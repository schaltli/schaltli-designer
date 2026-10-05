#!/usr/bin/env node
// A text's placeholder follows its topic on the 4.3B without a full redraw
// (docs/2026-10-05-placeholder-devices.md).
//
// The board redraws a value change by redrawing the rectangles of what the
// value touches, and until 2026-10-05 it knew only bound objects. A text
// that names a topic in a placeholder has no binding: alone on the screen it
// was caught by the full-screen fallback, but beside an object bound to the
// same topic only that object's rectangle was drawn and the text kept the
// old value. This installs exactly that - a live text bound to one topic, a
// text naming it, and a text naming a second topic nothing is bound to -
// draws it once, then changes each topic in turn WITHOUT forcing a render,
// and holds every picture to the designer's, pixel for pixel. The board's own
// report has to say the change was drawn as regions, or the full-screen
// fallback would hide what this is here to find.
//
//   node hil/waveshare4v3b/placeholder-redraw.js --device 192.168.1.117
//
// Needs the designer dev server and the HIL broker (`npm run hil:broker`),
// with the board pointed at it. Exits 2 with SKIPPED when the board is not
// reachable - hardware suites say so out loud, see hil/README.md.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { comparePixels } = require("../report-template")
const { loadDdf } = require("../conformance/ddf")
const { buildProject } = require("../conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "report", "placeholder-redraw")

const LEVEL = "hil-placeholder/level"
const NAME = "hil-placeholder/name"

function parseArgs(argv) {
  const args = { device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - 4.3B not reachable at ${base}/api/debug (set HIL_WAVESHARE_4V3B_DEVICE to override)`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const ddf = await loadDdf(device)
  const { project } = buildProject(ddf, { topicPrefix: "hil-placeholder" })
  const font = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))[Math.floor(ddf.fonts.length * 0.4)]
  const screenId = `placeholder-${Date.now().toString(36)}`
  const box = (y) => ({ x: 120, y, width: 560, height: 70 })
  const textProps = (text) => ({
    text,
    fontId: font.id,
    fontSize: font.size,
    color: "#ffffff",
    textAlign: "left",
    fontWeight: "normal",
    backgroundColor: "#000000",
    borderColor: "#000000",
  })
  project.name = "HIL placeholder redraw"
  project.assets = []
  project.fonts = ddf.fonts
  project.topics = [
    { id: "level", topic: LEVEL, type: "numeric", examples: ["10"] },
    { id: "name", topic: NAME, type: "text", examples: ["Grau"] },
  ]
  project.screens = [
    {
      id: screenId,
      name: "Placeholders",
      backgroundColor: "#000000",
      objects: [
        {
          id: "bound",
          type: "live-text",
          zIndex: 1,
          ...box(90),
          properties: { topic: LEVEL, fontId: font.id, textColor: "#ffffff", backgroundColor: "#000000", textAlign: "left", prefix: "", postfix: "" },
        },
        { id: "named", type: "text", zIndex: 1, ...box(200), properties: textProps(`Tank {topic:${LEVEL}:F1} %`) },
        { id: "alone", type: "text", zIndex: 1, ...box(310), properties: textProps(`Tank {topic:${NAME} ?? "leer"}`) },
      ],
    },
  ]

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  const publish = (topic, value) =>
    new Promise((resolve, reject) => client.publish(topic, value, { qos: 1 }, (err) => (err ? reject(err) : resolve())))

  const browser = await chromium.launch()
  let failures = 0
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)

    const zipPath = path.join(os.tmpdir(), "hil-placeholder.zip")
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    console.log("installing a bound value and two placeholder texts ...")
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl, "-o", os.devNull])
    } catch (err) {
      // 6 and 7: nothing was sent. Anything else is the board rebooting into
      // the new project mid-request, which is how an install ends.
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl} (curl exit ${err.status})`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(screenId)) break
      } catch {}
      if (Date.now() > deadline) throw new Error("the board did not come back with the installed project within 180 s")
      await sleep(3000)
    }
    await sleep(3000)

    const values = {}
    const applied = async () => {
      const topics = Object.keys(values)
      const url = `${base}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`
      const until = Date.now() + 15000
      while (Date.now() < until) {
        try {
          const got = await (await fetch(url, { signal: AbortSignal.timeout(4000) })).json()
          if (topics.every((t) => String(got[t]) === values[t])) return
        } catch {}
        await sleep(150)
      }
      throw new Error(`the board did not take ${JSON.stringify(values)} within 15 s`)
    }

    // name, then the value change, then whether it had to be drawn as regions
    const steps = [
      { name: "drawn once", set: { [LEVEL]: "10" }, force: true },
      { name: "the bound topic changes", set: { [LEVEL]: "75.195" }, regions: true },
      { name: "a topic only a text names arrives", set: { [NAME]: "Frischwasser" }, regions: true },
      { name: "it changes again", set: { [NAME]: "Grau" }, regions: true },
    ]
    for (const [i, step] of steps.entries()) {
      for (const [topic, value] of Object.entries(step.set)) {
        values[topic] = value
        await publish(topic, value)
      }
      await applied()
      if (step.force) {
        const r = await fetch(`${base}/api/screen`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "index=0",
        })
        if (!(await r.json()).success) throw new Error("/api/screen failed")
      }
      // Values are drawn at most every 250 ms, after they are stored.
      await sleep(800)

      const how = /last value draw: (.*)/.exec((await get(`${base}/api/debug`)).body)?.[1] ?? "?"
      const snapshot = Buffer.from(await (await fetch(`${base}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer())
      const devicePath = path.join(OUT_DIR, `device-${i}.bmp`)
      fs.writeFileSync(devicePath, snapshot)
      // A topic nothing arrived on yet is passed as "" - without an entry the
      // reference would draw the topic's first example instead of `??`.
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
        quantize: ddf.testInterface.snapshotQuantize || "rgb565",
        project,
        screenIndex: 0,
        topicOverrides: { [LEVEL]: "", [NAME]: "", ...values },
      })
      const expectedPath = path.join(OUT_DIR, `expected-${i}.png`)
      fs.writeFileSync(expectedPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))
      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)])
      const { dimensionMismatch, diffPixels } = comparePixels(deviceImg, expectedImg)

      const pixelsOk = !dimensionMismatch && diffPixels === 0
      const pathOk = !step.regions || /region\(s\)/.test(how)
      if (!pixelsOk || !pathOk) failures++
      console.log(
        `  ${pixelsOk && pathOk ? "PASS" : "FAIL"} ${step.name}: ` +
          `${dimensionMismatch ? "dimension mismatch" : `${diffPixels} px differ`}, drawn as ${how}` +
          (pathOk ? "" : " - expected regions, so the partial redraw was not what drew it"),
      )
    }
  } finally {
    await browser.close()
    client.end()
  }

  if (failures > 0) {
    console.error(`FAIL - ${failures} step(s); pictures in ${path.relative(process.cwd(), OUT_DIR)}`)
    process.exit(1)
  }
  console.log("PASS - placeholder texts follow their topics through the partial redraw, 0 px")
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
