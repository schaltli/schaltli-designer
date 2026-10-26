#!/usr/bin/env node
// Scaled values on a board (device contract 2.11, feature "scaled-values";
// tasks/ha-templates-stage2-plan.md, H1). The project has a scaled topic
// `wind_kmh` - the field `wind` of a JSON topic times 18/5, one decimal - a
// text and a bar reading it, and a slider whose write format is
// `{"brightness":{value}}`, the value times 255/100, no decimals:
//
//   1. the source published, the board says the scaled number for
//      `combined:wind_kmh` - computed by the board, not by the designer;
//   2. a source that is not a number gives no value, never a wrong one;
//   3. a tap on the slider publishes the formatted payload, a whole
//      brightness that is 2.55 times a value the slider can be set to.
//
//   node hil/scaled-values.js --device 192.168.1.117
//
// Needs the designer dev server (test-render builds the zip) and the HIL
// broker (`npm run hil:broker`). Exit 0 pass, 1 fail, 2 the board is not
// reachable or does not declare the feature (skipped, loudly).

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
const PREFIX = `hil-scaled-${RUN}`
const WEATHER = `${PREFIX}/weather`
const LEVEL = `${PREFIX}/level`
const SET = `${PREFIX}/set`
const SCALED = "combined:wind_kmh"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--device") args.device = argv[++i]
  return args
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

async function reachable(base) {
  try {
    return (await get(`${base}/api/debug`, 4000)).status === 200
  } catch {
    return false
  }
}

// The text, the bar and the slider, one below the other inside what the
// glass shows: on a round display the square inside its circle.
function layout(ddf) {
  const { width: sw, height: sh } = ddf.screen
  const round = (ddf.raw?.screen?.shape ?? ddf.screen.shape) === "round"
  const side = round ? Math.floor(Math.min(sw, sh) / Math.SQRT2) : null
  const inner = round ? { x: Math.round((sw - side) / 2), y: Math.round((sh - side) / 2), w: side, h: side } : { x: 0, y: 0, w: sw, h: sh }
  const at = (fy, fh) => ({ x: Math.round(inner.x + inner.w * 0.1), y: Math.round(inner.y + inner.h * fy), width: Math.round(inner.w * 0.8), height: Math.round(inner.h * fh) })
  return { text: at(0.08, 0.2), bar: at(0.36, 0.16), slider: at(0.62, 0.22) }
}

