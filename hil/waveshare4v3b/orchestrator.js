// Pixel-parity orchestrator for the Waveshare 4.3B (screenbee-waveshare-1v8,
// env waveshare-touch-lcd-4v3b).
//
// Same method as hil/waveshare/orchestrator.js - see its header for the full
// rationale - and deliberately narrower: this one only asks whether the board
// draws what the designer draws. The knob's file also checks its encoder
// actions, its retained hello, install hygiene and screen blanking, all of
// which are worth having and none of which are why this exists.
//
// Why it exists at all (2026-09-10): every other device in this project has
// been held to a zero-tolerance pixel comparison against the designer's own
// renderer, and this one never had. Not for want of endpoints - the firmware
// has served /api/project, /api/screen and /snapshot.bmp since the port - but
// because its DDF did not declare a testInterface, which is the only thing
// the harness reads to find them. That was nine lines of JSON.
//
// Per screen and per MQTT-value combination:
//   1. publish the combination's topic values to the broker
//   2. poll GET /api/topic-values until the device reports them back, rather
//      than sleeping - a snapshot taken a few ms early captures the previous
//      value and looks exactly like a rendering bug
//   3. POST /api/screen to force a full render, then GET /snapshot.bmp
//   4. render the identical screen and values headlessly through the
//      designer's own renderer (app/test-render)
//   5. compare strictly, pixel for pixel
//
// The project under test defaults to whatever is installed on the device,
// fetched back from GET /recovery-project. That is deliberate for a first
// run: it needs no fixture, and it asks the question about the project this
// board is actually doing its job with. Pass --project to use a zip instead.
//
// Needs, all at once:
//   - `npm run dev` (the designer, for the headless reference render)
//   - `npm run hil:broker` (or any broker the device is configured for)
//   - the device on the network and pointed at that same broker; the board
//     reports which one at GET /api/debug
//
// Run: node hil/waveshare4v3b/orchestrator.js [--device <ip>] [--project <zip>]

const fs = require("fs")
const path = require("path")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const JSZip = require("jszip")
const { buildReport, comparePixels } = require("../report-template")
const { withEmbeddedAssetData } = require("../waveshare/project-assets")
const { withDdfFontData } = require("./ddf-fonts")
const { combinationCount, combinationOverrides } = require("../combinations")

const DESIGNER_URL = process.env.HIL_DESIGNER_URL || "http://localhost:3000/test-render"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "report")
const IMG_DIR = path.join(OUT_DIR, "images")

function parseArgs(argv) {
  const args = {
    device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117",
    project: null,
  }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--project") args.project = argv[++i]
  }
  return args
}

const args = parseArgs(process.argv)
const deviceHost = args.device

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The installed project, read back from the device's own editable copy. The
// firmware keeps it outside /PROJECT precisely so it survives an install, and
// serving it is what lets a run compare against reality rather than against a
// fixture that may have drifted from it.
async function fetchInstalledProject() {
  const res = await fetch(`http://${deviceHost}/recovery-project`, { signal: AbortSignal.timeout(30000) })
  if (res.status === 404) throw new Error("the device has no recovery copy - deploy a project first, or pass --project")
  if (!res.ok) throw new Error(`GET /recovery-project failed: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function loadProject(zipBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer)
  const entry = zip.file("project.json")
  if (!entry) throw new Error("the project zip has no project.json")
  const project = JSON.parse(await entry.async("string"))
  project.fonts = withDdfFontData(project.fonts)
  project.assets = await withEmbeddedAssetData(project, zip)
  return project
}

// Polls until the device's own loader reports every published value back.
// Sleeping instead would race the device and blame the renderer for it.
async function waitForTopicValuesApplied(overrides, { intervalMs = 150, timeoutMs = 15000 } = {}) {
  const topics = Object.keys(overrides)
  if (topics.length === 0) return

  const url = `http://${deviceHost}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const values = await res.json()
        if (topics.every((t) => String(values[t]) === String(overrides[t]))) return
      }
    } catch {
      // transient - the device is busy with the message that just landed
    }
    await sleep(intervalMs)
  }
  throw new Error(`device did not apply published values within ${timeoutMs}ms: ${JSON.stringify(overrides)}`)
}

