#!/usr/bin/env node
// The energy diagram moving on the Waveshare 4.3B (designer
// docs/2026-10-11-energy-diagram.md, decision 10 and 14; device contract
// 2.8; tasks/energy-devices-plan.md, F4 and F5). That it draws as the
// designer does is hil/conformance's (a still specimen, both modes); this
// asks what only the board can say:
//
//   1. it moves: two pictures of the glass a moment apart differ inside the
//      diagram and nowhere else - for a Flow (dots) and a Sankey (wave);
//   2. a tap is no slower for it: a switch beside the diagram, tapped 20
//      times at random intervals with Motion off and again with Motion on;
//      the board times each from the sample to the press feedback on the
//      glass (`tap latency` on /api/debug), and the moving median may be at
//      most 1.2 times the still one - the spike's bound - while the motion
//      steps at least 8 times a second;
//   3. a tap on a node runs its action: the sun's opens a popup.
//
// The diagram's values come from the broker the board listens to, retained
// (HIL_BROKER_URL, default mqtt://localhost:1883 - `npm run hil:broker`).
//
// Run: node hil/waveshare4v3b/energy-diagram.js --device <ip> [--mode flow|sankey]
// Needs the dev server (test-render builds the zip). Exit 0 pass, 1 fail,
// 2 the board is not reachable (skipped, loudly).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { loadDdf } = require("../conformance/ddf")
const { buildProject } = require("../conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const PREFIX = `hil-energy-${RUN}`
const DIAGRAM = { x: 0, y: 0, width: 580, height: 480 }
const SWITCH = { x: 600, y: 208, width: 160, height: 64 }
const TAPS = 20
const MAX_SLOWDOWN = 1.2
const MIN_STEPS = 8
const OUT_DIR = path.join(__dirname, "report", "energy")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null, modes: ["flow", "sankey"] }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    if (argv[i] === "--mode") args.modes = [argv[++i]]
  }
  return args
}

async function get(url, ms = 10000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
  return { status: r.status, body: await r.text() }
}

const VALUES = { solar: "180", battery: "120", soc: "64", fridge: "45" }

function energyProject(ddf, mode, motion) {
  const { project } = buildProject(ddf, { topicPrefix: PREFIX })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.5)]
  const small = sorted[Math.floor(sorted.length * 0.3)]
  const topic = (name) => `${PREFIX}/${name}`
  project.name = "HIL energy diagram"
  project.fonts = ddf.fonts
  project.topics = [
    { id: "sw", topic: topic("sw"), type: "text", examples: ["off"] },
    ...Object.entries(VALUES).map(([name, value]) => ({ id: name, topic: topic(name), type: "numeric", examples: [value] })),
  ]
  project.combinedTopics = []
  const at = (fx, fy) => ({ x: Math.round(DIAGRAM.width * fx), y: Math.round(DIAGRAM.height * fy) })
  const watts = [{ text: "{watts} W" }]
  project.screens = [
    {
      id: `energy-${RUN}`,
      name: "Energie",
      backgroundColor: "#ffffff",
      objects: [
        {
          id: "diagram",
          type: "energy-diagram",
          zIndex: 1,
          ...DIAGRAM,
          properties: {
            mode,
            motion,
            fullScale: 500,
            fontId: small.id,
            valueFontId: font.id,
            nodes: [
              { id: "bus", role: "bus", name: "12 V", ...at(0.5, 0.45) },
              { id: "solar", role: "source", name: "Solar", colorRole: "energySun", topic: topic("solar"), lines: watts, action: { type: "open-popup", targetScreenId: `popup-${RUN}` }, ...at(0.18, 0.18) },
              { id: "shore", role: "source", name: "Landstrom", colorRole: "energyGrid", topic: topic("shore"), lines: watts, ...at(0.5, 0.12) },
              { id: "battery", role: "storage", name: "Batterie", colorRole: "energyCharge", topic: topic("battery"), chargeTopic: topic("soc"), lines: watts, ...at(0.18, 0.72) },
              { id: "fridge", role: "sink", name: "Kühlschrank", colorRole: "energyGrid", topic: topic("fridge"), lines: watts, ...at(0.82, 0.18) },
              { id: "rest", role: "rest", name: "Verbraucher", colorRole: "energyLoad", lines: watts, ...at(0.82, 0.72) },
            ],
          },
        },
        {
          id: "sw",
          type: "switch",
          zIndex: 2,
          ...SWITCH,
          properties: {
            topic: topic("sw"),
            writeTopic: `${topic("sw")}/set`,
            states: [
              { id: "off", label: "Aus", readValue: "off", writeValue: "off", showAsOn: false },
              { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true },
            ],
            switchStyle: "filled",
            switchColor: "#6750a4",
            fontId: font.id,
          },
        },
      ],
    },
    {
      id: `popup-${RUN}`,
      name: "Solar",
      screenType: "popup",
      backgroundColor: "#ffffff",
      // A popup is as big as what it holds.
      objects: [{ id: "popup-card", type: "box", zIndex: 1, x: 250, y: 140, width: 300, height: 200, properties: { fillColor: "#ffffff", strokeColor: "#3a3a3a", strokeWidth: 2 } }],
    },
  ]
  return project
}

