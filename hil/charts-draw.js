#!/usr/bin/env node
// A board draws a chart as the designer does, pixel for pixel
// (tasks/charts-firmware-plan.md F4, F5; device contract §2.13). On the
// bench's broker it lays what a recorder would - presence, clock and days,
// today's history of a level and a heater's on-periods - installs a screen
// with a chart of them (a fixed axis, a zone, a line, a band, a legend),
// makes the board draw it at a known clock, and compares the board's snapshot
// with the designer's test-render of the same history at the same clock.
//
//   node hil/charts-draw.js --device 192.168.1.117
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
const { Jimp } = require("jimp")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")
const { comparePixels } = require("./report-template")
const { deviceTag } = require("./device-tag")
const { dateOf, midnightOf, keptDates, nextDate, previousDate } = require("../recorder/history")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const LEVEL = `hil-chart-${RUN}/level`
const HEATER = `hil-chart-${RUN}/heater`
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const OUT_DIR = path.join(__dirname, "charts-draw-report", deviceTag())

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

function chartProject(ddf, stamp) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-chart-${RUN}` })
  const { width, height } = ddf.screen
  const round = (ddf.raw?.screen?.shape ?? ddf.screen.shape) === "round"
  const side = round ? Math.floor(Math.min(width, height) / Math.SQRT2) : null
  const inner = round ? { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), w: side, h: side } : { x: 0, y: 0, w: width, h: height }
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  project.name = "HIL chart"
  project.fonts = ddf.fonts
  project.combinedTopics = []
  project.topics = [
    { id: "level", topic: LEVEL, type: "numeric", examples: ["50"] },
    { id: "heater", topic: HEATER, type: "text", examples: ["on", "off"] },
  ]
  project.screens = [
    {
      id: `chart-${stamp}`,
      name: "Chart",
      backgroundColor: "#ffffff",
      timeRange: "24h",
      objects: [
        {
          id: "chart",
          type: "chart",
          zIndex: 1,
          x: inner.x + Math.round(inner.w * 0.04),
          y: inner.y + Math.round(inner.h * 0.06),
          width: Math.round(inner.w * 0.92),
          height: Math.round(inner.h * 0.88),
          properties: {
            mode: "time",
            scroll: false,
            legend: "top-right",
            fontId: font.id,
            textColor: "#1d1b20",
            mutedColor: "#49454f",
            lineColor: "#cac4d0",
            left: { scale: "fixed", min: 0, max: 100, unit: "%" },
            zones: [{ axis: "left", to: 20, color: "#d0453f" }],
            series: [
              { id: "s1", source: { kind: "topic", topic: LEVEL }, name: "Level", valueKind: "level", unit: "%", draw: "line", color: "#2255aa", annotations: ["current"] },
              { id: "s2", source: { kind: "topic", topic: HEATER }, name: "Heat", valueKind: "state", draw: "band", color: "#2f9a52", annotations: ["runtime"] },
            ],
          },
        },
      ],
    },
  ]
  return project
}

async function main() {
  let device = null
  for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === "--device") device = process.argv[++i]
  if (!device) {
    console.error("usage: node hil/charts-draw.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error()
  } catch {
    console.warn(`SKIPPED - ${device} not reachable`)
    process.exit(2)
  }
  console.log(`\n=== a chart drawn as the designer draws it (device: ${device}) ===`)
  const ddf = await loadDdf(device)
  const stamp = `${RUN}-${device.replace(/\./g, "-")}`
  const project = chartProject(ddf, stamp)

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

  // Today's history: a level falling through the day so far, the heater on twice.
  const start = Date.now() / 1000
  const today = dateOf(start, TZ)
  const dates = keptDates(TZ, start)
  dates.unshift(previousDate(dates[0]))
  dates.push(nextDate(dates[dates.length - 1]))
  const steps = Math.floor((start - midnightOf(today, TZ)) / 900)
  const mean = Array.from({ length: 96 }, (_, i) => (i < steps ? Math.round(80 - (i * 50) / 96) : null))
  const levelTopic = `schaltli/history/${LEVEL}/day/${today}`
  const heaterTopic = `schaltli/history/${HEATER}/day/${today}`
  const level = { date: today, step: 900, mean, min: mean, max: mean }
  const heater = { date: today, on: [[60, 150], [Math.max(200, Math.floor(steps * 15) - 120), Math.max(260, Math.floor(steps * 15) - 30)]] }
  const nowPayload = (t) => JSON.stringify({ time: Math.floor(t), tz: TZ, days: dates.map((date) => ({ date, start: midnightOf(date, TZ) })) })
  const lay = (t, payload) => broker.publishAsync(t, payload, { retain: true, qos: 1 })
  const recorderPayload = JSON.stringify({ state: "online", id: "hil-chart", since: Math.floor(start), seen: Math.floor(start) })
  await lay("schaltli/history/recorder", recorderPayload)
  await lay("schaltli/history/now", nowPayload(start))
  await lay(levelTopic, JSON.stringify(level))
  await lay(heaterTopic, JSON.stringify(heater))

  let failures = 0
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const zipPath = path.join(os.tmpdir(), `hil-chart-${stamp}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(await page.evaluate((p) => window.__buildDeviceZipForTest(p), project), "base64"))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    // Back with the project, holding both days.
    const deadline = Date.now() + 180000
    for (;;) {
      let held = []
      try {
        held = JSON.parse((await get(`${base}/api/debug?set=charts`, 5000)).body).held ?? []
      } catch {}
      if (held.includes(levelTopic) && held.includes(heaterTopic)) break
      if (Date.now() > deadline) throw new Error("the board never held the chart's history")
      await sleep(2000)
    }

    // The clock, laid anew, and the level's day again with a mark it does not
    // read: the board draws now, at that clock - the moment the reference is
    // drawn at.
    const at = Date.now() / 1000
    await lay("schaltli/history/now", nowPayload(at))
    await lay(levelTopic, JSON.stringify({ ...level, rev: RUN }))
    await sleep((ddf.testInterface.postRenderSettleMs || 0) + 2500)

    fs.mkdirSync(OUT_DIR, { recursive: true })
    const devicePath = path.join(OUT_DIR, "device.bmp")
    fs.writeFileSync(devicePath, Buffer.from(await (await fetch(`${base}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer()))
    const live = {
      "schaltli/history/recorder": recorderPayload,
      "schaltli/history/now": nowPayload(at),
      [levelTopic]: JSON.stringify(level),
      [heaterTopic]: JSON.stringify(heater),
    }
    const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
      quantize: ddf.testInterface.snapshotQuantize || "rgb565",
      pullTabs: ddf.pullTabs,
      project,
      screenIndex: 0,
      topicOverrides: {},
      chartLive: { live, now: Math.floor(at) },
    })
    const expectedPath = path.join(OUT_DIR, "expected.png")
    fs.writeFileSync(expectedPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))
    const [glass, want] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)])
    const { dimensionMismatch, diffPixels, totalPixels } = comparePixels(glass, want)
    const ok = !dimensionMismatch && diffPixels === 0
    if (!ok && !dimensionMismatch) {
      const mask = glass.clone()
      for (let i = 0; i < mask.bitmap.data.length; i += 4) {
        const same = glass.bitmap.data[i] === want.bitmap.data[i] && glass.bitmap.data[i + 1] === want.bitmap.data[i + 1] && glass.bitmap.data[i + 2] === want.bitmap.data[i + 2]
        mask.bitmap.data[i] = same ? 12 : 255
        mask.bitmap.data[i + 1] = same ? 14 : 0
        mask.bitmap.data[i + 2] = same ? 16 : 255
      }
      await mask.write(path.join(OUT_DIR, "diff.png"))
    }
    console.log(`  ${ok ? "PASS" : "FAIL"} the chart as the designer draws it (${dimensionMismatch ? "dimension mismatch" : `${diffPixels}/${totalPixels} px differ`}) - ${OUT_DIR}`)
    if (!ok) failures++
  } finally {
    await browser.close()
    for (const t of ["schaltli/history/recorder", "schaltli/history/now", levelTopic, heaterTopic]) await lay(t, "")
    await broker.endAsync()
  }
  console.log(failures === 0 ? `PASS - ${device}: the chart as the designer draws it` : `FAIL - ${device}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
