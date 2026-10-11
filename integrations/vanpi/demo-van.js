#!/usr/bin/env node
// The van of demo.schaltli.com (docs/2026-10-09-demo-instance.md, decision 6).
//
// A conversion in progress: stage one was light - three dimmers and two
// relays -, stage two water - a fresh and a grey water tank, the water pump
// and a relay that lets the grey water out -, stage three energy - a
// battery on Pekaway's shunt, a solar charger, a mains charger behind a blue
// socket and a DC-DC charger off the engine (2026-10-11). What answers the designer is the
// real VanPi bridge - the flow buildBridgeFlow() installs into Node-RED on
// every Pekaway - run here outside Node-RED, node by node and wired as the flow wires them, the way
// e2e/vanpi-bridge.spec.ts runs it. Where that flow talks to Pekaway, a fake
// Pekaway answers: `pkw/stat/<kind>` with `pkw/tele/<kind>` in Pekaway's own
// format, and `pkw/cmnd/…` changes its state. It answers only for what the
// van has so far, so the bridge announces and publishes only that; a later
// stage adds a kind here and the bridge already knows it.
//
// What a visitor does in the scene comes as schaltli/cmnd/demo/shower,
// .../refill, .../shore and .../engine - a shower empties fresh water into
// the grey, a canister fills the fresh tank, the cable goes into the blue
// socket or out of it, the engine starts or stops - and what the scene shows
// of it goes out as schaltli/demo/shower, /refill, /puddle (the drain's,
// 0..1), /shore and /engine.
//
// The mains charger and the DC-DC charger are no Pekaway's: they come as the
// author's van has them (vanpi-custom's ble-mqtt-bridge, Victron Instant
// Readout), ble/charger/<value> and ble/orion/<value> as {"value": ...}, and
// what his Node-RED tab Energie works out, van/energy/solar_watts and
// van/energy/consumers_watts - so the demo's page Energie goes into his
// project as it is.
//
// Beside the bridge it keeps the van's clock: a day lasts ten minutes,
// published retained as schaltli/demo/daylight (0 at night, 1 at noon) and
// schaltli/demo/time ("HH:MM"). Nothing in Pekaway's format reads them; the
// designer's «Your van» does.
//
// It goes back to its seed - every light off, the pump on, the tanks part
// full, the theme light - at 04:00 and after an hour without a command.
//
//   node integrations/vanpi/demo-van.js [--broker mqtt://localhost:1883]
//        [--day-seconds 600] [--idle-minutes 60]
//   DEMO_VAN_USER / DEMO_VAN_PASSWORD: the broker account, if it asks.

const mqtt = require("mqtt")
const { buildBridgeFlow } = require("./build-flow")

/** What the van has, as Pekaway would report it: the lights off, the water
 * pump on, the tanks part full. */
function seed() {
  return {
    relay: {
      Relay1: false,
      "Relay1 Name": "Lichterkette",
      Relay2: false,
      "Relay2 Name": "Aussenlicht",
      Relay3: false,
      "Relay3 Name": "Grauwasser ablassen",
      Relay4: true,
      "Relay4 Name": "Wasserpumpe",
    },
    level: {
      level1: { state: 80, name: "Frischwasser" },
      level2: { state: 35, name: "Grauwasser" },
    },
    dimmer: {
      "Dimmer Settings": true,
      dimmer1: { state: 0, name: "Innenlicht", autooff: 0, offtime: null },
      dimmer2: { state: 0, name: "Küche", autooff: 0, offtime: null },
      dimmer3: { state: 0, name: "Einstieg", autooff: 0, offtime: null },
    },
    // Pekaway's shunt and solar charger, as it reports them: the shunt in
    // strings, the charger in numbers. Set by tick() from the battery below.
    batt: { AMPS: "0.00", SoC: String(SEED_SOC), Voltage: volts(SEED_SOC, 0).toFixed(2) },
    mppt: { mppt_pv_amps: 0, mppt_pv_volts: 0, mppt_pv_watts: 0 },
  }
}

