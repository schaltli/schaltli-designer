"use client"

/**
 * The four actions on a screen's time range (docs/2026-10-16-charts.md
 * decision 15, tasks/charts-actions-plan.md decision 2), for both pickers:
 * a hardware button's or gesture's and a Button's. Offered only in a
 * project with charts - elsewhere they would do nothing.
 */

import type { HardwareButtonAction } from "../project-editor"
import { RANGE_LABELS, TIME_RANGES, type TimeRange } from "@/lib/chart"
import { SelectField } from "./fields"

export const RANGE_ACTION_OPTIONS: { value: HardwareButtonAction["type"]; label: string }[] = [
  { value: "narrow-range", label: "Narrow the time range" },
  { value: "widen-range", label: "Widen the time range" },
  { value: "move-range", label: "Move the time range" },
  { value: "set-range", label: "Set the time range" },
]

interface Walkable {
  type?: string
  children?: Walkable[]
}

/** Whether a project has anything a range action acts on: a chart, or a screen with a time range. */
export function projectHasCharts(screens: readonly { timeRange?: string; objects?: readonly unknown[] }[] | undefined): boolean {
  const has = (objects: readonly unknown[] | undefined): boolean =>
    (objects ?? []).some((o) => (o as Walkable).type === "chart" || has((o as Walkable).children))
  return (screens ?? []).some((s) => s.timeRange !== undefined || has(s.objects))
}

/** A range action as first chosen: earlier, or 24 hours. */
export function rangeActionOf(type: HardwareButtonAction["type"]): HardwareButtonAction {
  if (type === "move-range") return { type, rangeDirection: "earlier" }
  if (type === "set-range") return { type, range: "24h" }
  return { type }
}

export function RangeActionFields({ action, idPrefix, onChange }: { action: HardwareButtonAction; idPrefix: string; onChange: (action: HardwareButtonAction) => void }) {
  if (action.type === "move-range") {
    return (
      <SelectField
        id={`${idPrefix}rangeDirection`}
        label="Which way"
        value={action.rangeDirection ?? "earlier"}
        options={[
          { value: "earlier", label: "Earlier" },
          { value: "later", label: "Later" },
        ]}
        onChange={(v) => onChange({ type: "move-range", rangeDirection: v === "later" ? "later" : "earlier" })}
      />
    )
  }
  if (action.type === "set-range") {
    return (
      <SelectField
        id={`${idPrefix}range`}
        label="Span"
        value={action.range ?? "24h"}
        options={TIME_RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
        onChange={(v) => onChange({ type: "set-range", range: v as TimeRange })}
      />
    )
  }
  return null
}
