#!/usr/bin/env node
// Live values and combined topics on a board (docs/2026-10-07-live-values.md,
// device contract 2.6, generation 1.4).
//
// Installs one screen: a text with three live values - a yes/no that reads
// «läuft» or «aus», a countdown in h:mm:ss that is empty at 0, a number with
// a No value yet of its own - a live icon on a threshold (frost below 1), and
// a live icon on a combined topic two levels deep (`alarm`: `warm` and
// night; `warm`: heating or boiler). Then walks it from nothing arrived to a
// change of only a combined topic's input, holding every picture to the
// designer's, pixel for pixel. Every step after the first has to be drawn as
// regions: a live value has no binding, so without its own place in the
// redraw it would be caught by the full-screen fallback at best, and beside
// a bound object not at all - the placeholders' story (hil/placeholder-
// redraw.js). `--full` drops that check, for a board that always draws the
// whole screen (the PaperS3).
//
//   node hil/live-value-redraw.js --device 192.168.1.117   # the 4.3B
//   node hil/live-value-redraw.js --device 192.168.1.114   # the knob
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
const { comparePixels } = require("./report-template")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "live-value-redraw-report")

// Fresh topics each run: a value the broker kept from an earlier run would
// make «nothing arrived yet» impossible to show.
const RUN = Date.now().toString(36)
const T = (leaf) => `hil-live-${RUN}/${leaf}`
const HEAT = T("heat")
const TIMER = T("timer")
const TEMP = T("temp")
const OUTSIDE = T("outside")
const BOILER = T("boiler")
const NIGHT = T("night")
const ALL_TOPICS = [HEAT, TIMER, TEMP, OUTSIDE, BOILER, NIGHT]

