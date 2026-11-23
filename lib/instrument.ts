/**
 * Instrument styles for the read-only gauge (`arc-level`) and bar
 * (`level-indicator`) - docs/2026-11-23-instrument-styles.md.
 *
 * The style decides the material, the scale decides what is measured. This
 * file is the pure half: the style ids and what each style fixes (sweep,
 * spring, how dense its ticks may get), the new properties and their
 * normalizer, and the scale - ticks, labels and zones as positions 0..1
 * along the scale, every one of them through `calibrationPoints`, so a
 * non-linear calibration gets unevenly spaced ticks as a real fuel gauge has.
 *
 * Written to be ported like lib/energy-diagram.ts: no canvas, no React, no
 * theme. Its cases are in lib/instrument/vectors.json.
 */

export const INSTRUMENT_STYLES = [
  "pressure",
  "deco",
  "coil",
  "roadster",
  "cockpit",
  "rally",
  "vfd",
  "fuel",
  "bluered",
  "night",
  "engraving",
] as const

export type InstrumentStyle = (typeof INSTRUMENT_STYLES)[number]
export type ZoneKind = "danger" | "warning" | "ok"
export type InstrumentMotion = "style" | "direct"
export type LabelPreset = "numbers" | "fuel" | "words"

export interface CalibrationPoint {
  value: number
  barSizePercent: number
}

export interface InstrumentLabel {
  value: number
  text: string
}

export interface InstrumentScaleProps {
  /** In value units; missing = automatic. */
  majorStep?: number
  /** Subdivisions of a major step; missing = automatic, by pixel size. */
  minorPerMajor?: number
  /** Missing = numbers at the major ticks. */
  labels?: InstrumentLabel[]
  decimals?: number
  /** Labels show value / factor (cockpit «W × 100»: 0-4 for 0-400). */
  factor?: number
}

export interface InstrumentZone {
  from: number
  to: number
  kind: ZoneKind
}

/** The properties a style adds, the same on gauge and bar. */
export interface InstrumentProps {
  style?: InstrumentStyle
  caption?: string
  unit?: string
  scale?: InstrumentScaleProps
  zones?: InstrumentZone[]
  motion?: InstrumentMotion
  readout?: boolean
}

export interface StyleMeta {
  id: InstrumentStyle
  /** The gauge's sweep, degrees, 0 = up, clockwise. Fixed by the style (decision 1). */
  sweepFrom: number
  sweepTo: number
  /** Where the gauge's ticks sit, as a fraction of the object's side: the arc length a scale has. */
  tickRadius: number
  /** The bar's scale as a fraction of the bar's length. */
  barTrack: number
  /** The spring a needle follows; frequency in Hz, damping ratio. */
  spring: { frequency: number; damping: number }
  /** Minor ticks closer than this, in pixels, are thinned out. */
  minTickPx: number
  /** Major ticks (and their labels) closer than this, in pixels, are thinned out. */
  minLabelPx: number
  /** Whether the face has a digital field. */
  readout: boolean
}

const meta = (
  id: InstrumentStyle,
  sweepFrom: number,
  sweepTo: number,
  tickRadius: number,
  frequency: number,
  damping: number,
  readout = false,
): StyleMeta => ({
  id,
  sweepFrom,
  sweepTo,
  tickRadius,
  barTrack: 0.8,
  spring: { frequency, damping },
  minTickPx: 4,
  minLabelPx: 28,
  readout,
})

