/**
 * Bakes a styled face - the static layer - at an object's pixel size, and
 * keeps it (docs/2026-11-23-instrument-styles.md, «Two layers»; plan
 * decision 1). The editor, the reference render and the export all take the
 * same baked picture, so the face's pixels are one picture everywhere; only
 * the needle is drawn per value.
 *
 * Keyed by everything that shows on the face: style, kind, size, the scale,
 * zones, caption, unit, the screen colour edge pixels mix into. A value
 * change hits the cache; changing the range rebakes.
 */
import {
  instrumentScale,
  normalizeInstrument,
  scaleLengthPx,
  type CalibrationPoint,
  type InstrumentProps,
  type InstrumentScale,
  type InstrumentStyle,
} from "@/lib/instrument"
import { instrumentFontsReady } from "@/lib/instrument-fonts"
import { settle565 } from "@/components/canvas/instrument-faces/common"
import { paintFuelBar, paintFuelGauge } from "@/components/canvas/instrument-faces/fuel"
import { paintNightBar, paintNightGauge } from "@/components/canvas/instrument-faces/night"
import { paintRallyBar, paintRallyGauge } from "@/components/canvas/instrument-faces/rally"
import { barFrame, STYLE_META, type BarDirection, type BarFrame } from "@/lib/instrument"

export type InstrumentKind = "gauge" | "bar"

export interface BakedFace {
  canvas: HTMLCanvasElement
  scale: InstrumentScale
  key: string
}

type Painter = (ctx: CanvasRenderingContext2D, scale: InstrumentScale, props: InstrumentProps) => void

/** Gauge painters by style. A style without its own yet is drawn as the fuel gauge until its task. */
const GAUGE_PAINTERS: Partial<Record<InstrumentStyle, Painter>> = {
  fuel: paintFuelGauge,
  rally: paintRallyGauge,
  night: paintNightGauge,
}

type BarPainter = (
  ctx: CanvasRenderingContext2D,
  scale: InstrumentScale,
  props: InstrumentProps,
  frame: BarFrame,
  width: number,
  height: number,
) => void

/** Bar painters by style; as with gauges, the fuel gauge's until a style has its own. */
const BAR_PAINTERS: Partial<Record<InstrumentStyle, BarPainter>> = {
  fuel: paintFuelBar,
  rally: paintRallyBar,
  night: paintNightBar,
}

const cache = new Map<string, BakedFace>()
const CACHE_LIMIT = 64
/** How many faces were baked - for the e2e that checks a value change does not rebake. */
let bakes = 0
export const bakeCount = () => bakes

export function faceKey(
  style: InstrumentStyle,
  kind: InstrumentKind,
  width: number,
  height: number,
  props: InstrumentProps,
  calibrationPoints: CalibrationPoint[],
  ground: string,
  direction = "",
): string {
  return JSON.stringify([style, kind, width, height, direction, props.scale ?? null, props.zones ?? null, props.caption ?? "", props.unit ?? "", calibrationPoints, ground])
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt((hex || "#ffffff").replace("#", "").slice(0, 6).padEnd(6, "f"), 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

/**
 * The baked face of a styled gauge `size` × `size`, or null while the style
 * typefaces are still loading (`onReady` asks for a redraw then).
 */
export function bakedGaugeFace(
  properties: Record<string, any>,
  size: number,
  ground: string,
  onReady?: () => void,
): BakedFace | null {
  const props = normalizeInstrument(properties)
  if (!props.style) return null
  if (!instrumentFontsReady(onReady)) return null
  const calibrationPoints: CalibrationPoint[] = properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const key = faceKey(props.style, "gauge", size, size, props, calibrationPoints, ground)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const scale = instrumentScale(calibrationPoints, props, scaleLengthPx(props.style, "gauge", size, size))
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.save()
  ctx.scale(size / 200, size / 200)
  ;(GAUGE_PAINTERS[props.style] ?? paintFuelGauge)(ctx, scale, props)
  ctx.restore()
  settle565(ctx, size, size, hexToRgb(ground))
  bakes++
  const face = { canvas, scale, key }
  cache.set(key, face)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return face
}

/**
 * The baked face of a styled bar `width` x `height`, running its
 * `direction`, or null while the style typefaces load.
 */
export function bakedBarFace(
  properties: Record<string, any>,
  width: number,
  height: number,
  ground: string,
  onReady?: () => void,
): BakedFace | null {
  const props = normalizeInstrument(properties)
  if (!props.style) return null
  if (!instrumentFontsReady(onReady)) return null
  const calibrationPoints: CalibrationPoint[] = properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const direction = (properties.direction as BarDirection | undefined) ?? "left-to-right"
  const key = faceKey(props.style, "bar", width, height, props, calibrationPoints, ground, direction)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const frame = barFrame(width, height, direction, STYLE_META[props.style].barTrack)
  const scale = instrumentScale(calibrationPoints, props, frame.to - frame.from)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ;(BAR_PAINTERS[props.style] ?? paintFuelBar)(ctx, scale, props, frame, width, height)
  settle565(ctx, width, height, hexToRgb(ground))
  bakes++
  const face = { canvas, scale, key }
  cache.set(key, face)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return face
}
