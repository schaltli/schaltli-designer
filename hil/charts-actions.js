#!/usr/bin/env node
// A board changes a screen's time range as the designer's preview does
// (tasks/charts-firmware-plan.md F6; device contract §2.13): a button's
// set-range, the knob's ring moving it earlier and later, a pinch narrowing
// and widening it where the board reads two fingers, and a sideways drag on a
// scrolling chart moving it back through time, settled on whole days. Each
// step is read from what the board says its view is (/api/debug?set=charts).
//
//   node hil/charts-actions.js --device 192.168.1.117
//
// Needs the designer dev server, the HIL broker and a firmware with the
// charts. Exit 0 pass, 1 fail, 2 the board is not reachable or a recorder
// records on the broker (skipped, loudly).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")
const { dateOf, midnightOf, keptDates, nextDate, previousDate } = require("../recorder/history")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const LEVEL = `hil-range-${RUN}/level`
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const DAY = 86400

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

function specimen(project, type) {
  for (const screen of project.screens) for (const o of screen.objects) if (o.type === type) return JSON.parse(JSON.stringify(o))
  throw new Error(`no ${type} specimen in the conformance project`)
}

function rangeProject(ddf, stamp, { ring, pinch }) {
  const built = buildProject(ddf, { topicPrefix: `hil-range-${RUN}` }).project
  const buttonBase = specimen(built, "button")
  const project = JSON.parse(JSON.stringify(built))
  const { width, height } = ddf.screen
  const round = (ddf.raw?.screen?.shape ?? ddf.screen.shape) === "round"
  const side = round ? Math.floor(Math.min(width, height) / Math.SQRT2) : null
  const inner = round ? { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), w: side, h: side } : { x: 0, y: 0, w: width, h: height }
  const at = (fx, fy, fw, fh) => ({
    x: inner.x + Math.round(inner.w * fx),
    y: inner.y + Math.round(inner.h * fy),
    width: Math.round(inner.w * fw),
    height: Math.round(inner.h * fh),
  })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  const chart = {
    id: "chart",
    type: "chart",
    zIndex: 1,
    ...at(0.04, 0.04, 0.92, 0.62),
    properties: {
      mode: "time",
      scroll: true,
      legend: "none",
      fontId: font.id,
      left: { scale: "fixed", min: 0, max: 100, unit: "%" },
      series: [{ id: "s1", source: { kind: "topic", topic: LEVEL }, name: "Level", valueKind: "level", unit: "%", draw: "line", color: "#2255aa" }],
    },
  }
  const button = (id, text, range, fx) => ({
    ...buttonBase,
    id,
    zIndex: 2,
    ...at(fx, 0.72, 0.4, 0.22),
    properties: { ...buttonBase.properties, text, action: { type: "set-range", range } },
  })
  project.name = "HIL time range"
  project.fonts = ddf.fonts
  project.combinedTopics = []
  project.topics = [{ id: "level", topic: LEVEL, type: "numeric", examples: ["50"] }]
  // An export writes the actions of the buttons the project lists, and none else.
  project.hardwareButtons = [
    ...(ring ? [{ id: "button-0", name: "Rotate Right" }, { id: "button-1", name: "Rotate Left" }] : []),
    ...(pinch ? [{ id: "pinch-in", name: "Pinch In" }, { id: "pinch-out", name: "Pinch Out" }] : []),
  ]
  project.screens = [
    {
      id: `range-${stamp}`,
      name: "Range",
      backgroundColor: "#ffffff",
      timeRange: "24h",
      buttonActions: {
        ...(ring
          ? {
              "button-0": { type: "move-range", rangeDirection: "later" },
              "button-1": { type: "move-range", rangeDirection: "earlier" },
            }
          : {}),
        ...(pinch ? { "pinch-in": { type: "widen-range" }, "pinch-out": { type: "narrow-range" } } : {}),
      },
      objects: [chart, button("week", "7 d", "7d", 0.06), button("day", "24 h", "24h", 0.54)],
    },
  ]
  return { project, chart, week: project.screens[0].objects[1], day: project.screens[0].objects[2] }
}

