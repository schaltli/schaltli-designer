// The recorder's core (docs/2026-10-16-charts.md decisions 5-7,
// tasks/charts-recorder-plan.md decisions 2-4): what arrives on a wanted
// topic, gathered into steps, and the payloads laid on the broker. Pure -
// every time comes from outside - so each rule is tested without a broker
// and without waiting.
//
// Level and power: per step the time-weighted mean, the minimum and the
// maximum. A value holds until the next one, but for 15 minutes at most: a
// sensor that went quiet leaves its steps empty, not a flat line. Power also
// keeps the positive part of its integral, so the energy that went in and
// out is exact. State: the periods it was on.

"use strict"

const { asNumber, matches, valueOf } = require("./compare")

const MINUTE = 60
const HOLD = 15 * MINUTE
const RESOLUTIONS = { m1: 60, m5: 300, m15: 900 }
const KEEP = { m1: 48 * 3600, m5: 6 * 3600, m15: 31 * 86400 }
const DAYS_KEPT = 30

// ---- days in a time zone

function partsAt(t, tz) {
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

/** Seconds the zone is ahead of UTC at `t`. */
function offsetAt(t, tz) {
  const p = partsAt(t, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) / 1000 - Math.floor(t)
}

/** The calendar day `t` falls on in the zone, "YYYY-MM-DD". */
function dateOf(t, tz) {
  const p = partsAt(t, tz)
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
}

/** The unix second a calendar day begins in the zone. */
function midnightOf(date, tz) {
  const [y, m, d] = date.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d) / 1000
  let t = guess - offsetAt(guess, tz)
  t = guess - offsetAt(t, tz)
  return t
}

