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
// It also announces what it publishes in Home Assistant's discovery format
// (docs/2026-09-30-block-discovery.md, "The VanPi bridge"): one config per
// thing, retained, under one device «VanPi», which is what the designer's
// Block menu lists - and what a Home Assistant on the same broker sees.
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
  // on one odd message stops every value. `last` is what was published so
  // far, which the MaxxFan needs (once its BLE flow was heard, Pekaway's own
  // shape is ignored).
  function flatten(kind, payload, last) {
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
        // On or off, which Pekaway does not say: a level above 0 is on. And
        // the level it was at, which "on" goes back to (dimmerLevel).
        if (present(dimmer.state)) {
          var lit = Number(dimmer.state) > 0
          put("dimmer/" + d + "/power", lit ? "on" : "off")
          if (lit) put("dimmer/" + d + "/on_level", dimmer.state)
        }
      }
    } else if (kind === "heater") {
      // An Autoterm reports itself in an object of its own, with its own
      // state, target and timer, and a mode: Pekaway drives it in temperature
      // mode, at a fixed power level, or as a fan alone (VanPi Core OS,
      // "get heater stats" and the Heater Autoterm tab).
      var autoterm = data.autoterm1 && typeof data.autoterm1 === "object" ? data.autoterm1 : null
      var heater = autoterm || data
      if (autoterm) {
        var running = autotermMode(autoterm.mode)
        put("heater/power", running.mode === "off" ? "off" : "on")
        put("heater/mode", running.mode)
        // The preset stays what it was while the heater is off; before any
        // was seen, temperature.
        if (running.preset) put("heater/preset", running.preset)
        else if (!(last && present(last[PREFIX + "heater/preset"]))) put("heater/preset", "temperature")
        // Levels while they are set; 0 is Pekaway's off, not a level.
        if (Number(autoterm.powerlevel) > 0) put("heater/power_level", autoterm.powerlevel)
        if (Number(autoterm.fanspeed) > 0) put("heater/fan_level", autoterm.fanspeed)
      } else if ("heatertoggle" in data) {
        put("heater/power", onOff(data.heatertoggle))
        // The same as Home Assistant's climate names it: heat or off.
        put("heater/mode", onOff(data.heatertoggle) === "on" ? "heat" : "off")
      }
      put("heater/target", heater.targettemp_vanpi)
      put("heater/status", heater.heatstatus)
      put("heater/temp", heater.heattemp)
      put("heater/error", heater.heaterror)
      put("heater/name", data.heater_name)
      // The minutes left of a timer, rounded up, where the van's flow says
      // (Pekaway 2.1.0); 2.0.10 does not, and the bridge counts itself
      // (heaterTimer).
      if (present(heater.runtime_remaining_s)) put("heater/timer", String(Math.ceil(Number(heater.runtime_remaining_s) / 60)))
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
      // Two shapes on one topic (docs/2026-09-29-block-options.md, MaxxFan),
      // made into one set of values. A, Pekaway's own, is what Pekaway
      // believes - it sends the fan IR or RJ45 commands and hears nothing
      // back. B, the user's BLE flow in vanpi-custom, is the fan's real
      // state. Once B was heard A is ignored: on the reference van A carries
      // only Pekaway's defaults, every two seconds, and reading both would
      // flip the values between real and made up.
      var fan = data.maxxfan
      if (fan && typeof fan === "object") {
        if (last && last[PREFIX + "maxxfan/source"] === "ble") return []
        if ("fan_power" in fan) {
          var mode = onOff(fan.fan_power) === "off" ? "off" : onOff(fan.fan_auto) === "on" ? "auto" : "manual"
          putMaxxfanMode(put, mode)
        }
        if (present(fan.fan_speed) && !isNaN(Number(fan.fan_speed))) put("maxxfan/speed", String(Number(fan.fan_speed) * 10))
        put("maxxfan/temperature", fan.fan_temp)
        if (present(fan.fan_vent)) put("maxxfan/cover", String(fan.fan_vent).toLowerCase() === "open" ? "open" : "closed")
        if (present(fan.fan_direction)) put("maxxfan/airflow", String(fan.fan_direction).toLowerCase() === "in" ? "in" : "out")
        put("maxxfan/source", "pekaway")
      } else if ("mode" in data || "cover" in data || "airflow" in data) {
        if (present(data.mode)) {
          var m = String(data.mode).toLowerCase()
          if (m === "off" || m === "manual" || m === "auto") putMaxxfanMode(put, m)
        }
        put("maxxfan/speed", data.speed)
        put("maxxfan/temperature", data.temperature)
        if (present(data.cover)) put("maxxfan/cover", String(data.cover).toLowerCase().indexOf("open") === 0 ? "open" : "closed")
        if (present(data.airflow)) put("maxxfan/airflow", String(data.airflow).toLowerCase() === "in" ? "in" : "out")
        put("maxxfan/source", "ble")
      }
    }
    return out
  }

  // --- Discovery -------------------------------------------------------------

  var DISCOVERY = "homeassistant/"
  var NODE = "schaltli-vanpi"
  var DEVICE = { identifiers: [NODE], name: "VanPi", manufacturer: "Pekaway", model: "VanPi" }
  var ORIGIN = { name: "schaltli" }
  var COMMAND = "schaltli/cmnd/"

  function parse(payload) {
    if (typeof payload !== "string") return payload
    try {
      return JSON.parse(payload)
    } catch (e) {
      return null
    }
  }

  // The van's own name for a thing, else a plain one.
  function nameOr(name, fallback) {
    return present(name) ? String(name) : fallback
  }

  // The things one Pekaway answer reports, as { discovery topic: config }, or
  // null for an answer that cannot be read - which must not clear anything.
  // A thing is there when the answer has its entry at all, whatever its value:
  // a tank whose level is "wait" for a moment has not gone.
  function things(kind, payload) {
    // The theme is the bridge's own: no answer to read.
    var data = kind === "theme" ? {} : parse(payload)
    if (!data || typeof data !== "object") return null
    var out = {}
    function thing(component, object, config) {
      config.unique_id = NODE + "-" + object
      config.device = DEVICE
      config.origin = ORIGIN
      out[DISCOVERY + component + "/" + NODE + "/" + object + "/config"] = config
    }
    function relay(group, key, r, fallback) {
      thing("switch", group + "_" + r, {
        name: nameOr(data[key + r + " Name"], fallback + " " + r),
        state_topic: PREFIX + group + "/" + r + "/power",
        command_topic: COMMAND + group + "/" + r,
        payload_on: "on",
        payload_off: "off",
      })
    }

    if (kind === "level") {
      for (var t = 1; t <= 4; t++) {
        var tank = data["level" + t]
        if (!tank || typeof tank !== "object") continue
        thing("sensor", "tank_" + t, {
          name: nameOr(tank.name, "Tank " + t),
          state_topic: PREFIX + "tank/" + t + "/level",
          unit_of_measurement: "%",
          icon: "mdi:water",
        })
      }
    } else if (kind === "batt") {
      if (!("SoC" in data)) return out
      thing("sensor", "battery", {
        name: "Batterie",
        state_topic: PREFIX + "battery/soc",
        unit_of_measurement: "%",
        device_class: "battery",
      })
    } else if (kind === "relay") {
      for (var r = 1; r <= 8; r++) {
        if ("Relay" + r in data) relay("relay", "Relay", r, "Relais")
        if ("WifiRelay" + r in data) relay("wifirelay", "WifiRelay", r, "WiFi-Relais")
      }
    } else if (kind === "dimmer") {
      for (var d = 1; d <= 8; d++) {
        var dimmer = data["dimmer" + d]
        if (!dimmer || typeof dimmer !== "object") continue
        // A light with a brightness of 0 to 100: on and off and the level all
        // go to the one command the bridge takes. Its state is the bridge's
        // (a level above 0 is on), and "on" goes back to the level it had,
        // as a light in Home Assistant does - so "on" comes first, then the
        // level asked for, which wins.
        thing("light", "dimmer_" + d, {
          name: nameOr(dimmer.name, "Dimmer " + d),
          state_topic: PREFIX + "dimmer/" + d + "/power",
          command_topic: COMMAND + "dimmer/" + d,
          payload_on: "on",
          payload_off: "off",
          on_command_type: "first",
          brightness_state_topic: PREFIX + "dimmer/" + d + "/level",
          brightness_command_topic: COMMAND + "dimmer/" + d,
          brightness_scale: 100,
        })
      }
    } else if (kind === "heater") {
      if (!("heatertoggle" in data)) return out
      var heater = nameOr(data.heater_name, "Heizung")
      // The room it heats is measured by the sensor Pekaway names for it.
      var sensor = intIn(data.tempsensor, 1, 4)
      var hasAutoterm = data.autoterm1 && typeof data.autoterm1 === "object"
      var climate = {
        name: heater,
        modes: hasAutoterm ? ["off", "heat", "fan_only"] : ["off", "heat"],
        mode_state_topic: PREFIX + "heater/mode",
        mode_command_topic: COMMAND + "heater",
        temperature_state_topic: PREFIX + "heater/target",
        temperature_command_topic: COMMAND + "heater/target",
        min_temp: 12,
        max_temp: 35,
        temp_step: 1,
        temperature_unit: "C",
      }
      if (sensor) climate.current_temperature_topic = PREFIX + "temp/" + sensor + "/value"
      if (hasAutoterm) {
        // How it heats: to the target temperature, or at a fixed power level.
        climate.preset_modes = ["temperature", "power"]
        climate.preset_mode_state_topic = PREFIX + "heater/preset"
        climate.preset_mode_command_topic = COMMAND + "heater/preset"
      }
      thing("climate", "heater", climate)
      thing("number", "heater_timer", {
        name: heater + " Timer",
        state_topic: PREFIX + "heater/timer",
        command_topic: COMMAND + "heater/timer",
        min: 0,
        max: 600,
        step: 1,
        unit_of_measurement: "min",
        icon: "mdi:timer-outline",
      })
      if (hasAutoterm) {
        thing("number", "heater_power_level", {
          name: heater + " Leistung",
          state_topic: PREFIX + "heater/power_level",
          command_topic: COMMAND + "heater/power_level",
          min: 1,
          max: 10,
          step: 1,
        })
        thing("number", "heater_fan_level", {
          name: heater + " Lüftung",
          state_topic: PREFIX + "heater/fan_level",
          command_topic: COMMAND + "heater/fan_level",
          min: 1,
          max: 10,
          step: 1,
          icon: "mdi:fan",
        })
      }
    } else if (kind === "maxxfan") {
      var shapeA = data.maxxfan && typeof data.maxxfan === "object"
      if (!shapeA && !("mode" in data || "cover" in data || "airflow" in data)) return null
      thing("fan", "maxxfan", {
        name: "MaxxFan",
        state_topic: PREFIX + "maxxfan/power",
        command_topic: COMMAND + "maxxfan/power",
        payload_on: "on",
        payload_off: "off",
        percentage_state_topic: PREFIX + "maxxfan/speed",
        percentage_command_topic: COMMAND + "maxxfan/speed",
        preset_mode_state_topic: PREFIX + "maxxfan/preset",
        preset_mode_command_topic: COMMAND + "maxxfan/mode",
        preset_modes: ["manual", "auto"],
        icon: "mdi:fan",
      })
      // Home Assistant's fan knows forward and reverse, not in and out, and
      // no cover: each a switch of its own, with the fan's words.
      thing("switch", "maxxfan_cover", {
        name: "MaxxFan Deckel",
        state_topic: PREFIX + "maxxfan/cover",
        command_topic: COMMAND + "maxxfan/cover",
        payload_on: "open",
        payload_off: "closed",
      })
      thing("switch", "maxxfan_airflow", {
        name: "MaxxFan Luftrichtung",
        state_topic: PREFIX + "maxxfan/airflow",
        command_topic: COMMAND + "maxxfan/airflow",
        payload_on: "out",
        payload_off: "in",
      })
      thing("number", "maxxfan_temperature", {
        name: "MaxxFan Temperatur",
        state_topic: PREFIX + "maxxfan/temperature",
        command_topic: COMMAND + "maxxfan/temperature",
        min: 0,
        max: 37,
        step: 1,
        unit_of_measurement: "°C",
      })
    } else if (kind === "theme") {
      // Not Pekaway's, so always there.
      thing("switch", "theme", {
        name: "Theme",
        state_topic: THEME_STATE,
        command_topic: COMMAND + "theme",
        payload_on: "dark",
        payload_off: "light",
        icon: "mdi:weather-night",
      })
    } else return null
    return out
  }

  // The configs to publish for one answer, and the updated record of what is
  // announced: a thing new or renamed is published, one the answer no longer
  // has is cleared with an empty payload. `announced` is per kind, so a relay
  // answer never clears a tank.
  function announce(kind, payload, announced) {
    var now = things(kind, payload)
    if (!now) return { publish: [], announced: announced }
    var before = (announced && announced[kind]) || {}
    var publish = []
    var mine = {}
    var topic
    for (topic in now) {
      var config = JSON.stringify(now[topic])
      mine[topic] = config
      if (before[topic] !== config) publish.push({ topic: topic, payload: config })
    }
    for (topic in before) if (!(topic in now)) publish.push({ topic: topic, payload: "" })
    var next = {}
    for (var k in announced) next[k] = announced[k]
    next[kind] = mine
    return { publish: publish, announced: next }
  }

  // The MaxxFan's mode three ways: as it is (off, manual, auto - what a
  // Switcher on the screen shows by), on or off, and the preset, manual or
  // auto - which stays what it was while the fan is off, so that power and
  // preset never both say off.
  function putMaxxfanMode(put, mode) {
    put("maxxfan/mode", mode)
    put("maxxfan/power", mode === "off" ? "off" : "on")
    if (mode !== "off") put("maxxfan/preset", mode)
  }

  // Pekaway's word for what an Autoterm does -> Home Assistant's mode, and
  // the preset where it heats.
  function autotermMode(mode) {
    var m = String(mode || "").toLowerCase()
    if (m.indexOf("fan") >= 0) return { mode: "fan_only", preset: null }
    if (m.indexOf("power") >= 0) return { mode: "heat", preset: "power" }
    if (m.indexOf("temp") >= 0) return { mode: "heat", preset: "temperature" }
    return { mode: "off", preset: null }
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

  // Light or dark for the whole installation (docs/2026-09-25-theme-topic.md).
  // Not Pekaway's: the bridge keeps it itself, retained, because a device
  // never publishes retained and something has to remember the answer.
  var THEME_STATE = PREFIX + "theme"

  // How long an answer from Pekaway that contradicts a dimmer level just
  // commanded is taken for an old one. Pekaway sets the lamp at once and shows
  // the new level in its own dashboard at once, but files it where
  // pkw/stat/dimmer reads it only 200 ms after the LAST command ("save after
  // 200ms" in its Dimmer Controller tab) - so while a slider is dragged, every
  // answer is a step behind (2026-09-27, measured in the van). Commanded
  // levels are published straight away, as Pekaway's dashboard shows them, and
  // for this long an answer saying otherwise is set aside. After it, what
  // Pekaway says wins again: a level it did not take comes back with the next
  // poll, two seconds later at most.
  var HOLD_MS = 600

  // A Schaltli command -> { publish: [{ topic, payload }], refresh: kind }
  // for Pekaway, or { state: [{ topic, value }] } for a value the bridge keeps
  // itself (the theme), or null when it is not one this bridge knows or the
  // payload is not valid. `state` is the last published schaltli/state
  // values, which "toggle" and a heater target need.
  function command(topic, payload, state) {
    var parts = String(topic).split("/")
    if (parts[0] !== "schaltli" || parts[1] !== "cmnd") return null
    var group = parts[2]
    var p = String(payload === undefined || payload === null ? "" : payload).trim().toLowerCase()
    state = state || {}

    function power(current) {
      if (p === "on" || p === "true" || p === "1" || p === "heat") return "on"
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
      var level = dimmerLevel(p, PREFIX + "dimmer/" + dn + "/", state)
      if (level === null) return null
      // On while it is on changes nothing. Home Assistant sends it before
      // every new level (on_command_type "first"), and passing it on would
      // set the old level again just before the new one.
      if ((p === "on" || p === "true") && parseInt(state[PREFIX + "dimmer/" + dn + "/level"] || "0", 10) > 0) return { state: [] }
      // Always as a level: Pekaway's own "on" is 100, where a light goes back
      // to the level it had. Shown the moment it is asked for, as Pekaway's
      // dashboard shows it.
      var shown = [
        { topic: PREFIX + "dimmer/" + dn + "/level", value: String(level) },
        { topic: PREFIX + "dimmer/" + dn + "/power", value: level > 0 ? "on" : "off" },
      ]
      if (level > 0) shown.push({ topic: PREFIX + "dimmer/" + dn + "/on_level", value: String(level) })
      return {
        publish: [{ topic: "pkw/cmnd/dimmer/" + dn + "/POWER", payload: String(level) }],
        refresh: "dimmer",
        state: shown,
        hold: true,
      }
    }
    // An Autoterm: the bridge has seen its preset (flatten always gives one).
    var autoterm = present(state[PREFIX + "heater/preset"])
    if (group === "heater" && parts.length === 3 && autoterm) {
      var now = state[PREFIX + "heater/mode"] || "off"
      var want =
        p === "off" || p === "false" || p === "0"
          ? "off"
          : p === "on" || p === "true" || p === "1" || p === "heat"
            ? "heat"
            : p === "fan_only"
              ? "fan_only"
              : p === "toggle"
                ? now === "off"
                  ? "heat"
                  : "off"
                : null
      if (!want) return null
      if (want === "off") return { publish: [{ topic: "pkw/cmnd/heater/POWER", payload: "off" }], refresh: "heater" }
      return { publish: [autotermStart(want, state[PREFIX + "heater/preset"], state)], refresh: "heater" }
    }
    if (group === "heater" && parts.length === 3) {
      var hp = power(state[PREFIX + "heater/power"])
      if (!hp) return null
      return { publish: [{ topic: "pkw/cmnd/heater/POWER", payload: hp }], refresh: "heater" }
    }
    if (group === "heater" && parts.length === 4 && parts[3] === "preset") {
      if (!autoterm || (p !== "temperature" && p !== "power")) return null
      // Shown at once, since off it is only the bridge's to remember; while
      // it heats, the Autoterm is switched over.
      var presetCommand = { state: [{ topic: PREFIX + "heater/preset", value: p }] }
      if (state[PREFIX + "heater/mode"] === "heat") {
        presetCommand.publish = [autotermStart("heat", p, state)]
        presetCommand.refresh = "heater"
      }
      return presetCommand
    }
    if (group === "heater" && parts.length === 4 && parts[3] === "target") {
      var target = intIn(p, 12, 35)
      if (target === null) return null
      // Pekaway sets a target together with on or off; the heater's current
      // state is sent along so that setting a temperature never switches it.
      var keep = state[PREFIX + "heater/power"] === "on" ? "on" : "off"
      return { publish: [{ topic: "pkw/cmnd/heater/POWER/" + target, payload: keep }], refresh: "heater" }
    }
    if (group === "heater" && parts.length === 4 && parts[3] === "timer") {
      var minutes = intIn(p, 0, 600)
      if (minutes === null) return null
      // 0 is off; any other number runs the heater that long, at its target.
      if (minutes === 0) {
        return {
          publish: [{ topic: "pkw/cmnd/heater/POWER", payload: "off" }],
          refresh: "heater",
          state: [{ topic: PREFIX + "heater/timer", value: "0" }],
          timer: { minutes: 0 },
        }
      }
      var at = state[PREFIX + "heater/target"]
      if (!present(at)) return null
      return {
        publish: [{ topic: "pkw/cmnd/heater/POWER/" + at + "/" + minutes, payload: "on" }],
        refresh: "heater",
        state: [{ topic: PREFIX + "heater/timer", value: String(minutes) }],
        timer: { minutes: minutes },
      }
    }
    if (group === "heater" && parts.length === 4 && (parts[3] === "power_level" || parts[3] === "fan_level")) {
      // An Autoterm's level: as Pekaway does it, setting one switches the
      // heater to that mode - a power level heats at it, a fan level fans.
      if (!autoterm) return null
      var lvl = intIn(p, 1, 10)
      if (lvl === null) return null
      var which = parts[3] === "power_level" ? "heatingpower" : "ventilation"
      return { publish: [{ topic: "pkw/cmnd/heater/autoterm/" + which + "/" + lvl, payload: "on" }], refresh: "heater" }
    }
    if (group === "maxxfan" && parts.length === 4) {
      return maxxfanCommand(parts[3], p, state)
    }
    if (group === "theme" && parts.length === 3) {
      // No state yet is light: an installation that never switched shows
      // light, so the first toggle gives dark.
      var theme = p === "light" || p === "dark" ? p : p === "toggle" ? (state[THEME_STATE] === "dark" ? "light" : "dark") : null
      if (!theme) return null
      return { state: [{ topic: THEME_STATE, value: theme }] }
    }
    if (group === "switchall" && parts.length === 3 && (p === "off" || p === "false")) {
      return { publish: [{ topic: "pkw/cmnd/switchall/POWER", payload: "off" }], refresh: "relay" }
    }
    return null
  }

  // A dimmer switched on with no level it was at: bright, not glaring
  // (Pekaway's own "on" is 100).
  var DIMMER_ON_LEVEL = 70

  // The level a dimmer command asks for: a number as it is; on the level it
  // was last at (else DIMMER_ON_LEVEL), off 0, toggle the one it is not.
  function dimmerLevel(p, base, state) {
    var asked = intIn(p, 0, 100)
    if (asked !== null) return asked
    var onLevel = intIn(state[base + "on_level"], 1, 100) || DIMMER_ON_LEVEL
    var lit = parseInt(state[base + "level"] || "0", 10) > 0
    if (p === "on" || p === "true") return onLevel
    if (p === "off" || p === "false") return 0
    if (p === "toggle") return lit ? 0 : onLevel
    return null
  }

  // What starts an Autoterm in a mode: to its target temperature through the
  // heater command every heater takes, at its power level, or as a fan at its
  // fan level - the last ones it had, else 5.
  var AUTOTERM_LEVEL = 5
  function autotermStart(mode, preset, state) {
    function levelOf(topic) {
      var n = intIn(state[PREFIX + topic], 1, 10)
      return n === null ? AUTOTERM_LEVEL : n
    }
    if (mode === "fan_only") return { topic: "pkw/cmnd/heater/autoterm/ventilation/" + levelOf("heater/fan_level"), payload: "on" }
    if (preset === "power") return { topic: "pkw/cmnd/heater/autoterm/heatingpower/" + levelOf("heater/power_level"), payload: "on" }
    var target = state[PREFIX + "heater/target"]
    return { topic: present(target) ? "pkw/cmnd/heater/POWER/" + target : "pkw/cmnd/heater/POWER", payload: "on" }
  }

  // A MaxxFan command with an absolute value, for Pekaway's shape A: the
  // toggles that get there from the state Pekaway reported, and speed and
  // temperature as they are - Pekaway steps the fan there itself (its
  // "create responses & process" function, VanPi Core OS, 210 ms a step).
  // With the BLE flow heard, the command is the BLE flow's: it listens on
  // schaltli/cmnd/maxxfan/# itself (block plan Task 12), and Pekaway must not
  // drive the same fan as well.
  function maxxfanCommand(part, p, state) {
    if (state[PREFIX + "maxxfan/source"] === "ble") return { elsewhere: "the MaxxFan's BLE flow" }
    function toPekaway(cmd, payload) {
      return { topic: "pkw/cmnd/maxxfan/" + cmd, payload: payload }
    }
    var toggle = function (cmd) {
      return toPekaway(cmd, "toggle")
    }
    var current = state[PREFIX + "maxxfan/mode"] || "off"
    var target = null
    if (part === "mode" && (p === "off" || p === "manual" || p === "auto")) target = p
    if (part === "power" && (p === "on" || p === "off")) target = p === "off" ? "off" : current === "off" ? "manual" : current
    if (target !== null) {
      // Pekaway knows power and auto, each toggled. Out of auto the auto flag
      // goes first, so the fan does not come back in auto next time.
      var steps = []
      if (current === "off" && target !== "off") steps.push(toggle("power"))
      if ((current === "auto") !== (target === "auto") && !(current === "off" && target !== "auto")) steps.push(toggle("auto"))
      if (current !== "off" && target === "off") steps.push(toggle("power"))
      return { publish: steps, refresh: "maxxfan" }
    }
    if (part === "speed") {
      var percent = intIn(p, 1, 100)
      if (percent === null) return null
      return { publish: [toPekaway("speed", String(Math.min(10, Math.max(1, Math.round(percent / 10)))))], refresh: "maxxfan" }
    }
    if (part === "temperature") {
      var degrees = intIn(p, 0, 37)
      if (degrees === null) return null
      return { publish: [toPekaway("temp", String(degrees))], refresh: "maxxfan" }
    }
    if (part === "cover" && (p === "open" || p === "closed" || p === "close")) {
      var cover = p === "open" ? "open" : "closed"
      return { publish: (state[PREFIX + "maxxfan/cover"] || "closed") === cover ? [] : [toggle("vent")], refresh: "maxxfan" }
    }
    if (part === "airflow" && (p === "in" || p === "out")) {
      return { publish: (state[PREFIX + "maxxfan/airflow"] || "out") === p ? [] : [toggle("direction")], refresh: "maxxfan" }
    }
    return null
  }

  // A retained theme state the broker hands the bridge when it subscribes -
  // after a restart its own memory is empty, and a toggle would otherwise
  // start again from light while the broker still says dark. Taken into the
  // record of what was published, so it is not published again either.
  function seen(last, topic, payload) {
    var value = String(payload === undefined || payload === null ? "" : payload).trim().toLowerCase()
    if (topic !== THEME_STATE || (value !== "light" && value !== "dark")) return last
    var next = {}
    for (var k in last) next[k] = last[k]
    next[topic] = value
    return next
  }

  // How long after a timer command an answer saying the heater is off is
  // taken for one from before it: Pekaway is asked again 300 ms after a
  // command, but its answer may not show the heater on yet.
  var TIMER_GRACE_MS = 10000

  // A timer the bridge counts down itself, for a van whose answer has no
  // runtime_remaining_s (2.0.10): { until, since } in ms, or null. From a
  // timer command: `command(...).timer`.
  function startTimer(timer, now) {
    if (!timer || !timer.minutes) return null
    return { until: now + timer.minutes * 60000, since: now }
  }

  // A heater answer's values with the minutes left added where the van does
  // not say them, and the timer as it is now: running, or done (null) once it
  // has run out or the heater is off. No timer running is 0.
  function heaterTimer(updates, timer, now) {
    var power = null
    for (var i = 0; i < updates.length; i++) {
      if (updates[i].topic === PREFIX + "heater/timer") return { updates: updates, timer: null }
      if (updates[i].topic === PREFIX + "heater/power") power = updates[i].value
    }
    if (power === null) return { updates: updates, timer: timer }
    var left = 0
    if (timer && (power === "on" || now - timer.since < TIMER_GRACE_MS)) {
      left = Math.max(0, Math.ceil((timer.until - now) / 60000))
    }
    var out = updates.slice()
    out.push({ topic: PREFIX + "heater/timer", value: String(left) })
    return { updates: out, timer: left > 0 ? timer : null }
  }

  // The record of values just commanded, with the moment until which an
  // answer saying otherwise is set aside (HOLD_MS).
  function hold(holds, updates, now) {
    var next = {}
    var k
    for (k in holds) if (holds[k].until > now) next[k] = holds[k]
    for (var i = 0; i < updates.length; i++) next[updates[i].topic] = { value: updates[i].value, until: now + HOLD_MS }
    return next
  }

  // Pekaway's answer without what contradicts a value still held.
  function held(updates, holds, now) {
    var out = []
    for (var i = 0; i < updates.length; i++) {
      var h = holds[updates[i].topic]
      if (h && now < h.until && h.value !== updates[i].value) continue
      out.push(updates[i])
    }
    return out
  }

  return {
    PREFIX: PREFIX,
    REQUESTS: REQUESTS,
    HOLD_MS: HOLD_MS,
    flatten: flatten,
    changed: changed,
    things: things,
    announce: announce,
    startTimer: startTimer,
    heaterTimer: heaterTimer,
    command: command,
    seen: seen,
    hold: hold,
    held: held,
  }
}

if (typeof module !== "undefined") module.exports = { createBridgeLogic: createBridgeLogic }
