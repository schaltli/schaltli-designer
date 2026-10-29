// A chart's layout (tasks/charts-designer-plan.md decision 3): every place,
// range and label a renderer needs, worked out from the chart, its window,
// the history read for it and its size - numbers only, no canvas and no DOM,
// so the firmware and the app can port it and be checked against it, as the
// energy diagram's layout is (lib/energy-diagram.ts).

import type { ChartAxis, ChartProperties, ChartSeries } from "@/lib/chart"
import { addDays, dateOf, midnightOf, type ChartWindow } from "@/lib/chart-window"

// ---- the history, read

/** One step of a level or power series: its start (unix s), length, and mean, min, max as shown. */
export interface Step {
  t: number
  len: number
  mean: number
  min: number
  max: number
}

/** What a series has in the window: steps, or a state's on-periods (unix s). */
export interface SeriesData {
  steps: Step[]
  on: [number, number][]
}

type Payload = Record<string, any> | null | undefined

/**
 * A series' history from the payloads read for it (keyed by topic, already
 * parsed): a day's or recent's arrays as steps, a state's periods in unix
 * seconds, `factor` applied and a power series' sign turned where `invert`.
 */
export function seriesData(series: ChartSeries, payloads: Payload[], tz: string): SeriesData {
  const steps: Step[] = []
  const on: [number, number][] = []
  const scale = (v: number) => {
    const shown = v * (series.factor ?? 1)
    return series.invert ? -shown : shown
  }
  for (const p of payloads) {
    if (!p) continue
    if (series.valueKind === "state") {
      const base = typeof p.date === "string" ? midnightOf(p.date, tz) : 0
      const minutes = typeof p.date === "string"
      for (const [a, b] of (p.on ?? []) as [number, number][]) on.push(minutes ? [base + a * 60, base + b * 60] : [a, b])
      continue
    }
    const len = p.step ?? 900
    const n = Array.isArray(p.mean) ? p.mean.length : 0
    const start = typeof p.date === "string" ? midnightOf(p.date, tz) : (p.end ?? 0) - n * len
    for (let i = 0; i < n; i++) {
      const mean = p.mean[i]
      if (mean === null || mean === undefined) continue
      const a = scale(mean)
      const lo = scale(p.min?.[i] ?? mean)
      const hi = scale(p.max?.[i] ?? mean)
      steps.push({ t: start + i * len, len, mean: a, min: Math.min(lo, hi), max: Math.max(lo, hi) })
    }
  }
  steps.sort((a, b) => a.t - b.t)
  on.sort((a, b) => a[0] - b[0])
  return { steps, on }
}

// ---- numbers

/** A step for at most about `count` ticks over `span`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(span: number, count = 4): number {
  if (!(span > 0)) return 1
  const raw = span / count
  const power = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / power
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * power
}

/** A value as an axis label: as many decimals as the step needs, the project's decimal separator. */
export function axisLabel(value: number, step: number, decimal = "."): string {
  // As many as the step has: 2.5 one, 0.25 two, 50 none.
  let decimals = 0
  while (decimals < 4 && Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-6) decimals++
  const text = (Math.abs(value) < step / 1e6 ? 0 : value).toFixed(decimals)
  return decimal === "." ? text : text.replace(".", decimal)
}

const round1 = (n: number) => Math.round(n * 10) / 10

// ---- the layout

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface AxisLayout {
  min: number
  max: number
  ticks: { value: number; y: number; label: string }[]
}

export interface SeriesLayout {
  id: string
  draw: ChartSeries["draw"]
  axis: "left" | "right"
  color: string
  colorDark?: string
  /** Its place among the chart's series: the hatching or dash a grey device draws it with. */
  pattern: number
  /** Lines, each a run of points with no gap. */
  lines: [number, number][][]
  /** Filled shapes under or between lines (area, the range band), each closed. */
  areas: [number, number][][]
  /** The range: the step's min and max as a faint band. */
  ranges: [number, number][][]
  /** The NowPoint on this series: its current value, where the window holds now. */
  nowPoint?: [number, number]
}