function nextDate(date) {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

function previousDate(date) {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

// ---- one topic

const round = (n) => Math.round(n * 1000) / 1000

class Series {
  constructor(topic, kind, onMeans) {
    this.topic = topic
    this.kind = kind
    this.onMeans = onMeans ?? []
    // level, power: per resolution, step start → { sum, pos, dur, min, max }
    this.steps = { m1: new Map(), m5: new Map(), m15: new Map() }
    this.last = null // { value, t }
    this.upto = null // up to when the held value is accounted for
    // state: [start, end|null], oldest first
    this.periods = []
  }

  /** A message at `t`. Returns false for one that says nothing it can use. */
  ingest(payload, t) {
    const text = valueOf(this.topic, String(payload))
    if (text === undefined) return false
    if (this.kind === "state") {
      const on = this.onMeans.length > 0 ? this.onMeans.some((c) => matches(text, c.op, c.value)) : matches(text, "yes")
      const open = this.periods.length > 0 && this.periods[this.periods.length - 1][1] === null
      if (on && !open) this.periods.push([t, null])
      if (!on && open) this.periods[this.periods.length - 1][1] = t
      return true
    }
    const value = asNumber(text)
    if (value === undefined) return false
    this.advance(t)
    this.last = { value, t }
    this.upto = t
    this.touch(t, t, value)
    return true
  }

  /** Accounts the held value up to `now`, as far as it holds. */
  advance(now) {
    if (this.kind === "state" || !this.last || this.upto === null) return
    const end = Math.min(now, this.last.t + HOLD)
    if (end > this.upto) this.touch(this.upto, end, this.last.value)
    this.upto = Math.max(this.upto, Math.min(now, end))
  }

  // Adds `value` held from `from` to `to` (an instant when equal) to every step it covers.
  touch(from, to, value) {
    for (const [res, len] of Object.entries(RESOLUTIONS)) {
      const map = this.steps[res]
      let a = from
      do {
        const start = Math.floor(a / len) * len
        const b = Math.min(to, start + len)
        let step = map.get(start)
        if (!step) map.set(start, (step = { sum: 0, pos: 0, dur: 0, min: value, max: value }))
        const dt = b - a
        step.sum += value * dt
        step.pos += Math.max(value, 0) * dt
        step.dur += dt
        if (value < step.min) step.min = value
        if (value > step.max) step.max = value
        a = b
      } while (a < to)
    }
  }

  /** The steps of one resolution from `from`, `count` of them: mean, min, max, null where none. */
  window(res, from, count) {
    const len = RESOLUTIONS[res]
    const out = { mean: [], min: [], max: [] }
    for (let i = 0; i < count; i++) {
      const step = this.steps[res].get(from + i * len)
      const has = step && step.dur > 0
      out.mean.push(has ? round(step.sum / step.dur) : step ? round(step.min) : null)
      out.min.push(step ? round(step.min) : null)
      out.max.push(step ? round(step.max) : null)
    }
    return out
  }

  /** The on-periods overlapping [from, to), clipped to it, still open ones up to `now`. */
  onBetween(from, to, now) {
    const out = []
    for (const [s, e] of this.periods) {
      const end = e === null ? now : e
      const a = Math.max(s, from)
      const b = Math.min(end, to)
      if (b > a) out.push([a, b])
    }
    return out
  }

  /** Forgets what is older than kept. */
  prune(now) {
    for (const [res, keep] of Object.entries(KEEP)) {
      for (const start of this.steps[res].keys()) if (start + RESOLUTIONS[res] <= now - keep) this.steps[res].delete(start)
    }
    this.periods = this.periods.filter(([, e]) => e === null || e > now - KEEP.m15)
  }

  toJSON() {
    return {
      topic: this.topic,
      kind: this.kind,
      onMeans: this.onMeans,
      last: this.last,
      upto: this.upto,
      steps: Object.fromEntries(Object.entries(this.steps).map(([res, map]) => [res, [...map.entries()]])),
      periods: this.periods,
    }
  }

  static fromJSON(o) {
    const s = new Series(o.topic, o.kind, o.onMeans)
    s.last = o.last ?? null
    s.upto = o.upto ?? null
    for (const res of Object.keys(RESOLUTIONS)) s.steps[res] = new Map(o.steps?.[res] ?? [])
    s.periods = o.periods ?? []
    return s
  }
}

// ---- the payloads (decision 7, «What the recorder lays on the broker»)

/** One calendar day: 15-minute steps (92, 96 or 100 of them), or a state's on-periods in minutes since midnight. */
function dayPayload(series, date, tz, now) {
  const from = midnightOf(date, tz)
  const to = midnightOf(nextDate(date), tz)
  if (series.kind === "state") {
    return { date, on: series.onBetween(from, to, now).map(([a, b]) => [round((a - from) / MINUTE), round((b - from) / MINUTE)]) }
  }
  return { date, step: RESOLUTIONS.m15, ...series.window("m15", from, Math.round((to - from) / RESOLUTIONS.m15)) }
}

/** The last `span` seconds at a resolution, ending with the step `now` is in. A state's periods in unix seconds. */
function recentPayload(series, res, span, now) {
  const len = RESOLUTIONS[res]
  const end = Math.floor(now / len) * len + len
  const from = end - span
  if (series.kind === "state") return { end, on: series.onBetween(from, end, now) }
  return { end, step: len, ...series.window(res, from, span / len) }
}

/** One day's figures for a per-day chart: what fits the kind. */
function dailyFigures(series, date, tz, now) {
  const from = midnightOf(date, tz)
  const to = midnightOf(nextDate(date), tz)
  if (series.kind === "state") {
    const on = series.onBetween(from, to, now)
    const starts = series.periods.filter(([s]) => s >= from && s < to).length
    return { date, runtime: round(on.reduce((n, [a, b]) => n + (b - a), 0) / MINUTE), starts }
  }
  let sum = 0
  let pos = 0
  let dur = 0
  let min = null
  let max = null
  const means = []
  for (let t = from; t < to; t += RESOLUTIONS.m15) {
    const step = series.steps.m15.get(t)
    if (!step) continue
    sum += step.sum
    pos += step.pos
    dur += step.dur
    if (min === null || step.min < min) min = step.min
    if (max === null || step.max > max) max = step.max
    if (step.dur > 0) means.push(step.sum / step.dur)
  }
  if (min === null) return { date }
  const mean = dur > 0 ? round(sum / dur) : round(min)
  if (series.kind === "power") {
    // Watt-seconds to watt-hours; what went out is the negative part.
    return { date, energyIn: round(pos / 3600), energyOut: round((pos - sum) / 3600), mean, min: round(min), max: round(max) }
  }
  // A tank's use is its decline: a refill does not count, and the other way round.
  let decline = 0
  let rise = 0
  for (let i = 1; i < means.length; i++) {
    const d = means[i] - means[i - 1]
    if (d < 0) decline -= d
    else rise += d
  }
  return { date, decline: round(decline), rise: round(rise), mean, min: round(min), max: round(max) }
}

/** The last 30 days (today included) for a per-day chart. */
function dailyPayload(series, tz, now) {
  const days = []
  let date = dateOf(now, tz)
  for (let i = 0; i < DAYS_KEPT; i++) {
    days.unshift(dailyFigures(series, date, tz, now))
    date = previousDate(date)
  }
  return { days }
}

/** The days kept, oldest first: the last 30, today included. */
function keptDates(tz, now) {
  const dates = []
  let date = dateOf(now, tz)
  for (let i = 0; i < DAYS_KEPT; i++) {
    dates.unshift(date)
    date = previousDate(date)
  }
  return dates
}

module.exports = {
  Series,
  RESOLUTIONS,
  HOLD,
  DAYS_KEPT,
  dateOf,
  midnightOf,
  nextDate,
  previousDate,
  dayPayload,
  recentPayload,
  dailyPayload,
  keptDates,
}
