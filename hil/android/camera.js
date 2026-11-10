#!/usr/bin/env node
// The Camera object in the Android app (docs/2026-11-09-camera.md, T9), against
// the fake camera (hil/camera-server.js) - the boards' hil/waveshare4v3b/
// camera.js, asked through the app's test interface (hil/android/phone.js):
//
//   1. images a second (success criterion 1), from the app's own count
//   2. the delay on the glass: each frame carries its number, read off the
//      window's snapshot and compared with the frame the camera is on
//   3. every way a camera fails (criteria 2, 3, 6, 7, 9), and an object above
//      the picture staying above it
//
// The main loop's pause (criterion 4) is a board's question: the app draws
// with Compose and fetches on its own thread.
//
// Run: node -r ./hil/device-auth.js hil/android/camera.js [--long]
// Needs the dev server, the HIL broker and the app with its test interface on.
// Exit 0 pass, 1 fail, 2 skipped.

const fs = require("fs")
const http = require("http")
const path = require("path")
const zlib = require("zlib")
const crypto = require("crypto")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const phoneApi = require("./phone")
const { phoneDdf } = require("./ddf-fonts")
const { startCameraServer, readFrameNumber, ffmpegAvailable, FPS } = require("../camera-server")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_MQTT_URL || process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const SCREEN_ID = `camera-${RUN}`
const CAMERA = { x: 20, y: 40, width: 320, height: 240 }
const ABOVE = { x: 220, y: 230, width: 60, height: 30 }
const CREDENTIALS = { user: "hilcam", password: "s3cret-hil-camera" }
const MEASURE_MS = 20000
const MIN_IMAGES_PER_SECOND = 5
const MAX_MEDIAN_DELAY_MS = 500
const DELAY_SAMPLES = 15
const OUT_DIR = path.join(__dirname, "report", "camera")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function project(screen, url) {
  return {
    name: "HIL camera",
    screenWidth: screen.width,
    screenHeight: screen.height,
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [],
    settings: { colorDepth: "24bit", exportFormat: "android", gridSize: 10, snapTolerance: 5, snapGrid: "{}" },
    nextId: 20,
    screens: [
      {
        id: SCREEN_ID,
        name: "Camera",
        backgroundColor: "#ffffff",
        objects: [
          { id: "camera", type: "camera", zIndex: 1, ...CAMERA, properties: { url, username: CREDENTIALS.user, password: CREDENTIALS.password } },
          { id: "above", type: "box", zIndex: 2, ...ABOVE, properties: { fillColor: "#ff00ff" } },
        ],
      },
      {
        id: `other-${RUN}`,
        name: "Other",
        backgroundColor: "#ffffff",
        objects: [{ id: "other-box", type: "box", zIndex: 1, x: 40, y: 40, width: 200, height: 120, properties: { fillColor: "#202020" } }],
      },
    ],
  }
}

async function exportBundle(screen, url) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    return Buffer.from(await page.evaluate((p) => window.__buildAndroidZipForTest(p), project(screen, url)), "base64")
  } finally {
    await browser.close()
  }
}

// The orchestrator's deployBundle, cut down: serve the zip once, publish the
// deploy, wait for «applied».
async function deploy(client, deviceId, zip) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length })
    res.end(zip)
  })
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve))
  const host = await phoneApi.addressTowardPhone(BROKER_URL)
  const deployId = crypto.randomUUID()
  const statusTopic = `schaltli/${deviceId}/deploy-status`
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("the phone never applied the Camera's project (60 s)")), 60000)
      function finish(err) {
        clearTimeout(timer)
        client.removeListener("message", onMessage)
        err ? reject(err) : resolve()
      }
      function onMessage(topic, payload) {
        if (topic !== statusTopic) return
        let m
        try {
          m = JSON.parse(payload.toString())
        } catch {
          return
        }
        if (m.deployId !== deployId) return
        if (m.state === "applied") finish(null)
        else if (m.state === "error" || m.state === "busy") finish(new Error(`the phone answered ${m.state}: ${m.error || ""}`))
      }
      client.on("message", onMessage)
      client.subscribe(statusTopic, (err) => {
        if (err) return finish(err)
        client.publish(
          `schaltli/${deviceId}/deploy`,
          JSON.stringify({ deployId, url: `http://${host}:${server.address().port}/bundle.zip`, crc32: zlib.crc32(zip) }),
          { qos: 1, retain: true },
        )
      })
    })
  } finally {
    server.close()
  }
}