// Values from the proposals (artifact «Instrumentenkabinett»): sweep and
// tick radius from each face's drawing in its 200-unit box, the springs as
// they were watched on the 4.3B (2026-11-23).
export const STYLE_META: Record<InstrumentStyle, StyleMeta> = {
  pressure: meta("pressure", -135, 135, 0.4, 1, 0.32),
  deco: meta("deco", -135, 135, 0.4, 1, 0.7),
  coil: meta("coil", -40, 40, 0.59, 1.1, 0.85),
  roadster: meta("roadster", -125, 125, 0.4, 1.6, 0.5),
  cockpit: meta("cockpit", -150, 150, 0.41, 2, 0.6),
  rally: meta("rally", -135, 135, 0.435, 2.3, 0.38),
  vfd: meta("vfd", -135, 135, 0.42, 6, 1, true),
  fuel: meta("fuel", -55, 55, 0.43, 0.45, 1),
  bluered: meta("bluered", -120, 120, 0.43, 1.4, 0.8),
  night: meta("night", -130, 130, 0.42, 1.3, 0.95, true),
  engraving: meta("engraving", -135, 135, 0.41, 1.2, 0.85),
}

export function isInstrumentStyle(v: unknown): v is InstrumentStyle {
  return typeof v === "string" && (INSTRUMENT_STYLES as readonly string[]).includes(v)
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const ZONE_KINDS: readonly ZoneKind[] = ["danger", "warning", "ok"]

/**
 * The instrument half of an object's properties, cleaned: unknown style ->
 * none, nonsense numbers dropped, zones put in order. An object without a
 * valid style gets `{}` and is drawn exactly as before.
 */
export function normalizeInstrument(p: Record<string, any> | undefined): InstrumentProps {
  if (!p || !isInstrumentStyle(p.style)) return {}
  const out: InstrumentProps = { style: p.style }
  if (typeof p.caption === "string" && p.caption !== "") out.caption = p.caption
  if (typeof p.unit === "string" && p.unit !== "") out.unit = p.unit
  out.motion = p.motion === "direct" ? "direct" : "style"
  out.readout = STYLE_META[p.style as InstrumentStyle].readout ? p.readout !== false : false
  const s = p.scale
  if (s && typeof s === "object") {
    const scale: InstrumentScaleProps = {}
    if (finite(s.majorStep) && s.majorStep > 0) scale.majorStep = s.majorStep
    if (finite(s.minorPerMajor) && s.minorPerMajor >= 1) scale.minorPerMajor = Math.round(s.minorPerMajor)
    if (finite(s.decimals) && s.decimals >= 0) scale.decimals = Math.min(6, Math.round(s.decimals))
    if (finite(s.factor) && s.factor > 0) scale.factor = s.factor
    if (Array.isArray(s.labels)) {
      const labels = s.labels.filter((l: any) => l && finite(l.value) && typeof l.text === "string")
      if (labels.length) scale.labels = labels.map((l: any) => ({ value: l.value, text: l.text }))
    }
    if (Object.keys(scale).length) out.scale = scale
  }
  if (Array.isArray(p.zones)) {
    const zones = p.zones
      .filter((z: any) => z && finite(z.from) && finite(z.to) && ZONE_KINDS.includes(z.kind) && z.from !== z.to)
      .map((z: any) => ({ from: Math.min(z.from, z.to), to: Math.max(z.from, z.to), kind: z.kind as ZoneKind }))
    if (zones.length) out.zones = zones
  }
  return out
}

/**
 * Where a value lands along the scale, 0..1, through the calibration
 * points - the same rule as the flat bar's calculateLevelIndicatorFill
 * (components/canvas/renderers/render-level-indicator.ts), restated here so
 * the core carries no renderer.
 */
export function calibratedAt(value: number, points: CalibrationPoint[]): number {
  if (!points || points.length === 0) return 0
  const sorted = [...points].sort((a, b) => a.value - b.value)
  const clamp = (pct: number) => Math.max(0, Math.min(1, pct / 100))
  if (value <= sorted[0].value) return clamp(sorted[0].barSizePercent)
  const last = sorted[sorted.length - 1]
  if (value >= last.value) return clamp(last.barSizePercent)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (value >= a.value && value <= b.value) {
      const ratio = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value)
      return clamp(a.barSizePercent + ratio * (b.barSizePercent - a.barSizePercent))
    }
  }
  return 0
}

