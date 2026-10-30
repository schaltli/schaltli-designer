import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { chartWindow, dayTable, midnightOf, type DayTable } from "../lib/chart-window"
import { dragged, moved, narrowed, openView, set, settled, widened, type RangeView } from "../lib/chart-range"
import { chartLayout, seriesData } from "../lib/chart-layout"
import { normalizeChart, type ChartProperties, type ChartSeries } from "../lib/chart"
import { chartShapes } from "../lib/chart-shapes"

// The chart's core as numbers (tasks/charts-firmware-plan.md decision 4):
// windows, range steps and layouts for a set of charts and payloads, every
// number the firmware's C++ and the app's Kotlin must reproduce. The
// firmware's test/test_chart reads a byte-for-byte copy of the file.
//
//   HARVEST_CHART_VECTORS=1 npx playwright test e2e/chart-vectors.spec.ts
//
// writes it anew; without, this checks it is still what the core gives.

const FILE = path.join(__dirname, "..", "lib", "chart", "vectors.json")
const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
// A device's zone is the recorder's table of days (lib/chart-window.ts
// DayTable): the cases name one of these, and every number is worked out
// with the table, as the firmware and the app will.
const ZONES: Record<string, DayTable> = {
  zurich: dayTable(TZ, "2026-03-25", "2026-11-05"),
  newyork: dayTable("America/New_York", "2026-10-01", "2026-10-20"),
}
const NOON = DAY + 12 * 3600 + 30

const series = (s: Partial<ChartSeries>): ChartSeries => ({
  id: "s1",
  source: { kind: "topic", topic: "van/x" },
  name: "X",
  valueKind: "level",
  draw: "line",
  color: "#2255aa",
  ...s,
})
const chart = (s: ChartSeries[], extra: Partial<ChartProperties> = {}) =>
  normalizeChart({ mode: "time", scroll: false, legend: "top-right", left: { scale: "auto" }, series: s, ...extra })
const day = (date: string, at: Record<number, number>, n = 96) => ({
  date,
  step: 900,
  mean: Array.from({ length: n }, (_, i) => (i in at ? at[i] : null)),
  min: Array.from({ length: n }, (_, i) => (i in at ? at[i] - 1 : null)),
  max: Array.from({ length: n }, (_, i) => (i in at ? at[i] + 1 : null)),
})