// Fresh water used: about 1 % a minute, so a visitor sees it move. An open
// drain empties a full grey water tank in under a minute.
const USE_PER_SECOND = 1 / 60
const DRAIN_PER_SECOND = 2
// What a visitor does in the scene (schaltli/cmnd/demo/...): a shower of
// twelve seconds takes some 15 % of the fresh water and puts 12 % into the
// grey; a canister fills the fresh tank in ten seconds. The puddle under an
// open drain grows while water runs and soaks away in half a minute after.
const SHOWER_SECONDS = 12
const SHOWER_FRESH_PER_SECOND = 1.25
const SHOWER_GREY_PER_SECOND = 1
const REFILL_SECONDS = 10
const PUDDLE_GROWS_PER_SECOND = 0.08
const PUDDLE_DRIES_PER_SECOND = 1 / 30
const round1 = (v) => Math.round(v * 10) / 10

// The battery: 100 Ah of lithium at 12.8 V, starting part full. Time runs
// faster for it than for the water - a van's evening of light would
// otherwise move it by a percent - so a visitor sees the charge move: an
// hour of the van's in three real minutes.
const SEED_SOC = 78
const BATTERY_WH = 1280
const BATTERY_TIME = 20
// The solar panels' most, at noon of the van's day, and what the charger
// sees of them while the sun is up.
const SOLAR_PEAK_WATTS = 150
const SOLAR_VOLTS = 18.6
// The mains charger (a Blue Smart IP22 12/30) and the DC-DC charger off the
// engine (an Orion XS 12/12-50A): their most, in amps.
const SHORE_AMPS = 30
const BOOSTER_AMPS = 50
// What the battery takes at most, in amps: all of it up to 70 %, then less
// and less until nothing at 100 %.
const ACCEPT_AMPS = 80
const acceptAmps = (soc) => ACCEPT_AMPS * Math.max(0, Math.min(1, (100 - soc) / 30))
// The engine stops by itself after this many seconds.
const ENGINE_SECONDS = 300
// A charger's state, in Victron's words.
const chargeState = (soc) => (soc < 70 ? "bulk" : soc < 100 ? "absorption" : "float")
// What draws: Pekaway and the router always, each light by its brightness,
// the water pump while it runs - a shower.
const BASE_WATTS = 6
const DIMMER_WATTS = { dimmer1: 12, dimmer2: 8, dimmer3: 4 }
const RELAY_WATTS = { Relay1: 5, Relay2: 10 }
const PUMP_WATTS = 45

/** A lithium battery's voltage at a charge, and a little with the current. */
function volts(soc, amps) {
  return 12.9 + (soc - 50) * 0.008 + amps * 0.01
}