export function calibratedRange(points: CalibrationPoint[]): { min: number; max: number } {
  if (!points || points.length === 0) return { min: 0, max: 100 }
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
  }
  return min < max ? { min, max } : { min, max: min + 1 }
}

/** The gauge needle's angle for a position 0..1, degrees, 0 = up, clockwise. */
export function gaugeAngle(style: InstrumentStyle, at: number): number {
  const m = STYLE_META[style]
  return m.sweepFrom + (m.sweepTo - m.sweepFrom) * at
}

/** How long a style's scale is in pixels, for thinning its ticks. */
export function scaleLengthPx(style: InstrumentStyle, kind: "gauge" | "bar", width: number, height: number): number {
  const m = STYLE_META[style]
  if (kind === "bar") return Math.max(width, height) * m.barTrack
  const side = Math.min(width, height)
  return (side * m.tickRadius * Math.abs(m.sweepTo - m.sweepFrom) * Math.PI) / 180
}

const round = (v: number, places = 9) => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

/** The smallest of 1, 2, 5 × 10ⁿ that is at least `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const exp = Math.floor(Math.log10(raw))
  for (const e of [exp - 1, exp, exp + 1]) {
    for (const m of [1, 2, 5]) {
      const step = round(m * 10 ** e, 12)
      if (step >= raw * (1 - 1e-12)) return step
    }
  }
  return 10 ** (exp + 1)
}

function mantissa(step: number): number {
  const m = round(step / 10 ** Math.floor(Math.log10(step) + 1e-12), 6)
  return m >= 5 ? 5 : m >= 2 ? 2 : 1
}

/** Decimals a label needs to show `v` (a step, or a value) exactly, up to 6. */
function decimalsFor(v: number): number {
  for (let d = 0; d <= 6; d++) if (Math.abs(round(v, d) - v) < 1e-9) return d
  return 6
}

export function presetLabels(preset: LabelPreset, min: number, max: number): InstrumentLabel[] | undefined {
  const mid = round((min + max) / 2)
  if (preset === "fuel") return [{ value: min, text: "E" }, { value: mid, text: "½" }, { value: max, text: "F" }]
  if (preset === "words") return [{ value: min, text: "LEER" }, { value: mid, text: "HALB" }, { value: max, text: "VOLL" }]
  return undefined
}

/** The spacing of hand-set labels if they stand at even steps, else undefined. */
function evenLabelStep(labels: InstrumentLabel[] | undefined): number | undefined {
  if (!labels || labels.length < 2) return undefined
  const v = labels.map((l) => l.value).sort((a, b) => a - b)
  const step = v[1] - v[0]
  if (!(step > 0)) return undefined
  for (let i = 2; i < v.length; i++) if (Math.abs(v[i] - v[i - 1] - step) > step * 1e-9) return undefined
  return round(step)
}

export interface ScaleTick {
  value: number
  at: number
  major: boolean
}
export interface ScaleLabel {
  value: number
  at: number
  text: string
}
export interface ScaleZone {
  from: number
  to: number
  kind: ZoneKind
}
export interface InstrumentScale {
  min: number
  max: number
  majorStep: number
  minorPerMajor: number
  ticks: ScaleTick[]
  labels: ScaleLabel[]
  zones: ScaleZone[]
  /** A hand-set scale denser than the style allows at this size (the designer warns). */
  dense: boolean
}

/**
 * Ticks, labels and zones for a scale `lengthPx` pixels long.
 *
 * Automatic: under hand-set labels at even steps, those steps; otherwise a
 * 1/2/5 step with at most eight majors, none closer than the style's label
 * spacing; then as many subdivisions as fit the style's tick
 * spacing (1 → 5 or 2, 2 → 4 or 2, 5 → 5). Set by hand, the user's numbers
 * win and `dense` says when they are tighter than the style allows.
 */