function build() {
  const windows = [
    { chart: { mode: "time" }, range: "24h", now: NOON, tz: "zurich", back: 0 },
    { chart: { mode: "time" }, range: "7d", now: NOON, tz: "zurich", back: 0 },
    { chart: { mode: "time" }, range: "1h", now: NOON, tz: "zurich", back: 0 },
    { chart: { mode: "time" }, range: "6h", now: NOON, tz: "zurich", back: 0 },
    { chart: { mode: "time" }, range: "24h", now: NOON, tz: "zurich", back: 86400 },
    { chart: { mode: "time" }, range: "1h", now: NOON, tz: "zurich", back: 3 * 3600 },
    { chart: { mode: "time" }, range: "24h", now: midnightOf("2026-10-25", TZ) + 3600, tz: "zurich", back: 0 },
    { chart: { mode: "time" }, range: "24h", now: midnightOf("2026-03-29", TZ) + 7200, tz: "zurich", back: 0 },
    { chart: { mode: "per-day", days: 7 }, range: "24h", now: NOON, tz: "zurich", back: 0 },
    { chart: { mode: "time" }, range: "24h", now: NOON, tz: "newyork", back: 0 },
  ].map((w) => ({ in: w, out: chartWindow(w.chart as any, w.range as any, w.now, ZONES[w.tz], w.back) }))

  const steps: { in: { view: RangeView; step: string; arg?: unknown }; out: RangeView }[] = []
  const step = (view: RangeView, name: string, arg: unknown, out: RangeView) => steps.push({ in: { view, step: name, ...(arg === undefined ? {} : { arg }) }, out })
  for (const r of ["1h", "6h", "24h", "7d"] as const) {
    step(openView(r), "narrow", undefined, narrowed(openView(r), NOON, ZONES.zurich))
    step(openView(r), "widen", undefined, widened(openView(r), NOON, ZONES.zurich))
    step(openView(r), "earlier", undefined, moved(openView(r), "earlier", NOON, ZONES.zurich))
    step({ range: r, back: 86400 * 2 }, "later", undefined, moved({ range: r, back: 86400 * 2 }, "later", NOON, ZONES.zurich))
  }
  step(openView("24h"), "set", "1h", set("1h"))
  for (const secs of [-500, 3 * 3600, 12 * 3600, 20 * 3600, 40 * 3600]) {
    step(openView("24h"), "drag-settle", secs, settled(dragged(openView("24h"), secs), NOON, ZONES.zurich))
  }
  step(openView("7d"), "drag-settle", 2 * 86400 + 3600, settled(dragged(openView("7d"), 2 * 86400 + 3600), NOON, ZONES.zurich))

  const o = { width: 800, height: 440, fontSize: 14, now: NOON, tz: "zurich" }
  const cases: { name: string; chart: ChartProperties; range: string; back: number; payloads: Record<string, unknown[]>; options: typeof o & { decimal?: string } }[] = [
    {
      name: "water: fixed axis, steps, a zone",
      chart: chart([series({ draw: "steps", unit: "%", annotations: ["current"] }), series({ id: "s2", name: "Grau", draw: "steps", unit: "%", color: "#888888" })], {
        left: { scale: "fixed", min: 0, max: 100, unit: "%" },
        zones: [{ axis: "left", to: 15, color: "#ff0000" }],
      }),
      range: "24h",
      back: 0,
      payloads: { s1: [day("2026-10-14", { 0: 80, 1: 78, 2: 75, 30: 60 })], s2: [day("2026-10-14", { 0: 10, 1: 12 })] },
      options: o,
    },
    {
      name: "auto axis, area with range, min and max, decimal comma",
      chart: chart([series({ draw: "area", range: true, unit: "V", decimals: 2, annotations: ["current", "min", "max"] })], { legend: "bottom" }),
      range: "24h",
      back: 0,
      payloads: { s1: [day("2026-10-14", { 4: 13.2, 5: 13.6, 6: 12.9, 20: 14.1 })] },
      options: { ...o, decimal: "," },
    },
    {
      name: "a heater's band, its run time and starts, on two axes with a level",
      chart: chart([series({ id: "t", unit: "°C" }), series({ id: "h", valueKind: "state", draw: "band", name: "Heizung", annotations: ["runtime", "starts"] }), series({ id: "w", unit: "W", valueKind: "power", axis: "right", annotations: ["sum"] })], {
        legend: "top-left",
      }),
      range: "24h",
      back: 0,
      payloads: { t: [day("2026-10-14", { 0: 18, 8: 21.5 })], h: [{ date: "2026-10-14", on: [[60, 150], [600, 630]] }], w: [day("2026-10-14", { 0: 1200, 1: 1200, 4: -300 })] },
      options: o,
    },
    {
      name: "an energy stack with its balance",
      chart: chart(
        [
          series({ id: "sun", valueKind: "power", draw: "stacked", stack: "e", source: { kind: "topic", topic: "sun" } }),
          series({ id: "grid", valueKind: "power", draw: "stacked", stack: "e", source: { kind: "topic", topic: "grid" } }),
          series({ id: "rest", valueKind: "power", draw: "stacked", stack: "e", source: { kind: "balance" } }),
        ],
        { legend: "none" },
      ),
      range: "24h",
      back: 0,
      payloads: { sun: [day("2026-10-14", { 0: 300, 1: 200 })], grid: [day("2026-10-14", { 0: 100 })] },
      options: o,
    },
    {
      // 2026-10-30: a series charging and discharging is two shapes, one on
      // each side of zero, the curves smooth, the areas fading outwards, and
      // the stack's NowPoint on zero.
      name: "a battery charging and discharging in a stack, smooth and fading",
      chart: chart(
        [
          series({ id: "sun", valueKind: "power", draw: "stacked", stack: "e", source: { kind: "topic", topic: "sun" } }),
          series({ id: "bat", valueKind: "power", draw: "stacked", stack: "e", source: { kind: "topic", topic: "bat" } }),
          series({ id: "load", valueKind: "power", draw: "stacked", stack: "e", source: { kind: "topic", topic: "load" } }),
        ],
        { legend: "none" },
      ),
      range: "24h",
      back: 0,
      payloads: {
        sun: [day("2026-10-14", { 40: 0, 41: 120, 42: 300, 43: 420, 44: 380, 45: 200 })],
        bat: [day("2026-10-14", { 40: 180, 41: 60, 42: -150, 43: -260, 44: -200, 45: 40 })],
        load: [day("2026-10-14", { 40: -180, 41: -180, 42: -150, 43: -160, 44: -180, 45: -240 })],
      },
      options: o,
    },
    {
      name: "an hour from recent",
      chart: chart([series({ annotations: ["current"] })]),
      range: "1h",
      back: 0,
      payloads: { s1: [{ end: Math.floor(NOON / 60) * 60 + 60, step: 60, mean: Array.from({ length: 120 }, (_, i) => (i % 7 === 0 ? null : 40 + (i % 10))), min: [], max: [] }] },
      options: o,
    },
    {
      name: "yesterday, moved back: the arrow past now",
      chart: chart([series({})]),
      range: "24h",
      back: 86400,
      payloads: { s1: [day("2026-10-13", { 10: 5, 11: 6 })] },
      options: o,
    },
    {
      name: "seven days of bars, energy up and down",
      chart: chart([series({ valueKind: "power", draw: "bars", dailyValue: "energy" })], { mode: "per-day", days: 7 }),
      range: "24h",
      back: 0,
      payloads: { s1: [{ days: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, energyIn: 1000 + i * 10, energyOut: 500 })) }] },
      options: o,
    },
  ]
  const layouts = cases.map((c) => {
    const zone = ZONES[c.options.tz]
    const window = chartWindow(c.chart, c.range as any, c.options.now, zone, c.back)
    const data = Object.fromEntries(c.chart.series.map((s) => [s.id, seriesData(s, (c.payloads[s.id] ?? []) as any, zone)]))
    const layout = chartLayout(c.chart, window, data, { ...c.options, tz: zone })
    // The fills a board draws (lib/chart-shapes.ts), on colour and on grey.
    // A now colour, so the line at now and a stack's NowPoint are held too.
    const shapes = chartShapes(layout, { grid: "#cccccc", grey: false, now: "#ff0000" })
    const greyShapes = chartShapes(layout, { grid: "#cccccc", grey: true, now: "#ff0000" })
    // And with the NowPoint's pulse a third of the way out, as a colour board draws it.
    const pulseShapes = chartShapes(layout, { grid: "#cccccc", grey: false, pulse: 1 / 3, now: "#ff0000" })
    return { name: c.name, in: { chart: c.chart, range: c.range, back: c.back, payloads: c.payloads, options: c.options }, out: layout, shapes, greyShapes, pulseShapes }
  })
  return { zones: ZONES, windows, steps, layouts }
}

test("the chart's vectors are what its core gives", () => {
  const text = JSON.stringify(build(), null, 1) + "\n"
  if (process.env.HARVEST_CHART_VECTORS) fs.writeFileSync(FILE, text)
  expect(fs.readFileSync(FILE, "utf8"), "run with HARVEST_CHART_VECTORS=1 after a change to the core").toBe(text)
})
