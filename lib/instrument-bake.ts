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
import { NIGHT_FONT, NIGHT_GAUGE_READOUT, nightBarReadout } from "@/components/canvas/instrument-faces/night"
import { paintVfdBar, paintVfdGauge, VFD_CYAN, VFD_FONT, VFD_GAUGE_READOUT, vfdBarReadout } from "@/components/canvas/instrument-faces/vfd"
import { grey565, hex565 } from "@/lib/instrument-needles"
import { paintPressureBar, paintPressureGauge } from "@/components/canvas/instrument-faces/pressure"
import { paintCoilBar, paintCoilGauge } from "@/components/canvas/instrument-faces/coil"
import { paintDecoBar, paintDecoGauge } from "@/components/canvas/instrument-faces/deco"
import { paintRoadsterBar, paintRoadsterGauge } from "@/components/canvas/instrument-faces/roadster"
import { paintCockpitBar, paintCockpitGauge } from "@/components/canvas/instrument-faces/cockpit"
import { paintBlueredBar, paintBlueredGauge } from "@/components/canvas/instrument-faces/bluered"
import { paintEngravingBar, paintEngravingGauge } from "@/components/canvas/instrument-faces/engraving"
import { bakeReadoutStrip, drawReadout, unlitPattern, type ReadoutDescription, type ReadoutStrip } from "@/lib/instrument-readout"
import type { Rgb565Target } from "@/lib/needle-raster"
import { barFrame, STYLE_META, type BarDirection, type BarFrame } from "@/lib/instrument"

export type InstrumentKind = "gauge" | "bar"

export interface BakedFace {
  canvas: HTMLCanvasElement
  scale: InstrumentScale
  key: string
  /** The digital readout, where the style has one and it is on: where it goes, and its baked characters. */
  readout?: { desc: Omit<ReadoutDescription, "glyphs">; strip: ReadoutStrip }
}

/** Where a style's readout goes and how it looks, in the object's pixels; null for a style without one. */
interface ReadoutLayout {
  x: number
  /** The text's middle line. */
  y: number
  px: number
  align: "right" | "center"
  glow: number
  font: (px: number) => string
  color: string
  /** The unlit segments behind it, as a VFD has them. */
  unlit: boolean
}

function readoutLayout(style: InstrumentStyle, kind: InstrumentKind, size: number, frame: BarFrame | null, width: number): ReadoutLayout | null {
  const k = size / 200
  if (style === "vfd") {
    const r = kind === "gauge" ? { ...VFD_GAUGE_READOUT, x: VFD_GAUGE_READOUT.x * k, y: VFD_GAUGE_READOUT.y * k, px: VFD_GAUGE_READOUT.px * k, glow: VFD_GAUGE_READOUT.glow * k, align: "right" as const } : vfdBarReadout(frame!, width)
    return { ...r, font: VFD_FONT, color: VFD_CYAN, unlit: true }
  }
  if (style === "night") {
    const r = kind === "gauge" ? { x: NIGHT_GAUGE_READOUT.x * k, y: NIGHT_GAUGE_READOUT.y * k, px: NIGHT_GAUGE_READOUT.px * k, glow: 0, align: "center" as const } : nightBarReadout(frame!, width)
    return { ...r, font: NIGHT_FONT, color: "#f2f4f7", unlit: false }
  }
  return null
}

const strips = new Map<string, ReadoutStrip>()

/** The readout of a face being baked, with its unlit pattern laid into the face's pixels. */
function bakeReadout(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: ReadoutLayout,
  props: InstrumentProps,
  calibrationPoints: CalibrationPoint[],
  colorDepth: string,
): BakedFace["readout"] {
  const px = Math.max(6, Math.round(layout.px))
  const font = layout.font(px)
  const glow = Math.round(layout.glow * 10) / 10
  const key = `${font}|${glow}`
  let strip = strips.get(key)
  if (!strip) {
    strip = bakeReadoutStrip(font, px, glow)
    strips.set(key, strip)
  }
  const decimals = props.scale?.decimals ?? 1
  const desc: Omit<ReadoutDescription, "glyphs"> = {
    chars: "0123456789.-",
    cells: strip.cells,
    pad: strip.pad,
    height: strip.height,
    x: Math.round(layout.x),
    y: Math.round(layout.y - strip.height / 2),
    align: layout.align,
    color: isGreyDepth(colorDepth) ? grey565(hex565(layout.color)) : hex565(layout.color),
    decimals,
  }
  if (layout.unlit) {
    const values = calibrationPoints.map((p) => p.value)
    const pattern = unlitPattern(Math.min(...values), Math.max(...values), decimals)
    const img = ctx.getImageData(0, 0, width, height)
    const d = img.data
    const target: Rgb565Target = {
      width,
      height,
      get: (x, y) => {
        const i = (y * width + x) * 4
        return ((d[i] >> 3) << 11) | ((d[i + 1] >> 2) << 5) | (d[i + 2] >> 3)
      },
      set: (x, y, c) => {
        const i = (y * width + x) * 4
        if (d[i + 3] === 0) return // nothing to light outside the face
        const r = (c >> 11) & 31
        const g = (c >> 5) & 63
        const b = c & 31
        d[i] = (r << 3) | (r >> 2)
        d[i + 1] = (g << 2) | (g >> 4)
        d[i + 2] = (b << 3) | (b >> 2)
      },
    }
    drawReadout(target, desc, strip, pattern, 20)
    ctx.putImageData(img, 0, 0)
  }
  return { desc, strip }
}

