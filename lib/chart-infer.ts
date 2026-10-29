// What kind of value a series is, guessed when it is made
// (docs/2026-10-16-charts.md decision 5, tasks/charts-designer-plan.md
// decision 7): from what Home Assistant announced for it where it did, else
// from its unit, else from its examples, else a level. Overridable in the
// panel; nothing infers it again later.

import type { ValueKind } from "@/lib/chart"

export interface KindHints {
  /** The Home Assistant component it was announced as: sensor, binary_sensor, switch … */
  component?: string
  device_class?: string
  unit?: string
  /** Its examples, as the topic list keeps them (a field's where the series names one). */
  examples?: readonly string[]
}

const LEVEL_DEVICE_CLASSES = new Set(["temperature", "humidity", "battery", "voltage", "current", "pressure", "moisture", "volume", "water", "distance"])
const STATE_COMPONENTS = new Set(["binary_sensor", "switch", "light", "fan", "lock", "input_boolean"])
const POWER_UNITS = new Set(["w", "kw", "mw"])
const STATE_WORDS = new Set(["on", "off", "true", "false", "open", "closed", "yes", "no"])

export function inferValueKind(h: KindHints): ValueKind {
  if (h.component && STATE_COMPONENTS.has(h.component)) return "state"
  if (h.device_class === "power") return "power"
  if (h.device_class && LEVEL_DEVICE_CLASSES.has(h.device_class)) return "level"
  const unit = h.unit?.trim().toLowerCase()
  if (unit && POWER_UNITS.has(unit)) return "power"
  if (unit) return "level"
  const words = (h.examples ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e !== "")
  if (words.length > 0 && words.every((w) => STATE_WORDS.has(w))) return "state"
  return "level"
}
