// The window a chart shows and the history it reads for it
// (docs/2026-10-16-charts.md decisions 7, 9, 15; tasks/charts-designer-plan.md
// decisions 1, 2). Pure: the time and the zone come from outside - in the
// preview the recorder's (`schaltli/history/now`), else the browser's.

import { historyName, type ChartProperties, type TimeRange } from "@/lib/chart"

export const HISTORY_PREFIX = "schaltli/history"

export type HistorySource = "recent" | "recent6" | "day" | "daily"

export interface ChartWindow {
  /** Unix seconds: the window's left and right edge. */
  from: number
  to: number
  /** What the curve is read from, and its step in seconds. */
  source: HistorySource
  step: number
  /** The calendar days in the window, oldest first (day and daily). */
  dates: string[]
}

// ---- days in a zone, as the recorder counts them (recorder/history.js)

/**
 * The days a device knows its midnights from: the recorder's table in
 * `schaltli/history/now` (tasks/charts-firmware-plan.md F1). A device has no
 * zone database, so the recorder, which has one, says where each of the last
 * days began; a date the table does not hold is a whole number of 24-hour
 * days from the nearest it does.
 */
export interface DayTable {
  days: { date: string; start: number }[]
}

/** A zone: its IANA name, where `Intl` knows it (the designer), or the recorder's table (a device). */
export type Zone = string | DayTable

function partsAt(t: number, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

function offsetAt(t: number, tz: string): number {
  const p = partsAt(t, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) / 1000 - Math.floor(t)
}

/** Whole days from one date to another. */
function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number)
  const [y2, m2, d2] = b.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** The calendar day `t` falls on in the zone, "YYYY-MM-DD". */
export function dateOf(t: number, tz: Zone): string {
  if (typeof tz !== "string") {
    const days = tz.days
    let at = 0
    for (let i = 0; i < days.length; i++) if (days[i].start <= t) at = i
    const base = days[at]
    if (!base) return "1970-01-01"
    // Before the first, or a day past the last: whole days from it.
    const off = Math.floor((t - base.start) / 86400)
    return off === 0 || (at > 0 && at < days.length - 1) ? base.date : addDays(base.date, off)
  }
  const p = partsAt(t, tz)
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
}

/** The unix second a calendar day begins in the zone. */
export function midnightOf(date: string, tz: Zone): number {
  if (typeof tz !== "string") {
    const days = tz.days
    const hit = days.find((d) => d.date === date)
    if (hit) return hit.start
    if (days.length === 0) return 0
    // The nearest the table holds, and whole days from it.
    const near = daysBetween(days[0].date, date) < 0 ? days[0] : days[days.length - 1]
    return near.start + daysBetween(near.date, date) * 86400
  }
  const [y, m, d] = date.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d) / 1000
  const t = guess - offsetAt(guess, tz)
  return guess - offsetAt(t, tz)
}

/** The recorder's table for a zone: the days from `first` to `last`, each with where it began. */
export function dayTable(tz: string, first: string, last: string): DayTable {
  const days: DayTable["days"] = []
  for (let d = first; daysBetween(d, last) >= 0; d = addDays(d, 1)) days.push({ date: d, start: midnightOf(d, tz) })
  return { days }
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// ---- the window

/**
 * The window of a chart on a screen with `range`: 24 h is today, midnight to
 * midnight; 7 days the last seven days, today the last; 1 h and 6 h end with
 * the step now is in; a per-day chart its last `days` days.
 */
export function chartWindow(chart: Pick<ChartProperties, "mode" | "days">, range: TimeRange, now: number, tz: Zone, back = 0): ChartWindow {
  const base = baseWindow(chart, range, now, tz)
  if (back <= 0) return base
  // Moved back in time (lib/chart-range.ts): the same span, earlier. What
  // lies further back than recent or recent6 keep is read from the days.
  const from = base.from - back
  const to = base.to - back
  if (base.source === "daily") {
    const shift = Math.round(back / 86400)
    return { ...base, from, to, dates: base.dates.map((d) => addDays(d, -shift)) }
  }
  const kept = base.source === "recent" ? 2 * 3600 : base.source === "recent6" ? 6 * 3600 : 0
  if (now - from <= kept) return { ...base, from, to }
  const dates: string[] = []
  for (let d = dateOf(from, tz); midnightOf(d, tz) < to; d = addDays(d, 1)) dates.push(d)
  return { from, to, source: "day", step: 900, dates }
}

function baseWindow(chart: Pick<ChartProperties, "mode" | "days">, range: TimeRange, now: number, tz: Zone): ChartWindow {
  const today = dateOf(now, tz)
  if (chart.mode === "per-day") {
    const n = Math.max(1, chart.days ?? 7)
    const dates = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
    return { from: midnightOf(dates[0], tz), to: midnightOf(addDays(today, 1), tz), source: "daily", step: 86400, dates }
  }
  if (range === "1h" || range === "6h") {
    const step = range === "1h" ? 60 : 300
    const to = Math.floor(now / step) * step + step
    const from = to - (range === "1h" ? 3600 : 6 * 3600)
    return { from, to, source: range === "1h" ? "recent" : "recent6", step, dates: [] }
  }
  const n = range === "7d" ? 7 : 1
  const dates = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
  return { from: midnightOf(dates[0], tz), to: midnightOf(addDays(today, 1), tz), source: "day", step: 900, dates }
}

/** The retained topics a chart reads for a window: per topic series, the source's topic or one per day. */
export function historyTopicsFor(chart: Pick<ChartProperties, "series">, window: ChartWindow): string[] {
  const out: string[] = []
  for (const s of chart.series ?? []) {
    if (s.source?.kind !== "topic" || !s.source.topic) continue
    const base = `${HISTORY_PREFIX}/${historyName(s.source.topic)}`
    const names = window.source === "day" ? window.dates.map((d) => `${base}/day/${d}`) : [`${base}/${window.source}`]
    for (const n of names) if (!out.includes(n)) out.push(n)
  }
  return out
}
