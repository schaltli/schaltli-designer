import { test, expect } from "@playwright/test"
import { chartWindow, dateOf, historyTopicsFor, midnightOf } from "../lib/chart-window"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const recorder = require("../recorder/history")

// The window a chart shows and the history it reads
// (tasks/charts-designer-plan.md D1, decisions 1 and 2).

const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
const NOON = DAY + 12 * 3600 + 30
const time = { mode: "time" as const }

test.describe("the chart's window (D1)", () => {
  test("24 h is today, midnight to midnight; 7 days ends with today", () => {
    expect(chartWindow(time, "24h", NOON, TZ)).toEqual({ from: DAY, to: DAY + 86400, source: "day", step: 900, dates: ["2026-10-14"] })
    const week = chartWindow(time, "7d", NOON, TZ)
    expect(week.dates).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"])
    expect(week.from).toBe(midnightOf("2026-10-08", TZ))
    expect(week.to).toBe(DAY + 86400)
  })

  test("1 h and 6 h end with the step now is in", () => {
    expect(chartWindow(time, "1h", NOON, TZ)).toEqual({ from: DAY + 12 * 3600 + 60 - 3600, to: DAY + 12 * 3600 + 60, source: "recent", step: 60, dates: [] })
    expect(chartWindow(time, "6h", NOON, TZ)).toMatchObject({ to: DAY + 12 * 3600 + 300, from: DAY + 6 * 3600 + 300, source: "recent6", step: 300 })
  })

  test("a per-day chart reads its last days from daily", () => {
    expect(chartWindow({ mode: "per-day", days: 3 }, "24h", NOON, TZ)).toMatchObject({ source: "daily", dates: ["2026-10-12", "2026-10-13", "2026-10-14"] })
  })

  test("the day the clock goes back is 25 hours long", () => {
    const w = chartWindow(time, "24h", midnightOf("2026-10-25", TZ) + 3600, TZ)
    expect(w.to - w.from).toBe(25 * 3600)
  })

  test("its days are the recorder's", () => {
    for (const t of [DAY - 1, DAY, NOON, midnightOf("2026-10-25", TZ) + 7200, midnightOf("2026-03-29", TZ) + 7200]) {
      expect(dateOf(t, TZ)).toBe(recorder.dateOf(t, TZ))
      expect(midnightOf(dateOf(t, TZ), TZ)).toBe(recorder.midnightOf(dateOf(t, TZ), TZ))
    }
  })

  test("the topics it reads: per series, the source's, a field's under ~, a balance none", () => {
    const chart = {
      series: [
        { source: { kind: "topic", topic: "van/tank#level" } },
        { source: { kind: "topic", topic: "van/heater" } },
        { source: { kind: "balance" } },
      ],
    } as any
    expect(historyTopicsFor(chart, chartWindow(time, "1h", NOON, TZ))).toEqual(["schaltli/history/van/tank~level/recent", "schaltli/history/van/heater/recent"])
    expect(historyTopicsFor(chart, chartWindow(time, "7d", NOON, TZ))).toHaveLength(14)
    expect(historyTopicsFor(chart, chartWindow({ mode: "per-day", days: 7 }, "24h", NOON, TZ))).toEqual([
      "schaltli/history/van/tank~level/daily",
      "schaltli/history/van/heater/daily",
    ])
  })
})
