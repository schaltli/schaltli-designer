#!/usr/bin/env node
// Does a finger land where the board draws? A check with a person in it.
//
// Why (2026-10-30, the Waveshare 4", tasks/waveshare-4-todo.md Task 5): every
// other touch check drives /api/touch, which hands the firmware coordinates
// that never went through the touch controller - so a GT911 reporting x and
// y swapped, mirrored or scaled against the panel passes them all. Only a
// real finger on the glass goes the whole way.
//
// It installs one screen with five buttons - the four corners and the
// middle, each sending its own name over MQTT - and asks for a tap on each,
// in order. A target passes when its message arrives in its turn; a message
// twice or from nowhere fails the run. A board whose firmware logs
// "[touch] down x,y" (the RGB boards since 2026-10-30) says over serial
// where a tap that hit nothing went.
// The corners sit flush in the corners, where a mirror shows first.
//
// Not part of test:all: it waits for a finger. Run it by hand on a new
// board, after anything that touches the touch path, or when taps seem to
// miss:
//
//   node -r ./hil/device-auth.js hil/touch-corners.js --device <ip>
//
// Needs the designer (DESIGNER_URL, default http://localhost:3000) to build
// the project and the broker the board talks to (HIL_BROKER_URL).
// Exit 0 pass, 1 fail, 2 device not reachable.
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const TOPIC = `hil-touch/${RUN}`
// How long a person gets for the first tap, and between the later ones.
const TAP_WAIT_MS = 180000
const BETWEEN_TAPS_MS = 20000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--device") args.device = argv[++i]
  if (!args.device) {
    console.error("usage: node -r ./hil/device-auth.js hil/touch-corners.js --device <ip>")
    process.exit(1)
  }
  return args
}

// The five targets, in the order they are asked for.
function targets(screen) {
  const w = Math.round(screen.width * 0.25)
  const h = Math.round(screen.height * 0.17)
  return [
    { id: "top-left", label: "1", say: "oben links", x: 0, y: 0, w, h },
    { id: "top-right", label: "2", say: "oben rechts", x: screen.width - w, y: 0, w, h },
    { id: "bottom-right", label: "3", say: "unten rechts", x: screen.width - w, y: screen.height - h, w, h },
    { id: "bottom-left", label: "4", say: "unten links", x: 0, y: screen.height - h, w, h },
    { id: "middle", label: "5", say: "in der Mitte", x: Math.round((screen.width - w) / 2), y: Math.round((screen.height - h) / 2), w, h },
  ]
}

function touchProject(ddf, screenId) {
  const { project } = buildProject(ddf, { topicPrefix: TOPIC })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.6)]
  project.name = "HIL touch corners"
  project.fonts = ddf.fonts
  project.combinedTopics = []
  project.topics = []
  project.screens = [
    {
      id: screenId,
      name: "Touch",
      backgroundColor: "#202020",
      objects: targets(ddf.screen).map((t, i) => ({
        id: t.id,
        type: "button",
        zIndex: 1 + i,
        x: t.x,
        y: t.y,
        width: t.w,
        height: t.h,
        properties: {
          text: t.label,
          buttonStyle: "filled",
          buttonColor: "#2850c8",
          fontId: font.id,
          action: { type: "send-mqtt", mqttTopic: `${TOPIC}/${t.id}`, mqttMessage: "pressed" },
        },
      })),
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

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`
  try {
    const r = await fetch(`${base}/api/device-settings`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`status ${r.status}`)
  } catch (e) {
    console.warn(`SKIPPED - ${device} not reachable (${e.message})`)
    process.exit(2)
  }

  const ddf = await loadDdf(device)
  const screenId = `touch-${RUN}`
  console.log(`=== touch corners (${ddf.deviceId}, ${ddf.screen.width}x${ddf.screen.height}, device: ${device}) ===`)

  const zipPath = path.join(os.tmpdir(), `hil-touch-${RUN}.zip`)
  fs.writeFileSync(zipPath, await buildZip(touchProject(ddf, screenId)))
  execFileSync("curl", ["-s", "--show-error", "-m", "60", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
  const deadline = Date.now() + 180000
  for (;;) {
    try {
      const r = await fetch(`${base}/api/device-settings`, { signal: AbortSignal.timeout(5000) })
      if (r.ok && (await r.text()).includes(screenId)) break
    } catch {}
    if (Date.now() > deadline) {
      console.error("FAIL - the board did not come back with the touch screen within 180 s")
      process.exit(1)
    }
    await sleep(3000)
  }
  await sleep(2000)

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  const heard = []
  client.on("message", (topic) => heard.push(topic.slice(TOPIC.length + 1)))
  await new Promise((resolve) => client.subscribe(`${TOPIC}/#`, resolve))

  // One sequence, not one window per target: when a tap is lost, a window
  // per target hands every later tap to the target before it, and one miss
  // reads as four wrong corners (the first run, 2026-10-30). So the person
  // taps all five in order, and what arrived is compared with that order.
  const all = targets(ddf.screen)
  console.log(`\n  Tippe die Buttons der Reihe nach je einmal an: ${all.map((t) => `${t.label} ${t.say}`).join(", ")}.`)
  let last = Date.now()
  let seen = 0
  while (heard.length < all.length && Date.now() - last < (seen === 0 ? TAP_WAIT_MS : BETWEEN_TAPS_MS)) {
    if (heard.length !== seen) {
      seen = heard.length
      last = Date.now()
      console.log(`  heard ${heard[seen - 1]}`)
    }
    await sleep(100)
  }
  await sleep(800) // a second message from the last tap would land here
  client.end()

  const failures = []
  let at = 0
  for (const t of all) {
    const i = heard.indexOf(t.id, at)
    if (i !== -1) at = i + 1
    console.log(`  ${i !== -1 ? "PASS" : "FAIL"} ${t.id} (${t.x},${t.y} ${t.w}x${t.h}): ${i !== -1 ? "landed" : "never arrived in its turn"}`)
    if (i === -1) failures.push(t.id)
  }
  const stray = heard.filter((h, i) => !all.some((t) => t.id === h) || heard.indexOf(h) !== i)
  if (stray.length) {
    console.log(`  FAIL a tap landed twice or elsewhere: ${stray.join(", ")} (heard in all: ${heard.join(", ")})`)
    failures.push(...stray)
  }

  if (failures.length) {
    console.log(`\nFAIL - a tap landed elsewhere or not at all: ${failures.join(", ")}`)
    process.exit(1)
  }
  console.log(`\nPASS - every tap landed on what it was aimed at, corners included`)
}

main().catch((e) => {
  console.error(`FAILED: ${e.stack || e.message}`)
  process.exit(1)
})
