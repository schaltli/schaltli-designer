#!/usr/bin/env node
// The Camera object on a Waveshare RGB board (docs/2026-11-09-camera.md),
// against the fake camera (hil/camera-server.js), with an energy diagram moving
// and its values arriving over MQTT beside it. The spike had neither, and that
// is what this is here to find out (tasks/camera-plan.md, T2, Checkpoint A):
//
//   1. images a second (success criterion 1)
//   2. the longest pause of the main loop, and a tap's latency (criterion 4)
//   3. the delay on the glass: each frame carries its number, read off
//      /panel.bmp and compared with the frame the camera is on. The board serves
//      /panel.bmp from its loop, so the glass stands still while it does, and
//      the time just before the request is the moment that counts.
//
// Run: node -r ./hil/device-auth.js hil/waveshare4v3b/camera.js --device <ip> [--long]
// (--long: five minutes against a slow camera, success criterion 2)
// --soak [minutes]: success criterion 5 alone (tasks/camera-plan.md, T11) - the
// screen with a chart instead of the diagram, first without the Camera for its
// internal RAM, then with it for 30 minutes: no restart, the RAM it leaves,
// none of it lost over the run, and the pictures still coming at the end.
// Needs the dev server and the HIL broker. Exit 0 pass, 1 fail, 2 skipped.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { loadDdf } = require("../conformance/ddf")
const { buildProject } = require("../conformance/build-project")
const { startCameraServer, readFrameNumber, ffmpegAvailable, FPS } = require("../camera-server")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const PREFIX = `hil-camera-${RUN}`
// Each install its own, so a second one waits for its own project.
let SCREEN_ID = `camera-${RUN}`
// Where things go on a 480-wide screen, and on the Knob's round 360: the
// picture whole within the square (its corners off the glass), the switch below
// it, no room for the diagram (T8, 2026-11-09).
const LAYOUTS = {
  wide: {
    CAMERA: { x: 0, y: 0, width: 320, height: 240 },
    ABOVE: { x: 220, y: 190, width: 60, height: 30 }, // an object on the picture
    SWITCH: { x: 340, y: 100, width: 120, height: 56 },
    DIAGRAM: { x: 0, y: 250, width: 470, height: 225 },
    IDLE_TAP: { x: 400, y: 30 },
  },
  round360: {
    CAMERA: { x: 20, y: 60, width: 320, height: 240 },
    ABOVE: { x: 200, y: 230, width: 60, height: 30 },
    SWITCH: { x: 130, y: 304, width: 100, height: 44 },
    DIAGRAM: null,
    IDLE_TAP: { x: 180, y: 30 },
  },
}
let { CAMERA, ABOVE, SWITCH, DIAGRAM, IDLE_TAP } = LAYOUTS.wide
const ABOVE_SAMPLES = 12
const MAX_FONTS_PARSED = 8 // the project's own and the one for «No live image»; 4 seen
const CREDENTIALS = { user: "hilcam", password: "s3cret-hil-camera" }

const MEASURE_MS = 20000
const MIN_IMAGES_PER_SECOND = 5
// The same screen without a Camera (--baseline), plus the spec's 150 ms:
// 126 ms on the 4", 136 on the 4.3B, 13 on the Knob (no diagram there) (2026-11-09).
const LOOP_GAP_BASELINE_MS = { "waveshare-touch-lcd-4": 126, "waveshare-touch-lcd-4v3b": 136, "waveshare-knob-1v8": 13 }
const LOOP_GAP_ALLOWANCE_MS = 150
const MAX_MEDIAN_DELAY_MS = 500
const DELAY_SAMPLES = 15
const TAPS = 15
const OUT_DIR = path.join(__dirname, "report", "camera")

// --baseline: the same screen without the Camera, for what the rest costs.
const BASELINE = process.argv.includes("--baseline")
// --value-period <ms>: how often the diagram's three values change; 0: never.
const periodAt = process.argv.indexOf("--value-period")
const VALUE_PERIOD_MS = periodAt > 0 ? Number(process.argv[periodAt + 1]) : 2000
const soakAt = process.argv.indexOf("--soak")
const SOAK_MINUTES = soakAt < 0 ? 0 : Number(/^\d+$/.test(process.argv[soakAt + 1] ?? "") ? process.argv[soakAt + 1] : 30)
// Criterion 5: what the Camera leaves of the internal RAM, and what a run may
// lose of it between its first and last ten minutes without being a leak.
const SOAK_MIN_HEAP_MARGIN_KB = 20
const SOAK_MAX_DRIFT_KB = 6
const SOAK_SAMPLE_MS = 20000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (url, ms = 10000) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
  return { status: r.status, body: await r.text() }
}

