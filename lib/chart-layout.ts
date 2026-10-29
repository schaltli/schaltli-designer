// A chart's layout (tasks/charts-designer-plan.md decision 3): every place,
// range and label a renderer needs, worked out from the chart, its window,
// the history read for it and its size - numbers only, no canvas and no DOM,
// so the firmware and the app can port it and be checked against it, as the
// energy diagram's layout is (lib/energy-diagram.ts).

import type { Annotation, ChartAxis, ChartProperties, ChartSeries } from "@/lib/chart"
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

/** One day of a per-day chart: what went up and, for power, what went down (as a negative). */
export interface DayBar {
  date: string
  up: number | null
  down: number | null
}

/** What a series has: steps, a state's on-periods (unix s), a per-day chart's days. */
export interface SeriesData {
  steps: Step[]
  on: [number, number][]
  days: DayBar[]
}

type Payload = Record<string, any> | null | undefined

/** The daily value a series shows in per-day mode: its own, or its kind's default. */
function dailyValueOf(s: ChartSeries) {
  return s.dailyValue ?? (s.valueKind === "power" ? "energy" : s.valueKind === "state" ? "runtime" : "mean")
}

/**
 * A series' history from the payloads read for it (already parsed): a day's
 * or recent's arrays as steps, a state's periods in unix seconds, a daily's
 * days as bars - `factor` applied and a power series' sign turned where
 * `invert`.
 */
