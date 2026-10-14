// The phone under test, through the app's own test interface
// (schaltli-android test/AppTestInterface.kt; docs/device-contract.md §6,
// #70). Until 2026-10-14 the Android HIL drove the phone over adb -
// screencap, input, am, run-as, logcat, settings; now it asks the app the
// way it asks a board, over the network with HIL_PASSWORD
// (hil/device-auth.js), and adb only installs.
//
// Which phone: the one whose retained `test-interface` topic is on the
// broker - an app with its test interface switched on says where it answers
// there. HIL_PHONE_ID picks one when there are several.

require("../device-auth")
const { testInterfaces } = require("../device-mqtt")

let found = null

// The phone's id on the broker and the base url of its test interface.
async function phone(brokerUrl) {
  if (found) return found
  const all = [...(await testInterfaces(brokerUrl, 2000))].filter(([id]) => id.startsWith("android-"))
  const wanted = process.env.HIL_PHONE_ID
  const pick = wanted ? all.find(([id]) => id === wanted) : all.length === 1 ? all[0] : null
  if (!pick) {
    throw Object.assign(
      new Error(
        all.length === 0
          ? `No phone with its test interface on is on ${brokerUrl || "the broker"}. Switch it on in the app's settings, ` +
              "or over the cable: node hil/android/test-interface.js on"
          : `Several phones have their test interface on (${all.map(([id]) => id).join(", ")}): name one with HIL_PHONE_ID.`,
      ),
      { phoneAbsent: all.length === 0 },
    )
  }
  found = { deviceId: pick[0], base: `http://${pick[1]}` }
  return found
}

async function request(path, { method = "GET", form, timeoutMs = 20_000, brokerUrl } = {}) {
  const { base } = await phone(brokerUrl)
  const init = { method, signal: AbortSignal.timeout(timeoutMs) }
  if (form) {
    init.body = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)]))
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" }
  }
  const res = await fetch(`${base}${path}`, init)
  if (!res.ok) throw new Error(`${method} ${path} on the phone: HTTP ${res.status} ${await res.text().catch(() => "")}`)
  return res
}

const screenshot = async () => Buffer.from(await (await request("/snapshot.png", { timeoutMs: 30_000 })).arrayBuffer())
const debug = async () => (await request("/api/debug")).json()
const tap = (x, y) => request("/api/tap", { method: "POST", form: { x: Math.round(x), y: Math.round(y) } })
const swipe = (x1, y1, x2, y2, ms = 250) =>
  request("/api/swipe", { method: "POST", form: { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), ms }, timeoutMs: ms + 20_000 })
const setDisplayOff = (seconds) => request("/api/device-settings", { method: "POST", form: { displayOffSeconds: seconds } })

// The app afresh, process and all, and back answering.
async function restart(timeoutMs = 30_000) {
  await request("/api/restart", { method: "POST" })
  await new Promise((r) => setTimeout(r, 1500))
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const d = await debug()
      if (d.width > 0) return d
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error("The app did not come back after a restart")
}

// This machine's IPv4 address on the phone's network, for a file the phone
// downloads (a deploy's bundle): the one sharing the most leading bits with
// the phone's own address.
async function addressTowardPhone(brokerUrl) {
  const os = require("os")
  const phoneHost = new URL((await phone(brokerUrl)).base).hostname
  const toBits = (ip) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0)
  const target = toBits(phoneHost)
  let best = null
  let bestShared = -1
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" || a.internal) continue
      let shared = 0
      const x = (toBits(a.address) ^ target) >>> 0
      while (shared < 32 && !((x >>> (31 - shared)) & 1)) shared++
      if (shared > bestShared) {
        best = a.address
        bestShared = shared
      }
    }
  }
  if (!best) throw new Error("This machine has no IPv4 address to serve from")
  return best
}

module.exports = { phone, screenshot, debug, tap, swipe, setDisplayOff, restart, addressTowardPhone }
