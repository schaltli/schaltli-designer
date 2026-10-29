// The chart (docs/2026-10-16-charts.md, «Data model»; tasks/charts-model-plan.md):
// one or more values drawn over time. A series is plain - topic, kind,
// colour, scale and annotations are its own, written in when it is made -
// so the five renderers and the recorder read the same fields and none of
// them infers anything.

import type { ComparisonOperator } from "@/lib/comparison-operators"
import { normalizeOperator } from "@/lib/comparison-operators"

export type ChartMode = "time" | "per-day"
export type ValueKind = "level" | "power" | "state"
export type SeriesDraw = "line" | "area" | "steps" | "band" | "stacked" | "bars"
export type DailyValue = "energy" | "decline" | "rise" | "mean" | "min" | "max" | "runtime"
export type Annotation = "current" | "min" | "max" | "sum" | "runtime" | "starts"
export type TimeRange = "1h" | "6h" | "24h" | "7d"

export const TIME_RANGES: readonly TimeRange[] = ["1h", "6h", "24h", "7d"]
export const DEFAULT_TIME_RANGE: TimeRange = "24h"

export interface ChartAxis {
  scale: "auto" | "fixed" | "at-least"
  min?: number
  max?: number
  unit?: string
}

export interface ChartZone {
  axis: "left" | "right"
  from?: number
  to?: number
  color: string
}

export interface OnMeans {
  op: ComparisonOperator
  value: string
}

export interface ChartSeries {
  id: string
  source: { kind: "topic"; topic: string } | { kind: "balance" }
  name: string
  valueKind: ValueKind
  onMeans?: OnMeans[]
  invert?: boolean
  factor?: number
  unit?: string
  decimals?: number
  draw: SeriesDraw
  stack?: string
  axis?: "left" | "right"
  color: string
  range?: boolean
  dailyValue?: DailyValue
  annotations?: Annotation[]
}

export interface ChartProperties {
  mode: ChartMode
  days?: number
  scroll: boolean
  left: ChartAxis
  right?: ChartAxis
  zones?: ChartZone[]
  legend: "top-right" | "top-left" | "bottom" | "none"
  fontId?: string
  series: ChartSeries[]
}

/** What a series of a kind is drawn as and annotated with, unless told otherwise. */
export function defaultSeries(kind: ValueKind): Pick<ChartSeries, "draw" | "annotations"> {
  if (kind === "power") return { draw: "area", annotations: ["sum"] }
  if (kind === "state") return { draw: "band", annotations: ["runtime"] }
  return { draw: "line", annotations: ["current"] }
}

/** A chart with nothing in it yet: time mode, the axis automatic, the legend top right. */
export function defaultChart(): ChartProperties {
  return { mode: "time", scroll: false, left: { scale: "auto" }, legend: "top-right", series: [] }
}

const ANNOTATIONS_FOR: Record<ValueKind, readonly Annotation[]> = {
  level: ["current", "min", "max"],
  power: ["current", "min", "max", "sum"],
  state: ["runtime", "starts"],
}

const DRAWS_FOR: Record<ValueKind, readonly SeriesDraw[]> = {
  level: ["line", "area", "steps", "bars"],
  power: ["line", "area", "steps", "stacked", "bars"],
  state: ["band", "bars"],
}

const DAILY_FOR: Record<ValueKind, readonly DailyValue[]> = {
  level: ["decline", "rise", "mean", "min", "max"],
  power: ["energy", "mean", "min", "max"],
  state: ["runtime"],
}

function isKind(v: unknown): v is ValueKind {
  return v === "level" || v === "power" || v === "state"
}

/**
 * A series with what the spec says is never stored taken out: annotations,
 * a way of drawing and a daily value its kind does not have, bars and daily
 * values outside per-day mode, `onMeans` on anything but a state.
 */
export function normalizeSeries(series: ChartSeries, mode: ChartMode): ChartSeries {
  const kind: ValueKind = isKind(series.valueKind) ? series.valueKind : "level"
  const out: ChartSeries = { ...series, valueKind: kind }
  const perDay = mode === "per-day"
  const draws = DRAWS_FOR[kind].filter((d) => (d === "bars") === perDay)
  if (!draws.includes(out.draw)) out.draw = perDay ? "bars" : defaultSeries(kind).draw
  if (out.annotations) {
    const kept = out.annotations.filter((a) => ANNOTATIONS_FOR[kind].includes(a))
    if (kept.length !== out.annotations.length) out.annotations = kept
  }
  if (out.dailyValue !== undefined && (!perDay || !DAILY_FOR[kind].includes(out.dailyValue))) delete out.dailyValue
  if (kind !== "state") delete out.onMeans
  else if (out.onMeans) out.onMeans = out.onMeans.map((m) => ({ op: normalizeOperator(m.op), value: String(m.value) }))
  if (out.draw !== "stacked") delete out.stack
  if (kind !== "power") delete out.invert
  return out
}

