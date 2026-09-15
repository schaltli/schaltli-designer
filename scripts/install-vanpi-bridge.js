#!/usr/bin/env node
// Installs, updates or removes the ScreenBee VanPi bridge - a Node-RED tab
// that republishes Pekaway's values under screenbee/state and turns
// screenbee/cmnd into Pekaway's commands (docs/2026-09-15-live-data.md,
// decision 1; the tab itself is built by integrations/vanpi/build-flow.js).
//
// Runs on the VanPi, from deploy/pekaway-install.sh, and talks to Node-RED's
// admin API on 127.0.0.1:1880. Adds or replaces exactly one tab through
// POST /flow or PUT /flow/:id; Pekaway's own flows are neither read into it
// nor written back. A copy of all flows as they were is saved first, because
// a tool that edits someone's running automation should leave a way back.
//
// Anywhere that is not a VanPi it does nothing and says why: no Node-RED
// answering, or a Node-RED without Pekaway's MQTT API. Exits 0 then, so an
// install elsewhere is not stopped by it.
//
// --verify, after installing: waits for the bridge's retained values to be on
// the broker. The install script runs it every time, which makes each install
// its own check that the bridge works on this van.
//
// Run: node scripts/install-vanpi-bridge.js [--uninstall] [--verify]
//        [--node-red <url>] [--broker <mqtt url>] [--interval <seconds>]

const fs = require("fs")
const os = require("os")
const path = require("path")
const { buildBridgeFlow, BROKER_ID } = require("../integrations/vanpi/build-flow")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const NODE_RED = arg("--node-red", "http://127.0.0.1:1880")
const BROKER = arg("--broker", "mqtt://127.0.0.1:1883")
const INTERVAL = Number(arg("--interval", "2"))
const uninstall = process.argv.includes("--uninstall")
const verify = process.argv.includes("--verify")

const log = (message) => console.log(`[vanpi-bridge] ${message}`)

async function api(method, route, body) {
  const res = await fetch(`${NODE_RED}${route}`, {
    method,
    headers: { "Content-Type": "application/json", "Node-RED-API-Version": "v2" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  return { status: res.status, body: text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null }
}

async function verifyValues() {
  let mqtt
  try {
    mqtt = require("mqtt")
  } catch {
    log("cannot verify: the mqtt package is not installed here")
    return false
  }
  const client = mqtt.connect(BROKER, { reconnectPeriod: 0, connectTimeout: 5000 })
  const seen = new Map()
  try {
    await new Promise((resolve, reject) => {
      client.once("connect", resolve)
      client.once("error", reject)
    })
    client.on("message", (topic, payload) => {
      if (payload.length > 0) seen.set(topic, payload.toString())
    })
    client.subscribe("screenbee/state/#")
    // The first round goes out five seconds after the tab starts, and a
    // round's answers arrive within a second or two.
    const deadline = Date.now() + 20000
    while (Date.now() < deadline && seen.size === 0) await new Promise((r) => setTimeout(r, 500))
    await new Promise((r) => setTimeout(r, 2000))
  } catch (e) {
    log(`cannot verify: broker ${BROKER} not reachable (${e.message})`)
    return false
  } finally {
    client.end(true)
  }
  if (seen.size === 0) {
    log("VERIFY FAILED: no screenbee/state values on the broker 20 s after installing")
    return false
  }
  const sample = [...seen.entries()].slice(0, 5).map(([t, v]) => `${t} = ${v}`).join(", ")
  log(`verified: ${seen.size} retained screenbee/state values, e.g. ${sample}`)
  return true
}

async function main() {
  let flows
  try {
    const res = await api("GET", "/flows")
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    flows = res.body.flows || res.body
  } catch (e) {
    log(`no Node-RED admin API at ${NODE_RED} (${e.message}) - not a VanPi, nothing to do`)
    return 0
  }

  const isVanPi = flows.some((n) => n.type === "mqtt in" && n.topic === "pkw/stat/batt")
  // Found by its broker config node, not by the tab's id: Node-RED gives a tab
  // added through POST /flow an id of its own and ignores the one sent, while
  // keeping the ids of the nodes inside. Looking for the sent id found nothing
  // on the second install, which then tried to add the tab again and was
  // refused for duplicate node ids (reference van, 2026-09-15).
  const marker = flows.find((n) => n.id === BROKER_ID)
  const installedTab = marker ? marker.z : null
  const installed = Boolean(installedTab)

  if (uninstall) {
    if (!installed) {
      log("not installed, nothing to remove")
      return 0
    }
    const res = await api("DELETE", `/flow/${installedTab}`)
    if (res.status !== 204 && res.status !== 200) {
      log(`ERROR: removing the tab failed: HTTP ${res.status} ${JSON.stringify(res.body)}`)
      return 1
    }
    log("removed the ScreenBee VanPi Bridge tab")
    return 0
  }

  if (!isVanPi) {
    log("Node-RED answers but has no Pekaway MQTT API (no pkw/stat/batt) - not a VanPi, nothing to do")
    return 0
  }

  const backupDir = path.join(os.homedir(), ".node-red")
  if (fs.existsSync(backupDir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backup = path.join(backupDir, `flows.pre_screenbee_bridge_${stamp}.json`)
    fs.writeFileSync(backup, JSON.stringify(flows, null, 1))
    log(`saved all flows as they were to ${backup}`)
  }

  // An update keeps the id Node-RED gave the tab: PUT /flow/:id wants the same
  // id in the body, and the nodes inside have to name it as their tab.
  const flow = buildBridgeFlow({ intervalSeconds: INTERVAL, tabId: installedTab || undefined })
  const res = installed ? await api("PUT", `/flow/${installedTab}`, flow) : await api("POST", "/flow", flow)
  if (res.status !== 200 && res.status !== 204) {
    log(`ERROR: ${installed ? "updating" : "adding"} the tab failed: HTTP ${res.status} ${JSON.stringify(res.body)}`)
    return 1
  }
  log(`${installed ? "updated" : "added"} the ScreenBee VanPi Bridge tab (asks every ${INTERVAL} s)`)

  if (verify) return (await verifyValues()) ? 0 : 1
  return 0
}

main().then((code) => process.exit(code), (e) => {
  log(`ERROR: ${e.message}`)
  process.exit(1)
})