async function install(base, ddf, project) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)
    const zipPath = path.join(os.tmpdir(), `hil-energy-${RUN}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl, "-o", os.devNull])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
  } finally {
    await browser.close()
  }
  const deadline = Date.now() + 180000
  for (;;) {
    try {
      const r = await get(`${base}/api/device-settings`, 5000)
      if (r.status === 200 && r.body.includes(`energy-${RUN}`)) break
    } catch {}
    if (Date.now() > deadline) throw new Error("the board did not come back with the diagram's screen within 180 s")
    await sleep(3000)
  }
  await sleep(3000)
}

// The values, retained, and the board's word that it has them.
async function publishValues(base) {
  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  for (const [name, value] of Object.entries(VALUES)) {
    await new Promise((resolve) => client.publish(`${PREFIX}/${name}`, value, { retain: true }, resolve))
  }
  client.end()
  const topics = Object.keys(VALUES).map((name) => `${PREFIX}/${name}`)
  const deadline = Date.now() + 15000
  for (;;) {
    const r = await get(`${base}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`).catch(() => ({ body: "null" }))
    let values = null
    try {
      values = JSON.parse(r.body)
    } catch {}
    if (values && Object.entries(VALUES).every(([name, value]) => String(values[`${PREFIX}/${name}`]) === value)) return
    if (Date.now() > deadline) throw new Error(`the board never reported the diagram's values (broker ${BROKER_URL})`)
    await sleep(500)
  }
}

