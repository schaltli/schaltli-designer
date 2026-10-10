#!/usr/bin/env node
// The van of demo.schaltli.com (docs/2026-10-09-demo-instance.md, decision 6).
//
// A conversion in progress: stage one was light - three dimmers and two
// relays -, stage two water - a fresh and a grey water tank, and a relay
// that lets the grey water out. What answers the designer is the real VanPi bridge - the flow
// buildBridgeFlow() installs into Node-RED on every Pekaway - run here
// outside Node-RED, node by node and wired as the flow wires them, the way
// e2e/vanpi-bridge.spec.ts runs it. Where that flow talks to Pekaway, a fake
// Pekaway answers: `pkw/stat/<kind>` with `pkw/tele/<kind>` in Pekaway's own
// format, and `pkw/cmnd/…` changes its state. It answers only for what the
// van has so far, so the bridge announces and publishes only that; a later
// stage adds a kind here and the bridge already knows it.
//
// Beside the bridge it keeps the van's clock: a day lasts ten minutes,
// published retained as schaltli/demo/daylight (0 at night, 1 at noon) and
// schaltli/demo/time ("HH:MM"). Nothing in Pekaway's format reads them; the
// designer's «Your van» does.
//
// It goes back to its seed - every light off, the tanks part full - at 04:00
// and after an hour without a command.
//
//   node integrations/vanpi/demo-van.js [--broker mqtt://localhost:1883]
//        [--day-seconds 600] [--idle-minutes 60]
//   DEMO_VAN_USER / DEMO_VAN_PASSWORD: the broker account, if it asks.

const mqtt = require("mqtt")
const { buildBridgeFlow } = require("./build-flow")

/** What the van has, as Pekaway would report it, all off, the tanks part full. */
function seed() {
  return {
    relay: {
      Relay1: false,
      "Relay1 Name": "Lichterkette",
      Relay2: false,
      "Relay2 Name": "Aussenlicht",
      Relay3: false,
      "Relay3 Name": "Grauwasser ablassen",
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
  }
}

// Fresh water used: about 1 % a minute, so a visitor sees it move. An open
// drain empties a full grey water tank in under a minute.
const USE_PER_SECOND = 1 / 60
const DRAIN_PER_SECOND = 2
const round1 = (v) => Math.round(v * 10) / 10

/** The fake Pekaway: its state, its answers, what its commands do. */
function fakePekaway() {
  let state = seed()
  return {
    get state() {
      return state
    },
    reset() {
      state = seed()
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
    tick(seconds) {
      const fresh = state.level.level1
      const grey = state.level.level2
      const used = Math.min(fresh.state, seconds * USE_PER_SECOND)
      fresh.state = round1(fresh.state - used)
      grey.state = round1(Math.min(100, grey.state + used * 0.8))
      if (state.relay.Relay3) grey.state = round1(Math.max(0, grey.state - seconds * DRAIN_PER_SECOND))
      // An empty fresh water tank is filled again at the next stop.
      if (fresh.state <= 5) fresh.state = 100
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

  // Node-RED's function node, as far as this flow uses it: initialize once,
  // then the body per message, with context, flow context and node.send.
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
    if (n.initialize) new Function("context", "flow", "node", n.initialize)(context, flowApi, nodeApi)
    const body = new Function("msg", "context", "flow", "node", n.func)
    functions[n.id] = (msg) => body(msg, context, flowApi, nodeApi)
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

  const mqttIns = flow.nodes.filter((n) => n.type === "mqtt in")
  client.on("connect", () => {
    log(`connected to ${broker}`)
    client.subscribe([...new Set(mqttIns.map((n) => n.topic)), "pkw/stat/+", "pkw/cmnd/#"])
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
    lastCommand = Date.now()
    log(`reset (${why})`)
  }

  // The clock, and the resets: at 04:00 of the real day, and after an idle hour.
  timers.push(
    setInterval(() => {
      if (!client.connected) return
      const now = Date.now()
      pekaway.tick(2)
      const clock = vanClock(now, daySeconds)
      client.publish("schaltli/demo/daylight", String(clock.daylight), { retain: true })
      client.publish("schaltli/demo/time", clock.time, { retain: true })
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
