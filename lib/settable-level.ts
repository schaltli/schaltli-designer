// What a settable level's own numbers add up to, for the property panel to
// say out loud (docs/2026-09-17-settable-level.md, decisions 4, 5 and 6b).
//
// Both answers come from the object alone, so they are computed here rather
// than in the panel: the firmware and the live preview do the same arithmetic
// when a finger lands, and a warning that disagreed with what the device then
// does would be worse than none.

export interface CalibrationPoint {
  value: number
  barSizePercent: number
}

export interface SettableRange {
  /** The lowest and highest value a finger can reach: the outer points. */
  min: number
  max: number
  /** How many distinct values the step leaves inside that range. */
  steps: number
  /** True when the range is not a whole number of steps, e.g. 0-100 by 7. */
  ragged: boolean
  /** The last value reachable below max when ragged - what a finger tops out at. */
  highestReachable: number
}

export function settableRange(points: CalibrationPoint[] | undefined, step: number | undefined): SettableRange | null {
  if (!points || points.length < 2) return null
  const sorted = [...points].sort((a, b) => a.value - b.value)
  const min = sorted[0].value
  const max = sorted[sorted.length - 1].value
  const span = max - min
  if (!step || step <= 0 || span <= 0) return { min, max, steps: 0, ragged: false, highestReachable: max }
  const wholeSteps = Math.floor((span + 1e-9) / step)
  const ragged = Math.abs(wholeSteps * step - span) > 1e-9
  return { min, max, steps: wholeSteps + 1, ragged, highestReachable: min + wholeSteps * step }
}

// A calibration a finger cannot be trusted with: its percentages have to run
// one way, or a position on the bar stands for more than one value and the
// inverse is a guess. Harmless while the object is only read - the forward
// direction is defined either way - which is why this is a warning about
// writing, not about the object.
export function calibrationIsMonotonic(points: CalibrationPoint[] | undefined): boolean {
  if (!points || points.length < 2) return true
  const sorted = [...points].sort((a, b) => a.value - b.value)
  let rising = 0
  let falling = 0
  for (let i = 0; i + 1 < sorted.length; i++) {
    const delta = sorted[i + 1].barSizePercent - sorted[i].barSizePercent
    if (delta > 0) rising++
    if (delta < 0) falling++
  }
  return rising === 0 || falling === 0
}
