#!/usr/bin/env node
// The energy diagram's spike on the Waveshare 4.3B (designer
// docs/2026-10-11-energy-diagram.md, decision 14 and success criterion 3;
// tasks/energy-diagram-plan.md, S1-S4).
//
// The question it answers before the diagram is built: can the board move
// dots along a diagram's lines and waves through its bands without a tap
// getting slower? It installs one screen - room for the diagram on the
// left, a switch on the right - taps the switch 20 times and reads what the
// firmware measured itself: from the moment a sample arrived to the press
// feedback being on the glass (`tap latency` on /api/debug). Measured from
// here over HTTP the WiFi's own round trip would swamp the few milliseconds
// looked for, which is why the board keeps the clock.
//
//   --baseline   taps with nothing moving: today's number
//   --no-wave    the dots alone, no Sankey band
//   (default)    the baseline, then the same taps with the spike's motion
//                running (?set=energyspike=<lines>), and its steps per
//                second; passes when steps/s >= 8 and the median tap is at
//                most 1.2 x the baseline's
//
// Run: node hil/waveshare4v3b/energy-motion-spike.js --device <ip> [--baseline] [--lines 5] [--no-wave]
// Needs the dev server (test-render builds the zip). Exit 0 pass, 1 fail,
// 2 the board is not reachable (skipped, loudly).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const { chromium } = require("playwright")
const { loadDdf } = require("../conformance/ddf")
const { buildProject } = require("../conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const RUN = Date.now().toString(36)
const SCREEN = `energy-spike-${RUN}`
// Where the switch sits, and the room left of it for the diagram.
const SWITCH = { x: 600, y: 208, width: 160, height: 64 }
const TAPS = 20
const MAX_SLOWDOWN = 1.2
const MIN_STEPS = 8

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null, baseline: false, lines: 5, wave: true }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    if (argv[i] === "--baseline") args.baseline = true
    if (argv[i] === "--lines") args.lines = Number(argv[++i])
    if (argv[i] === "--no-wave") args.wave = false
  }
  return args
}

async function get(url, ms = 10000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
  return { status: r.status, body: await r.text() }
}

function spikeProject(ddf) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-energy-${RUN}` })
  const font = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))[Math.floor(ddf.fonts.length * 0.5)]
  project.name = "HIL energy spike"
  project.fonts = ddf.fonts
  project.topics = [{ id: "sw", topic: `hil-energy-${RUN}/sw`, type: "text", examples: ["off"] }]
  project.combinedTopics = []
  project.screens = [
    {
      id: SCREEN,
      name: "Spike",
      backgroundColor: "#000000",
      objects: [
        {
          id: "sw",
          type: "switch",
          zIndex: 1,
          ...SWITCH,
          properties: {
            topic: `hil-energy-${RUN}/sw`,
            writeTopic: `hil-energy-${RUN}/sw/set`,
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
    const zipPath = path.join(os.tmpdir(), `hil-energy-spike-${RUN}.zip`)
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
      if (r.status === 200 && r.body.includes(SCREEN)) break
    } catch {}
    if (Date.now() > deadline) throw new Error("the board did not come back with the spike's screen within 180 s")
    await sleep(3000)
  }
  await sleep(3000)
}

const touch = (base, x, y, down) =>
  fetch(`${base}/api/touch?x=${x}&y=${y}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })

// Taps the switch and returns the board's own tap latency.
async function measureTaps(base) {
  const x = SWITCH.x + SWITCH.width / 4, y = SWITCH.y + SWITCH.height / 2
  // A first tap wakes a dark panel and counts for nothing.
  await touch(base, x, y, true)
  await sleep(120)
  await touch(base, x, y, false)
  await sleep(800)
  await get(`${base}/api/debug?set=taplatency=clear`)
  for (let i = 0; i < TAPS; i++) {
    await touch(base, x, y, true)
    await sleep(120)
    await touch(base, x, y, false)
    await sleep(700)
  }
  const debug = (await get(`${base}/api/debug`)).body
  const m = /tap latency: (\d+) taps, median ([\d.]+) ms, p90 ([\d.]+) ms, worst ([\d.]+) ms/.exec(debug)
  if (!m) throw new Error(`no tap latency on /api/debug - the firmware predates it:\n${debug.split("\n").find((l) => l.includes("tap latency")) ?? ""}`)
  return { taps: Number(m[1]), median: Number(m[2]), p90: Number(m[3]), worst: Number(m[4]) }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node hil/waveshare4v3b/energy-motion-spike.js --device <ip> [--baseline] [--lines 5]")
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
  console.log("installing the spike's screen ...")
  await install(base, ddf, spikeProject(ddf))

  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const still = await measureTaps(base)
  console.log(`baseline: ${still.taps} taps, median ${still.median} ms, p90 ${still.p90} ms, worst ${still.worst} ms`)
  check("every tap measured, nothing moving", still.taps === TAPS, `${still.taps} of ${TAPS}`)

  if (!args.baseline) {
    const started = (await get(`${base}/api/debug?set=energyspike=${args.lines}${args.wave ? "" : ",nowave"}`)).body
    if (!/energy spike/i.test(started)) {
      check("the spike's motion starts", false, "the firmware has no ?set=energyspike yet")
    } else {
      await sleep(3000)
      const moving = await measureTaps(base)
      const debug = (await get(`${base}/api/debug`)).body
      await get(`${base}/api/debug?set=energyspike=0`)
      const line = debug.split("\n").find((l) => l.includes("energy spike")) ?? ""
      const steps = Number(/([\d.]+) steps\/s/.exec(line)?.[1] ?? 0)
      console.log(`moving (${args.lines} lines): ${line.trim()}`)
      console.log(`moving: ${moving.taps} taps, median ${moving.median} ms, p90 ${moving.p90} ms, worst ${moving.worst} ms`)
      check(`the dots and the wave step at least ${MIN_STEPS} times a second`, steps >= MIN_STEPS, `${steps} steps/s`)
      check(
        `a tap is at most ${Math.round((MAX_SLOWDOWN - 1) * 100)} % slower while it moves`,
        moving.median <= still.median * MAX_SLOWDOWN,
        `median ${moving.median} ms against ${still.median} ms (x${(moving.median / still.median).toFixed(2)})`,
      )
    }
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : "\nPASS - the energy spike")
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