export function seriesData(series: ChartSeries, payloads: Payload[], tz: string): SeriesData {
  const steps: Step[] = []
  const on: [number, number][] = []
  const days: DayBar[] = []
  const factor = series.factor ?? 1
  const scale = (v: number) => (series.invert ? -v * factor : v * factor)
  for (const p of payloads) {
    if (!p) continue
    if (Array.isArray(p.days)) {
      const which = dailyValueOf(series)
      for (const d of p.days as Record<string, any>[]) {
        if (which === "energy") {
          const inn = d.energyIn == null ? null : d.energyIn * factor
          const out = d.energyOut == null ? null : -d.energyOut * factor
          days.push(series.invert ? { date: d.date, up: out === null ? null : -out, down: inn === null ? null : -inn } : { date: d.date, up: inn, down: out })
        } else if (which === "runtime") {
          // Minutes on, shown in hours.
          days.push({ date: d.date, up: d.runtime == null ? null : d.runtime / 60, down: null })
        } else {
          const v = d[which]
          days.push({ date: d.date, up: v == null ? null : v * factor, down: null })
        }
      }
      continue
    }
    if (series.valueKind === "state") {
      const minutes = typeof p.date === "string"
      const base = minutes ? midnightOf(p.date, tz) : 0
      for (const [a, b] of (p.on ?? []) as [number, number][]) on.push(minutes ? [base + a * 60, base + b * 60] : [a, b])
      continue
    }
    const len = p.step ?? 900
    const n = Array.isArray(p.mean) ? p.mean.length : 0
    const start = typeof p.date === "string" ? midnightOf(p.date, tz) : (p.end ?? 0) - n * len
    for (let i = 0; i < n; i++) {
      const mean = p.mean[i]
      if (mean === null || mean === undefined) continue
      const lo = scale(p.min?.[i] ?? mean)
      const hi = scale(p.max?.[i] ?? mean)
      steps.push({ t: start + i * len, len, mean: scale(mean), min: Math.min(lo, hi), max: Math.max(lo, hi) })
    }
  }
  steps.sort((a, b) => a.t - b.t)
  on.sort((a, b) => a[0] - b[0])
  return { steps, on, days }
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

/** A series' value as text: its decimals (else none from 100 up, one below), its unit after a space. */
export function valueText(v: number, s: Pick<ChartSeries, "decimals" | "unit">, decimal = "."): string {
  const decimals = s.decimals ?? (Math.abs(v) >= 100 ? 0 : 1)
  const text = v.toFixed(decimals).replace(".", decimal)
  return s.unit ? `${text} ${s.unit}` : text
}

/** Energy in Wh as text: Wh below 1000, kWh with one decimal from there. */
export function energyText(wh: number, decimal = "."): string {
  return Math.abs(wh) >= 1000 ? `${(wh / 1000).toFixed(1).replace(".", decimal)} kWh` : `${Math.round(wh)} Wh`
}

/** A run time in minutes as «h:mm h». */
export function runtimeText(minutes: number): string {
  const m = Math.round(minutes)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`
}

const round1 = (n: number) => Math.round(n * 10) / 10

function clockText(t: number, tz: string): string {
  const m = midnightOf(dateOf(t, tz), tz)
  const hh = Math.floor((t - m) / 3600)
  const mm = Math.floor(((t - m) % 3600) / 60)
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

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
  /** Lines, each a run of points with no gap (a stack's: its upper edge). */
  lines: [number, number][][]
  /** Filled shapes (an area down to zero, a stack's slice), each closed. */
  areas: [number, number][][]
  /** The range: the step's min and max as a faint band. */
  ranges: [number, number][][]
  /** A state: the stretches it was on, in its strip; and where each run began. */
  bands: Box[]
  starts: number[]
  /** Per day: one bar per day, up from zero and, for power, down. */
  bars: Box[]
  /** Min and max on the curve, with their value and time. */
  marks: { x: number; y: number; label: string; below: boolean }[]
  /** The NowPoint on this series: its current value, where the window holds now. */
  nowPoint?: [number, number]
}

/**
 * A text the chart writes, as a box: its top left, width and height, how it
 * is aligned in it, and whether it is in the text or the quiet colour. Drawn
 * by each renderer in the chart's own font (tasks/charts-firmware-plan.md
 * decision 3), so the boxes are the same everywhere and only the glyphs are
 * the device's.
 */
export interface ChartText {
  text: string
  x: number
  y: number
  w: number
  h: number
  align: "left" | "center" | "right"
  tone: "text" | "muted"
}

export interface LegendRow {
  id: string
  x: number
  y: number
  align: "left" | "right"
  /** Its colour's mark: on the outer side of the row. */
  swatch: Box
  color: string
  colorDark?: string
  pattern: number
  name: string
  /** The figures the series' annotations ask for, each its own text. */
  figures: string[]
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
  legend: LegendRow[]
  /** Every text: axis labels, times, days' names, marks, legend rows, the arrow past now. */
  texts: ChartText[]
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
  let max = Math.max(hi, 0)
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

// ---- stacks (decision 0, «Source»: the balance)

interface StackSlice {
  t: number
  len: number
  lo: number
  hi: number
}

/**
 * Each stacked series' slices, step by step: positive values piled up from
 * zero, negative ones down from it, in series order. A balance is minus the
 * sum of the others in its stack, at a step where all of them have a value.
 */
function stackSlices(chart: ChartProperties, data: Record<string, SeriesData>): Map<string, StackSlice[]> {
  const out = new Map<string, StackSlice[]>()
  const groups = new Map<string, ChartSeries[]>()
  for (const s of chart.series) {
    if (s.draw !== "stacked") continue
    const key = s.stack ?? ""
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  for (const members of groups.values()) {
    const byT = new Map<number, { len: number; values: Map<string, number> }>()
    for (const s of members) {
      if (s.source.kind !== "topic") continue
      for (const st of data[s.id]?.steps ?? []) {
        if (!byT.has(st.t)) byT.set(st.t, { len: st.len, values: new Map() })
        byT.get(st.t)!.values.set(s.id, st.mean)
      }
    }
    const measured = members.filter((s) => s.source.kind === "topic")
    for (const s of members) out.set(s.id, [])
    for (const [t, { len, values }] of [...byT.entries()].sort((a, b) => a[0] - b[0])) {
      let up = 0
      let down = 0
      for (const s of members) {
        let v: number | undefined
        if (s.source.kind === "balance") {
          if (measured.every((m) => values.has(m.id))) v = -measured.reduce((n, m) => n + values.get(m.id)!, 0)
        } else v = values.get(s.id)
        if (v === undefined) continue
        if (v >= 0) {
          out.get(s.id)!.push({ t, len, lo: up, hi: up + v })
          up += v
        } else {
          out.get(s.id)!.push({ t, len, lo: down + v, hi: down })
          down += v
        }
      }
    }
  }
  return out
}

/**
 * The layout of a chart: time mode (lines, areas, steps, stacks, bands) or
 * per-day mode (bars), its legend with the annotations' figures.
 */
export function chartLayout(chart: ChartProperties, window: ChartWindow, data: Record<string, SeriesData>, o: LayoutOptions): ChartLayout {
  const decimal = o.decimal ?? "."
  const pad = Math.round(o.fontSize / 3)
  const labelW = Math.round(o.fontSize * 2.6)
  const usesRight = chart.series.some((s) => s.axis === "right")
  const bottom = o.fontSize + pad * 2
  const rowH = o.fontSize + pad
  const legendBelow = chart.legend === "bottom" ? rowH * Math.max(1, chart.series.length) : 0
  const plot: Box = {
    x: labelW + pad,
    y: pad + Math.round(o.fontSize / 2),
    w: Math.max(1, o.width - labelW - pad * 2 - (usesRight ? labelW : 0)),
    h: Math.max(1, o.height - bottom - legendBelow - pad - Math.round(o.fontSize / 2)),
  }
  const perDay = chart.mode === "per-day"
  const span = window.to - window.from
  const xOf = (t: number) => round1(plot.x + ((t - window.from) / span) * plot.w)
  const inWindow = (st: { t: number; len: number }) => st.t + st.len > window.from && st.t < window.to
  const stacks = perDay ? new Map<string, StackSlice[]>() : stackSlices(chart, data)

  const valuesOn = (axis: "left" | "right") =>
    chart.series
      .filter((s) => (s.axis ?? "left") === axis && (perDay || s.valueKind !== "state"))
      .flatMap((s) => {
        if (perDay) return (data[s.id]?.days ?? []).filter((d) => window.dates.includes(d.date)).flatMap((d) => [d.up, d.down].filter((v): v is number => v !== null))
        if (s.draw === "stacked") return (stacks.get(s.id) ?? []).filter(inWindow).flatMap((x) => [x.lo, x.hi])
        return (data[s.id]?.steps ?? []).filter(inWindow).flatMap((st) => (s.range ? [st.min, st.max] : [st.mean]))
      })
  const leftRange = axisRange(chart.left, valuesOn("left"))
  const rightRange = usesRight ? axisRange(chart.right ?? { scale: "auto" }, valuesOn("right")) : undefined
  const left = axisLayout(leftRange, plot, decimal)
  const right = rightRange ? axisLayout(rightRange, plot, decimal) : undefined
  const yOf = (v: number, axis: "left" | "right") => {
    const r = axis === "right" && rightRange ? rightRange : leftRange
    return round1(plot.y + plot.h - ((v - r.min) / (r.max - r.min)) * plot.h)
  }

  // The time axis: hours and midnights; per day, each day's name under its bars.
  const times: ChartLayout["times"] = []
  const midnights: ChartLayout["midnights"] = []
  const slot = perDay ? plot.w / Math.max(1, window.dates.length) : 0
  if (perDay) {
    window.dates.forEach((d, j) => times.push({ x: round1(plot.x + slot * (j + 0.5)), label: weekdayOf(d) }))
  } else {
    const tick = TIME_TICK.find((x) => span <= x.span)
    for (let d = dateOf(window.from, o.tz); midnightOf(d, o.tz) <= window.to; d = addDays(d, 1)) {
      const m = midnightOf(d, o.tz)
      if (m >= window.from && m <= window.to) midnights.push({ x: xOf(m), label: weekdayOf(d) })
      if (!tick) continue
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
    const dark = (z as { colorDark?: string }).colorDark
    return { x: plot.x, y: top, w: plot.w, h: round1(bottomY - top), color: z.color, ...(dark ? { colorDark: dark } : {}) }
  })

  const nowOn = !perDay && o.now >= window.from && o.now < window.to
  const stateIndex = new Map(chart.series.filter((s) => s.valueKind === "state").map((s, k) => [s.id, k]))
  const bandH = Math.max(4, Math.round(o.fontSize * 0.6))
  const barW = perDay ? (slot * 0.7) / Math.max(1, chart.series.length) : 0

  const series = chart.series.map((s, index): SeriesLayout => {
    const yS = (v: number) => yOf(v, s.axis ?? "left")
    const dark = (s as { colorDark?: string }).colorDark
    const out: SeriesLayout = {
      id: s.id,
      draw: s.draw,
      axis: s.axis ?? "left",
      color: s.color,
      ...(dark ? { colorDark: dark } : {}),
      pattern: index,
      lines: [],
      areas: [],
      ranges: [],
      bands: [],
      starts: [],
      bars: [],
      marks: [],
    }
    const d = data[s.id]
    if (!d) return out
    if (perDay) {
      const zero = yS(0)
      window.dates.forEach((date, j) => {
        const day = d.days.find((x) => x.date === date)
        const x = round1(plot.x + slot * j + slot * 0.15 + index * barW)
        for (const v of [day?.up, day?.down]) {
          if (v === null || v === undefined || v === 0) continue
          const y = yS(v)
          out.bars.push({ x, y: Math.min(y, zero), w: round1(barW), h: round1(Math.abs(zero - y)) })
        }
      })
      return out
    }
    if (s.valueKind === "state") {
      const k = stateIndex.get(s.id) ?? 0
      const y = plot.y + plot.h - (k + 1) * bandH
      for (const [a, b] of d.on) {
        if (b <= window.from || a >= window.to) continue
        const x = xOf(Math.max(a, window.from))
        out.bands.push({ x, y, w: round1(xOf(Math.min(b, window.to)) - x), h: bandH })
        if (a >= window.from) out.starts.push(xOf(a))
      }
      return out
    }
    if (s.draw === "stacked") {
      const slices = (stacks.get(s.id) ?? []).filter(inWindow)
      const runs: StackSlice[][] = []
      for (const x of slices) {
        const run = runs[runs.length - 1]
        if (run && run[run.length - 1].t + run[run.length - 1].len === x.t) run.push(x)
        else runs.push([x])
      }
      for (const run of runs) {
        const upper = run.flatMap((x) => [[xOf(x.t), yS(x.hi)], [xOf(x.t + x.len), yS(x.hi)]] as [number, number][])
        const lower = run.flatMap((x) => [[xOf(x.t), yS(x.lo)], [xOf(x.t + x.len), yS(x.lo)]] as [number, number][]).reverse()
        out.lines.push(upper)
        out.areas.push([...upper, ...lower])
      }
      return out
    }
    lineSeries(out, s, d, inWindow, xOf, yS, nowOn ? o.now : null)
    // Min and max on the curve, with value and time (decision 8, annotations).
    const shown = d.steps.filter(inWindow)
    if (shown.length > 0) {
      for (const which of ["min", "max"] as const) {
        if (!s.annotations?.includes(which)) continue
        const pick = shown.reduce((a, b) => (which === "min" ? (b.mean < a.mean ? b : a) : b.mean > a.mean ? b : a))
        out.marks.push({ x: xOf(pick.t + pick.len / 2), y: yS(pick.mean), label: `${valueText(pick.mean, s, decimal)} ${clockText(pick.t, o.tz)}`, below: which === "min" })
      }
    }
    return out
  })

  // The legend: one row per series, the figures of its annotations.
  const legend: LegendRow[] =
    chart.legend === "none"
      ? []
      : chart.series.map((s, i) => {
          const at =
            chart.legend === "bottom"
              ? { x: plot.x, y: plot.y + plot.h + bottom + i * rowH, align: "left" as const }
              : chart.legend === "top-left"
                ? { x: plot.x + pad, y: plot.y + pad + i * rowH, align: "left" as const }
                : { x: plot.x + plot.w - pad, y: plot.y + pad + i * rowH, align: "right" as const }
          const dark = (s as { colorDark?: string }).colorDark
          const swatch = { x: at.align === "right" ? at.x - 10 : at.x, y: round1(at.y + o.fontSize / 2 - 2), w: 10, h: 4 }
          return { id: s.id, ...at, swatch, color: s.color, ...(dark ? { colorDark: dark } : {}), pattern: i, name: s.name, figures: figures(s, data[s.id], window, o, decimal) }
        })

  // The texts, as boxes (ChartText).
  const half = Math.round(o.fontSize / 2)
  const texts: ChartText[] = []
  const box = (text: string, x: number, y: number, w: number, align: ChartText["align"], tone: ChartText["tone"]) =>
    texts.push({ text, x: round1(x), y: round1(y), w: round1(w), h: o.fontSize, align, tone })
  for (const t of left.ticks) box(t.label, 0, t.y - half, plot.x - pad, "right", "muted")
  for (const t of right?.ticks ?? []) box(t.label, plot.x + plot.w + pad, t.y - half, labelW, "left", "muted")
  for (const t of times) box(t.label, t.x - labelW, plot.y + plot.h + pad, labelW * 2, "center", "muted")
  for (const m of midnights) if (m.x < plot.x + plot.w - o.fontSize * 2) box(m.label, m.x + 3, plot.y, labelW * 2, "left", "muted")
  for (const s of series) for (const m of s.marks) box(m.label, m.x - labelW * 3, m.below ? m.y + pad : m.y - pad - o.fontSize, labelW * 6, "center", "text")
  for (const row of legend) {
    const line = [row.name, ...row.figures].join("  ")
    if (row.align === "right") box(line, plot.x, row.y, row.x - 14 - plot.x, "right", "text")
    else box(line, row.x + 14, row.y, plot.w - 14 - (row.x - plot.x), "left", "text")
  }
  if (!perDay && o.now >= window.to) box("→", plot.x, plot.y + plot.h / 2 - half, plot.w - 2, "right", "muted")

  return {
    plot,
    left,
    ...(right ? { right } : {}),
    times,
    midnights,
    zones,
    series,
    legend,
    texts,
    now: perDay ? null : nowOn ? { x: xOf(o.now) } : o.now >= window.to ? { past: true } : null,
  }
}

/** The figures of a series' annotations, worked out from what was measured in the window. */
function figures(s: ChartSeries, d: SeriesData | undefined, window: ChartWindow, o: LayoutOptions, decimal: string): string[] {
  const out: string[] = []
  const wanted = (a: Annotation) => s.annotations?.includes(a)
  if (!d) return out
  // current: always the value now, wherever the window is.
  if (wanted("current") && s.valueKind !== "state") {
    const last = [...d.steps].reverse().find((st) => st.t <= o.now)
    if (last) out.push(`jetzt ${valueText(last.mean, s, decimal)}`)
  }
  if (wanted("sum") && s.valueKind === "power") {
    let inWh = 0
    let outWh = 0
    for (const st of d.steps) {
      const a = Math.max(st.t, window.from)
      const b = Math.min(st.t + st.len, window.to, o.now)
      if (b <= a) continue
      const wh = (st.mean * (b - a)) / 3600
      if (wh >= 0) inWh += wh
      else outWh -= wh
    }
    const text = outWh > 0 ? `+${energyText(inWh, decimal)} / −${energyText(outWh, decimal)}` : energyText(inWh, decimal)
    // A window not snapped to whole days says what it covers.
    const snapped = window.source === "day" || window.source === "daily"
    out.push(snapped ? text : `${text} (${clockText(window.from, o.tz)} – ${clockText(Math.min(window.to, o.now), o.tz)})`)
  }
  if (s.valueKind === "state" && (wanted("runtime") || wanted("starts"))) {
    let minutes = 0
    let starts = 0
    for (const [a, b] of d.on) {
      const lo = Math.max(a, window.from)
      const hi = Math.min(b, window.to)
      if (hi > lo) minutes += (hi - lo) / 60
      if (a >= window.from && a < window.to) starts++
    }
    if (wanted("runtime")) out.push(runtimeText(minutes))
    if (wanted("starts")) out.push(`${starts}×`)
  }
  return out
}

function lineSeries(
  out: SeriesLayout,
  s: ChartSeries,
  data: SeriesData,
  inWindow: (st: Step) => boolean,
  xOf: (t: number) => number,
  yOf: (v: number) => number,
  now: number | null,
): void {
  if (!["line", "area", "steps"].includes(s.draw)) return
  const steps = data.steps.filter(inWindow)
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
}