const svg = (d) =>
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`).toString("base64")
const THERMO = svg("M10 2h4v14a4 4 0 1 1-4 0z")
const FLAKE = svg("M11 1h2v22h-2zM1 11h22v2H1z")
const ALERT = svg("M11 2h2v14h-2zM11 19h2v3h-2z")

const text = (s) => ({ kind: "text", parts: [s] })
const icon = (id) => ({ kind: "icon", icon: id })

function parseArgs(argv) {
  const args = { device: null, full: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    if (argv[i] === "--full") args.full = true
  }
  return args
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

// How the board drew the last value - see hil/placeholder-redraw.js.
function drawnAs(debugBody, value) {
  const line = /last value draw: (.*)/.exec(debugBody)
  if (line) return line[1]
  try {
    const lat = JSON.parse(debugBody).lat || []
    let rx = -1
    lat.forEach(([, tag, info], i) => {
      if (tag === "rx" && info === value) rx = i
    })
    if (rx < 0) return "? (the value's rx is not in the trace)"
    const prt = lat.slice(rx + 1).find(([, tag]) => tag === "prt")
    return prt ? `prt ${prt[2]}` : "full screen"
  } catch {
    return "?"
  }
}

function liveProject(ddf) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-live-${RUN}` })
  const font = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))[Math.floor(ddf.fonts.length * 0.4)]
  const { width: sw, height: sh } = ddf.screen
  const row = (r) => ({ x: Math.round(sw * 0.15), y: Math.round(sh * (0.2 + r * 0.17)), width: Math.round(sw * 0.7), height: Math.round(sh * 0.12) })
  const side = Math.max(24, Math.round(Math.min(sw, sh) * 0.14))
  const iconAt = (col) => ({ x: Math.round(sw * (col ? 0.58 : 0.42) - side / 2), y: Math.round(sh * 0.58), width: side, height: side })
  const textProps = (t, liveValues) => ({
    text: t,
    liveValues,
    fontId: font.id,
    fontSize: font.size,
    color: "#ffffff",
    textColor: "#ffffff",
    textAlign: "left",
    fontWeight: "normal",
    backgroundColor: "#000000",
    borderColor: "#000000",
  })
  project.name = "HIL live values"
  project.fonts = ddf.fonts
  project.assets = [
    { id: "a-thermo", name: "thermometer", type: "icon", data: THERMO },
    { id: "a-flake", name: "snowflake", type: "icon", data: FLAKE },
    { id: "a-alert", name: "alert", type: "icon", data: ALERT },
  ]
  project.topics = [
    { id: "heat", topic: HEAT, type: "boolean", examples: ["true"] },
    { id: "timer", topic: TIMER, type: "numeric", examples: ["12198"] },
    { id: "temp", topic: TEMP, type: "numeric", examples: ["21.5"] },
    { id: "outside", topic: OUTSIDE, type: "numeric", examples: ["8"] },
    { id: "boiler", topic: BOILER, type: "boolean", examples: ["false"] },
    { id: "night", topic: NIGHT, type: "boolean", examples: ["true"] },
  ]
  project.combinedTopics = [
    {
      id: "c1",
      name: "warm",
      mode: "any",
      conditions: [
        { source: { namespace: "topic", path: HEAT }, op: "yes" },
        { source: { namespace: "topic", path: BOILER }, op: "yes" },
      ],
    },
    {
      id: "c2",
      name: "alarm",
      mode: "all",
      conditions: [
        { source: { namespace: "combined", path: "warm" }, op: "yes" },
        { source: { namespace: "topic", path: NIGHT }, op: "yes" },
      ],
    },
  ]
  const iconProps = (liveValue, fallback) => ({ assetId: fallback, iconColor: "#ffffff", liveIconId: liveValue.id, liveValues: [liveValue] })
  project.screens = [
    {
      id: `live-${RUN}`,
      name: "Live values",
      backgroundColor: "#000000",
      objects: [
        {
          id: "heating",
          type: "text",
          zIndex: 1,
          ...row(0),
          properties: textProps("Heizung {live:heat} {live:timer}", [
            { id: "heat", source: { namespace: "topic", path: HEAT }, rules: [{ op: "yes", result: text("läuft") }, { op: "no", result: text("aus") }] },
            {
              id: "timer",
              source: { namespace: "topic", path: TIMER },
              format: { kind: "duration", pattern: "h:mm:ss" },
              rules: [{ op: "<=", operand: "0", result: { kind: "text", parts: [] } }],
            },
          ]),
        },
        {
          id: "inside",
          type: "text",
          zIndex: 1,
          ...row(1),
          properties: textProps("Innen {live:temp} C", [
            { id: "temp", source: { namespace: "topic", path: TEMP }, format: { kind: "number", decimals: 1, grouped: false }, rules: [], noValueYet: text("--") },
          ]),
        },
        {
          id: "frost",
          type: "icon",
          zIndex: 1,
          ...iconAt(0),
          properties: iconProps(
            { id: "frost", source: { namespace: "topic", path: OUTSIDE }, rules: [{ op: "<", operand: "1", result: icon("a-flake") }], otherwise: icon("a-thermo") },
            "a-thermo",
          ),
        },
        {
          id: "alarm",
          type: "icon",
          zIndex: 1,
          ...iconAt(1),
          properties: iconProps(
            { id: "alarm", source: { namespace: "combined", path: "alarm" }, rules: [{ op: "yes", result: icon("a-alert") }], otherwise: icon("a-flake") },
            "a-flake",
          ),
        },
      ],
    },
  ]
  return project
}

