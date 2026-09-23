// The logic of the Schaltli VanPi bridge (docs/2026-09-15-live-data.md,
// decisions 1-4): turning Pekaway's JSON answers into single retained values
// under schaltli/state, and Schaltli commands under schaltli/cmnd into
// Pekaway's commands.
//
// One function, createBridgeLogic(), with nothing outside it: build-flow.js
// puts its source text into the Node-RED tab's "On Start" code, and the e2e
// spec calls it directly - so what the tests check is, character for
// character, what runs on the van. That is also why it uses no require() and
// no syntax a Node-RED function node would not accept.
//
// Formats are Pekaway's MQTT API as answered by VanPi_Ctrl v2.0.10 on
// 2026-09-15 (pkw/tele/batt, level, temp, relay, dimmer, heater, mppt, bms,
// maxxfan). Only that documented API is read, never Pekaway's internal
// variables, so a rename inside their flows does not break the bridge.

function createBridgeLogic() {
  var PREFIX = "schaltli/state/"

  // Pekaway reports "not known yet" as "wait" or NaN. Nothing is published for
  // those: a value that does not exist is not shown (decision 6), and "wait"
  // on a display would read as a value.
  function present(value) {
    if (value === undefined || value === null) return false
    if (typeof value === "number") return !isNaN(value)
    var s = String(value).trim()
    return s !== "" && s !== "wait" && s !== "NaN" && s !== "nan"
  }

  function onOff(value) {
    return value === true || value === "true" || value === "on" || value === 1 ? "on" : "off"
  }

  // The answers this bridge asks for, in the order it asks.
  var REQUESTS = ["batt", "level", "temp", "relay", "dimmer", "heater", "mppt", "bms", "maxxfan"]

  // One Pekaway answer -> [{ topic, value }] under schaltli/state. Unknown or
  // malformed answers give nothing rather than throwing: a bridge that stops
  // on one odd message stops every value.
  function flatten(kind, payload) {
    var data = payload
    if (typeof payload === "string") {
      try {
        data = JSON.parse(payload)
      } catch (e) {
        return []
      }
    }
    if (!data || typeof data !== "object") return []
    var out = []
    function put(path, value) {
      if (present(value)) out.push({ topic: PREFIX + path, value: String(value) })
    }

    if (kind === "batt") {
      put("battery/voltage", data.Voltage)
      put("battery/current", data.AMPS)
      put("battery/soc", data.SoC)
    } else if (kind === "level") {
      for (var t = 1; t <= 4; t++) {
        var tank = data["level" + t]
        if (!tank) continue
        put("tank/" + t + "/level", tank.state)
        put("tank/" + t + "/name", tank.name)
      }
    } else if (kind === "temp") {
      for (var s = 1; s <= 4; s++) {
        var sensor = data["temp" + s]
        if (!sensor) continue
        put("temp/" + s + "/value", sensor.state)
        put("temp/" + s + "/name", sensor.name)
      }
    } else if (kind === "relay") {
      for (var r = 1; r <= 8; r++) {
        if ("Relay" + r in data) {
          put("relay/" + r + "/power", onOff(data["Relay" + r]))
          put("relay/" + r + "/name", data["Relay" + r + " Name"])
        }
        if ("WifiRelay" + r in data) {
          put("wifirelay/" + r + "/power", onOff(data["WifiRelay" + r]))
          put("wifirelay/" + r + "/name", data["WifiRelay" + r + " Name"])
        }
      }
    } else if (kind === "dimmer") {
      for (var d = 1; d <= 8; d++) {
        var dimmer = data["dimmer" + d]
        if (!dimmer) continue
        put("dimmer/" + d + "/level", dimmer.state)
        put("dimmer/" + d + "/name", dimmer.name)
      }
    } else if (kind === "heater") {
      if ("heatertoggle" in data) put("heater/power", onOff(data.heatertoggle))
      put("heater/target", data.targettemp_vanpi)
      put("heater/status", data.heatstatus)
      put("heater/temp", data.heattemp)
      put("heater/error", data.heaterror)
    } else if (kind === "mppt") {
      put("mppt/pv_volts", data.mppt_pv_volts)
      put("mppt/pv_amps", data.mppt_pv_amps)
      put("mppt/pv_watts", data.mppt_pv_watts)
      put("mppt/pv_total", data.mppt_pv_total)
    } else if (kind === "bms") {
      put("bms/voltage", data.BMSvolt)
      put("bms/current", data.BMSamps)
      put("bms/soc", data.BMSsoc)
      put("bms/capacity", data.BMScap)
      for (var c = 1; c <= 16; c++) put("bms/cell/" + c, data["BMScell" + c])
    } else if (kind === "maxxfan") {
      // Only Pekaway's own shape. The same topic can carry a different,
      // user-built shape (a custom flow on the reference van publishes
      // {"mode":...,"speed":...} there, retained), and reading both would make
      // the values flip between two meanings.
      var fan = data.maxxfan
      if (!fan || typeof fan !== "object") return []
      if ("fan_power" in fan) put("maxxfan/power", onOff(fan.fan_power))
      put("maxxfan/speed", fan.fan_speed)
      put("maxxfan/direction", fan.fan_direction)
      put("maxxfan/temp", fan.fan_temp)
      if ("fan_auto" in fan) put("maxxfan/auto", onOff(fan.fan_auto))
      put("maxxfan/vent", fan.fan_vent)
    }
    return out
  }

  // The values that differ from what was last published, and the updated
  // record of what has been. Publishing only changes is what makes a retained
  // value cheap to keep current every two seconds.
  function changed(last, updates) {
    var next = {}
    var k
    for (k in last) next[k] = last[k]
    var out = []
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i]
      if (next[u.topic] !== u.value) {
        next[u.topic] = u.value
        out.push(u)
      }
    }
    return { changed: out, last: next }
  }

  function intIn(text, min, max) {
    if (!/^\d+$/.test(String(text))) return null
    var n = parseInt(text, 10)
    return n >= min && n <= max ? n : null
  }

  // A Schaltli command -> { publish: [{ topic, payload }], refresh: kind }
  // for Pekaway, or null when it is not one this bridge knows or the payload
  // is not valid. `state` is the last published schaltli/state values, which
  // "toggle" and a heater target need.
  function command(topic, payload, state) {
    var parts = String(topic).split("/")
    if (parts[0] !== "schaltli" || parts[1] !== "cmnd") return null
    var group = parts[2]
    var p = String(payload === undefined || payload === null ? "" : payload).trim().toLowerCase()
    state = state || {}

    function power(current) {
      if (p === "on" || p === "true" || p === "1") return "on"
      if (p === "off" || p === "false" || p === "0") return "off"
      if (p === "toggle") return current === "on" ? "off" : "on"
      return null
    }

    if ((group === "relay" || group === "wifirelay") && parts.length === 4) {
      var n = intIn(parts[3], 1, 8)
      var wanted = n && power(state[PREFIX + group + "/" + n + "/power"])
      if (!wanted) return null
      var pkw = group === "relay" ? "relay" : "wrelay"
      return { publish: [{ topic: "pkw/cmnd/" + pkw + "/" + n + "/POWER", payload: wanted }], refresh: "relay" }
    }
    if (group === "dimmer" && parts.length === 4) {
      var dn = intIn(parts[3], 1, 8)
      if (!dn) return null
      var level = intIn(p, 0, 100)
      var value = level !== null ? String(level) : p === "on" || p === "off" ? p : null
      if (value === null && p === "toggle") {
        var currentLevel = parseInt(state[PREFIX + "dimmer/" + dn + "/level"] || "0", 10)
        value = currentLevel > 0 ? "off" : "on"
      }
      if (value === null) return null
      return { publish: [{ topic: "pkw/cmnd/dimmer/" + dn + "/POWER", payload: value }], refresh: "dimmer" }
    }
    if (group === "heater" && parts.length === 3) {
      var hp = power(state[PREFIX + "heater/power"])
      if (!hp) return null
      return { publish: [{ topic: "pkw/cmnd/heater/POWER", payload: hp }], refresh: "heater" }
    }
    if (group === "heater" && parts.length === 4 && parts[3] === "target") {
      var target = intIn(p, 12, 35)
      if (target === null) return null
      // Pekaway sets a target together with on or off; the heater's current
      // state is sent along so that setting a temperature never switches it.
      var keep = state[PREFIX + "heater/power"] === "on" ? "on" : "off"
      return { publish: [{ topic: "pkw/cmnd/heater/POWER/" + target, payload: keep }], refresh: "heater" }
    }
    if (group === "switchall" && parts.length === 3 && (p === "off" || p === "false")) {
      return { publish: [{ topic: "pkw/cmnd/switchall/POWER", payload: "off" }], refresh: "relay" }
    }
    return null
  }

  return { PREFIX: PREFIX, REQUESTS: REQUESTS, flatten: flatten, changed: changed, command: command }
}

if (typeof module !== "undefined") module.exports = { createBridgeLogic: createBridgeLogic }
