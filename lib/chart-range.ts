// A screen's time range and how far back it looks
// (docs/2026-10-16-charts.md decision 15, tasks/charts-actions-plan.md
// decisions 3-5): the four range actions and a drag, as steps on a plain
// state. Pure, so the preview, the firmware and the app take the same steps.

import { DEFAULT_TIME_RANGE, TIME_RANGES, type TimeRange } from "@/lib/chart"
import { dateOf, midnightOf, type Zone } from "@/lib/chart-window"

/** What a screen shows: its range, and how many seconds back from now its window lies. */
export interface RangeView {
  range: TimeRange
  back: number
}

export const SPAN: Record<TimeRange, number> = { "1h": 3600, "6h": 6 * 3600, "24h": 86400, "7d": 7 * 86400 }

/** Where a screen opens: its Time range, today. */
export function openView(range: TimeRange | undefined): RangeView {
  return { range: range ?? DEFAULT_TIME_RANGE, back: 0 }
}

/** One step shorter: 7 days → 24 h → 6 h → 1 h, and no shorter. */
export function narrowed(v: RangeView, now: number, tz: Zone): RangeView {
  const i = TIME_RANGES.indexOf(v.range)
  return settled({ ...v, range: TIME_RANGES[Math.max(0, i - 1)] }, now, tz)
}

/** One step longer, and no longer than 7 days. */
export function widened(v: RangeView, now: number, tz: Zone): RangeView {
  const i = TIME_RANGES.indexOf(v.range)
  return settled({ ...v, range: TIME_RANGES[Math.min(TIME_RANGES.length - 1, i + 1)] }, now, tz)
}

/** By one range, earlier or later; later stops at now. */
export function moved(v: RangeView, direction: "earlier" | "later", now: number, tz: Zone): RangeView {
  const back = direction === "earlier" ? v.back + SPAN[v.range] : Math.max(0, v.back - SPAN[v.range])
  return settled({ ...v, back }, now, tz)
}

/** Straight to a span, back at now. */
export function set(range: TimeRange): RangeView {
  return { range, back: 0 }
}

/** Dragged by `seconds` (positive: earlier), not settled yet. */
export function dragged(v: RangeView, seconds: number): RangeView {
  return { ...v, back: Math.max(0, v.back + seconds) }
}

/**
 * Let go: from 24 hours up a window always settles on the nearest midnight
 * (decision 9; the user, 2026-10-30: «danach schnappt es immer auf ganze
 * Tage ein» - until then only within 6 hours of one), so a day is shown
 * whole; never later than now. 1 and 6 hours stay where they were let go.
 */
export function settled(v: RangeView, now: number, tz: Zone): RangeView {
  if (v.back <= 0) return { ...v, back: 0 }
  if (v.range !== "24h" && v.range !== "7d") return v
  // Today's window starts at today's midnight (or six days before); moved
  // back, it starts `back` earlier.
  const todayStart = midnightOf(dateOf(now, tz), tz) - (v.range === "7d" ? 6 * 86400 : 0)
  const from = todayStart - v.back
  const before = midnightOf(dateOf(from, tz), tz)
  const after = midnightOf(dateOf(from + 86400, tz), tz)
  const near = from - before <= after - from ? before : after
  return { ...v, back: Math.max(0, todayStart - near) }
}
