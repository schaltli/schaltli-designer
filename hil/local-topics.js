#!/usr/bin/env node
// Local topics on a board (designer docs/2026-10-13-local-topics.md, device
// contract 2.9; tasks/local-firmware-plan.md, F1). A button group writes
// `local/hil-<run>/view` (initial "b"), a switcher reads it: panel «a» holds
// a dark box, panel «b» a light one. The board must keep the topic itself:
//
//   1. after the install the glass shows «b» - the initial value, not the
//      first panel a switcher shows while its topic has none;
//   2. a tap on the group shows «a», and the board says "a" for the topic;
//   3. a listener on `#` hears nothing under the name from the board;
//   4. a retained «c» published on the same name by the broker changes
//      nothing - a real topic of that name does not reach the display;
//   5. after a restart the glass shows «b» again: nothing is kept.
//
// With --pair <ip> the same project goes to a second board first, and a tap
// on the first leaves the second at «b»: each display has its own value.
//
//   node hil/local-topics.js --device 192.168.1.114 [--pair 192.168.1.117]
//
// Needs the designer dev server (test-render builds the zip) and the HIL
// broker (`npm run hil:broker`). Exit 0 pass, 1 fail, 2 the board is not
// reachable (skipped, loudly).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")
const { deviceTag } = require("./device-tag")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const NAME = `local/hil-${RUN}/view`
const OUT_DIR = path.join(__dirname, "local-topics-report", deviceTag())
const DARK = "#202020"
const LIGHT = "#e0e0e0"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null, pair: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    if (argv[i] === "--pair") args.pair = argv[++i]
  }
  return args
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

async function reachable(base) {
  try {
    return (await get(`${base}/api/debug`, 4000)).status === 200
  } catch {
    return false
  }
}

// The group and the switcher, inside what the glass shows: on a round
// display the square inside its circle.
function layout(ddf) {
  const { width: sw, height: sh } = ddf.screen
  const round = (ddf.raw?.screen?.shape ?? ddf.screen.shape) === "round"
  const side = round ? Math.floor(Math.min(sw, sh) / Math.SQRT2) : null
  const inner = round ? { x: Math.round((sw - side) / 2), y: Math.round((sh - side) / 2), w: side, h: side } : { x: 0, y: 0, w: sw, h: sh }
  const at = (fx, fy, fw, fh) => ({
    x: Math.round(inner.x + inner.w * fx),
    y: Math.round(inner.y + inner.h * fy),
    width: Math.round(inner.w * fw),
    height: Math.round(inner.h * fh),
  })
  return { group: at(0.1, 0.08, 0.8, 0.28), switcher: at(0.2, 0.45, 0.6, 0.45) }
}

