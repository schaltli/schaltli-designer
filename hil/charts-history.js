#!/usr/bin/env node
// A board holds the charts' history of the screen it shows, and no other
// (tasks/charts-firmware-plan.md F3; device contract §2.13). On the bench's
// broker this lays what a recorder would - its presence, its clock with the
// table of days, a day of one topic's history - and installs a project of two
// screens: «Chart» with a chart of that topic, «Plain» without. Then:
//
//   1. on «Chart» the board says it holds today's day of the topic, the
//      recorder online and the recorder's days;
//   2. on «Plain» it holds nothing: the day was let go;
//   3. back on «Chart» it holds the day again.
//
// It reads what the board holds through its test interface
// (/api/debug?set=charts). Everything laid on the broker is cleared at the end.
//
//   node hil/charts-history.js --device 192.168.1.114
//
// Needs the designer dev server (test-render builds the zip), the HIL broker,
// and a firmware with the charts (schaltli-firmware ChartFeed). Exit 0 pass,
// 1 fail, 2 the board is not reachable (skipped, loudly).

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
const TOPIC = `hil-charts-${RUN}/level`
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

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

function chartProject(ddf, stamp) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-charts-${RUN}` })
  const { width, height } = ddf.screen
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  project.name = "HIL charts history"
  project.fonts = ddf.fonts
  project.combinedTopics = []
  project.topics = [{ id: "level", topic: TOPIC, type: "numeric", examples: ["50"] }]
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
          x: Math.round(width * 0.1),
          y: Math.round(height * 0.2),
          width: Math.round(width * 0.8),
          height: Math.round(height * 0.6),
          properties: {
            mode: "time",
            scroll: false,
            legend: "none",
            fontId: font.id,
            left: { scale: "fixed", min: 0, max: 100 },
            series: [{ id: "s1", source: { kind: "topic", topic: TOPIC }, name: "Level", valueKind: "level", draw: "line", color: "#2255aa" }],
          },
        },
      ],
    },
    { id: `plain-${stamp}`, name: "Plain", backgroundColor: "#ffffff", objects: [] },
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
    console.error("usage: node hil/charts-history.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${args.device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no answer")
  } catch {
    console.warn(`SKIPPED - ${args.device} not reachable`)
    process.exit(2)
  }
  console.log(`\n=== charts' history (device: ${args.device}) ===`)
  const ddf = await loadDdf(args.device)
  const stamp = `${RUN}-${args.device.replace(/\./g, "-")}`
  let failures = 0
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures++
  }

  // What a recorder lays: presence, clock and days, today's history of the topic.
  const now = Date.now() / 1000
  const today = dateOf(now, TZ)
  const dates = keptDates(TZ, now)
  dates.unshift(previousDate(dates[0]))
  dates.push(nextDate(dates[dates.length - 1]))
  const dayTopic = `schaltli/history/${TOPIC}/day/${today}`
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
  if (presence && JSON.parse(presence).state === "online") {
    console.warn("SKIPPED - a recorder records on this broker; its clock would be the board's")
    await broker.endAsync()
    process.exit(2)
  }
  const lay = (t, payload) => broker.publishAsync(t, payload, { retain: true, qos: 1 })
  await lay("schaltli/history/recorder", JSON.stringify({ state: "online", id: "hil-charts", since: Math.floor(now), seen: Math.floor(now) }))
  await lay("schaltli/history/now", JSON.stringify({ time: Math.floor(now), tz: TZ, days: dates.map((date) => ({ date, start: midnightOf(date, TZ) })) }))
  await lay(dayTopic, JSON.stringify({ date: today, step: 900, mean: Array(96).fill(50), min: Array(96).fill(40), max: Array(96).fill(60) }))

  // What the board holds; while it restarts after the install, nothing.
  const charts = async () => {
    try {
      const r = await get(`${base}/api/debug?set=charts`, 5000)
      return JSON.parse(r.body)
    } catch (err) {
      return { error: String(err.message ?? err).slice(0, 200) }
    }
  }
  const holds = async (want, ms = 20000) => {
    const end = Date.now() + ms
    let last
    while (Date.now() < end) {
      last = await charts()
      if (want(last)) return last
      await sleep(1000)
    }
    return last
  }
  const show = async (index) => {
    const r = await fetch(`${base}/api/screen?index=${index}`, { method: "POST", signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`/api/screen answered ${r.status}`)
  }

  try {
    const zipPath = path.join(os.tmpdir(), `hil-charts-${stamp}.zip`)
    fs.writeFileSync(zipPath, await buildZip(chartProject(ddf, stamp)))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    // Back with the project: its first screen shown, the chart's day held.
    const first = await holds((c) => Array.isArray(c.held) && c.held.includes(dayTopic), 180000)
    check(!!first && Array.isArray(first.held) && first.held.includes(dayTopic), `on «Chart» it holds today's day of the topic (${JSON.stringify(first?.held ?? first)})`)
    check(first?.recorder === true, "it knows the recorder is there")
    check(first?.days === dates.length, `it has the recorder's ${dates.length} days (${first?.days})`)
    check(Math.abs((first?.clock ?? 0) - Date.now() / 1000) < 120, `its clock is the recorder's (${Math.round(first?.clock ?? 0)})`)

    await show(1)
    const plain = await holds((c) => Array.isArray(c.wanted) && c.wanted.length === 0)
    check(plain?.wanted?.length === 0 && plain?.held?.length === 0 && plain?.bytes === 0, `on «Plain» it holds nothing (${JSON.stringify({ wanted: plain?.wanted, bytes: plain?.bytes })})`)

    await show(0)
    const again = await holds((c) => Array.isArray(c.held) && c.held.includes(dayTopic))
    check(!!again?.held?.includes(dayTopic), "back on «Chart» it holds the day again")
  } finally {
    for (const t of ["schaltli/history/recorder", "schaltli/history/now", dayTopic]) await lay(t, "")
    await broker.endAsync()
  }
  console.log(failures === 0 ? `PASS - ${args.device}: the shown screen's history, and no other` : `FAIL - ${args.device}: ${failures} check(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
