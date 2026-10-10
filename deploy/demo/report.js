#!/usr/bin/env node
// What visitors did in the demo (docs/2026-10-10-demo-tracking.md), from the
// day files lib/demo-events.ts writes - on the server:
//
//   node deploy/demo/report.js [--days 7] [--dir .data/demo-events]
//
// or from the PC: bash deploy/demo/report.sh [--days 7]

const fs = require("fs")
const path = require("path")

/** The day files' lines of the last `days` days up to `today`, parsed. */
function readEvents(dir, days, today = new Date()) {
  const from = new Date(today.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  const events = []
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
    if (!m || m[1] < from) continue
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line))
      } catch {}
    }
  }
  return events
}

const count = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by)
const top = (map, n = 10) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n)
const median = (values) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** The visits, each with its events in order and its length in seconds. */
function visitsOf(events) {
  const byVisit = new Map()
  for (const e of events) {
    if (!byVisit.has(e.visit)) byVisit.set(e.visit, [])
    byVisit.get(e.visit).push(e)
  }
  return [...byVisit.entries()].map(([id, list]) => {
    list.sort((a, b) => a.t.localeCompare(b.t))
    const start = list.find((e) => e.type === "visit") ?? list[0]
    const seconds = Math.round((Date.parse(list[list.length - 1].t) - Date.parse(list[0].t)) / 1000)
    return { id, events: list, start, seconds, day: list[0].t.slice(0, 10) }
  })
}

const placeName = (p) => (p ? [p.country, p.region, p.city].filter(Boolean).join(", ") : "unknown")

/** The summary as numbers, for the text below and for the test. */
function summarize(events) {
  const visits = visitsOf(events)
  const s = {
    visits: visits.length,
    phonePage: visits.filter((v) => v.start.detail === "phone page").length,
    medianSeconds: median(visits.map((v) => v.seconds)),
    longest: Math.max(0, ...visits.map((v) => v.seconds)),
    designer: visits.filter((v) => v.events.some((e) => e.type === "mode" && String(e.detail).startsWith("designer"))).length,
    inserted: visits.filter((v) => v.events.some((e) => e.type === "insert")).length,
    downloads: visits.filter((v) => v.events.some((e) => e.type === "download")).length,
    days: new Map(),
    places: new Map(),
    from: new Map(),
    browsers: new Map(),
    inserts: new Map(),
    taps: new Map(),
    scene: new Map(),
    screens: new Map(),
    refused: new Map(),
  }
  for (const v of visits) {
    const day = s.days.get(v.day) ?? { visits: 0, seconds: [], designer: 0, downloads: 0 }
    day.visits++
    day.seconds.push(v.seconds)
    if (v.events.some((e) => e.type === "mode" && String(e.detail).startsWith("designer"))) day.designer++
    if (v.events.some((e) => e.type === "download")) day.downloads++
    s.days.set(v.day, day)
    count(s.places, placeName(v.start.place))
    count(s.from, v.start.from || "(direct)")
    count(s.browsers, `${v.start.form ?? "?"} / ${v.start.browser ?? "?"}`)
    for (const e of v.events) {
      if (e.type === "insert") for (const type of String(e.detail ?? "").split(",")) if (type) count(s.inserts, type)
      if (e.type === "tap") count(s.taps, String(e.detail ?? "").split("=")[0])
      if (e.type === "scene") count(s.scene, e.detail)
      if (e.type === "screen") count(s.screens, e.detail)
      if (e.type === "refused") count(s.refused, e.detail)
    }
  }
  return s
}

const duration = (seconds) => (seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`)
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)} %` : "-")

function render(s, days) {
  const out = []
  const list = (title, map, n) => {
    out.push("", title)
    const rows = top(map, n)
    if (rows.length === 0) out.push("  -")
    for (const [key, value] of rows) out.push(`  ${String(value).padStart(5)}  ${key}`)
  }
  out.push(`Demo, the last ${days} day(s)`)
  out.push("")
  out.push(`Visits             ${s.visits}  (phone page: ${s.phonePage})`)
  out.push(`Length             median ${duration(s.medianSeconds)}, longest ${duration(s.longest)}`)
  out.push(`Opened Designer    ${s.designer}  (${pct(s.designer, s.visits)})`)
  out.push(`Inserted something ${s.inserted}  (${pct(s.inserted, s.visits)})`)
  out.push(`Download Project   ${s.downloads}  (${pct(s.downloads, s.visits)})`)
  out.push("", "Per day            visits  median   designer  downloads")
  for (const [day, d] of [...s.days.entries()].sort()) {
    out.push(`  ${day}       ${String(d.visits).padStart(5)}  ${duration(median(d.seconds)).padStart(9)}  ${String(d.designer).padStart(7)}  ${String(d.downloads).padStart(9)}`)
  }
  list("Where from", s.places, 15)
  list("Came from", s.from, 10)
  list("Form / browser", s.browsers, 8)
  list("Screens opened in the preview", s.screens, 10)
  list("Switched in the preview (topic)", s.taps, 15)
  list("In the drawing of the van", s.scene, 5)
  list("Inserted in the designer", s.inserts, 15)
  list("Asked for what the demo does not do", s.refused, 5)
  out.push("", "IP Geolocation by DB-IP (https://db-ip.com)")
  return out.join("\n")
}

module.exports = { readEvents, summarize, render }

if (require.main === module) {
  const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback)
  const days = Math.max(1, Number(arg("--days", "7")) || 7)
  const dir = arg("--dir", process.env.DEMO_EVENTS_DIR || path.join(process.cwd(), ".data", "demo-events"))
  console.log(render(summarize(readEvents(dir, days)), days))
}
