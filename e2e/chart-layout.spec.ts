import { test, expect } from "@playwright/test"
import { chartLayout, seriesData, niceStep, axisLabel, weekdayOf } from "../lib/chart-layout"
import { chartWindow, midnightOf } from "../lib/chart-window"
import type { ChartProperties, ChartSeries } from "../lib/chart"

// A chart's layout (tasks/charts-designer-plan.md D2, D3): the numbers every
// renderer draws from - here worked by hand.

const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
const NOON = DAY + 12 * 3600
const O = { width: 800, height: 440, fontSize: 14, now: NOON, tz: TZ }
// fontSize 14: pad 5, labels 36 wide - the plot from x 41, y 12, 754 × 404.
const PLOT = { x: 41, y: 12, w: 754, h: 404 }

const series = (s: Partial<ChartSeries>): ChartSeries => ({
  id: "s1",
  source: { kind: "topic", topic: "van/tank" },
  name: "Tank",
  valueKind: "level",
  draw: "line",
  color: "#2255aa",
  ...s,
})
const chart = (s: ChartSeries[], extra: Partial<ChartProperties> = {}): ChartProperties => ({
  mode: "time",
  scroll: false,
  legend: "none",
  left: { scale: "auto" },
  series: s,
  ...extra,
})
/** A day payload: 96 quarter hours, `at` filled. */
const day = (at: Record<number, number>) => ({
  date: "2026-10-14",
  step: 900,
  mean: Array.from({ length: 96 }, (_, i) => (i in at ? at[i] : null)),
  min: Array.from({ length: 96 }, (_, i) => (i in at ? at[i] : null)),
  max: Array.from({ length: 96 }, (_, i) => (i in at ? at[i] : null)),
})
const W24 = chartWindow({ mode: "time" }, "24h", NOON, TZ)

test.describe("the chart's layout: axes and lines (D2)", () => {
  test("nice steps and labels", () => {
    expect([niceStep(100), niceStep(13.4), niceStep(0.7), niceStep(2400)]).toEqual([25, 5, 0.2, 1000])
    expect(axisLabel(12.5, 2.5, ",")).toBe("12,5")
    expect(axisLabel(50, 25)).toBe("50")
    expect(weekdayOf("2026-10-14")).toBe("Mi")
  })

  test("the water example: a fixed axis 0 to 100, steps where the history has them", () => {
    const s = series({ draw: "steps", unit: "%" })
    const c = chart([s], { left: { scale: "fixed", min: 0, max: 100, unit: "%" } })
    const data = { s1: seriesData(s, [day({ 0: 50, 1: 25 })], TZ) }
    const l = chartLayout(c, W24, data, O)
    expect(l.plot).toEqual(PLOT)
    expect(l.left.ticks.map((t) => t.label)).toEqual(["0", "25", "50", "75", "100"])
    expect(l.left.ticks[0].y).toBe(416)
    expect(l.left.ticks[4].y).toBe(12)
    const q = 754 / 96 // a quarter hour in px
    expect(l.series[0].lines).toEqual([
      [
        [41, 214],
        [Math.round((41 + q) * 10) / 10, 214],
        [Math.round((41 + q) * 10) / 10, 315],
        [Math.round((41 + 2 * q) * 10) / 10, 315],
      ],
    ])
    // Now is noon: half way, the NowPoint on the last value before it.
    expect(l.now).toEqual({ x: 418 })
    expect(l.series[0].nowPoint).toEqual([418, 315])
    expect(l.times.map((t) => t.label)).toEqual(["00:00", "06:00", "12:00", "18:00", "00:00"])
    expect(l.midnights.map((m) => m.label)).toEqual(["Mi", "Do"])
  })

  test("auto starts at 0 when every value is above it, and rounds out to a tick", () => {
    const s = series({})
    const l = chartLayout(chart([s]), W24, { s1: seriesData(s, [day({ 4: 13.2, 5: 13.6 })], TZ) }, O)
    expect([l.left.min, l.left.max]).toEqual([0, 15])
    const neg = chartLayout(chart([s]), W24, { s1: seriesData(s, [day({ 4: -120, 5: 380 })], TZ) }, O)
    expect([neg.left.min, neg.left.max]).toEqual([-200, 400])
  })

  test("a step nothing arrived in breaks the line", () => {
    const s = series({})
    const l = chartLayout(chart([s]), W24, { s1: seriesData(s, [day({ 0: 1, 1: 2, 3: 3 })], TZ) }, O)
    expect(l.series[0].lines.map((run) => run.length)).toEqual([2, 1])
  })

  test("an area closes on zero; a range is the band between min and max", () => {
    const s = series({ draw: "area", valueKind: "power", range: true })
    const p = { ...day({ 0: 100 }), min: day({ 0: 50 }).mean, max: day({ 0: 150 }).mean }
    const l = chartLayout(chart([s]), W24, { s1: seriesData(s, [p], TZ) }, O)
    const zero = l.left.ticks[0].y
    expect(l.series[0].areas[0][0][1]).toBe(zero)
    expect(l.series[0].areas[0].at(-1)![1]).toBe(zero)
    expect(l.series[0].ranges[0]).toHaveLength(2)
  })

  test("factor and invert are applied before anything is placed", () => {
    const s = series({ valueKind: "power", factor: 0.001, invert: true })
    const d = seriesData(s, [day({ 0: 2000 })], TZ)
    expect(d.steps[0].mean).toBe(-2)
  })

  test("a fixed axis is kept even when a value lies beyond it, the painter clips", () => {
    const s = series({})
    const l = chartLayout(chart([s], { left: { scale: "fixed", min: 0, max: 100 } }), W24, { s1: seriesData(s, [day({ 0: 150 })], TZ) }, O)
    expect([l.left.min, l.left.max]).toEqual([0, 100])
    expect(l.series[0].lines[0][0][1]).toBeLessThan(PLOT.y)
  })

  test("a zone spans the plot between its values; two axes, the right one on its own range", () => {
    const a = series({ id: "a" })
    const b = series({ id: "b", axis: "right" })
    const c = chart([a, b], { left: { scale: "fixed", min: 0, max: 100 }, right: { scale: "fixed", min: 0, max: 1000 }, zones: [{ axis: "left", to: 25, color: "#ff0000" }] })
    const l = chartLayout(c, W24, { a: seriesData(a, [day({ 0: 50 })], TZ), b: seriesData(b, [day({ 0: 500 })], TZ) }, O)
    expect(l.plot.w).toBe(754 - 36)
    expect(l.zones[0]).toMatchObject({ x: 41, y: 315, h: 101, color: "#ff0000" })
    expect(l.series[0].lines[0][0][1]).toBe(l.series[1].lines[0][0][1])
    expect(l.right!.ticks.at(-1)!.label).toBe("1000")
  })

  test("1 h reads recent: steps from its end; a window that ended shows now past its edge", () => {
    const s = series({})
    const w = chartWindow({ mode: "time" }, "1h", NOON, TZ)
    const recent = { end: w.to, step: 60, mean: Array.from({ length: 60 }, (_, i) => i), min: [], max: [] }
    const l = chartLayout(chart([s]), w, { s1: seriesData(s, [recent], TZ) }, O)
    expect(l.series[0].lines[0]).toHaveLength(60)
    expect(l.times.map((t) => t.label)).toEqual(["11:15", "11:30", "11:45", "12:00"])
    expect(chartLayout(chart([s]), W24, {}, { ...O, now: DAY + 86400 + 5 }).now).toEqual({ past: true })
  })
})
