// What a chart draws in the designer (docs/2026-10-16-charts.md decision 11,
// tasks/charts-designer-plan.md decisions 5, 6): in Live the recorder's
// history as it lies on the broker, or a word that there is none; in
// Simulation, in the editor and in the thumbnails a curve made from the
// topics' examples, the same every time.

import type { Topic } from "@/components/project-editor"
import { DEFAULT_TIME_RANGE, historyName, normalizeChart, type ChartProperties, type ChartSeries, type TimeRange } from "@/lib/chart"
import { seriesData, type SeriesData } from "@/lib/chart-layout"
import { chartWindow, historyTopicsFor, HISTORY_PREFIX, type ChartWindow } from "@/lib/chart-window"
import { extractJsonField, splitTopicPath } from "@/lib/json-path"
import { asNumber, isYes, matches } from "@/lib/live-value"

export const RECORDER_TOPIC = `${HISTORY_PREFIX}/recorder`
export const RECORDER_NOW_TOPIC = `${HISTORY_PREFIX}/now`

/** What the Live preview subscribes to for a project's charts: each series' history, and the recorder. */
export function historySubscriptions(screens: readonly { objects?: readonly { type: string; properties?: Record<string, any>; children?: any[] }[] }[]): string[] {
  const out = new Set<string>()
  const walk = (objects: readonly { type: string; properties?: Record<string, any>; children?: any[] }[] | undefined) => {
    for (const o of objects ?? []) {
      if (o.type === "chart") {
        for (const s of (o.properties?.series ?? []) as ChartSeries[]) {
          if (s.source?.kind === "topic" && s.source.topic) out.add(`${HISTORY_PREFIX}/${historyName(s.source.topic)}/#`)
        }
      }
      walk(o.children)
    }
  }
  for (const screen of screens) walk(screen.objects)
  if (out.size > 0) {
    out.add(RECORDER_TOPIC)
    out.add(RECORDER_NOW_TOPIC)
  }
  return [...out]
}

function parse(text: string | undefined): Record<string, any> | null {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---- Simulation: a curve through the examples

/** A topic's examples as the series reads them: the field where it names one. */
function examplesOf(series: ChartSeries, topics: readonly Topic[]): string[] {
  if (series.source.kind !== "topic") return []
  const { topic, path } = splitTopicPath(series.source.topic)
  const examples = topics.find((t) => t.topic === topic)?.examples ?? []
  return examples.map((e) => (path ? extractJsonField(e, path) : e)).filter((e): e is string => e !== undefined)
}

/**
 * History made from a series' examples over the window, up to now: a smooth
 * curve through the numbers in turn, or a state on and off as they say. A
 * series without examples has none.
 */
export function simulatedData(series: ChartSeries, window: ChartWindow, now: number, topics: readonly Topic[]): SeriesData {
  const examples = examplesOf(series, topics)
  const empty: SeriesData = { steps: [], on: [], days: [] }
  if (examples.length === 0) return empty
  const end = Math.min(now, window.to)
  const span = window.to - window.from
  if (series.valueKind === "state") {
    const isOn = (e: string) => (series.onMeans?.length ? series.onMeans.some((c) => matches(e, c.op, c.value)) : isYes(e))
    // Each example a stretch of the window, in turn, twice round.
    const n = examples.length * 2
    const on: [number, number][] = []
    for (let i = 0; i < n; i++) {
      const a = window.from + (span * i) / n
      const b = Math.min(window.from + (span * (i + 1)) / n, end)
      if (b > a && isOn(examples[i % examples.length])) on.push([a, b])
    }
    return { ...empty, on }
  }
  const numbers = examples.map(asNumber).filter((v): v is number => v !== undefined)
  if (numbers.length === 0) return empty
  const factor = series.factor ?? 1
  const shown = (v: number) => (series.invert ? -v : v) * factor
  // Through the numbers in turn and back to the first: a cosine between each two.
  const at = (u: number) => {
    if (numbers.length === 1) return numbers[0]
    const pos = u * numbers.length
    const k = Math.floor(pos) % numbers.length
    const f = pos - Math.floor(pos)
    const a = numbers[k]
    const b = numbers[(k + 1) % numbers.length]
    return a + (b - a) * (1 - Math.cos(Math.PI * f)) / 2
  }
  if (window.source === "daily") {
    const days = window.dates.map((date, j) => {
      const v = shown(at((j + 0.5) / window.dates.length))
      if (series.valueKind === "power") return { date, up: v > 0 ? v * 24 : 0, down: v < 0 ? v * 24 : 0 }
      return { date, up: v, down: null }
    })
    return { ...empty, days }
  }
  const steps = []
  for (let t = window.from; t + window.step <= end; t += window.step) {
    const v = shown(at((t - window.from + window.step / 2) / span))
    steps.push({ t, len: window.step, mean: v, min: v, max: v })
  }
  return { ...empty, steps }
}

// ---- what a chart is drawn with

export interface ChartPreviewInput {
  range?: TimeRange
  topics: readonly Topic[]
  /** The broker's values in Live; none for Simulation, the editor and thumbnails. */
  live?: Record<string, string> | null
  now?: number
}

export interface ChartPreview {
  range: TimeRange
  data: Record<string, SeriesData>
  now: number
  tz: string
  message?: string
}

/**
 * Everything render-chart.ts needs beside the object: the window's history
 * per series and, in Live, the recorder's zone and what to say where there is
 * no recorder (decision 6) or no history yet.
 */
export function chartPreview(properties: Record<string, any>, input: ChartPreviewInput): ChartPreview {
  const chart = normalizeChart(properties) as ChartProperties
  const range = input.range ?? DEFAULT_TIME_RANGE
  const live = input.live
  const recorderNow = live ? parse(live[RECORDER_NOW_TOPIC]) : null
  const tz = (typeof recorderNow?.tz === "string" && recorderNow.tz) || Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = input.now ?? Date.now() / 1000
  const window = chartWindow(chart, range, now, tz)
  const data: Record<string, SeriesData> = {}
  if (!live) {
    for (const s of chart.series) data[s.id] = simulatedData(s, window, now, input.topics)
    return { range, data, now, tz }
  }
  const recorder = parse(live[RECORDER_TOPIC])
  if (recorder?.state !== "online") return { range, data, now, tz, message: "No recorder on this broker" }
  let any = false
  for (const s of chart.series) {
    if (s.source.kind !== "topic") continue
    const payloads = historyTopicsFor({ series: [s] }, window).map((t) => parse(live[t]))
    if (payloads.some((p) => p)) any = true
    data[s.id] = seriesData(s, payloads, tz)
  }
  return any || chart.series.length === 0 ? { range, data, now, tz } : { range, data, now, tz, message: "No history yet" }
}