// Where the project's unit (x, y) lands in the window's snapshot: the project
// centred in the window, `density` pixels a unit (orchestrator.js,
// cropDeviceScreenshot).
let geometry = null
let camera = null
async function snapshot(name) {
  // The frame the camera is on as the request leaves: what a live picture shows.
  const due = camera.frameNow()
  const png = await phoneApi.screenshot()
  if (name) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), png)
  }
  const image = await Jimp.read(png)
  const { data, width } = image.bitmap
  const at = (ux, uy) => {
    const x = Math.round(geometry.left + ux * geometry.density)
    const y = Math.round(geometry.top + uy * geometry.density)
    return (y * width + x) * 4
  }
  return { due, data, width, at }
}

async function glassNumber(name) {
  const { due, data, width } = await snapshot(name)
  const luma = (x, y) => {
    const i = (y * width + x) * 4
    return (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  }
  const ox = geometry.left + CAMERA.x * geometry.density
  const oy = geometry.top + CAMERA.y * geometry.density
  return { shown: readFrameNumber(luma, ox, oy, geometry.density), due }
}

const cameraStats = async () => (await phoneApi.debug()).camera ?? null

function delayOf(cam, due, shown) {
  const n = cam.frameCount
  const behind = (due - shown + n) % n
  return ((behind > n / 2 ? behind - n : behind) * 1000) / FPS
}

async function main() {
  let me
  try {
    me = await phoneApi.phone(BROKER_URL)
  } catch (err) {
    console.warn(`SKIPPED - ${err.message}`)
    process.exit(2)
  }
  if (!ffmpegAvailable()) {
    console.warn("SKIPPED - no ffmpeg for the fake camera")
    process.exit(2)
  }
  const ddf = await phoneDdf()
  if (!ddf.supportedObjectTypes.includes("camera")) {
    console.warn("SKIPPED - this app does not declare camera")
    process.exit(2)
  }

  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  // A port of its own: the lanes run side by side, each with its camera.
  const cam = await startCameraServer()
  camera = cam
  cam.mode({ basic: CREDENTIALS })
  if (!cam.real) console.warn("WARNING - testsrc frames: smaller than a real picture, the rates are too good")
  const host = await phoneApi.addressTowardPhone(BROKER_URL)
  const url = `http://${host}:${cam.port}${cam.path}`
  console.log(`camera at ${url}, ${cam.frameCount} frames, mean ${cam.meanBytes} bytes; phone ${me.deviceId}`)

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  const before = await phoneApi.debug()
  // Awake throughout: a dark panel asks the camera nothing, by design.
  await phoneApi.setDisplayOff(0)
  try {
    await deploy(client, me.deviceId, await exportBundle(ddf.screen, url))
    await sleep(3000)
    const d = await phoneApi.debug()
    geometry = {
      density: d.density,
      left: Math.round((d.width - ddf.screen.width * d.density) / 2),
      top: Math.round((d.height - ddf.screen.height * d.density) / 2),
    }

    // Criterion 1, from the app's own count.
    const s0 = await cameraStats()
    const t0 = Date.now()
    await sleep(MEASURE_MS)
    const s1 = await cameraStats()
    const rate = ((s1.shown - s0.shown) * 1000) / (Date.now() - t0)
    console.log(`  ${rate.toFixed(1)} images/s, ${s1.requests - s0.requests} requests, ${s1.failed - s0.failed} failed (${s1.lastFailure || "none"})`)
    check(`at least ${MIN_IMAGES_PER_SECOND} images a second`, rate >= MIN_IMAGES_PER_SECOND, `${rate.toFixed(1)}/s`)

    // The delay.
    const delays = []
    let unread = 0
    for (let i = 0; i < DELAY_SAMPLES; i++) {
      await sleep(300 + Math.floor(Math.random() * 300))
      const { shown, due } = await glassNumber(i === 0 ? "glass" : null)
      if (shown === null) {
        unread++
        continue
      }
      delays.push(delayOf(cam, due, shown))
    }
    delays.sort((a, b) => a - b)
    const median = delays[Math.floor(delays.length / 2)]
    console.log(`  delay ms: ${delays.map((x) => Math.round(x)).join(" ")} (${unread} unread)`)
    check("the frame number is read off the glass", delays.length >= DELAY_SAMPLES - 2, `${delays.length} of ${DELAY_SAMPLES}`)
    check(`median delay at most ${MAX_MEDIAN_DELAY_MS} ms`, median <= MAX_MEDIAN_DELAY_MS, `${Math.round(median)} ms`)

    // An object above the picture.
    {
      const { data, at } = await snapshot("above")
      const i = at(ABOVE.x + ABOVE.width / 2, ABOVE.y + ABOVE.height / 2)
      check("an object above the picture stays above it", data[i] > 200 && data[i + 1] < 60 && data[i + 2] > 200)
    }

    // Failure (criteria 2, 3, 6, 7, 9).
    const mode = (patch = {}) => cam.mode({ basic: CREDENTIALS, ...patch })
    const live = async (name, wait = 2500) => {
      await sleep(wait)
      return (await glassNumber(name)).shown !== null
    }
    check("the password is in no debug output", !JSON.stringify(await phoneApi.debug()).includes(CREDENTIALS.password))
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
    await cam.stop()
    check("camera gone: «No live image» within 1.5 s", !(await live("stopped", 1500)))
    await cam.start()
    check("camera back: the picture within 3 s", await live("restarted", 3000))

    // Criterion 6: swiped to the other screen, nothing asked.
    const screenBefore = (await phoneApi.debug()).screen
    const y = d.height / 2
    await phoneApi.swipe(d.width * 0.85, y, d.width * 0.15, y, 300)
    await sleep(1500)
    const screenAfter = (await phoneApi.debug()).screen
    cam.resetRequests()
    await sleep(3000)
    // The phone's own: a board on the bench may still be showing a camera.
    const phoneIp = new URL(me.base).hostname
    check("another screen: no request", screenAfter !== screenBefore && cam.requests(phoneIp) === 0, `on ${screenAfter}, ${cam.requests(phoneIp)} requests`)
    await phoneApi.swipe(d.width * 0.15, y, d.width * 0.85, y, 300)
    await sleep(2000)
    check("back on the screen: requests again", cam.requests(phoneIp) > 0, `${cam.requests(phoneIp)} requests`)

    // Criterion 2: a slow camera, the picture never old while it claims to be live.
    mode({ slowMs: 500 })
    await sleep(2000)
    const soakMs = process.argv.includes("--long") ? 300000 : 30000
    const started = Date.now()
    let worst = 0
    let samples = 0
    while (Date.now() - started < soakMs) {
      const { shown, due } = await glassNumber(null)
      if (shown !== null) {
        worst = Math.max(worst, delayOf(cam, due, shown))
        samples++
      }
      await sleep(1000)
    }
    check("a slow camera: the shown picture is never older than 1 s", samples > 5 && worst <= 1000, `worst ${Math.round(worst)} ms over ${samples} samples`)
    mode()
  } finally {
    await phoneApi.setDisplayOff(before.displayOffSeconds ?? 0).catch(() => {})
    client.end()
    await cam.stop()
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : "\nPASS - the Camera in the Android app")
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