type Painter = (ctx: CanvasRenderingContext2D, scale: InstrumentScale, props: InstrumentProps) => void

/** Gauge painters by style. A style without its own yet is drawn as the fuel gauge until its task. */
const GAUGE_PAINTERS: Partial<Record<InstrumentStyle, Painter>> = {
  fuel: paintFuelGauge,
  rally: paintRallyGauge,
  night: paintNightGauge,
  vfd: paintVfdGauge,
  pressure: paintPressureGauge,
  coil: paintCoilGauge,
  deco: paintDecoGauge,
  engraving: paintEngravingGauge,
  roadster: paintRoadsterGauge,
  cockpit: paintCockpitGauge,
  bluered: paintBlueredGauge,
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
  vfd: paintVfdBar,
  pressure: paintPressureBar,
  coil: paintCoilBar,
  deco: paintDecoBar,
  engraving: paintEngravingBar,
  roadster: paintRoadsterBar,
  cockpit: paintCockpitBar,
  bluered: paintBlueredBar,
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
  colorDepth = "24bit",
): string {
  return JSON.stringify([style, kind, width, height, direction, props.scale ?? null, props.zones ?? null, props.caption ?? "", props.unit ?? "", props.readout ?? false, calibrationPoints, ground, colorDepth])
}

/** Whether a colour depth is a grey panel's (the PaperS3's sixteen greys). */
export const isGreyDepth = (colorDepth: string | undefined) => colorDepth === "4bit"

/**
 * A face for a panel of sixteen greys (decision 6: every style on e-paper,
 * converted): each drawn pixel's luminance - the weights
 * quantizeColorFor4Bit() uses - to the nearest of the sixteen, with
 * Floyd-Steinberg error diffusion as every other bitmap gets for a 4-bit
 * device (lib/asset-converter.ts), so a gradient keeps its shape. Pixels
 * the face leaves transparent stay so and take no error.
 */
function greyFace(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const work = new Float32Array(width * height)
  for (let i = 0; i < work.length; i++) work[i] = (77 * d[i * 4] + 150 * d[i * 4 + 1] + 29 * d[i * 4 + 2] + 128) >> 8
  const drawn = (i: number) => d[i * 4 + 3] !== 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!drawn(i)) continue
      const old = Math.max(0, Math.min(255, work[i]))
      const level = Math.round((old * 15) / 255)
      const grey = level * 17
      const err = old - grey
      if (x + 1 < width && drawn(i + 1)) work[i + 1] += (err * 7) / 16
      if (y + 1 < height) {
        if (x > 0 && drawn(i + width - 1)) work[i + width - 1] += (err * 3) / 16
        if (drawn(i + width)) work[i + width] += (err * 5) / 16
        if (x + 1 < width && drawn(i + width + 1)) work[i + width + 1] += err / 16
      }
      // As an RGB565 framebuffer holds that grey, and back to 8 bits.
      const r = grey >> 3
      const g = grey >> 2
      d[i * 4] = (r << 3) | (r >> 2)
      d[i * 4 + 1] = (g << 2) | (g >> 4)
      d[i * 4 + 2] = (r << 3) | (r >> 2)
    }
  }
  ctx.putImageData(img, 0, 0)
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
  colorDepth = "24bit",
): BakedFace | null {
  const props = normalizeInstrument(properties)
  if (!props.style) return null
  if (!instrumentFontsReady(onReady)) return null
  const calibrationPoints: CalibrationPoint[] = properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const key = faceKey(props.style, "gauge", size, size, props, calibrationPoints, ground, "", colorDepth)
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
  if (isGreyDepth(colorDepth)) greyFace(ctx, size, size)
  const layout = props.readout ? readoutLayout(props.style, "gauge", size, null, size) : null
  const readout = layout ? bakeReadout(ctx, size, size, layout, props, calibrationPoints, colorDepth) : undefined
  bakes++
  const face: BakedFace = { canvas, scale, key, readout }
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
  colorDepth = "24bit",
): BakedFace | null {
  const props = normalizeInstrument(properties)
  if (!props.style) return null
  if (!instrumentFontsReady(onReady)) return null
  const calibrationPoints: CalibrationPoint[] = properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const direction = (properties.direction as BarDirection | undefined) ?? "left-to-right"
  const key = faceKey(props.style, "bar", width, height, props, calibrationPoints, ground, direction, colorDepth)
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
  if (isGreyDepth(colorDepth)) greyFace(ctx, width, height)
  const layout = props.readout ? readoutLayout(props.style, "bar", 200, frame, width) : null
  const readout = layout ? bakeReadout(ctx, width, height, layout, props, calibrationPoints, colorDepth) : undefined
  bakes++
  const face: BakedFace = { canvas, scale, key, readout }
  cache.set(key, face)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return face
}