function lanAddress(deviceIp) {
  const net = deviceIp.split(".").slice(0, 3).join(".")
  const all = Object.values(os.networkInterfaces()).flat().filter((a) => a.family === "IPv4" && !a.internal)
  return (all.find((a) => a.address.startsWith(`${net}.`)) ?? all.find((a) => a.address.startsWith("192.168.")))?.address
}

function project(ddf, url, { camera = !BASELINE, chart = false } = {}) {
  const { project: p } = buildProject(ddf, { topicPrefix: PREFIX })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.5)]
  const small = sorted[Math.floor(sorted.length * 0.3)]
  const topic = (name) => `${PREFIX}/${name}`
  const at = (fx, fy) => ({ x: Math.round((DIAGRAM?.width ?? 0) * fx), y: Math.round((DIAGRAM?.height ?? 0) * fy) })
  const watts = [{ text: "{watts} W" }]
  p.name = "HIL camera"
  p.fonts = ddf.fonts
  p.topics = ["sw", "solar", "battery", "fridge"].map((id) => ({ id, topic: topic(id), type: "text", examples: ["1"] }))
  if (chart) p.topics.push({ id: "level", topic: topic("level"), type: "numeric", examples: ["50"] })
  p.combinedTopics = []
  p.screens = [
    {
      id: SCREEN_ID,
      name: "Camera",
      backgroundColor: "#ffffff",
      objects: [
        ...(DIAGRAM && chart ? [{
          id: "chart",
          type: "chart",
          zIndex: 1,
          ...DIAGRAM,
          properties: {
            mode: "time",
            scroll: false,
            legend: "top-right",
            fontId: small.id,
            textColor: "#1d1b20",
            mutedColor: "#49454f",
            lineColor: "#cac4d0",
            nowColor: "#c62828",
            left: { scale: "fixed", min: 0, max: 100, unit: "%" },
            series: [{ id: "s1", source: { kind: "topic", topic: topic("level") }, name: "Level", valueKind: "level", unit: "%", draw: "line", color: "#2255aa", annotations: ["current"] }],
          },
        }] : []),
        ...(DIAGRAM && !chart ? [{
          id: "diagram",
          type: "energy-diagram",
          zIndex: 1,
          ...DIAGRAM,
          properties: {
            mode: "flow",
            motion: true,
            fullScale: 500,
            fontId: small.id,
            valueFontId: font.id,
            nodes: [
              { id: "bus", role: "bus", name: "12 V", ...at(0.5, 0.45) },
              { id: "solar", role: "source", name: "Solar", colorRole: "energySun", topic: topic("solar"), lines: watts, ...at(0.18, 0.18) },
              { id: "battery", role: "storage", name: "Batterie", colorRole: "energyCharge", topic: topic("battery"), lines: watts, ...at(0.82, 0.18) },
              { id: "fridge", role: "sink", name: "Kühlschrank", colorRole: "energyGrid", topic: topic("fridge"), lines: watts, ...at(0.18, 0.8) },
            ],
          },
        }] : []),
        ...(!camera
          ? []
          : [
              { id: "camera", type: "camera", zIndex: 3, ...CAMERA, properties: { url, username: CREDENTIALS.user, password: CREDENTIALS.password } },
              { id: "above", type: "box", zIndex: 4, ...ABOVE, properties: { fillColor: "#ff00ff" } },
            ]),
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
      id: `other-${RUN}`,
      name: "Other",
      backgroundColor: "#ffffff",
      objects: [{ id: "other-box", type: "box", zIndex: 1, x: 40, y: 40, width: 200, height: 120, properties: { fillColor: "#202020" } }],
    },
  ]
  return p
}

