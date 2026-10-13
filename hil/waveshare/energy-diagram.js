#!/usr/bin/env node
// The energy diagram moving on the knob (designer
// docs/2026-10-11-energy-diagram.md, decision 15 as of 2026-10-12;
// tasks/energy-knob-papers3-plan.md, K2 and K4). The 4.3B's
// hil/waveshare4v3b/energy-diagram.js, for the round 360x360 glass: that it
// draws as the designer does is hil/conformance's; this asks
//
//   1. it moves: two pictures of the glass a moment apart differ inside the
//      diagram and nowhere else - a Flow's dots, a Sankey's wave; with
//      Motion off they do not differ at all;
//   2. it costs input little: at least 8 steps a second, and no step holds
//      the loop longer than 25 ms - a tap or a detent waits at most that
//      long for it. The first step after a redraw is reported apart;
//   3. a tap on a node runs its action: the sun's opens a popup.
//
// The values come retained from the broker the knob listens to
// (HIL_BROKER_URL, default mqtt://localhost:1883 - `npm run hil:broker`).
//
// Run: node hil/waveshare/energy-diagram.js --device <ip> [--mode flow|sankey]
// Needs the dev server (test-render builds the zip). Exit 0 pass, 1 fail,
// 2 the knob is not reachable (skipped, loudly).

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
const PREFIX = `hil-energy-knob-${RUN}`
// Inside the circle: a square of 0.72 of the side, centred.
const DIAGRAM = { x: 50, y: 50, width: 260, height: 260 }
const MIN_STEPS = 8
const MAX_STEP_MS = 25
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

const debugOf = async (base) => JSON.parse((await get(`${base}/api/debug`)).body)

const VALUES = { solar: "180", battery: "120", soc: "64", fridge: "45" }
// The fridge's watts come as JSON, read through its field (`…/fridge#value`),
// as the author's chargers do: a new value redraws the diagram (2026-10-13).
const JSON_FIELD = { fridge: "value" }
const payload = (name, value) => (JSON_FIELD[name] ? JSON.stringify({ [JSON_FIELD[name]]: Number(value) }) : value)

