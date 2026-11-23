/**
 * Each style's moving part as a needle description (lib/needle-raster.ts),
 * at an object's pixel size. Drawn from the proposals' needles in their
 * 200-unit box (artifact «Instrumentenkabinett»), scaled to the object and
 * put on the eighth-pixel grid here, once - a device receives the result
 * and never needs this file.
 */
import type { NeedleDescription, NeedleLayer } from "@/lib/needle-raster"
import { barFrame, STYLE_META, type BarDirection, type InstrumentStyle } from "@/lib/instrument"

/** RGB565 from "#rrggbb", bits dropped as the framebuffers drop them. */
export function hex565(hex: string): number {
  const v = parseInt(hex.replace("#", ""), 16)
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
}

/** A 200-unit length on an object `size` pixels across, in eighths of a pixel. */
const e8 = (units: number, size: number) => Math.round((units * size * 8) / 200)

/** A soft edge `px` pixels wide whose inside is `inner`/256, fading linearly. */
export function softTable(inner: number, px: number): number[] {
  const out = [inner]
  for (let k = 1; k <= px; k++) out.push(Math.round((inner * (px + 1 - k)) / (px + 1)))
  return out
}

function poly(points: [number, number][], size: number): { poly: [number, number][] } {
  return { poly: points.map(([x, y]) => [e8(x, size), e8(y, size)]) }
}
function circle(cx: number, cy: number, r: number, size: number, rIn = 0) {
  return { circle: [e8(cx, size), e8(cy, size), e8(r, size), e8(rIn, size)] as [number, number, number, number] }
}

/** The fuel gauge: a broad white needle about a low pivot, its shadow, a black cap. */
function fuelGauge(size: number): NeedleDescription {
  const body: [number, number][] = [
    [96.8, 162],
    [103.2, 162],
    [101.5, 68],
    [98.5, 68],
  ]
  const shadowPx = Math.max(1, Math.round((1.8 * size) / 200))
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes: [poly(body, size)], color: 0, alpha: 256, soft: softTable(180, shadowPx), dy: e8(3, size) },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565("#f4f4f4"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 150, 13, size)], color: hex565("#1c1c1c"), alpha: 256 },
    { motion: "static", shapes: [circle(97, 146, 5, size)], color: hex565("#5a5a5a"), alpha: 90, soft: undefined },
  ]
  return { pivot: { x: e8(100, size), y: e8(150, size) }, layers }
}

/**
 * The gauge needle of a style on a square object `size` pixels across.
 * Styles without their own needle yet fall back to the fuel gauge's - until
 * their task draws them (tasks/instrument-styles-todo.md).
 */
export function gaugeNeedle(style: InstrumentStyle, size: number): NeedleDescription {
  switch (style) {
    case "fuel":
    default:
      return fuelGauge(size)
  }
}

export interface BarNeedle {
  desc: NeedleDescription
  /** Where the pointer moves at full scale, in eighths: shift = at × travel. */
  travelX: number
  travelY: number
}

/**
 * A styled bar's pointer, `width` × `height` running `direction`: given at
 * position 0, moved along the scale by the needle raster's translate.
 */
export function barNeedle(style: InstrumentStyle, width: number, height: number, direction: BarDirection | undefined): BarNeedle {
  const f = barFrame(width, height, direction, STYLE_META[style].barTrack)
  const T = f.thickness
  const q = (at: number, d: number, alongPx = 0): [number, number] => {
    // `alongPx` nudges along the scale (for the triangle's base), whichever way it runs.
    const [x, y] = f.point(at, d)
    const [x1, y1] = f.point(at + 0.001, d)
    const len = Math.hypot(x1 - x, y1 - y) || 1
    return [Math.round((x + ((x1 - x) / len) * alongPx) * 8), Math.round((y + ((y1 - y) / len) * alongPx) * 8)]
  }
  const half = T * 0.07
  const triangle: [number, number][] = [q(0, 0.47), q(0, 0.35, -half), q(0, 0.35, half)]
  const [x0, y0] = f.point(0, 0)
  const [x1, y1] = f.point(1, 0)
  const shadowPx = Math.max(1, Math.round(T * 0.015))
  const layers: NeedleLayer[] = [
    { motion: "translate", shapes: [{ poly: triangle }], color: 0, alpha: 256, soft: softTable(170, shadowPx), dy: Math.max(8, Math.round(T * 0.02 * 8)) },
    { motion: "translate", shapes: [{ poly: triangle }], color: hex565("#f4f4f4"), alpha: 256 },
  ]
  return {
    desc: { pivot: { x: 0, y: 0 }, layers },
    travelX: Math.round((x1 - x0) * 8),
    travelY: Math.round((y1 - y0) * 8),
  }
}