function localProject(ddf, stamp) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-local-${RUN}` })
  const { group, switcher } = layout(ddf)
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  const box = (id, color) => ({
    id,
    type: "box",
    zIndex: 1,
    x: 0,
    y: 0,
    width: switcher.width,
    height: switcher.height,
    properties: { fillColor: color, strokeColor: color, strokeWidth: 1, cornerRadius: 0 },
  })
  const panel = (id, value, children) => ({
    id,
    type: "panel",
    zIndex: 0,
    x: 0,
    y: 0,
    width: switcher.width,
    height: switcher.height,
    properties: { comparisonOperator: "==", comparisonValue: value },
    children,
  })
  project.name = "HIL local topics"
  project.fonts = ddf.fonts
  project.combinedTopics = []
  project.topics = [{ id: "view", topic: NAME, type: "text", examples: ["a"], local: true, initial: "b" }]
  project.screens = [
    {
      id: `local-${stamp}`,
      name: "Local",
      // Mid grey: a switcher showing no panel reads as neither «a» nor «b».
      backgroundColor: "#808080",
      objects: [
        {
          id: "group",
          type: "button-group",
          zIndex: 1,
          ...group,
          properties: {
            topic: NAME,
            writeTopic: NAME,
            fontId: font.id,
            states: [
              { id: "st-a", label: "A", readValue: "a", writeValue: "a", showAsOn: false },
              { id: "st-b", label: "B", readValue: "b", writeValue: "b", showAsOn: true },
            ],
          },
        },
        {
          id: "switcher",
          type: "switcher",
          zIndex: 2,
          ...switcher,
          properties: { topic: NAME },
          children: [panel("panel-a", "a", [box("box-a", DARK)]), panel("panel-b", "b", [box("box-b", LIGHT)])],
        },
      ],
    },
  ]
  return project
}

async function buildZip(project) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    return Buffer.from(await page.evaluate((p) => window.__buildDeviceZipForTest(p), project), "base64")
  } finally {
    await browser.close()
  }
}

// One board under test: its project installed, and the means to read it.
async function board(device) {
  const base = `http://${device}`
  const ddf = await loadDdf(device)
  const eink = /papers3/i.test(ddf.deviceId || "")
  const stamp = `${RUN}-${device.replace(/\./g, "-")}`
  const waitFor = async (what, ms) => {
    const deadline = Date.now() + ms
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(`local-${stamp}`)) return
      } catch {}
      if (Date.now() > deadline) throw new Error(`${device}: ${what} within ${ms / 1000} s`)
      await sleep(3000)
    }
  }
  const install = async () => {
    const zipPath = path.join(os.tmpdir(), `hil-local-${stamp}.zip`)
    fs.writeFileSync(zipPath, await buildZip(localProject(ddf, stamp)))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    await waitFor("the board did not come back with the installed project", 180000)
    await sleep(3000)
  }
  const touch = async (x, y, down) => {
    const r = await fetch(`${base}/api/touch?x=${Math.round(x)}&y=${Math.round(y)}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
  }
  // On e-ink a press is held past a refresh, or the board reads only the lift.
  const tap = async (x, y) => {
    await touch(x, y, true)
    await sleep(eink ? 1200 : 80)
    await touch(x, y, false)
    await sleep(eink ? 3000 : 1200)
  }
  const { group, switcher } = layout(ddf)
  let shots = 0
  // What the switcher shows: «a» (dark), «b» (light) or neither, by the
  // brightness at its centre.
  const shown = async (name) => {
    const buf = Buffer.from(await (await fetch(`${base}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer())
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const file = path.join(OUT_DIR, `${device.replace(/\./g, "-")}-${String(++shots).padStart(2, "0")}-${name}.bmp`)
    fs.writeFileSync(file, buf)
    const img = await Jimp.read(file)
    const x = Math.round(switcher.x + switcher.width / 2)
    const y = Math.round(switcher.y + switcher.height / 2)
    const i = (y * img.bitmap.width + x) * 4
    const lum = 0.3 * img.bitmap.data[i] + 0.59 * img.bitmap.data[i + 1] + 0.11 * img.bitmap.data[i + 2]
    return lum < 100 ? "a" : lum > 160 ? "b" : `neither (brightness ${Math.round(lum)})`
  }
  const value = async () => {
    const r = await get(`${base}/api/topic-values?topics=${encodeURIComponent(NAME)}`).catch(() => ({ body: "null" }))
    try {
      const v = JSON.parse(r.body)?.[NAME]
      return v === undefined || v === null ? "(none)" : String(v)
    } catch {
      return "(unreadable)"
    }
  }
  // Seconds since boot, as the board says it: the knob in its JSON, the
  // others in a line.
  const uptime = async () => {
    const body = (await get(`${base}/api/debug`)).body
    try {
      const ms = JSON.parse(body).uptimeMs
      if (typeof ms === "number") return ms / 1000
    } catch {}
    const m = /uptime (\d+) s/.exec(body)
    return m ? Number(m[1]) : NaN
  }
  // The knob restarts on set=restart; the 4.3B and the PaperS3 on
  // set=latewifi=1, with WiFi held back a second (hil/late-wifi.js).
  const knob = /knob/i.test(ddf.deviceId || "")
  const restart = async () => {
    const before = await uptime()
    await get(`${base}/api/debug?set=${knob ? "restart" : "latewifi=1"}`).catch(() => {})
    await sleep(8000)
    await waitFor("the board did not come back after the restart", 120000)
    await sleep(eink ? 5000 : 3000)
    const after = await uptime()
    if (!(after < before)) throw new Error(`${device} did not restart: up ${before} s before, ${after} s after`)
  }
  // A first touch on a blanked panel only wakes it: on the empty bottom.
  const wake = () => tap(switcher.x + switcher.width / 2, Math.min(ddf.screen.height - 5, switcher.y + switcher.height + 8))
  const tapGroup = () => tap(group.x + group.width / 2, group.y + group.height / 2)
  return { device, base, eink, install, shown, value, restart, wake, tapGroup }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node hil/local-topics.js --device <ip> [--pair <ip>]")
    process.exit(1)
  }
  if (!(await reachable(`http://${args.device}`))) {
    console.warn(`SKIPPED - no board reachable at http://${args.device}/api/debug`)
    process.exit(2)
  }
  if (args.pair && !(await reachable(`http://${args.pair}`))) {
    console.warn(`SKIPPED - no second board reachable at http://${args.pair}/api/debug`)
    process.exit(2)
  }
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  // Everything under the name, as it goes over the broker.
  const heard = []
  let ownPublishes = 0
  client.on("message", (topic, payload, packet) => {
    if (topic === NAME && !packet.retain) heard.push(payload.toString())
  })
  await new Promise((resolve) => client.subscribe("#", resolve))
  const publish = (value, retain) =>
    new Promise((resolve) => {
      ownPublishes++
      client.publish(NAME, value, { retain }, resolve)
    })

  try {
    const one = await board(args.device)
    const two = args.pair ? await board(args.pair) : null
    console.log(`local topic ${NAME} on ${args.device}${two ? ` and ${args.pair}` : ""}`)
    if (two) await two.install()
    await one.install()

    await one.wake()
    let seen = await one.shown("installed")
    check("1. after the install the glass shows «b», the initial value", seen === "b", `${seen}, the board says ${await one.value()}`)

    await one.tapGroup()
    seen = await one.shown("tapped")
    const said = await one.value()
    check("2. a tap on the group shows «a», and the board says so", seen === "a" && said === "a", `${seen}, the board says ${said}`)

    await sleep(1000)
    const fromBoard = heard.length - ownPublishes
    check("3. nothing went over the broker under the name", fromBoard === 0, `${fromBoard} message(s): ${JSON.stringify(heard)}`)

    if (two) {
      await two.wake()
      const other = await two.shown("pair-untouched")
      check("pair: the other display still shows «b»", other === "b", `${other}, it says ${await two.value()}`)
    }

    await publish("c", true)
    await sleep(one.eink ? 4000 : 2000)
    seen = await one.shown("broker-said-a")
    check("4. a retained «c» from the broker under the name changes nothing", seen === "a" && (await one.value()) === "a", seen)

    await one.restart()
    await one.wake()
    seen = await one.shown("restarted")
    check("5. after a restart the glass shows «b» again", seen === "b", `${seen}, the board says ${await one.value()}`)
  } finally {
    await new Promise((resolve) => client.unsubscribe("#", resolve))
    await new Promise((resolve) => client.publish(NAME, "", { retain: true }, resolve))
    client.end()
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : `\nPASS - local topics on ${args.device}${args.pair ? ` and ${args.pair}` : ""}`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