function scaledProject(ddf, stamp) {
  const { project } = buildProject(ddf, { topicPrefix: PREFIX })
  const { text, bar, slider } = layout(ddf)
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  const range = [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  project.name = "HIL scaled values"
  project.fonts = ddf.fonts
  project.topics = [
    { id: "weather", topic: WEATHER, type: "json", examples: ['{"wind":12.5}'], subtopics: [{ id: "wind", path: "wind", type: "numeric" }] },
    { id: "level", topic: LEVEL, type: "numeric", examples: ["50"] },
    { id: "set", topic: SET, type: "numeric", examples: ["50"] },
  ]
  project.combinedTopics = [
    {
      id: "c1",
      name: "wind_kmh",
      mode: "scale",
      conditions: [],
      scale: { source: { namespace: "topic", path: `${WEATHER}#wind` }, numerator: 18, denominator: 5, offset: "0", decimals: 1 },
    },
  ]
  project.screens = [
    {
      id: `scaled-${stamp}`,
      name: "Scaled",
      objects: [
        {
          id: "wind-text",
          type: "text",
          zIndex: 1,
          ...text,
          properties: {
            text: "{live:lv1} km/h",
            liveValues: [{ id: "lv1", source: { namespace: "combined", path: "wind_kmh" }, format: { kind: "number", decimals: 1, grouped: false }, rules: [] }],
            fontId: font.id,
            color: "#000000",
          },
        },
        { id: "wind-bar", type: "bar", zIndex: 1, ...bar, properties: { topic: SCALED, barDirection: "left-to-right", calibrationPoints: range, fillColor: "#2060c0" } },
        {
          id: "lamp",
          type: "slider",
          zIndex: 1,
          ...slider,
          properties: {
            topic: LEVEL,
            writeTopic: SET,
            writeFormat: { text: '{"brightness":{value}}', numerator: 255, denominator: 100, decimals: 0 },
            step: 5,
            barDirection: "left-to-right",
            calibrationPoints: range,
            fillColor: "#2060c0",
          },
        },
      ],
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
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node hil/scaled-values.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${args.device}`
  if (!(await reachable(base))) {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  const ddf = await loadDdf(args.device)
  const features = ddf.raw?.supportedFeatures ?? []
  if (!features.includes("scaled-values")) {
    console.warn(`SKIPPED - ${args.device} does not declare scaled-values (it declares ${JSON.stringify(features)})`)
    process.exit(2)
  }
  const eink = /papers3/i.test(ddf.deviceId || "")
  const stamp = `${RUN}-${args.device.replace(/\./g, "-")}`
  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  const heard = []
  client.on("message", (topic, payload) => {
    if (topic === SET) heard.push(payload.toString())
  })
  await new Promise((resolve) => client.subscribe(SET, resolve))
  const publish = (topic, value) => new Promise((resolve) => client.publish(topic, value, { retain: true }, resolve))
  const value = async (topic) => {
    const r = await get(`${base}/api/topic-values?topics=${encodeURIComponent(topic)}`).catch(() => ({ body: "null" }))
    try {
      const v = JSON.parse(r.body)?.[topic]
      return v === undefined || v === null || v === "" ? "(none)" : String(v)
    } catch {
      return "(unreadable)"
    }
  }
  const settle = (wanted) => async (topic) => {
    const deadline = Date.now() + 10000
    let last
    while (Date.now() < deadline) {
      last = await value(topic)
      if (last === wanted) return last
      await sleep(500)
    }
    return last
  }

  try {
    console.log(`scaled values on ${args.device} under ${PREFIX}`)
    const zipPath = path.join(os.tmpdir(), `hil-scaled-${stamp}.zip`)
    fs.writeFileSync(zipPath, await buildZip(scaledProject(ddf, stamp)))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      const r = await get(`${base}/api/device-settings`, 5000).catch(() => ({ status: 0, body: "" }))
      if (r.status === 200 && r.body.includes(`scaled-${stamp}`)) break
      if (Date.now() > deadline) throw new Error("the board did not come back with the installed project within 180 s")
      await sleep(3000)
    }
    await sleep(3000)

    await publish(WEATHER, '{"wind":12.5}')
    let seen = await settle("45.0")(SCALED)
    check("1. 12.5 m/s arrived, the board says 45.0 for combined:wind_kmh", seen === "45.0", seen)

    await publish(WEATHER, '{"wind":"calm"}')
    seen = await settle("(none)")(SCALED)
    check("2. «calm» is no number: no value", seen === "(none)", seen)

    // A tap at three quarters of the slider: the press sets, the lift sends.
    await publish(LEVEL, "50")
    const { slider } = layout(ddf)
    const x = Math.round(slider.x + slider.width * 0.75)
    const y = Math.round(slider.y + slider.height / 2)
    const touch = async (down) => {
      const r = await fetch(`${base}/api/touch?x=${x}&y=${y}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
    }
    // A first touch on a blanked panel only wakes it.
    await touch(true)
    await sleep(eink ? 1200 : 80)
    await touch(false)
    await sleep(eink ? 4000 : 1500)
    heard.length = 0
    await touch(true)
    await sleep(eink ? 1200 : 80)
    await touch(false)
    const until = Date.now() + 8000
    while (heard.length === 0 && Date.now() < until) await sleep(200)
    const last = heard[heard.length - 1]
    let brightness
    try {
      brightness = JSON.parse(last ?? "null")?.brightness
    } catch {}
    // A step of 5 times 2.55, half away from zero: what the designer computes too.
    const reachableBrightness = Array.from({ length: 21 }, (_, i) => Math.floor((i * 5 * 255) / 100 + 0.5))
    check(
      '3. the tap publishes {"brightness":N}, N a step of 5 times 2.55',
      typeof brightness === "number" && /^\{"brightness":\d+\}$/.test(last) && reachableBrightness.includes(brightness) && brightness >= 128 && brightness <= 242,
      JSON.stringify(heard),
    )
  } finally {
    for (const topic of [WEATHER, LEVEL]) await publish(topic, "")
    client.end()
  }

  const failed = results.filter((ok) => !ok).length
  console.log(failed ? `\nFAIL - ${failed} check(s)` : `\nPASS - scaled values on ${args.device}`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
