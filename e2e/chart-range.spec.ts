import { test, expect } from "@playwright/test"
import { dragged, moved, narrowed, openView, set, settled, widened } from "../lib/chart-range"
import { chartWindow, midnightOf } from "../lib/chart-window"

// A screen's time range and how far back it looks (tasks/charts-actions-plan.md
// A1, decisions 3-5).

const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
const NOON = DAY + 12 * 3600
const time = { mode: "time" as const }

test.describe("the range steps (A1)", () => {
  test("narrow and widen walk 7 days, 24 h, 6 h, 1 h, and stop at the ends", () => {
    let v = openView("7d")
    const walked: string[] = []
    for (let i = 0; i < 4; i++) {
      v = narrowed(v, NOON, TZ)
      walked.push(v.range)
    }
    expect(walked).toEqual(["24h", "6h", "1h", "1h"])
    expect(widened(openView("7d"), NOON, TZ).range).toBe("7d")
    expect(widened(openView("6h"), NOON, TZ).range).toBe("24h")
  })

  test("move: by one range, earlier and back; later stops at now", () => {
    const yesterday = moved(openView("24h"), "earlier", NOON, TZ)
    expect(yesterday).toEqual({ range: "24h", back: 86400 })
    expect(chartWindow(time, "24h", NOON, TZ, yesterday.back)).toMatchObject({ from: DAY - 86400, to: DAY, source: "day", dates: ["2026-10-13"] })
    expect(moved(yesterday, "later", NOON, TZ)).toEqual({ range: "24h", back: 0 })
    expect(moved(openView("24h"), "later", NOON, TZ)).toEqual({ range: "24h", back: 0 })
    expect(moved(openView("7d"), "earlier", NOON, TZ).back).toBe(7 * 86400)
  })

  test("set goes straight to its span, back at now", () => {
    expect(set("1h")).toEqual({ range: "1h", back: 0 })
  })

  test("an hour moved further back than recent keeps is read from the days", () => {
    expect(chartWindow(time, "1h", NOON, TZ, 3600).source).toBe("recent")
    const w = chartWindow(time, "1h", NOON, TZ, 3 * 3600)
    expect(w).toMatchObject({ source: "day", step: 900, dates: ["2026-10-14"] })
    expect(w.to - w.from).toBe(3600)
  })

  test("a drag settles on a midnight within 6 hours, from 24 h up; not further than now", () => {
    // Dragged 20 hours back: the window starts at 04:00 yesterday - settles on yesterday's midnight.
    expect(settled(dragged(openView("24h"), 20 * 3600), NOON, TZ)).toEqual({ range: "24h", back: 86400 })
    // 12 hours back: noon yesterday, 12 h from either midnight - stays.
    expect(settled(dragged(openView("24h"), 12 * 3600), NOON, TZ)).toEqual({ range: "24h", back: 12 * 3600 })
    // 3 hours back: settles on today.
    expect(settled(dragged(openView("24h"), 3 * 3600), NOON, TZ)).toEqual({ range: "24h", back: 0 })
    // An hour does not settle; a drag forward stops at now.
    expect(settled(dragged(openView("1h"), 1234), NOON, TZ)).toEqual({ range: "1h", back: 1234 })
    expect(dragged(openView("24h"), -500)).toEqual({ range: "24h", back: 0 })
  })
})

test("6 hours moved back more than recent6 keeps (6 hours) read the days", () => {
  const w6 = chartWindow(time, "6h", NOON, TZ, 0)
  expect(w6.source).toBe("recent6")
  expect(chartWindow(time, "6h", NOON, TZ, 6 * 3600)).toMatchObject({ source: "day", step: 900 })
})