export function instrumentScale(
  calibrationPoints: CalibrationPoint[],
  props: InstrumentProps,
  lengthPx: number,
): InstrumentScale {
  const style = props.style ?? "fuel"
  const m = STYLE_META[style]
  const { min, max } = calibratedRange(calibrationPoints)
  const range = max - min
  const s = props.scale ?? {}

  let majorStep: number
  let dense = false
  const labelStep = evenLabelStep(s.labels)
  if (s.majorStep) {
    majorStep = s.majorStep
    if ((lengthPx * majorStep) / range < m.minLabelPx) dense = true
  } else if (labelStep) {
    // Labels set by hand at even steps (E ½ F): the major ticks stand under them.
    majorStep = labelStep
  } else {
    const maxMajors = Math.max(2, Math.min(8, Math.floor(lengthPx / m.minLabelPx)))
    majorStep = niceStep(range / maxMajors)
  }
  const majorPx = (lengthPx * majorStep) / range

  let minorPerMajor: number
  if (s.minorPerMajor) {
    minorPerMajor = s.minorPerMajor
    if (minorPerMajor > 1 && majorPx / minorPerMajor < m.minTickPx) dense = true
  } else {
    const candidates = { 1: [5, 2, 1], 2: [4, 2, 1], 5: [5, 1] }[mantissa(majorStep)]!
    minorPerMajor = candidates.find((n) => n === 1 || majorPx / n >= m.minTickPx) ?? 1
  }

  const at = (v: number) => round(calibratedAt(v, calibrationPoints))
  const ticks: ScaleTick[] = []
  const minorStep = majorStep / minorPerMajor
  const first = Math.ceil(round(min / minorStep, 6))
  const last = Math.floor(round(max / minorStep, 6))
  for (let k = first; k <= last; k++) {
    const value = round(k * minorStep)
    ticks.push({ value, at: at(value), major: k % minorPerMajor === 0 })
  }

  const factor = s.factor ?? 1
  const decimals = s.decimals ?? decimalsFor(majorStep / factor)
  const labels: ScaleLabel[] = s.labels
    ? s.labels
        .filter((l) => l.value >= min - 1e-9 && l.value <= max + 1e-9)
        .map((l) => ({ value: l.value, at: at(l.value), text: l.text }))
    : ticks.filter((t) => t.major).map((t) => ({ value: t.value, at: t.at, text: (t.value / factor).toFixed(decimals) }))

  const zones: ScaleZone[] = (props.zones ?? [])
    .map((z) => ({ from: at(Math.max(min, z.from)), to: at(Math.min(max, z.to)), kind: z.kind }))
    .filter((z) => z.to > z.from)

  return { min, max, majorStep, minorPerMajor, ticks, labels, zones, dense }
}

/**
 * A bar's geometry, whichever way it runs: its length and thickness, and
 * where a position 0..1 and a depth 0..1 across it lie on the object.
 * Text stays upright in every direction; only positions turn.
 */
export interface BarFrame {
  vertical: boolean
  length: number
  thickness: number
  /** The track's start and end along the length, in pixels from the start edge. */
  from: number
  to: number
  /** The point at position `at` (0..1 along the scale) and depth `d` (0..1 across). */
  point(at: number, d: number): [number, number]
}

export type BarDirection = "left-to-right" | "right-to-left" | "bottom-to-top" | "top-to-bottom"

export function barFrame(width: number, height: number, direction: BarDirection | undefined, track: number): BarFrame {
  const dir: BarDirection = direction ?? "left-to-right"
  const vertical = dir === "bottom-to-top" || dir === "top-to-bottom"
  const length = vertical ? height : width
  const thickness = vertical ? width : height
  const margin = (length * (1 - track)) / 2
  const from = margin
  const to = length - margin
  const point = (at: number, d: number): [number, number] => {
    const along = from + (to - from) * at
    switch (dir) {
      case "left-to-right":
        return [along, d * thickness]
      case "right-to-left":
        return [length - along, d * thickness]
      case "top-to-bottom":
        return [d * thickness, along]
      case "bottom-to-top":
      default:
        return [d * thickness, length - along]
    }
  }
  return { vertical, length, thickness, from, to, point }
}