async function main() {
  const { device, full } = parseArgs(process.argv)
  if (!device) {
    console.error("usage: node hil/live-value-redraw.js --device <ip> [--full]")
    process.exit(1)
  }
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const ddf = await loadDdf(device)
  const project = liveProject(ddf)
  const screenId = project.screens[0].id

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
    page.on("pageerror", (e) => console.error("[page error]", e.message))
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)

    const zipPath = path.join(os.tmpdir(), "hil-live-value.zip")
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    console.log("installing three live values in a text, a threshold icon and an icon on a combined topic ...")
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl, "-o", os.devNull])
    } catch (err) {
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
    const topicValues = async (topics) =>
      (await fetch(`${base}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`, { signal: AbortSignal.timeout(4000) })).json()
    const applied = async () => {
      const topics = Object.keys(values)
      if (topics.length === 0) return
      const until = Date.now() + 15000
      while (Date.now() < until) {
        try {
          const got = await topicValues(topics)
          if (topics.every((t) => String(got[t]) === values[t])) return
        } catch {}
        await sleep(150)
      }
      throw new Error(`the board did not take ${JSON.stringify(values)} within 15 s`)
    }

    // name, the values sent, whether it must be drawn as regions, what the
    // combined topic `alarm` must read on the board afterwards
    const steps = [
      { name: "nothing arrived yet", set: {}, force: true, alarm: "" },
      {
        name: "every value arrives",
        set: { [HEAT]: "false", [TIMER]: "12198", [TEMP]: "21.46", [OUTSIDE]: "8", [BOILER]: "false", [NIGHT]: "true" },
        force: true,
        alarm: "false",
      },
      { name: "the heating starts (a chip, and the combined icon through warm)", set: { [HEAT]: "true" }, regions: true, alarm: "true" },
      { name: "the countdown ticks", set: { [TIMER]: "12197" }, regions: true, alarm: "true" },
      { name: "it runs out and its chip is empty", set: { [TIMER]: "0" }, regions: true, alarm: "true" },
      { name: "frost: the threshold icon", set: { [OUTSIDE]: "-2" }, regions: true, alarm: "true" },
      { name: "the heating stops - the boiler is off, alarm goes off", set: { [HEAT]: "false" }, regions: true, alarm: "false" },
      { name: "only the boiler changes - an input of warm, two levels under the icon", set: { [BOILER]: "true" }, regions: true, alarm: "true" },
      { name: "only night changes", set: { [NIGHT]: "false" }, regions: true, alarm: "false" },
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
      await sleep(800)

      const last = Object.values(step.set).pop()
      const how = last === undefined ? "full screen (forced)" : drawnAs((await get(`${base}/api/debug`)).body, last)
      const snapshot = Buffer.from(await (await fetch(`${base}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer())
      const devicePath = path.join(OUT_DIR, `device-${i}.bmp`)
      fs.writeFileSync(devicePath, snapshot)
      // "" is a topic nothing arrived on yet (see hil/placeholder-redraw.js).
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
        quantize: ddf.testInterface.snapshotQuantize || "rgb565",
        project,
        screenIndex: 0,
        topicOverrides: { ...Object.fromEntries(ALL_TOPICS.map((t) => [t, ""])), ...values },
      })
      const expectedPath = path.join(OUT_DIR, `expected-${i}.png`)
      fs.writeFileSync(expectedPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))
      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)])
      const { dimensionMismatch, diffPixels } = comparePixels(deviceImg, expectedImg)

      // The board's own word for the combined topic, as /api/topic-values
      // reads it: "" while it has no value.
      let alarm = "?"
      try {
        const got = await topicValues(["combined:alarm"])
        alarm = got["combined:alarm"] == null ? "" : String(got["combined:alarm"])
      } catch {}

      const pixelsOk = !dimensionMismatch && diffPixels === 0
      const pathOk = full || !step.regions || /region\(s\)|rect/.test(how)
      const alarmOk = alarm === step.alarm
      const ok = pixelsOk && pathOk && alarmOk
      if (!ok) failures++
      console.log(
        `  ${ok ? "PASS" : "FAIL"} ${step.name}: ` +
          `${dimensionMismatch ? "dimension mismatch" : `${diffPixels} px differ`}, drawn as ${how}, combined:alarm = "${alarm}"` +
          (pathOk ? "" : " - expected regions, so the partial redraw was not what drew it") +
          (alarmOk ? "" : ` - expected "${step.alarm}"`),
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
  console.log("PASS - live values and combined topics follow their topics, 0 px")
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
