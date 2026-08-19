// HIL test orchestrator for the Waveshare Knob-1.8 firmware
// (screenbee-waveshare-1v8). Same strategy as hil/m5dial/orchestrator.js -
// see its header for the full rationale - against this board's test
// interface, which is the same shape: everything on port 80 once WiFi is up.
//
// What it does, per screen and per MQTT-value combination:
//   1. publish the combination's topic values to the broker
//   2. poll GET /api/topic-values until the device reports them back, rather
//      than sleeping - a snapshot taken a few ms early captures the previous
//      value and looks exactly like a rendering bug
//   3. POST /api/screen to force a full render, then GET /snapshot.bmp
//   4. render the identical screen and values headlessly through the
//      designer's own renderer (app/test-render)
//   5. compare strictly, pixel for pixel
//
// Strict comparison is the point, not a nicety: this is the method that took
// the e-paper firmware's text rendering from 15177 differing pixels to zero,
// finding six real bugs on the way - u8g2 font-mode resets, a firmware
// border drawn after text, missing color quantization. A tolerance would
// have hidden every one of them.
//
// Needs, all at once:
//   - `npm run dev` (the designer, for the headless reference render)
//   - `npm run hil:broker` (or any broker the device is configured for)
//   - the device on the network and pointed at that same broker
//
// Run: node hil/waveshare/orchestrator.js --device <ip> [--project <zip>]
//
// --project defaults to fixtures/smoke-test.zip. Pass --skip-upload to test
// against whatever is already installed.

const fs = require("fs")
const path = require("path")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const JSZip = require("jszip")
const { buildReport, comparePixels } = require("../report-template")
const { combinationCount, combinationOverrides } = require("../combinations")

const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const DESIGNER_URL = process.env.HIL_DESIGNER_URL || "http://localhost:3000/test-render"
const OUT_DIR = path.join(__dirname, "report")
const IMG_DIR = path.join(OUT_DIR, "images")
// This board's DDF lives only in its firmware repo, never baked into this
// one - same arrangement as the M5 Dial since 2026-08-16.
const DDF_SOURCE_DIR = path.join(__dirname, "../../../screenbee-waveshare-1v8/ddf-source")
const DEFAULT_PROJECT = path.join(__dirname, "fixtures", "smoke-test.zip")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const deviceHost = arg("--device")
const projectZip = arg("--project", DEFAULT_PROJECT)
const skipUpload = process.argv.includes("--skip-upload")
if (!deviceHost) {
  console.error("usage: node hil/waveshare/orchestrator.js --device <ip> [--project <zip>] [--skip-upload]")
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Font BDF text is deliberately NOT in the project zip: the firmware
// resolves fonts by matching internalName against compiled-in u8g2 tables
// and never opens a file, so embedding one would be dead upload weight. The
// designer's reference render does need real glyph data though, so it is
// resolved here from the DDF source - matched on internalName, the
// identifier both sides already agree on.
async function loadProjectFromZip(zipPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  const projectFile = zip.file("project.json")
  if (!projectFile) throw new Error(`${zipPath} has no project.json`)
  const project = JSON.parse(await projectFile.async("string"))

  const devicePath = path.join(DDF_SOURCE_DIR, "device.json")
  if (!fs.existsSync(devicePath)) {
    throw new Error(`DDF source not found at ${DDF_SOURCE_DIR} - check out screenbee-waveshare-1v8 alongside this repo`)
  }
  const ddfDevice = JSON.parse(fs.readFileSync(devicePath, "utf8"))
  const ddfFontsByInternalName = new Map((ddfDevice.fonts || []).map((f) => [f.internalName, f]))

  project.fonts = (project.fonts || []).map((font) => {
    if (font.data) return font
    const ddfFont = ddfFontsByInternalName.get(font.internalName)
    if (!ddfFont) throw new Error(`Font "${font.id}" (internalName "${font.internalName}") is not in the DDF`)
    const fontPath = path.join(DDF_SOURCE_DIR, ddfFont.file)
    if (!fs.existsSync(fontPath)) throw new Error(`DDF source is missing "${ddfFont.file}" for font "${font.id}"`)
    return { ...font, data: fs.readFileSync(fontPath, "utf8") }
  })

  return project
}

async function waitForDevice(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${deviceHost}/ddf.zip`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) return true
    } catch {
      // still rebooting
    }
    await sleep(2000)
  }
  return false
}

async function uploadProject(zipPath) {
  const form = new FormData()
  form.append("file", new Blob([fs.readFileSync(zipPath)]), path.basename(zipPath))
  try {
    // The device reboots into the installed project rather than rebuilding
    // live render state mid-request, so this request never gets a reply -
    // the timeout is the success path.
    await fetch(`http://${deviceHost}/api/project`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    // expected
  }
  if (!(await waitForDevice())) throw new Error("device did not come back after upload")
}

// Polls until the device's own loader reports every published value back.
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
      // transient - the device is busy handling the message that just landed
    }
    await sleep(intervalMs)
  }
  throw new Error(`device did not apply published values within ${timeoutMs}ms: ${JSON.stringify(overrides)}`)
}

// Retried, like the smoke-test verifier: at a weak signal a single ~380KB
// snapshot has been measured taking 8s, and a HIL run that fails at random
// teaches you to ignore it.
async function fetchSnapshot(attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://${deviceHost}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })
      if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      lastError = e
      console.log(`    (snapshot attempt ${i + 1} failed, retrying)`)
    }
  }
  throw new Error(`snapshot failed after ${attempts} attempts: ${lastError.message}`)
}

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true })
  const project = await loadProjectFromZip(projectZip)
  console.log(`project "${project.name}", ${project.screens.length} screen(s), ${project.fonts.length} font(s) resolved`)

  if (!skipUpload) {
    console.log(`uploading ${path.basename(projectZip)} to ${deviceHost}...`)
    await uploadProject(projectZip)
  } else if (!(await waitForDevice(15000))) {
    throw new Error(`device at ${deviceHost} is not reachable`)
  }

  console.log("connecting to MQTT broker...")
  const mqttClient = mqtt.connect(MQTT_URL, { clientId: "hil-waveshare-" + Math.random().toString(16).slice(2) })
  await new Promise((resolve, reject) => {
    mqttClient.on("connect", resolve)
    mqttClient.on("error", reject)
    setTimeout(() => reject(new Error("MQTT connect timeout")), 10000)
  })

  console.log("launching headless designer...")
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", (err) => console.log("[designer page error]", err.message))
  await page.goto(DESIGNER_URL, { waitUntil: "networkidle" })
  await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 15000 })

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

      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
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
  console.log(`\n${passed}/${results.length} cases passed.`)
  const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - Waveshare Knob-1.8" })
  console.log("report:", outPath)
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((err) => {
  console.error("FAILED:", err)
  process.exit(1)
})
