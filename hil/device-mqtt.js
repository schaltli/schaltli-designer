// What HIL learns about a device over the broker since 2026-10-14
// (docs/device-contract.md §4 and §6, #70): its hello names no `url` any
// more, so a script finds a device's test interface on its retained
// `test-interface` topic - there only while the interface is switched on -
// and its description by asking on `ddf/get`.
//
//   const { testInterfaces, instanceAt, deviceDdf } = require("./device-mqtt")

const mqtt = require("mqtt")

const TOPIC_PREFIX = "schaltli"

function brokerUrl() {
  return process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
}

async function withClient(url, fn) {
  const client = await mqtt.connectAsync(url || brokerUrl(), {
    clientId: `hil-device-mqtt-${process.pid}-${Math.random().toString(16).slice(2, 8)}`,
    username: process.env.HIL_MQTT_USERNAME || undefined,
    password: process.env.HIL_MQTT_PASSWORD || undefined,
    connectTimeout: 5000,
    reconnectPeriod: 0,
  })
  try {
    return await fn(client)
  } finally {
    await client.endAsync().catch(() => {})
  }
}

// Every device's test interface on one broker: client id -> host (no port
// when it is 80), from the retained `test-interface` topics.
async function testInterfacesOn(client, waitMs = 1500) {
  const found = new Map()
  const onMessage = (topic, payload) => {
    const [prefix, clientId, leaf] = topic.split("/")
    if (prefix !== TOPIC_PREFIX || leaf !== "test-interface") return
    if (payload.length === 0) return found.delete(clientId)
    try {
      found.set(clientId, new URL(JSON.parse(payload.toString()).url).host)
    } catch {}
  }
  client.on("message", onMessage)
  await client.subscribeAsync(`${TOPIC_PREFIX}/+/test-interface`)
  await new Promise((r) => setTimeout(r, waitMs))
  client.removeListener("message", onMessage)
  await client.unsubscribeAsync(`${TOPIC_PREFIX}/+/test-interface`).catch(() => {})
  return found
}

async function testInterfaces(url, waitMs) {
  return withClient(url, (client) => testInterfacesOn(client, waitMs))
}

// The client id of the device whose test interface answers at `host`, or
// null.
async function instanceAt(host, url, waitMs) {
  const all = await testInterfaces(url, waitMs)
  for (const [clientId, at] of all) if (at === host || at.split(":")[0] === host) return clientId
  return null
}

// A device's description, the way the designer gets it: the retained `ddf`
// if it is there and `fresh` accepts it, else asked for on `ddf/get`.
// Resolves with the zip's bytes; rejects when nothing came in time.
async function deviceDdfOn(client, clientId, { timeoutMs = 30_000, fresh = () => true } = {}) {
  const topic = `${TOPIC_PREFIX}/${clientId}/ddf`
  return new Promise((resolve, reject) => {
    let asked = false
    let timer
    const finish = (error, bytes) => {
      clearTimeout(timer)
      client.removeListener("message", onMessage)
      client.unsubscribe(topic)
      error ? reject(error) : resolve(bytes)
    }
    const onMessage = (t, payload) => {
      if (t !== topic || payload.length === 0) return
      if (asked || fresh(payload)) finish(null, payload)
    }
    client.on("message", onMessage)
    client.subscribe(topic, (err) => {
      if (err) return finish(err)
      timer = setTimeout(() => {
        asked = true
        client.publish(`${topic}/get`, "")
        timer = setTimeout(() => finish(new Error(`${clientId} sent no description within ${timeoutMs / 1000} s`)), timeoutMs)
      }, 1500)
    })
  })
}

// Asked for afresh, ignoring what the broker retained: what the device
// sends now. With `hash`, the retained copy is taken when it is exactly that
// description, as the designer takes it (lib/announced-ddf.ts) - a device is
// asked once per firmware in real use, and the knob asked on every HIL run
// lost its network a run later (2026-10-14, tasks/connections-todo.md).
async function deviceDdf(clientId, url, options = {}) {
  const { hash, ...rest } = options
  const crypto = require("crypto")
  const fresh = hash ? (payload) => crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16) === hash : () => false
  return withClient(url, (client) => deviceDdfOn(client, clientId, { fresh, ...rest }))
}

// The device's description by the address of its test interface.
async function deviceDdfAt(host, url, options) {
  const clientId = await instanceAt(host, url)
  if (!clientId) throw new Error(`no device on the broker says its test interface is at ${host}`)
  return deviceDdf(clientId, url, options)
}

// The project a device keeps for recovery, asked for on `recovery/get` the
// way the designer's «recover» dialog asks. An empty Buffer means the device
// has none; rejects when it does not answer.
async function deviceRecovery(clientId, url, { timeoutMs = 45_000 } = {}) {
  return withClient(url, (client) => {
    const topic = `${TOPIC_PREFIX}/${clientId}/recovery`
    return new Promise((resolve, reject) => {
      let timer
      const finish = (error, bytes) => {
        clearTimeout(timer)
        client.removeListener("message", onMessage)
        error ? reject(error) : resolve(bytes)
      }
      const onMessage = (t, payload) => {
        if (t === topic) finish(null, payload)
      }
      client.on("message", onMessage)
      client.subscribe(topic, (err) => {
        if (err) return finish(err)
        client.publish(`${topic}/get`, "")
        timer = setTimeout(() => finish(new Error(`${clientId} did not answer recovery/get within ${timeoutMs / 1000} s`)), timeoutMs)
      })
    })
  })
}

module.exports = { TOPIC_PREFIX, brokerUrl, withClient, testInterfaces, testInterfacesOn, instanceAt, deviceDdf, deviceDdfOn, deviceDdfAt, deviceRecovery }