async function install(base, ddf, url, options) {
  const browser = await chromium.launch()
  let built
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    built = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project(ddf, url, options))
  } finally {
    await browser.close()
  }
  const zipPath = path.join(os.tmpdir(), `hil-camera-${RUN}.zip`)
  fs.writeFileSync(zipPath, Buffer.from(built, "base64"))
  try {
    execFileSync("curl", ["-s", "--show-error", "-m", "60", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
  } catch (err) {
    if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
  }
  const deadline = Date.now() + 180000
  for (;;) {
    try {
      const r = await get(`${base}/api/device-settings`, 5000)
      if (r.status === 200 && r.body.includes(SCREEN_ID)) break
    } catch {}
    if (Date.now() > deadline) throw new Error("the board did not come back with the Camera's screen within 180 s")
    await sleep(3000)
  }
  await sleep(3000)
}

const touch = (base, x, y, down) =>
  fetch(`${base}/api/touch?x=${x}&y=${y}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })

async function tap(base, x, y) {
  await touch(base, x, y, true)
  await sleep(120)
  await touch(base, x, y, false)
}

// The RGB boards answer in lines, the Knob in JSON.
const cameraLine = async (base) => {
  const body = (await get(`${base}/api/debug`)).body
  if (body.trimStart().startsWith("{")) return JSON.parse(body).camera ?? ""
  return body.split("\n").find((l) => l.startsWith("camera:")) ?? ""
}
const field = (line, re) => Number(re.exec(line)?.[1] ?? NaN)

// Values changing as a van's do: every couple of seconds unless told otherwise.
function publishWhile(client) {
  if (VALUE_PERIOD_MS <= 0) return () => {}
  let n = 0
  const timer = setInterval(() => {
    n++
    client.publish(`${PREFIX}/solar`, String(100 + (n % 80)))
    client.publish(`${PREFIX}/battery`, String(40 + (n % 60)))
    client.publish(`${PREFIX}/fridge`, String(20 + (n % 40)))
    client.publish(`${PREFIX}/level`, String(30 + Math.round(30 * Math.sin(n / 10))))
  }, VALUE_PERIOD_MS)
  return () => clearInterval(timer)
}

async function measureRate(base) {
  await get(`${base}/api/debug?set=camerastats=reset`)
  const started = Date.now()
  while (Date.now() - started < MEASURE_MS) {
    // A dark panel stops the feed; a tap where nothing is keeps it lit.
    await sleep(6000)
    await tap(base, IDLE_TAP.x, IDLE_TAP.y)
  }
  return cameraLine(base)
}

async function measureDelay(base, cam) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const delays = []
  let unread = 0
  for (let i = 0; i < DELAY_SAMPLES; i++) {
    await tap(base, IDLE_TAP.x, IDLE_TAP.y)
    await sleep(300 + Math.floor(Math.random() * 300))
    const due = cam.frameNow()
    const bmp = Buffer.from(await (await fetch(`${base}/panel.bmp`, { signal: AbortSignal.timeout(15000) })).arrayBuffer())
    const file = path.join(OUT_DIR, "glass.bmp")
    fs.writeFileSync(file, bmp)
    const image = await Jimp.read(file)
    const { data, width } = image.bitmap
    const luma = (x, y) => {
      const at = (y * width + x) * 4
      return (data[at] * 77 + data[at + 1] * 150 + data[at + 2] * 29) >> 8
    }
    const shown = readFrameNumber(luma, CAMERA.x, CAMERA.y, 1)
    if (shown === null) {
      unread++
      fs.copyFileSync(file, path.join(OUT_DIR, `unread-${i}.bmp`))
      console.log(`  sample ${i} unread: ${await cameraLine(base)}`)
      continue
    }
    // Across the loop's seam, and a frame ahead of `due` is a small negative.
    const n = cam.frameCount
    const behind = (due - shown + n) % n
    delays.push(((behind > n / 2 ? behind - n : behind) * 1000) / FPS)
  }
  delays.sort((a, b) => a - b)
  return { delays, unread }
}

async function glassNumber(base, name = "glass") {
  await tap(base, IDLE_TAP.x, IDLE_TAP.y)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${name}.bmp`)
  const due = Date.now()
  fs.writeFileSync(file, Buffer.from(await (await fetch(`${base}/panel.bmp`, { signal: AbortSignal.timeout(15000) })).arrayBuffer()))
  const { data, width } = (await Jimp.read(file)).bitmap
  const luma = (x, y) => {
    const at = (y * width + x) * 4
    return (data[at] * 77 + data[at + 1] * 150 + data[at + 2] * 29) >> 8
  }
  return { shown: readFrameNumber(luma, CAMERA.x, CAMERA.y, 1), due }
}