// Retried: this board's snapshot is 1.15MB, four times the knob's, and a run
// that fails at random teaches you to ignore it.
async function fetchSnapshot(attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://${deviceHost}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })
      if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 1000) throw new Error(`snapshot truncated: ${buf.length} bytes`)
      return buf
    } catch (err) {
      lastError = err
      console.log(`    (snapshot attempt ${i + 1} failed: ${err.message}, retrying)`)
      await sleep(500)
    }
  }
  throw new Error(`snapshot failed after ${attempts} attempts: ${lastError.message}`)
}

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true })

  console.log(`device: ${deviceHost}`)
  const zipBuffer = args.project ? fs.readFileSync(args.project) : await fetchInstalledProject()
  console.log(
    args.project
      ? `project: ${args.project} (${(zipBuffer.length / 1024).toFixed(0)}KB)`
      : `project: installed on the device (${(zipBuffer.length / 1024).toFixed(0)}KB from /recovery-project)`,
  )

  const project = await loadProject(zipBuffer)
  console.log(`  ${project.screens.length} screen(s), ${project.topics.length} topic(s), ${project.fonts.length} font(s)`)

  console.log(`connecting to ${BROKER_URL} ...`)
  const mqttClient = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    mqttClient.on("connect", resolve)
    mqttClient.on("error", reject)
    setTimeout(() => reject(new Error("MQTT connect timeout")), 10000)
  })

  console.log("launching headless designer...")
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", (err) => console.log("[designer page error]", err.message))
  // domcontentloaded, not networkidle: under `next dev` the HMR websocket
  // never goes quiet. The harness's own ready flag is the real signal.
  await page.goto(DESIGNER_URL, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })

  const results = []

  for (let si = 0; si < project.screens.length; si++) {
    const screen = project.screens[si]
    const combos = combinationCount(project, screen)
    console.log(`\nscreen ${si} "${screen.name}": ${combos} combination(s)`)

    for (let ci = 0; ci < combos; ci++) {
      const overrides = combinationOverrides(project, screen, ci)
      const caseId = `${si}-${ci}`

      for (const [topic, value] of Object.entries(overrides)) {
        await new Promise((resolve, reject) => {
          mqttClient.publish(topic, value, { qos: 1 }, (err) => (err ? reject(err) : resolve()))
        })
      }
      await waitForTopicValuesApplied(overrides)

      const switchRes = await fetch(`http://${deviceHost}/api/screen`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `index=${si}`,
      })
      const switchJson = await switchRes.json()
      if (!switchJson.success) throw new Error(`/api/screen failed for ${caseId}: ${JSON.stringify(switchJson)}`)

      const deviceBuf = await fetchSnapshot()
      const devicePath = path.join(IMG_DIR, `device-${caseId}.bmp`)
      fs.writeFileSync(devicePath, deviceBuf)

      // This panel is RGB565. Without saying so, every anti-aliased pixel in
      // the reference is a guaranteed mismatch, because the device
      // physically cannot hold the value the reference computed.
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
        quantize: "rgb565",
        project,
        screenIndex: si,
        topicOverrides: overrides,
      })
      const expectedBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")
      const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`)
      fs.writeFileSync(expectedPath, expectedBuf)

      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)])
      const { dimensionMismatch, diffPixels, totalPixels } = comparePixels(deviceImg, expectedImg)
      const pass = !dimensionMismatch && diffPixels === 0
      console.log(
        `  [${caseId}] ${pass ? "PASS" : "FAIL"}` +
          (dimensionMismatch ? " (dimension mismatch)" : ` (${diffPixels}/${totalPixels} differing pixels)`) +
          `  ${JSON.stringify(overrides)}`,
      )

      results.push({
        screenIndex: si,
        screenName: screen.name,
        comboIndex: ci,
        overrides,
        pass,
        diffPixels,
        totalPixels,
        dimensionMismatch,
        actualFile: `images/device-${caseId}.bmp`,
        expectedFile: `images/expected-${caseId}.png`,
        actualDims: `${deviceImg.bitmap.width}x${deviceImg.bitmap.height}`,
        expectedDims: `${expectedImg.bitmap.width}x${expectedImg.bitmap.height}`,
      })
    }
  }

  await browser.close()
  mqttClient.end()

  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2))
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} visual cases passed.`)
  const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - Waveshare 4.3B" })
  console.log("report:", outPath)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((err) => {
  console.error("FAILED:", err)
  process.exit(1)
})