/** The fake Pekaway: its state, its answers, what its commands do. */
function fakePekaway({ soc: startSoc = SEED_SOC } = {}) {
  let state = seed()
  // The battery's charge, finer than Pekaway's whole percent; another start
  // than the seed's for the tests only.
  let soc = startSoc
  // What is going on around the van, for the scene: seconds of shower and of
  // refilling left, and the puddle under the drain (0..1). Not Pekaway's.
  let scene = { shower: 0, refill: 0, puddle: 0, shore: false, engine: 0 }
  // What the chargers did on the last tick, in watts and amps, for
  // energy() - not Pekaway's: the author's ble/... and van/energy/...
  let flows = { solar: 0, shore: 0, booster: 0, load: 0, voltage: 0 }
  return {
    get state() {
      return state
    },
    get scene() {
      return scene
    },
    reset() {
      state = seed()
      soc = SEED_SOC
      scene = { shower: 0, refill: 0, puddle: 0, shore: false, engine: 0 }
      flows = { solar: 0, shore: 0, booster: 0, load: 0, voltage: 0 }
    },
    /** A visitor's shower: false without the water pump or fresh water. */
    startShower() {
      if (!state.relay.Relay4 || state.level.level1.state <= 0) return false
      scene.shower = SHOWER_SECONDS
      return true
    },
    /** A visitor's canister at the filler. */
    startRefill() {
      scene.refill = REFILL_SECONDS
      return true
    },
    /**
     * How long the battery lasts, as Pekaway words it in its global "ttgo"
     * when it works it out itself (flow Monit, "format values (wdhm)"):
     * capacity left over the current, in days, hours and quarter hours.
     */
    ttgo() {
      const amps = Number(state.batt.AMPS)
      if (amps > 0) return "charging"
      if (amps === 0) return "not using power"
      const hoursLeft = ((BATTERY_WH / 12.8) * (soc / 100)) / -amps
      let days = Math.floor(hoursLeft / 24)
      let hours = Math.floor(hoursLeft % 24)
      let minutes = Math.round(Math.round(((hoursLeft % 24) - hours) * 60) / 15) * 15
      if (minutes === 60) {
        hours += 1
        minutes = 0
        if (hours === 24) {
          days += 1
          hours = 0
        }
      }
      const parts = []
      if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`)
      if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
      if (minutes > 0) parts.push(`${minutes} minutes`)
      return parts.join(", ")
    },
    /** The cable into the blue socket, or out of it. */
    toggleShore() {
      scene.shore = !scene.shore
      return true
    },
    /** The engine started, or stopped. */
    toggleEngine() {
      scene.engine = scene.engine > 0 ? 0 : ENGINE_SECONDS
      return true
    },
    /**
     * What the author's van publishes beside Pekaway, as [topic, value]:
     * the two chargers as his ble-mqtt-bridge does - silent ones
     * not_available - and his Node-RED tab's sun and consumers.
     */
    energy() {
      const v = flows.voltage
      const amps = (w) => (v > 0 ? Math.round((w / v) * 10) / 10 : 0)
      const charger = scene.shore
        ? [
            ["state", chargeState(soc)],
            ["charging", "on"],
            ["out_volts", Math.round(v * 100) / 100],
            ["out_amps", amps(flows.shore)],
            ["watts", Math.round(flows.shore)],
          ]
        : [["state", "not_available"], ["charging", "off"], ["out_amps", 0], ["watts", 0]]
      const running = scene.engine > 0
      const orion = [
        // Running but the battery full: on and idle, nothing goes in.
        ["state", running ? (flows.booster > 0 ? chargeState(soc) : "float") : "off"],
        ["charging", running && flows.booster > 0 ? "on" : "off"],
        ["in_volts", running ? 14.2 : 12.8],
        ["in_amps", running ? amps(flows.booster * 1.05) : 0],
        ["out_volts", Math.round(v * 100) / 100],
        ["out_amps", amps(flows.booster)],
        ["watts", Math.round(flows.booster)],
        ["off_reason", running ? "none" : "engine_shutdown"],
      ]
      return [
        ...charger.map(([k, x]) => [`ble/charger/${k}`, JSON.stringify({ value: x })]),
        ...orion.map(([k, x]) => [`ble/orion/${k}`, JSON.stringify({ value: x })]),
        ["van/energy/solar_watts", String(Math.round(flows.solar))],
        ["van/energy/consumers_watts", String(Math.round(flows.load))],
      ]
    },
    /** The answer to pkw/stat/<kind>, or null for a kind the van does not have. */
    answer(kind) {
      if (!(kind in state)) return null
      // Pekaway reports a tank in whole percent.
      if (kind === "level") {
        const whole = {}
        for (const [k, tank] of Object.entries(state.level)) whole[k] = { ...tank, state: Math.round(tank.state) }
        return JSON.stringify(whole)
      }
      return JSON.stringify(state[kind])
    },
    /**
     * Time passing: water is used - fresh water goes down, grey water up -,
     * and an open drain lets the grey water out. Called every few seconds;
     * `seconds` is how many have passed.
     */
    tick(seconds, daylight = 0) {
      const fresh = state.level.level1
      const grey = state.level.level2
      const used = Math.min(fresh.state, seconds * USE_PER_SECOND)
      fresh.state = round1(fresh.state - used)
      grey.state = round1(Math.min(100, grey.state + used * 0.8))
      // The shower stops with the pump.
      if (!state.relay.Relay4) scene.shower = 0
      if (scene.shower > 0) {
        const t = Math.min(seconds, scene.shower)
        const water = Math.min(fresh.state, t * SHOWER_FRESH_PER_SECOND)
        fresh.state = round1(fresh.state - water)
        grey.state = round1(Math.min(100, grey.state + water * (SHOWER_GREY_PER_SECOND / SHOWER_FRESH_PER_SECOND)))
        scene.shower = fresh.state > 0 ? Math.max(0, scene.shower - seconds) : 0
      }
      if (scene.refill > 0) {
        const t = Math.min(seconds, scene.refill)
        fresh.state = round1(fresh.state + (100 - fresh.state) * (t / scene.refill))
        scene.refill = Math.max(0, scene.refill - seconds)
      }
      const draining = state.relay.Relay3 && grey.state > 0
      if (state.relay.Relay3) grey.state = round1(Math.max(0, grey.state - seconds * DRAIN_PER_SECOND))
      scene.puddle = draining
        ? Math.min(1, scene.puddle + seconds * PUDDLE_GROWS_PER_SECOND)
        : Math.max(0, scene.puddle - seconds * PUDDLE_DRIES_PER_SECOND)
      scene.puddle = Math.round(scene.puddle * 100) / 100

      // Energy: what the van draws, and what covers it and fills the
      // battery - the sun first, then the engine and the mains together - as
      // far as the battery still takes; the battery is the difference. The
      // DC-DC charger stops at 100 %; the mains charger and the sun keep
      // covering what is drawn.
      let load = BASE_WATTS
      for (const [key, watts] of Object.entries(DIMMER_WATTS)) load += (watts * (state.dimmer[key]?.state ?? 0)) / 100
      for (const [key, watts] of Object.entries(RELAY_WATTS)) if (state.relay[key]) load += watts
      if (scene.shower > 0) load += PUMP_WATTS
      if (scene.engine > 0) scene.engine = Math.max(0, scene.engine - seconds)
      const v = volts(soc, 0)
      const wanted = load + acceptAmps(soc) * v
      const solar = Math.min(SOLAR_PEAK_WATTS * Math.max(0, Math.min(1, daylight)), wanted)
      // The two chargers share what is left, each by its size, as two
      // chargers on one battery do.
      const boosterMax = scene.engine > 0 && soc < 100 ? BOOSTER_AMPS * v : 0
      const shoreMax = scene.shore ? SHORE_AMPS * v : 0
      const share = boosterMax + shoreMax > 0 ? Math.min(1, Math.max(0, wanted - solar) / (boosterMax + shoreMax)) : 0
      const booster = boosterMax * share
      const shore = shoreMax * share
      const net = solar + booster + shore - load
      soc = Math.max(0, Math.min(100, soc + ((net * seconds * BATTERY_TIME) / 3600 / BATTERY_WH) * 100))
      flows = { solar, shore, booster, load, voltage: volts(soc, net / v) }
      const v0 = volts(soc, 0)
      const amps = net / v0
      state.batt = { AMPS: amps.toFixed(2), SoC: String(Math.round(soc)), Voltage: volts(soc, amps).toFixed(2) }
      const pvVolts = solar > 0 ? SOLAR_VOLTS : 0
      state.mppt = {
        mppt_pv_amps: pvVolts ? round1(solar / pvVolts) : 0,
        mppt_pv_volts: pvVolts,
        mppt_pv_watts: Math.round(solar),
      }
    },
    /** A pkw/cmnd/... message; true when it changed something. */
    command(topic, payload) {
      const parts = topic.split("/")
      const value = String(payload).trim().toLowerCase()
      if (parts[2] === "relay" && parts[4] === "POWER") {
        const key = `Relay${parts[3]}`
        if (!(key in state.relay)) return false
        state.relay[key] = value === "on" || value === "true" || value === "1"
        return true
      }
      if (parts[2] === "dimmer" && parts[4] === "POWER") {
        const dimmer = state.dimmer[`dimmer${parts[3]}`]
        if (!dimmer) return false
        const level = value === "on" ? 100 : value === "off" ? 0 : Number(value)
        if (!Number.isFinite(level)) return false
        dimmer.state = Math.max(0, Math.min(100, Math.round(level)))
        return true
      }
      if (parts[2] === "switchall" && value === "off") {
        for (const key of Object.keys(state.relay)) if (/^Relay\d$/.test(key)) state.relay[key] = false
        return true
      }
      return false
    },
  }
}

/** MQTT topic filter match, + and # included. */
function matches(filter, topic) {
  const f = filter.split("/")
  const t = topic.split("/")
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true
    if (i >= t.length) return false
    if (f[i] !== "+" && f[i] !== t[i]) return false
  }
  return f.length === t.length
}

/** The van's clock at a moment: daylight 0..1 and the time of the van's day. */
function vanClock(now, daySeconds) {
  const phase = ((now / 1000) % daySeconds) / daySeconds // 0 midnight, 0.5 noon
  const daylight = Math.max(0, Math.sin(2 * Math.PI * phase - Math.PI / 2))
  const minutes = Math.floor(phase * 24 * 60)
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  return { daylight: Math.round(daylight * 100) / 100, time }
}

/**
 * Runs the van: the bridge flow's nodes over one MQTT connection, the fake
 * Pekaway, the clock. Returns a handle to stop it, reset it and look at it.
 */
function startDemoVan({
  broker = "mqtt://localhost:1883",
  username = process.env.DEMO_VAN_USER,
  password = process.env.DEMO_VAN_PASSWORD,
  daySeconds = 600,
  idleMinutes = 60,
  pollSeconds = 2,
  log = () => {},
} = {}) {
  const flow = buildBridgeFlow({ intervalSeconds: pollSeconds })
  const byId = Object.fromEntries(flow.nodes.map((n) => [n.id, n]))
  const pekaway = fakePekaway()
  const flowContext = new Map()
  const timers = []
  let lastCommand = Date.now()
  let lastResetDay = null

  const client = mqtt.connect(broker, {
    clientId: `schaltli-demo-van-${Math.random().toString(16).slice(2, 8)}`,
    username,
    password,
    reconnectPeriod: 2000,
  })

  // Node-RED's global context, as far as the bridge reads it: Pekaway's
  // time to go, in Pekaway's words.
  const globalApi = { get: (k) => (k === "ttgo" ? pekaway.ttgo() : undefined), set: () => {} }

  // Node-RED's function node, as far as this flow uses it: initialize once,
  // then the body per message, with context, flow context, global and node.send.
  const functions = {}
  for (const n of flow.nodes.filter((n) => n.type === "function")) {
    const own = new Map()
    const context = { get: (k) => own.get(k), set: (k, v) => own.set(k, v) }
    const flowApi = { get: (k) => flowContext.get(k), set: (k, v) => flowContext.set(k, v) }
    const nodeApi = {
      status: () => {},
      warn: (w) => log(`[${n.id}] ${w}`),
      error: (e) => log(`[${n.id}] ${e}`),
      send: (out) => route(n.id, out),
    }
    if (n.initialize) new Function("context", "flow", "node", "global", n.initialize)(context, flowApi, nodeApi, globalApi)
    const body = new Function("msg", "context", "flow", "node", "global", n.func)
    functions[n.id] = (msg) => body(msg, context, flowApi, nodeApi, globalApi)
  }

  // A node's output to the nodes its wires lead to. An output is a message,
  // an array of messages, or null; a node with several outputs returns one
  // entry per output.
  function route(fromId, out) {
    const node = byId[fromId]
    if (out == null) return
    const outputs = (node.outputs ?? 1) > 1 || Array.isArray(out) ? out : [out]
    outputs.forEach((entry, i) => {
      if (entry == null) return
      const messages = Array.isArray(entry) ? entry : [entry]
      for (const target of node.wires[i] ?? []) for (const msg of messages) if (msg) deliver(target, { ...msg })
    })
  }

  function deliver(id, msg) {
    const node = byId[id]
    if (!node) return
    try {
      if (node.type === "function") return route(id, functions[id](msg))
      if (node.type === "mqtt out") {
        client.publish(String(msg.topic), String(msg.payload ?? ""), { retain: !!msg.retain, qos: 0 })
        return
      }
      if (node.type === "delay") {
        timers.push(setTimeout(() => route(id, msg), Number(node.timeout) || 0))
        return
      }
      if (node.type === "http request") {
        // Pekaway's HTTP API drives an Autoterm, which this van has not got.
        route(id, { ...msg, payload: "not in this van", statusCode: 404 })
        return
      }
    } catch (error) {
      log(`[${id}] ${error instanceof Error ? error.message : error}`)
    }
  }

  // Light, as a visitor finds the van: the theme is the bridge's own, so it
  // is put back with a command to the bridge - at the start and on a reset.
  const lightTheme = () => client.publish("schaltli/cmnd/theme", "light")
  let started = false

  const mqttIns = flow.nodes.filter((n) => n.type === "mqtt in")
  client.on("connect", () => {
    log(`connected to ${broker}`)
    client.subscribe([...new Set(mqttIns.map((n) => n.topic)), "pkw/stat/+", "pkw/cmnd/#", "schaltli/cmnd/demo/#"], () => {
      if (!started) lightTheme()
      started = true
    })
  })
  client.on("error", (error) => log(`broker: ${error.message}`))
  client.on("message", (topic, payload, packet) => {
    const text = payload.toString()
    // The fake Pekaway first: it is on the same broker as the bridge.
    if (matches("pkw/stat/+", topic)) {
      const kind = topic.split("/")[2]
      const answer = pekaway.answer(kind)
      if (answer !== null) client.publish(`pkw/tele/${kind}`, answer)
    } else if (matches("pkw/cmnd/#", topic)) {
      if (pekaway.command(topic, text)) lastCommand = Date.now()
    } else if (topic === "schaltli/cmnd/demo/shower") {
      if (pekaway.startShower()) lastCommand = Date.now()
    } else if (topic === "schaltli/cmnd/demo/refill") {
      if (pekaway.startRefill()) lastCommand = Date.now()
    } else if (topic === "schaltli/cmnd/demo/shore") {
      if (pekaway.toggleShore()) lastCommand = Date.now()
    } else if (topic === "schaltli/cmnd/demo/engine") {
      if (pekaway.toggleEngine()) lastCommand = Date.now()
    } else if (topic === "schaltli/cmnd/theme" && text !== "light") {
      lastCommand = Date.now()
    }
    for (const n of mqttIns) {
      if (matches(n.topic, topic)) for (const target of n.wires[0] ?? []) deliver(target, { topic, payload: text, retain: packet.retain })
    }
  })

  // The bridge asks Pekaway on its own interval, as the inject node says.
  for (const n of flow.nodes.filter((n) => n.type === "inject" && n.repeat)) {
    timers.push(setInterval(() => route(n.id, { topic: n.topic || "", payload: Date.now() }), Number(n.repeat) * 1000))
  }

  function reset(why) {
    pekaway.reset()
    lightTheme()
    lastCommand = Date.now()
    log(`reset (${why})`)
  }

  // The clock, and the resets: at 04:00 of the real day, and after an idle hour.
  timers.push(
    setInterval(() => {
      if (!client.connected) return
      const now = Date.now()
      const clock = vanClock(now, daySeconds)
      pekaway.tick(2, clock.daylight)
      client.publish("schaltli/demo/daylight", String(clock.daylight), { retain: true })
      client.publish("schaltli/demo/time", clock.time, { retain: true })
      client.publish("schaltli/demo/shower", pekaway.scene.shower > 0 ? "on" : "off", { retain: true })
      client.publish("schaltli/demo/refill", pekaway.scene.refill > 0 ? "on" : "off", { retain: true })
      client.publish("schaltli/demo/puddle", String(pekaway.scene.puddle), { retain: true })
      client.publish("schaltli/demo/shore", pekaway.scene.shore ? "on" : "off", { retain: true })
      client.publish("schaltli/demo/engine", pekaway.scene.engine > 0 ? "on" : "off", { retain: true })
      for (const [topic, value] of pekaway.energy()) client.publish(topic, value, { retain: true })
      const today = new Date(now).toDateString()
      if (new Date(now).getHours() === 4 && lastResetDay !== today) {
        lastResetDay = today
        reset("04:00")
      }
      if (now - lastCommand > idleMinutes * 60 * 1000) reset("idle")
    }, 2000),
  )

  return {
    client,
    pekaway,
    reset: () => reset("asked"),
    clock: (now = Date.now()) => vanClock(now, daySeconds),
    stop: () =>
      new Promise((resolve) => {
        for (const t of timers) {
          clearTimeout(t)
          clearInterval(t)
        }
        client.end(true, {}, resolve)
      }),
  }
}

module.exports = { startDemoVan, fakePekaway, vanClock, seed }

if (require.main === module) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name)
    return i > 0 ? process.argv[i + 1] : fallback
  }
  const van = startDemoVan({
    broker: arg("--broker", "mqtt://localhost:1883"),
    daySeconds: Number(arg("--day-seconds", "600")),
    idleMinutes: Number(arg("--idle-minutes", "60")),
    log: (line) => console.log(`[demo-van] ${line}`),
  })
  const stop = () => van.stop().then(() => process.exit(0))
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}