// Each sample is a moment between pictures being painted: one over the object shows.
async function objectAboveStays(base) {
  let kept = 0
  for (let i = 0; i < ABOVE_SAMPLES; i++) {
    const bytes = Buffer.from(await (await fetch(`${base}/panel.bmp`, { signal: AbortSignal.timeout(15000) })).arrayBuffer())
    const { data, width } = (await Jimp.read(bytes)).bitmap
    const at = ((ABOVE.y + ABOVE.height / 2) * width + ABOVE.x + ABOVE.width / 2) * 4
    if (data[at] > 200 && data[at + 1] < 60 && data[at + 2] > 200) kept++
    await sleep(170)
  }
  return kept
}

const uptime = async (base) => {
  const body = (await get(`${base}/api/debug`)).body
  const ms = /"uptimeMs":(\d+)/.exec(body)
  return ms ? Math.floor(Number(ms[1]) / 1000) : Number(/uptime (\d+) s/.exec(body)?.[1] ?? -1)
}

// What only a board can say about failure (success criteria 2, 3, 6, 7, 9).
async function checkFailures(base, cam, check, soakMs) {
  const mode = (patch = {}) => cam.mode({ basic: CREDENTIALS, ...patch })
  const before = await uptime(base)
  const live = async (name, wait = 2500) => {
    await sleep(wait)
    return (await glassNumber(base, name)).shown !== null
  }

  const debug = (await get(`${base}/api/debug`)).body
  const settings = (await get(`${base}/api/device-settings`)).body
  check("the password is in no debug output", !debug.includes(CREDENTIALS.password) && !settings.includes(CREDENTIALS.password))
  check("Basic: a picture with the project's credentials", await live("basic", 500))
  mode({ basic: { user: CREDENTIALS.user, password: "another" } })
  check("wrong password: «No live image»", !(await live("wrong-password")))
  mode()
  check("right password again: the picture is back", await live("back"))

  mode({ contentLength: false })
  check("without Content-Length: a picture", await live("no-length"))
  mode({ keepAlive: true })
  check("with keep-alive: a picture", await live("keep-alive"))

  for (const bad of ["garbage", "oversize"]) {
    mode({ [bad]: true })
    check(`${bad}: «No live image»`, !(await live(bad)))
    mode()
    check(`after ${bad}: the picture is back`, await live(`after-${bad}`))
  }

  // Criterion 3.
  await cam.stop()
  const gone = await live("stopped", 1500)
  check("camera gone: «No live image» within 1.5 s", !gone)
  await cam.start()
  check("camera back: the picture within 3 s", await live("restarted", 3000))

  // Criterion 6.
  await fetch(`${base}/api/screen?index=1`, { method: "POST", signal: AbortSignal.timeout(5000) })
  await sleep(1500)
  cam.resetRequests()
  await sleep(3000)
  // This board's own: another on the bench may still be showing a camera.
  const ip = new URL(base).hostname
  check("another screen: no request", cam.requests(ip) === 0, `${cam.requests(ip)} requests`)
  await fetch(`${base}/api/screen?index=0`, { method: "POST", signal: AbortSignal.timeout(5000) })
  await sleep(2000)
  check("back on the screen: requests again", cam.requests(ip) > 0, `${cam.requests(ip)} requests`)

  // Criterion 2: a slow camera, the picture never old while it claims to be live.
  mode({ slowMs: 500 })
  await sleep(2000)
  const started = Date.now()
  let worst = 0
  let samples = 0
  let unanswered = 0
  let maxGap = 0
  while (Date.now() - started < soakMs) {
    const due = cam.frameNow()
    let shown = null
    try {
      ;({ shown } = await glassNumber(base, "slow"))
    } catch (error) {
      // Named, not fatal: a run must say what it saw over all five minutes.
      unanswered++
      console.log(`  ${Math.round((Date.now() - started) / 1000)} s: no answer from the board (${error.message})`)
    }
    if (shown !== null) {
      const n = cam.frameCount
      const behind = (due - shown + n) % n
      const ms = ((behind > n / 2 ? behind - n : behind) * 1000) / FPS
      worst = Math.max(worst, ms)
      samples++
    }
    // /panel.bmp is served from the loop: the window for the pause starts after it.
    try {
      await get(`${base}/api/debug?set=camerastats=reset`)
      await sleep(2000)
      const body = (await get(`${base}/api/debug`)).body
      const line = body.trimStart().startsWith("{") ? (JSON.parse(body).camera ?? "") : (body.split("\n").find((l) => l.startsWith("camera:")) ?? "")
      const psram = /psram free (\d+) KB/.exec(body)?.[1]
      const gap = field(line, /loop gap max ms ([\d.]+)/)
      maxGap = Math.max(maxGap, gap)
      if (gap > 400 || samples % 10 === 0) console.log(`  ${Math.round((Date.now() - started) / 1000)} s: loop gap ${gap} ms, psram free ${psram} KB, ${line.match(/bad \d+/)?.[0]}, ${line.match(/connects \d+ failed \d+/)?.[0]}`)
    } catch {
      unanswered++
    }
  }
  console.log(`  slow camera: longest loop pause ${maxGap} ms, ${unanswered} request(s) unanswered`)
  check("a slow camera: the shown picture is never older than 1 s", samples > 5 && worst <= 1000, `worst ${Math.round(worst)} ms over ${samples} samples`)
  check("a slow camera: the board answers throughout", unanswered === 0, `${unanswered} unanswered`)
  mode()

  const after = await uptime(base)
  check("no restart through all of it", after > before, `uptime ${before} s -> ${after} s`)
}