async function main() {
  let device = null
  for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === "--device") device = process.argv[++i]
  if (!device) {
    console.error("usage: node hil/charts-actions.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error()
  } catch {
    console.warn(`SKIPPED - ${device} not reachable`)
    process.exit(2)
  }
  console.log(`\n=== a screen's time range changed on the board (device: ${device}) ===`)
  const ddf = await loadDdf(device)
  const ring = /knob/i.test(ddf.deviceId || "")
  const pinch = (ddf.supportedFeatures || []).includes("pinch")
  // The knob follows no drag on a chart (yet): its ring moves the range.
  const drags = !ring
  const eink = (ddf.screen.colorDepth || "").toString().includes("gray") || /paper/i.test(ddf.deviceId || "")
  const stamp = `${RUN}-${device.replace(/\./g, "-")}`
  const { project, chart, week, day } = rangeProject(ddf, stamp, { ring, pinch })

  const broker = await mqtt.connectAsync(BROKER_URL, { reconnectPeriod: 0 })
  const presence = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 600)
    broker.on("message", (t, m) => {
      if (t === "schaltli/history/recorder") {
        clearTimeout(timer)
        resolve(m.length ? m.toString() : null)
      }
    })
    broker.subscribe("schaltli/history/recorder")
  })
  // A presence another HIL run left behind (id "hil-…") is no recorder.
  const recorder = presence ? JSON.parse(presence) : null
  if (recorder?.state === "online" && !String(recorder.id).startsWith("hil-")) {
    console.warn("SKIPPED - a recorder records on this broker")
    await broker.endAsync()
    process.exit(2)
  }

  // A recorder's clock and days, so the board can move by whole days.
  const start = Date.now() / 1000
  const dates = keptDates(TZ, start)
  dates.unshift(previousDate(dates[0]))
  dates.push(nextDate(dates[dates.length - 1]))
  const lay = (t, payload) => broker.publishAsync(t, payload, { retain: true, qos: 1 })
  await lay("schaltli/history/recorder", JSON.stringify({ state: "online", id: "hil-range", since: Math.floor(start), seen: Math.floor(start) }))
  await lay("schaltli/history/now", JSON.stringify({ time: Math.floor(start), tz: TZ, days: dates.map((date) => ({ date, start: midnightOf(date, TZ) })) }))

  let failures = 0
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
    if (!ok) failures++
  }
  const view = async () => {
    try {
      return JSON.parse((await get(`${base}/api/debug?set=charts`, 5000)).body).views?.["0"] ?? null
    } catch {
      return null
    }
  }
  const touch = async (query) => {
    const r = await fetch(`${base}/api/touch?${query}`, { method: "POST", signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
  }
  const settle = () => sleep(eink ? 2500 : 1200)
  const tap = async (o) => {
    const x = Math.round(o.x + o.width / 2)
    const y = Math.round(o.y + o.height / 2)
    await touch(`x=${x}&y=${y}&down=1`)
    await sleep(eink ? 1200 : 60)
    await touch(`x=${x}&y=${y}&down=0`)
    await settle()
  }
  const input = async (id) => {
    await fetch(`${base}/api/input`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `id=${id}` })
    await settle()
  }
  // One contact: the first finger alone, then both from `from` to `to` apart, then the lift.
  const pinchBy = async (from, to) => {
    const cx = Math.round(chart.x + chart.width / 2)
    const cy = Math.round(chart.y + chart.height / 2)
    await touch(`x=${cx - from}&y=${cy}`)
    await sleep(30)
    for (let i = 0; i <= 6; i++) {
      const d = Math.round(from + ((to - from) * i) / 6)
      await touch(`x=${cx - d}&y=${cy}&x2=${cx + d}&y2=${cy}`)
      await sleep(eink ? 200 : 30)
    }
    await touch(`x=${cx - to}&y=${cy}&down=0`)
    await settle()
  }
  const drag = async (x0, x1, y) => {
    for (let i = 0; i <= 8; i++) {
      await touch(`x=${Math.round(x0 + ((x1 - x0) * i) / 8)}&y=${y}&down=1`)
      await sleep(eink ? 150 : 40)
    }
    await touch(`x=${x1}&y=${y}&down=0`)
    await settle()
  }
  const show = (v) => (v ? `${v.range}, ${v.back} s back` : "no view")

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const zipPath = path.join(os.tmpdir(), `hil-range-${stamp}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(await page.evaluate((p) => window.__buildDeviceZipForTest(p), project), "base64"))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    // Back with the project, the screen's view at its Time range and the recorder's days.
    const deadline = Date.now() + 180000
    for (;;) {
      let state = null
      try {
        state = JSON.parse((await get(`${base}/api/debug?set=charts`, 5000)).body)
      } catch {}
      if (state?.views?.["0"] && state.days > 0 && (state.wanted ?? []).some((t) => t.includes(LEVEL))) break
      if (Date.now() > deadline) throw new Error("the board never showed the range screen")
      await sleep(2000)
    }
    let v = await view()
    check("the screen opens at its Time range", v?.range === "24h" && v.back === 0, show(v))

    await tap(week)
    v = await view()
    check("a button's set-range", v?.range === "7d" && v.back === 0, show(v))
    await tap(day)
    v = await view()
    check("another button's set-range", v?.range === "24h" && v.back === 0, show(v))

    if (ring) {
      await input("button-1")
      v = await view()
      check("the ring moves it a day earlier", v?.range === "24h" && v.back >= DAY - 3600 && v.back <= DAY + 3600, show(v))
      await input("button-0")
      v = await view()
      check("and back to now", v?.range === "24h" && v.back === 0, show(v))
    }

    if (pinch) {
      const reach = Math.round(Math.min(chart.width, chart.height * 2) * 0.4)
      await pinchBy(Math.round(reach * 0.3), reach)
      v = await view()
      check("fingers drawn apart narrow it", v?.range === "6h", show(v))
      await pinchBy(reach, Math.round(reach * 0.3))
      v = await view()
      check("fingers drawn together widen it", v?.range === "24h", show(v))
    }

    if (drags) {
      const y = Math.round(chart.y + chart.height / 2)
      await drag(Math.round(chart.x + chart.width * 0.15), Math.round(chart.x + chart.width * 0.9), y)
      v = await view()
      check("a drag to the right goes back, settled on a day", v?.range === "24h" && v.back > 0 && Math.abs(v.back / DAY - Math.round(v.back / DAY)) < 0.05, show(v))
      await drag(Math.round(chart.x + chart.width * 0.9), Math.round(chart.x + chart.width * 0.1), y)
      v = await view()
      check("a drag to the left comes back, never later than now", v?.range === "24h" && v.back === 0, show(v))
    }
  } finally {
    await browser.close()
    for (const t of ["schaltli/history/recorder", "schaltli/history/now"]) await lay(t, "")
    await broker.endAsync()
  }
  console.log(failures === 0 ? `PASS - ${device}: the time range changed as the designer changes it` : `FAIL - ${device}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAILED: ${err.stack || err.message}`)
  process.exit(1)
})