const touch = (base, x, y, down) =>
  fetch(`${base}/api/touch?x=${x}&y=${y}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })

async function tap(base, x, y) {
  await touch(base, x, y, true)
  await sleep(120)
  await touch(base, x, y, false)
}

// Taps the switch and returns the board's own tap latency.
async function measureTaps(base) {
  const x = SWITCH.x + SWITCH.width / 4, y = SWITCH.y + SWITCH.height / 2
  // A first tap wakes a dark panel and counts for nothing.
  await tap(base, x, y)
  await sleep(800)
  await get(`${base}/api/debug?set=taplatency=clear`)
  // At random intervals: taps at a fixed beat lock onto the motion's own
  // beat (the spike, 2026-10-11). A finger comes at any moment.
  for (let i = 0; i < TAPS; i++) {
    await tap(base, x, y)
    await sleep(600 + Math.floor(Math.random() * 400))
  }
  const debug = (await get(`${base}/api/debug`)).body
  const m = /tap latency: (\d+) taps, median ([\d.]+) ms, p90 ([\d.]+) ms, worst ([\d.]+) ms/.exec(debug)
  if (!m) throw new Error("no tap latency on /api/debug")
  return { taps: Number(m[1]), median: Number(m[2]), p90: Number(m[3]), worst: Number(m[4]), debug }
}

// The panel goes dark after 15 s without a touch, and a dark board moves
// nothing: a tap where nothing is wakes it.
async function wake(base) {
  await tap(base, 700, 450)
  await sleep(1500)
}

async function glass(base, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${name}.bmp`)
  fs.writeFileSync(file, Buffer.from(await (await fetch(`${base}/panel.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer()))
  return Jimp.read(file)
}

// Where two pictures differ: inside the diagram, and outside it.
function changes(a, b) {
  let inside = 0, outside = 0
  const { width, height } = a.bitmap
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (a.bitmap.data[i] === b.bitmap.data[i] && a.bitmap.data[i + 1] === b.bitmap.data[i + 1] && a.bitmap.data[i + 2] === b.bitmap.data[i + 2]) continue
      const within = x >= DIAGRAM.x && x < DIAGRAM.x + DIAGRAM.width && y >= DIAGRAM.y && y < DIAGRAM.y + DIAGRAM.height
      if (within) inside++
      else outside++
    }
  }
  return { inside, outside }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node hil/waveshare4v3b/energy-diagram.js --device <ip> [--mode flow|sankey]")
    process.exit(1)
  }
  const base = `http://${args.device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  const ddf = await loadDdf(args.device)
  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }
  if (!ddf.supportedObjectTypes.includes("energy-diagram")) {
    check("the board declares energy-diagram", false, "its DDF does not list it - firmware before generation 1.7")
    process.exit(1)
  }

  for (const mode of args.modes) {
    console.log(`\n--- ${mode}: still ---`)
    await install(base, ddf, energyProject(ddf, mode, false))
    await publishValues(base)
    await wake(base)
    const a = await glass(base, `${mode}-still-1`)
    await sleep(400)
    const b = await glass(base, `${mode}-still-2`)
    const stillChanges = changes(a, b)
    check(`${mode}, Motion off: the glass stands still`, stillChanges.inside + stillChanges.outside === 0, `${stillChanges.inside + stillChanges.outside} px changed`)
    const still = await measureTaps(base)
    console.log(`   still: median ${still.median} ms, p90 ${still.p90} ms, worst ${still.worst} ms`)

    console.log(`--- ${mode}: moving ---`)
    await install(base, ddf, energyProject(ddf, mode, true))
    await publishValues(base)
    await wake(base)
    const c = await glass(base, `${mode}-moving-1`)
    await sleep(400)
    const d = await glass(base, `${mode}-moving-2`)
    const moved = changes(c, d)
    check(`${mode}, Motion on: the glass moves inside the diagram and nowhere else`, moved.inside > 20 && moved.outside === 0, `${moved.inside} px inside, ${moved.outside} outside`)
    const moving = await measureTaps(base)
    const line = moving.debug.split("\n").find((l) => l.includes("energy motion")) ?? ""
    const steps = Number(/([\d.]+) steps\/s/.exec(line)?.[1] ?? 0)
    console.log(`   ${line.trim()}`)
    console.log(`   moving: median ${moving.median} ms, p90 ${moving.p90} ms, worst ${moving.worst} ms`)
    check(`${mode}: the motion steps at least ${MIN_STEPS} times a second`, steps >= MIN_STEPS, `${steps} steps/s`)
    check(
      `${mode}: a tap is at most ${Math.round((MAX_SLOWDOWN - 1) * 100)} % slower while it moves`,
      moving.median <= still.median * MAX_SLOWDOWN,
      `median ${moving.median} ms against ${still.median} ms (x${(moving.median / still.median).toFixed(2)})`,
    )

    if (mode === "flow") {
      // The sun's circle, at (18 %, 18 %) of the diagram.
      await tap(base, DIAGRAM.x + Math.round(DIAGRAM.width * 0.18), DIAGRAM.y + Math.round(DIAGRAM.height * 0.18))
      await sleep(1500)
      const debug = (await get(`${base}/api/debug`)).body
      const popupLine = (debug.split("\n").find((l) => l.includes("popup:")) ?? "").trim()
      check("a tap on the sun's node opens its popup", /popup: open/.test(popupLine), popupLine)
    }
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : "\nPASS - the energy diagram on the 4.3B")
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