export interface ChartLayout {
  plot: Box
  left: AxisLayout
  right?: AxisLayout
  /** The time axis: labelled ticks, and the midnights drawn stronger, each with its day's name. */
  times: { x: number; label: string }[]
  midnights: { x: number; label: string }[]
  zones: (Box & { color: string; colorDark?: string })[]
  series: SeriesLayout[]
  /** Where now is: on the plot, or past its right edge (a window that ended). */
  now: { x: number } | { past: true } | null
}

export interface LayoutOptions {
  /** The object's size. */
  width: number
  height: number
  /** The label font's height in px. */
  fontSize: number
  now: number
  tz: string
  decimal?: string
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]

/** The day's short name: «Mo» … «So». */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function axisRange(axis: ChartAxis, values: number[]): { min: number; max: number } {
  const lo = values.length > 0 ? Math.min(...values) : 0
  const hi = values.length > 0 ? Math.max(...values) : 1
  if (axis.scale === "fixed" && axis.min !== undefined && axis.max !== undefined && axis.max > axis.min) return { min: axis.min, max: axis.max }
  if (axis.scale === "at-least" && axis.min !== undefined && axis.max !== undefined) {
    return { min: Math.min(axis.min, lo), max: Math.max(axis.max, hi) }
  }
  // auto: from 0 where nothing is below it, out to the next tick.
  let min = lo >= 0 ? 0 : lo
  let max = hi
  if (max <= min) max = min + 1
  const step = niceStep(max - min)
  min = Math.floor(min / step) * step
  max = Math.ceil(max / step) * step
  return { min, max }
}

function axisLayout(range: { min: number; max: number }, plot: Box, decimal: string): AxisLayout {
  const step = niceStep(range.max - range.min)
  const ticks: AxisLayout["ticks"] = []
  const first = Math.ceil(range.min / step - 1e-9) * step
  for (let v = first; v <= range.max + step * 1e-6; v += step) {
    ticks.push({ value: v, y: round1(plot.y + plot.h - ((v - range.min) / (range.max - range.min)) * plot.h), label: axisLabel(v, step, decimal) })
  }
  return { ...range, ticks }
}

const TIME_TICK: { span: number; every: number }[] = [
  { span: 3600, every: 900 },
  { span: 6 * 3600, every: 3600 },
  { span: 25 * 3600, every: 6 * 3600 },
]

/**
 * The layout of a time chart. `data` holds each series' history by id
 * (seriesData). Series drawn as band, stacked or bars, and the legend, are
 * laid out by the next part (charts-designer D3).
 */