function energyProject(ddf, mode, motion) {
  const { project } = buildProject(ddf, { topicPrefix: PREFIX })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  const small = sorted[0]
  const topic = (name) => `${PREFIX}/${name}`
  project.name = "HIL energy diagram"
  project.fonts = ddf.fonts
  project.topics = Object.entries(VALUES).map(([name, value]) =>
    JSON_FIELD[name]
      ? { id: name, topic: topic(name), type: "json", subtopics: [{ path: JSON_FIELD[name], type: "numeric" }], examples: [payload(name, value)] }
      : { id: name, topic: topic(name), type: "numeric", examples: [value] },
  )
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
              { id: "solar", role: "source", name: "Solar", colorRole: "energySun", topic: topic("solar"), lines: watts, action: { type: "open-popup", targetScreenId: `popup-${RUN}` }, ...at(0.2, 0.2) },
              { id: "battery", role: "storage", name: "Batterie", colorRole: "energyCharge", topic: topic("battery"), chargeTopic: topic("soc"), lines: watts, ...at(0.2, 0.72) },
              { id: "fridge", role: "sink", name: "Kühlschrank", colorRole: "energyGrid", topic: `${topic("fridge")}#value`, lines: watts, ...at(0.8, 0.2) },
              { id: "rest", role: "rest", name: "Verbraucher", colorRole: "energyLoad", lines: watts, ...at(0.8, 0.72) },
            ],
          },
        },
      ],
    },
    {
      id: `popup-${RUN}`,
      name: "Solar",
      screenType: "popup",
      backgroundColor: "#ffffff",
      objects: [{ id: "popup-card", type: "box", zIndex: 1, x: 90, y: 110, width: 180, height: 140, properties: { fillColor: "#ffffff", strokeColor: "#3a3a3a", strokeWidth: 2 } }],
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
    const zipPath = path.join(os.tmpdir(), `hil-energy-knob-${RUN}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
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
    if (Date.now() > deadline) throw new Error("the knob did not come back with the diagram's screen within 180 s")
    await sleep(3000)
  }
  await sleep(3000)
}

// The values, retained, and the knob's word that it has them.
async function publishValues(base, values = VALUES) {
  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  for (const [name, value] of Object.entries(values)) {
    await new Promise((resolve) => client.publish(`${PREFIX}/${name}`, payload(name, value), { retain: true }, resolve))
  }
  client.end()
  const topics = Object.keys(values).map((name) => `${PREFIX}/${name}`)
  const deadline = Date.now() + 15000
  for (;;) {
    const r = await get(`${base}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`).catch(() => ({ body: "null" }))
    let reported = null
    try {
      reported = JSON.parse(r.body)
    } catch {}
    if (reported && Object.entries(values).every(([name, value]) => String(reported[`${PREFIX}/${name}`]).replace(/\s/g, "") === payload(name, value))) return
    if (Date.now() > deadline) throw new Error(`the knob never reported the diagram's values (broker ${BROKER_URL})`)
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

// A dark panel moves nothing: a tap where nothing is - the empty bottom of
// the circle - wakes it.
async function wake(base) {
  await tap(base, 180, 340)
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
    console.error("usage: node hil/waveshare/energy-diagram.js --device <ip> [--mode flow|sankey]")
    process.exit(1)
  }
  const base = `http://${args.device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no knob reachable at ${base}/api/debug`)
    process.exit(2)
  }
  const ddf = await loadDdf(args.device)
  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }
  if (!ddf.supportedObjectTypes.includes("energy-diagram")) {
    check("the knob declares energy-diagram", false, "its DDF does not list it - firmware from before 2026-10-12")
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
    const still = changes(a, b)
    check(`${mode}, Motion off: the glass stands still`, still.inside + still.outside === 0, `${still.inside + still.outside} px changed`)
    if (mode === "flow") {
      await publishValues(base, { fridge: "90" })
      await sleep(1500)
      const redrawn = changes(b, await glass(base, `${mode}-still-fridge-90`))
      check("a node's topic with a JSON field redraws the diagram", redrawn.inside > 0 && redrawn.outside === 0, `${redrawn.inside} px inside, ${redrawn.outside} outside`)
    }

    console.log(`--- ${mode}: moving ---`)
    await install(base, ddf, energyProject(ddf, mode, true))
    await publishValues(base)
    await wake(base)
    const c = await glass(base, `${mode}-moving-1`)
    await sleep(400)
    const d = await glass(base, `${mode}-moving-2`)
    const moved = changes(c, d)
    check(`${mode}, Motion on: the glass moves inside the diagram and nowhere else`, moved.inside > 20 && moved.outside === 0, `${moved.inside} px inside, ${moved.outside} outside`)
    // The glass held the loop for most of a second: a whole window of steps
    // (two seconds) after it, then the board's own counts.
    await sleep(4500)
    const debug = await debugOf(base)
    const steps = Number(/([\d.]+) steps\/s/.exec(debug.energyMotion ?? "")?.[1] ?? 0)
    const worst = Number(/worst step ([\d.]+) ms/.exec(debug.energyMotion ?? "")?.[1] ?? Infinity)
    const afterRedraw = /worst after a redraw ([\d.]+) ms/.exec(debug.energyMotion ?? "")?.[1]
    console.log(`   energy motion: ${debug.energyMotion}`)
    check(`${mode}: the motion steps at least ${MIN_STEPS} times a second`, steps >= MIN_STEPS, `${steps} steps/s`)
    // The step right after a redraw works the moving parts out again (the
    // still copy, a Sankey's runs) and is reported, not bounded: it follows
    // a redraw that held the loop far longer.
    check(`${mode}: no step holds the loop longer than ${MAX_STEP_MS} ms`, worst <= MAX_STEP_MS, `worst ${worst} ms, after a redraw ${afterRedraw} ms`)

    if (mode === "flow") {
      // The panel goes dark 15 s after the last touch, and the snapshots
      // above can take that long on a weak link: a tap on a dark panel only
      // wakes it ("woke-display-only"). So it is woken right before.
      await wake(base)
      await tap(base, DIAGRAM.x + Math.round(DIAGRAM.width * 0.2), DIAGRAM.y + Math.round(DIAGRAM.height * 0.2))
      await sleep(1500)
      const after = await debugOf(base)
      const popup = String(after.popup ?? "")
      check("a tap on the sun's node opens its popup", /^open/.test(popup), `${popup} - the tap read as ${after.lastReleaseVerdict}`)
    }
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : "\nPASS - the energy diagram on the knob")
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
