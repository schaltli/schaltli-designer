/**
 * Each style's moving part as a needle description (lib/needle-raster.ts),
 * at an object's pixel size. Drawn from the proposals' needles in their
 * 200-unit box (artifact «Instrumentenkabinett»), scaled to the object and
 * put on the eighth-pixel grid here, once - a device receives the result
 * and never needs this file.
 */
import type { NeedleDescription, NeedleLayer } from "@/lib/needle-raster"
import type { InstrumentStyle } from "@/lib/instrument"

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