export function chartLayout(chart: ChartProperties, window: ChartWindow, data: Record<string, SeriesData>, o: LayoutOptions): ChartLayout {
  const decimal = o.decimal ?? "."
  const pad = Math.round(o.fontSize / 3)
  const labelW = Math.round(o.fontSize * 2.6)
  const usesRight = chart.series.some((s) => s.axis === "right")
  const bottom = o.fontSize + pad * 2
  const legendBelow = chart.legend === "bottom" ? (o.fontSize + pad) * Math.max(1, chart.series.length) : 0
  const plot: Box = {
    x: labelW + pad,
    y: pad + Math.round(o.fontSize / 2),
    w: Math.max(1, o.width - labelW - pad * 2 - (usesRight ? labelW : 0)),
    h: Math.max(1, o.height - bottom - legendBelow - pad - Math.round(o.fontSize / 2)),
  }
  const span = window.to - window.from
  const xOf = (t: number) => round1(plot.x + ((t - window.from) / span) * plot.w)

  const valuesOn = (axis: "left" | "right") =>
    chart.series
      .filter((s) => (s.axis ?? "left") === axis && s.valueKind !== "state")
      .flatMap((s) => (data[s.id]?.steps ?? []).filter((st) => st.t + st.len > window.from && st.t < window.to).flatMap((st) => (s.range ? [st.min, st.max] : [st.mean])))
  const leftRange = axisRange(chart.left, valuesOn("left"))
  const rightRange = usesRight ? axisRange(chart.right ?? { scale: "auto" }, valuesOn("right")) : undefined
  const left = axisLayout(leftRange, plot, decimal)
  const right = rightRange ? axisLayout(rightRange, plot, decimal) : undefined
  const yOf = (v: number, axis: "left" | "right") => {
    const r = axis === "right" && rightRange ? rightRange : leftRange
    return round1(plot.y + plot.h - ((v - r.min) / (r.max - r.min)) * plot.h)
  }

  // The time axis.
  const times: ChartLayout["times"] = []
  const midnights: ChartLayout["midnights"] = []
  const tick = TIME_TICK.find((x) => span <= x.span)
  const firstDate = dateOf(window.from, o.tz)
  for (let d = firstDate; midnightOf(d, o.tz) <= window.to; d = addDays(d, 1)) {
    const m = midnightOf(d, o.tz)
    if (m >= window.from && m <= window.to) midnights.push({ x: xOf(m), label: weekdayOf(d) })
    if (tick) {
      for (let t = m; t < midnightOf(addDays(d, 1), o.tz); t += tick.every) {
        if (t < window.from || t > window.to) continue
        const hh = Math.floor((t - m) / 3600)
        const mm = Math.round(((t - m) % 3600) / 60)
        times.push({ x: xOf(t), label: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` })
      }
    }
  }

  // Zones, as wide as the plot, between their values on their axis.
  const zones = (chart.zones ?? []).map((z) => {
    const r = z.axis === "right" && rightRange ? rightRange : leftRange
    const top = yOf(Math.min(z.to ?? r.max, r.max), z.axis)
    const bottomY = yOf(Math.max(z.from ?? r.min, r.min), z.axis)
    return { x: plot.x, y: top, w: plot.w, h: round1(bottomY - top), color: z.color, ...(("colorDark" in z) ? { colorDark: (z as { colorDark?: string }).colorDark } : {}) }
  })

  const nowOn = o.now >= window.from && o.now < window.to
  const series = chart.series.map((s, index) => lineSeries(s, index, data[s.id], window, xOf, (v) => yOf(v, s.axis ?? "left"), nowOn ? o.now : null))

  return {
    plot,
    left,
    ...(right ? { right } : {}),
    times,
    midnights,
    zones,
    series,
    now: nowOn ? { x: xOf(o.now) } : o.now >= window.to ? { past: true } : null,
  }
}

function lineSeries(
  s: ChartSeries,
  index: number,
  data: SeriesData | undefined,
  window: ChartWindow,
  xOf: (t: number) => number,
  yOf: (v: number) => number,
  now: number | null,
): SeriesLayout {
  const out: SeriesLayout = {
    id: s.id,
    draw: s.draw,
    axis: s.axis ?? "left",
    color: s.color,
    ...((s as { colorDark?: string }).colorDark ? { colorDark: (s as { colorDark?: string }).colorDark } : {}),
    pattern: index,
    lines: [],
    areas: [],
    ranges: [],
  }
  if (!data || s.valueKind === "state" || !["line", "area", "steps"].includes(s.draw)) return out
  const steps = data.steps.filter((st) => st.t + st.len > window.from && st.t < window.to)
  // Runs of steps without a gap between them.
  const runs: Step[][] = []
  for (const st of steps) {
    const run = runs[runs.length - 1]
    if (run && run[run.length - 1].t + run[run.length - 1].len === st.t) run.push(st)
    else runs.push([st])
  }
  const zero = yOf(0)
  for (const run of runs) {
    const points: [number, number][] =
      s.draw === "steps"
        ? run.flatMap((st) => [
            [xOf(st.t), yOf(st.mean)] as [number, number],
            [xOf(st.t + st.len), yOf(st.mean)] as [number, number],
          ])
        : run.map((st) => [xOf(st.t + st.len / 2), yOf(st.mean)] as [number, number])
    out.lines.push(points)
    if (s.draw === "area") out.areas.push([[points[0][0], zero], ...points, [points[points.length - 1][0], zero]])
    if (s.range) {
      const upper = run.map((st) => [xOf(st.t + st.len / 2), yOf(st.max)] as [number, number])
      const lower = run.map((st) => [xOf(st.t + st.len / 2), yOf(st.min)] as [number, number]).reverse()
      out.ranges.push([...upper, ...lower])
    }
  }
  if (now !== null) {
    const last = [...steps].reverse().find((st) => st.t <= now)
    if (last) out.nowPoint = [xOf(now), yOf(last.mean)]
  }
  return out
}