async function measureTaps(base) {
  const x = SWITCH.x + SWITCH.width / 4
  const y = SWITCH.y + SWITCH.height / 2
  await tap(base, x, y)
  await sleep(800)
  await get(`${base}/api/debug?set=taplatency=clear`)
  for (let i = 0; i < TAPS; i++) {
    await tap(base, x, y)
    await sleep(600 + Math.floor(Math.random() * 400))
  }
  const debug = (await get(`${base}/api/debug`)).body
  const m = /tap latency: (\d+) taps, median ([\d.]+) ms, p90 ([\d.]+) ms, worst ([\d.]+) ms/.exec(debug)
  // The Knob does not measure it (T8 asks criteria 1, 3 and 4 of it).
  if (!m) return null
  return { taps: Number(m[1]), median: Number(m[2]), worst: Number(m[4]) }
}

// Internal heap now and its lowest since boot, from either kind of /api/debug.
async function heap(base) {
  const body = (await get(`${base}/api/debug`)).body
  if (body.trimStart().startsWith("{")) {
    const j = JSON.parse(body)
    const kb = (v) => (v === undefined ? NaN : Number(v) > 4096 ? Math.round(Number(v) / 1024) : Number(v))
    return { free: kb(j.freeInternalHeap), lowest: kb(j.minFreeInternalHeap), uptime: Math.floor(Number(j.uptimeMs ?? -1000) / 1000), body }
  }
  const m = /heap (\d+) KB \(lowest (\d+) KB/.exec(body)
  return { free: Number(m?.[1] ?? NaN), lowest: Number(m?.[2] ?? NaN), uptime: Number(/uptime (\d+) s/.exec(body)?.[1] ?? -1), body }
}

// Success criterion 5: the same screen without the Camera, then with it for
// SOAK_MINUTES. «What the board needs without a Camera» is read as that
// screen's lowest internal heap; the Camera may take from it, but must leave
// SOAK_MIN_HEAP_MARGIN_KB, and the run must not drain it.
async function soak(base, ddf, url, cam, check) {
  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  const stopPublishing = publishWhile(client)
  try {
    SCREEN_ID = `camera-${RUN}-without`
    await install(base, ddf, url, { camera: false, chart: true })
    await tap(base, IDLE_TAP.x, IDLE_TAP.y)
    let without = Infinity
    for (let i = 0; i < 6; i++) {
      await sleep(10000)
      const h = await heap(base)
      without = Math.min(without, h.free, h.lowest)
    }
    console.log(`  without the Camera: internal heap lowest ${without} KB`)

    SCREEN_ID = `camera-${RUN}`
    await install(base, ddf, url, { camera: true, chart: true })
    await tap(base, IDLE_TAP.x, IDLE_TAP.y)
    await sleep(5000)
    const start = await heap(base)
    const started = Date.now()
    const samples = []
    let lastUptime = start.uptime
    let restarts = 0
    let unanswered = 0
    let slow = 0
    while (Date.now() - started < SOAK_MINUTES * 60000) {
      try {
        await get(`${base}/api/debug?set=camerastats=reset`)
        // Blanking comes after 15 s, and a dark screen asks for nothing.
        for (let t = 0; t < SOAK_SAMPLE_MS; t += 5000) {
          await sleep(5000)
          await tap(base, IDLE_TAP.x, IDLE_TAP.y).catch(() => {})
        }
        const h = await heap(base)
        const line = h.body.trimStart().startsWith("{") ? (JSON.parse(h.body).camera ?? "") : (h.body.split("\n").find((l) => l.startsWith("camera:")) ?? "")
        const shown = field(line, /shown\/s ([\d.]+)/)
        if (h.uptime < lastUptime) {
          restarts++
          console.log(`  RESTART: uptime ${lastUptime} s -> ${h.uptime} s (${/last reset ([^,\n]+)/.exec(h.body)?.[1] ?? /"lastReset":"([^"]+)"/.exec(h.body)?.[1] ?? "?"})`)
        }
        lastUptime = h.uptime
        if (shown < MIN_IMAGES_PER_SECOND) slow++
        const minute = (Date.now() - started) / 60000
        samples.push({ minute, free: h.free, lowest: h.lowest, shown })
        if (samples.length % 6 === 1 || shown < MIN_IMAGES_PER_SECOND) console.log(`  ${minute.toFixed(1)} min: heap ${h.free} KB (lowest ${h.lowest}), shown ${shown}/s, uptime ${h.uptime} s`)
      } catch (error) {
        unanswered++
        console.log(`  ${((Date.now() - started) / 60000).toFixed(1)} min: no answer from the board (${error.message})`)
        await sleep(SOAK_SAMPLE_MS)
      }
    }
    const end = await heap(base)
    const lowest = Math.min(end.lowest, ...samples.map((s) => s.free))
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    const tenth = Math.min(10, SOAK_MINUTES / 3)
    const first = mean(samples.filter((s) => s.minute <= tenth).map((s) => s.free))
    const last = mean(samples.filter((s) => s.minute >= SOAK_MINUTES - tenth).map((s) => s.free))
    console.log(`  with the Camera: lowest ${lowest} KB (the Camera takes ${without - lowest} KB), first ${Number(tenth.toFixed(1))} min ${first.toFixed(1)} KB, last ${last.toFixed(1)} KB; ${slow} of ${samples.length} windows under ${MIN_IMAGES_PER_SECOND}/s`)
    check(`no restart in ${SOAK_MINUTES} minutes`, restarts === 0 && end.uptime > start.uptime, `uptime ${start.uptime} s -> ${end.uptime} s`)
    check("the board answers throughout", unanswered === 0, `${unanswered} unanswered`)
    check(`the Camera leaves at least ${SOAK_MIN_HEAP_MARGIN_KB} KB of internal heap`, lowest >= SOAK_MIN_HEAP_MARGIN_KB, `lowest ${lowest} KB`)
    check(`no internal heap lost over the run (at most ${SOAK_MAX_DRIFT_KB} KB)`, first - last <= SOAK_MAX_DRIFT_KB, `${(first - last).toFixed(1)} KB`)
    check(`pictures in at least 90% of the windows at ${MIN_IMAGES_PER_SECOND}/s`, samples.length > 0 && slow <= samples.length * 0.1, `${samples.length - slow} of ${samples.length}`)
    check("the picture still live at the end", (await glassNumber(base, "soak-end")).shown !== null)
  } finally {
    stopPublishing()
    client.end()
  }
}

async function main() {
  const at = process.argv.indexOf("--device")
  const device = at > 0 ? process.argv[at + 1] : null
  if (!device) {
    console.error("usage: node hil/waveshare4v3b/camera.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  if (!ffmpegAvailable()) {
    console.warn("SKIPPED - no ffmpeg for the fake camera")
    process.exit(2)
  }

  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const ddf = await loadDdf(device)
  ;({ CAMERA, ABOVE, SWITCH, DIAGRAM, IDLE_TAP } = ddf.screen.width < 480 ? LAYOUTS.round360 : LAYOUTS.wide)
  if (!ddf.supportedObjectTypes.includes("camera")) {
    console.warn("SKIPPED - this board does not declare camera")
    process.exit(2)
  }

  // A port of its own: the lanes run side by side, each with its camera.
  const cam = await startCameraServer()
  cam.mode({ basic: CREDENTIALS })
  if (!cam.real) console.warn("WARNING - testsrc frames: smaller than a real picture, the rates are too good")
  const url = `http://${lanAddress(device)}:${cam.port}${cam.path}`
  console.log(`camera at ${url}, ${cam.frameCount} frames, mean ${cam.meanBytes} bytes`)
  if (SOAK_MINUTES > 0) {
    await soak(base, ddf, url, cam, check)
    await cam.stop()
    const failed = results.filter((ok) => !ok).length
    console.log(failed ? `
FAIL - ${failed} check(s)` : `
PASS - the Camera for ${SOAK_MINUTES} minutes`)
    process.exit(failed ? 1 : 0)
  }
  await install(base, ddf, url)

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  const stopPublishing = publishWhile(client)
  await tap(base, IDLE_TAP.x, IDLE_TAP.y)
  await sleep(3000)

  const line = await measureRate(base)
  console.log(`  ${line}`)
  const shown = field(line, /shown\/s ([\d.]+)/)
  const gap = field(line, /loop gap max ms ([\d.]+)/)
  if (BASELINE) {
    const taps = await measureTaps(base)
    console.log(`  baseline: loop gap max ${gap} ms; ${taps ? `taps ${taps.taps}, median ${taps.median} ms, worst ${taps.worst} ms` : "taps not measured on this board"}`)
    stopPublishing()
    client.end()
    await cam.stop()
    process.exit(0)
  }
  check(`at least ${MIN_IMAGES_PER_SECOND} images a second`, shown >= MIN_IMAGES_PER_SECOND, `${shown}/s`)
  const baseline = LOOP_GAP_BASELINE_MS[ddf.deviceId]
  const maxGap = baseline + LOOP_GAP_ALLOWANCE_MS
  check(`the loop never pauses more than ${maxGap} ms`, baseline !== undefined && gap <= maxGap, baseline === undefined ? `no baseline for ${ddf.deviceId}: run --baseline` : `${gap} ms`)

  const taps = await measureTaps(base)
  if (taps) {
    console.log(`  taps: ${taps.taps}, median ${taps.median} ms, worst ${taps.worst} ms`)
    check("every tap was seen", taps.taps >= TAPS, `${taps.taps} of ${TAPS}`)
  } else console.log("  taps: not measured on this board")

  const { delays, unread } = await measureDelay(base, cam)
  const median = delays[Math.floor(delays.length / 2)]
  console.log(`  delay ms: ${delays.map((d) => Math.round(d)).join(" ")} (${unread} unread)`)
  check("the frame number is read off the glass", delays.length >= DELAY_SAMPLES - 2, `${delays.length} of ${DELAY_SAMPLES}`)
  check(`median delay at most ${MAX_MEDIAN_DELAY_MS} ms`, median <= MAX_MEDIAN_DELAY_MS, `${Math.round(median)} ms`)

  await checkFailures(base, cam, check, process.argv.includes("--long") ? 300000 : 30000)

  // «No live image» once parsed every font to choose one: 54 on the 4.3B, all
  // its PSRAM but 230 KB, 275 ms of the loop each (2026-11-09).
  const parsed = Number(/fonts: (\d+) parsed/.exec((await get(`${base}/api/debug`)).body)?.[1] ?? -1)
  if (parsed < 0) console.log("  (fonts parsed: not reported by this board)")
  else check(`«No live image» parses no font it does not draw with`, parsed <= MAX_FONTS_PARSED, `${parsed} parsed`)

  // Last: a dozen screenshots in a row hold up the loop that shows the pictures.
  cam.mode({ basic: CREDENTIALS })
  await sleep(2500)
  const kept = await objectAboveStays(base)
  check("an object above the picture stays above it", kept === ABOVE_SAMPLES, `${kept} of ${ABOVE_SAMPLES}`)

  stopPublishing()
  client.end()
  await cam.stop()
  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : "\nPASS - the Camera on the real firmware")
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
