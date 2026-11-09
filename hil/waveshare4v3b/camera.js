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
const SCREEN_ID = `camera-${RUN}`
const CAMERA = { x: 0, y: 0, width: 320, height: 240 }
const SWITCH = { x: 340, y: 100, width: 120, height: 56 }
const DIAGRAM = { x: 0, y: 250, width: 470, height: 225 }
const IDLE_TAP = { x: 400, y: 30 }
const CREDENTIALS = { user: "hilcam", password: "s3cret-hil-camera" }

const MEASURE_MS = 20000
const MIN_IMAGES_PER_SECOND = 5
// The same screen without a Camera gives 126 ms on the 4" (--baseline).
const MAX_LOOP_GAP_MS = 276
const MAX_MEDIAN_DELAY_MS = 500
const DELAY_SAMPLES = 15
const TAPS = 15
const OUT_DIR = path.join(__dirname, "report", "camera")

// --baseline: the same screen without the Camera, for what the rest costs.
const BASELINE = process.argv.includes("--baseline")
// --value-period <ms>: how often the diagram's three values change; 0: never.
const periodAt = process.argv.indexOf("--value-period")
const VALUE_PERIOD_MS = periodAt > 0 ? Number(process.argv[periodAt + 1]) : 2000

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

function project(ddf, url) {
  const { project: p } = buildProject(ddf, { topicPrefix: PREFIX })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.5)]
  const small = sorted[Math.floor(sorted.length * 0.3)]
  const topic = (name) => `${PREFIX}/${name}`
  const at = (fx, fy) => ({ x: Math.round(DIAGRAM.width * fx), y: Math.round(DIAGRAM.height * fy) })
  const watts = [{ text: "{watts} W" }]
  p.name = "HIL camera"
  p.fonts = ddf.fonts
  p.topics = ["sw", "solar", "battery", "fridge"].map((id) => ({ id, topic: topic(id), type: "text", examples: ["1"] }))
  p.combinedTopics = []
  p.screens = [
    {
      id: SCREEN_ID,
      name: "Camera",
      backgroundColor: "#ffffff",
      objects: [
        {
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
        },
        ...(BASELINE
          ? []
          : [{ id: "camera", type: "camera", zIndex: 3, ...CAMERA, properties: { url, username: CREDENTIALS.user, password: CREDENTIALS.password } }]),
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

async function install(base, ddf, url) {
  const browser = await chromium.launch()
  let built
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    built = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project(ddf, url))
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

const cameraLine = async (base) => (await get(`${base}/api/debug`)).body.split("\n").find((l) => l.startsWith("camera:")) ?? ""
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

const uptime = async (base) => Number(/uptime (\d+) s/.exec((await get(`${base}/api/debug`)).body)?.[1] ?? -1)

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
  check("another screen: no request", cam.requests() === 0, `${cam.requests()} requests`)
  await fetch(`${base}/api/screen?index=0`, { method: "POST", signal: AbortSignal.timeout(5000) })
  await sleep(2000)
  check("back on the screen: requests again", cam.requests() > 0, `${cam.requests()} requests`)

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
      const line = body.split("\n").find((l) => l.startsWith("camera:")) ?? ""
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
  if (!m) throw new Error("no tap latency on /api/debug")
  return { taps: Number(m[1]), median: Number(m[2]), worst: Number(m[4]) }
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
  if (!ddf.supportedObjectTypes.includes("camera")) {
    console.warn("SKIPPED - this board does not declare camera")
    process.exit(2)
  }

  const cam = await startCameraServer({ port: 8090 })
  cam.mode({ basic: CREDENTIALS })
  if (!cam.real) console.warn("WARNING - testsrc frames: smaller than a real picture, the rates are too good")
  const url = `http://${lanAddress(device)}:${cam.port}${cam.path}`
  console.log(`camera at ${url}, ${cam.frameCount} frames, mean ${cam.meanBytes} bytes`)
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
    console.log(`  baseline: loop gap max ${gap} ms; taps ${taps.taps}, median ${taps.median} ms, worst ${taps.worst} ms`)
    stopPublishing()
    client.end()
    await cam.stop()
    process.exit(0)
  }
  check(`at least ${MIN_IMAGES_PER_SECOND} images a second`, shown >= MIN_IMAGES_PER_SECOND, `${shown}/s`)
  check(`the loop never pauses more than ${MAX_LOOP_GAP_MS} ms`, gap <= MAX_LOOP_GAP_MS, `${gap} ms`)

  const taps = await measureTaps(base)
  console.log(`  taps: ${taps.taps}, median ${taps.median} ms, worst ${taps.worst} ms`)
  check("every tap was seen", taps.taps >= TAPS, `${taps.taps} of ${TAPS}`)

  const { delays, unread } = await measureDelay(base, cam)
  const median = delays[Math.floor(delays.length / 2)]
  console.log(`  delay ms: ${delays.map((d) => Math.round(d)).join(" ")} (${unread} unread)`)
  check("the frame number is read off the glass", delays.length >= DELAY_SAMPLES - 2, `${delays.length} of ${DELAY_SAMPLES}`)
  check(`median delay at most ${MAX_MEDIAN_DELAY_MS} ms`, median <= MAX_MEDIAN_DELAY_MS, `${Math.round(median)} ms`)

  await checkFailures(base, cam, check, process.argv.includes("--long") ? 300000 : 30000)

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
