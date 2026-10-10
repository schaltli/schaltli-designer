#!/usr/bin/env node
// Checks demo.schaltli.com from outside, after every setup
// (docs/2026-10-09-demo-instance.md, decision 10): it opens with the start
// project over a valid certificate, refuses what the demo does not do, the
// broker answers a visitor's command and keeps visitors off everything else,
// and nothing but 80 and 443 (and SSH) is reachable.
//
//   node deploy/demo/check.js [--host demo.schaltli.com]
//
// Exit 0 when every check passes, 1 otherwise.

const net = require("net")
const mqtt = require("mqtt")

const host = process.argv.includes("--host") ? process.argv[process.argv.indexOf("--host") + 1] : "demo.schaltli.com"
const base = `https://${host}`
let failed = 0
const check = (ok, what, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`)
  if (!ok) failed++
}

function portClosed(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 4000 })
    socket.once("connect", () => {
      socket.destroy()
      resolve(false)
    })
    socket.once("timeout", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(true))
  })
}

function brokerClient() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`wss://${host}/mqtt`, { clientId: `check-${Date.now()}-${Math.random()}`, reconnectPeriod: 0, connectTimeout: 10000 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function waitFor(client, topic, predicate, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.removeListener("message", onMessage)
      resolve(null)
    }, ms)
    function onMessage(t, payload) {
      const value = payload.toString()
      if (t === topic && predicate(value)) {
        clearTimeout(timer)
        client.removeListener("message", onMessage)
        resolve(value)
      }
    }
    client.on("message", onMessage)
    client.subscribe(topic)
  })
}

async function main() {
  console.log(`[demo-check] ${base}`)

  // The page and the start project, over HTTPS - fetch refuses a bad certificate.
  const version = await fetch(`${base}/api/version`).then((r) => r.json()).catch((e) => ({ error: String(e) }))
  check(version?.demo?.start === "Camper", "demo mode, start project «Camper»", JSON.stringify(version.demo ?? version.error))
  check((await fetch(`${base}/`)).ok, "the page answers")
  check((await fetch(`${base}/api/projects/Camper`)).ok, "the start project is there")

  // What the demo does not do.
  const refused = [
    ["POST", "/api/projects", { name: "x", project: {} }],
    ["DELETE", "/api/projects/Camper"],
    ["POST", "/api/ddf/fetch", { url: "http://192.0.2.1/ddf.zip" }],
    ["GET", "/api/translate?q=Licht&tl=en"],
    ["POST", "/api/deploy", {}],
  ]
  for (const [method, path, body] of refused) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
    check(res.status === 403, `${method} ${path} refused`, String(res.status))
  }
  const big = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(70 * 1024) })
  check(big.status === 413, "a body above 64 KB refused at the door", String(big.status))

  // The broker, as a visitor.
  try {
    const visitor = await brokerClient()
    const watcher = await brokerClient()
    check(true, "the broker answers on wss://…/mqtt")
    const name = await waitFor(watcher, "schaltli/state/dimmer/1/name", (v) => v.length > 0, 8000)
    check(name !== null, "the demo van's values arrive", name ?? "nothing")

    visitor.publish("schaltli/cmnd/dimmer/1", "30")
    const level = await waitFor(watcher, "schaltli/state/dimmer/1/level", (v) => v === "30", 8000)
    check(level === "30", "a visitor's command switches the van")
    visitor.publish("schaltli/cmnd/dimmer/1", "0")

    visitor.publish("schaltli/state/dimmer/1/name", "check-was-here", { retain: true })
    const forged = await waitFor(watcher, "schaltli/state/dimmer/1/name", (v) => v === "check-was-here", 3000)
    check(forged === null, "a visitor cannot write the van's state")
    visitor.publish("homeassistant/sensor/check/config", "{}", { retain: true })
    const announced = await waitFor(watcher, "homeassistant/sensor/check/config", () => true, 3000)
    check(announced === null, "a visitor cannot announce blocks")
    visitor.end(true)
    watcher.end(true)
  } catch (error) {
    check(false, "the broker answers on wss://…/mqtt", String(error))
  }

  // Nothing else reachable from outside.
  for (const port of [1883, 3000, 9001]) check(await portClosed(port), `port ${port} closed from outside`)

  console.log(failed === 0 ? "[demo-check] PASS" : `[demo-check] FAIL - ${failed} check(s)`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