/** A chart as the spec has it stored: every series normalized, a right axis only while a series is on it. */
export function normalizeChart(properties: Record<string, any>): ChartProperties {
  const base = defaultChart()
  const mode: ChartMode = properties.mode === "per-day" ? "per-day" : "time"
  const series = (Array.isArray(properties.series) ? (properties.series as ChartSeries[]) : []).map((s) => normalizeSeries(s, mode))
  const out: ChartProperties = {
    ...(properties as ChartProperties),
    mode,
    scroll: properties.scroll === true,
    left: properties.left ?? base.left,
    legend: properties.legend ?? base.legend,
    series,
  }
  if (mode !== "per-day") delete out.days
  if (!series.some((s) => s.axis === "right")) {
    delete out.right
    if (out.zones) out.zones = out.zones.filter((z) => z.axis !== "right")
  }
  return out
}

/** Whether normalizing would change the chart: so a migration only reports what it changed. */
export function chartNeedsNormalizing(properties: Record<string, any>): boolean {
  return JSON.stringify(normalizeChart(properties)) !== JSON.stringify(properties)
}

// ---- What Deploy asks of a device (decision 10; device contract)

export const CHARTS_FEATURE = "charts"

interface FeatureObject {
  type: string
  children?: FeatureObject[]
}

/**
 * The feature a project with charts needs, naming the screens that show one
 * or open with a time range; null when none does. The chart's type is gated
 * by the device's `supportedObjectTypes` as any type is.
 */
export function chartsFeature(project: {
  screens?: readonly { name: string; timeRange?: string; objects?: FeatureObject[] }[]
  popups?: readonly { name: string; objects?: FeatureObject[] }[]
}): { feature: string; label: string } | null {
  const hasChart = (objects: FeatureObject[] | undefined): boolean => (objects ?? []).some((o) => o.type === "chart" || hasChart(o.children))
  const names = [...(project.screens ?? []), ...(project.popups ?? [])]
    .filter((s) => hasChart(s.objects) || ("timeRange" in s && s.timeRange !== undefined))
    .map((s) => s.name)
  return names.length > 0 ? { feature: CHARTS_FEATURE, label: `charts (${names.join(", ")})` } : null
}

// ---- What the recorder is asked to record (decision 4, «What the recorder gets»)

export interface HistoryWant {
  topic: string
  kind: ValueKind
  onMeans?: OnMeans[]
}

interface WantObject {
  type: string
  properties?: Record<string, any>
  children?: WantObject[]
}

/**
 * Every series a display's charts read, as the recorder takes it: the topic
 * (with any `#path`) raw, its kind and, for a state, what counts as on - once
 * per topic and kind. Not a balance, which the display works out, and not a
 * local topic, which never reaches the broker (lib/local-topics.ts).
 */
export function historyWants(project: {
  topics?: readonly { topic: string; local?: boolean }[]
  screens?: readonly { objects?: WantObject[] }[]
  popups?: readonly { objects?: WantObject[] }[]
}): { series: HistoryWant[] } {
  const local = new Set((project.topics ?? []).filter((t) => t.local === true).map((t) => t.topic))
  const series: HistoryWant[] = []
  const walk = (objects: WantObject[] | undefined) => {
    for (const obj of objects ?? []) {
      if (obj.type === "chart" && Array.isArray(obj.properties?.series)) {
        for (const s of obj.properties!.series as ChartSeries[]) {
          if (s.source?.kind !== "topic" || !s.source.topic) continue
          const topic = s.source.topic
          if (local.has(topic.split("#")[0])) continue
          const kind: ValueKind = isKind(s.valueKind) ? s.valueKind : "level"
          if (series.some((w) => w.topic === topic && w.kind === kind)) continue
          series.push(kind === "state" && s.onMeans?.length ? { topic, kind, onMeans: s.onMeans } : { topic, kind })
        }
      }
      walk(obj.children)
    }
  }
  for (const screen of [...(project.screens ?? []), ...(project.popups ?? [])]) walk(screen.objects)
  return { series }
}
