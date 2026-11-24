/**
 * Each style's moving part as a needle description (lib/needle-raster.ts),
 * at an object's pixel size. Drawn from the proposals' needles in their
 * 200-unit box (artifact «Instrumentenkabinett»), scaled to the object and
 * put on the eighth-pixel grid here, once - a device receives the result
 * and never needs this file.
 */
import { angle64Of, type FillGrow, type NeedleDescription, type NeedleLayer } from "@/lib/needle-raster"
import { barFrame, STYLE_META, type BarDirection, type BarFrame, type InstrumentStyle } from "@/lib/instrument"
import { NIGHT_BAR_LIGHT, NIGHT_LIGHT, NIGHT_NEEDLE, NIGHT_RING } from "@/components/canvas/instrument-faces/night"
import { RALLY_BAR_FILL, RALLY_ORANGE } from "@/components/canvas/instrument-faces/rally"

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

/** The rally gauge: a broad orange needle with a hard shadow, a black cap with an orange dot. */
function rallyGauge(size: number): NeedleDescription {
  const body: [number, number][] = [
    [96.3, 114],
    [103.7, 114],
    [101.3, 20],
    [98.7, 20],
  ]
  const shadowPx = Math.max(1, Math.round((2 * size) / 200))
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes: [poly(body, size)], color: 0, alpha: 256, soft: softTable(190, shadowPx), dy: e8(3, size) },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565(RALLY_ORANGE), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 14, size)], color: hex565("#333333"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 12, size)], color: hex565("#1c1c1c"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 3.5, size)], color: hex565(RALLY_ORANGE), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/**
 * The night cluster: the ring's light grows to the value - a band with
 * round ends, red to orange across the face, glowing - and a slim
 * light-guide needle glows over it.
 */
function nightGauge(size: number): NeedleDescription {
  const m = STYLE_META.night
  const ring = {
    arc: [e8(NIGHT_RING.r, size), e8(NIGHT_RING.width / 2, size), angle64Of(m.sweepFrom), angle64Of(m.sweepTo)] as [number, number, number, number],
  }
  const x0 = Math.floor(((100 - NIGHT_RING.r - NIGHT_RING.width / 2) * size) / 200)
  const x1 = Math.ceil(((100 + NIGHT_RING.r + NIGHT_RING.width / 2) * size) / 200)
  const gradient = { to: hex565(NIGHT_LIGHT.to), axis: "x" as const, start: x0, length: Math.max(1, x1 - x0) }
  const glowPx = Math.max(1, Math.round((4 * size) / 200))
  const body: [number, number][] = [
    [98.4, 69],
    [101.6, 69],
    [100.5, 15],
    [99.5, 15],
  ]
  const layers: NeedleLayer[] = [
    { motion: "fill", shapes: [ring], color: hex565(NIGHT_LIGHT.from), alpha: 256, soft: softTable(130, glowPx), gradient },
    { motion: "fill", shapes: [ring], color: hex565(NIGHT_LIGHT.from), alpha: 256, gradient },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565(NIGHT_NEEDLE), alpha: 256, soft: softTable(140, glowPx) },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565(NIGHT_NEEDLE), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/**
 * The gauge needle of a style on a square object `size` pixels across.
 * Styles without their own needle yet fall back to the fuel gauge's - until
 * their task draws them (tasks/instrument-styles-todo.md).
 */
export function gaugeNeedle(style: InstrumentStyle, size: number): NeedleDescription {
  switch (style) {
    case "rally":
      return rallyGauge(size)
    case "night":
      return nightGauge(size)
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

/** The fill's full rectangle between depths d0 and d1, in eighths, the way it grows, and its travel. */
function fillRect(f: BarFrame, direction: BarDirection | undefined, d0: number, d1: number) {
  const [ax, ay] = f.point(0, d0)
  const [bx, by] = f.point(1, d1)
  const X0 = Math.round(Math.min(ax, bx) * 8)
  const X1 = Math.round(Math.max(ax, bx) * 8)
  const Y0 = Math.round(Math.min(ay, by) * 8)
  const Y1 = Math.round(Math.max(ay, by) * 8)
  const dir = direction ?? "left-to-right"
  const grow: FillGrow = dir === "left-to-right" ? "right" : dir === "right-to-left" ? "left" : dir === "top-to-bottom" ? "down" : "up"
  const travelX = grow === "right" ? X1 - X0 : grow === "left" ? X0 - X1 : 0
  const travelY = grow === "down" ? Y1 - Y0 : grow === "up" ? Y0 - Y1 : 0
  return { rect: [X0, Y0, X1, Y1] as [number, number, number, number], grow, travelX, travelY }
}

/** The rally bar: the orange fill, cut into twenty by black stripes that stand still over it. */
function rallyBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const fill = fillRect(f, direction, RALLY_BAR_FILL.from, RALLY_BAR_FILL.to)
  const [X0, Y0, X1, Y1] = fill.rect
  const stripe = Math.max(8, Math.round((f.thickness * 2 * 8) / 110))
  const stripes: { rect: [number, number, number, number] }[] = []
  for (let i = 1; i < 20; i++) {
    if (f.vertical) {
      const y = Math.round(Y0 + ((Y1 - Y0) * i) / 20 - stripe / 2)
      stripes.push({ rect: [X0, y, X1, y + stripe] })
    } else {
      const x = Math.round(X0 + ((X1 - X0) * i) / 20 - stripe / 2)
      stripes.push({ rect: [x, Y0, x + stripe, Y1] })
    }
  }
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: hex565(RALLY_ORANGE), alpha: 256 },
    { motion: "static", shapes: stripes, color: hex565("#0d0d0d"), alpha: 256 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: fill.travelX, travelY: fill.travelY }
}

/** The night strip: a thin light, red to orange along the scale, glowing. */
function nightBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const fill = fillRect(f, direction, NIGHT_BAR_LIGHT.from, NIGHT_BAR_LIGHT.to)
  const [X0, Y0, X1, Y1] = fill.rect
  // The gradient runs from the start of the scale to its end, whichever way that is.
  const reversed = fill.grow === "left" || fill.grow === "up"
  const axis = f.vertical ? ("y" as const) : ("x" as const)
  const start = Math.floor((f.vertical ? Y0 : X0) / 8)
  const length = Math.max(1, Math.ceil((f.vertical ? Y1 : X1) / 8) - start)
  const from = hex565(reversed ? NIGHT_LIGHT.to : NIGHT_LIGHT.from)
  const gradient = { to: hex565(reversed ? NIGHT_LIGHT.from : NIGHT_LIGHT.to), axis, start, length }
  const glowPx = Math.max(1, Math.round(f.thickness * 0.03))
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: from, alpha: 256, soft: softTable(130, glowPx), gradient },
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: from, alpha: 256, gradient },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: fill.travelX, travelY: fill.travelY }
}

/**
 * A styled bar's moving part, `width` × `height` running `direction`: a
 * pointer given at position 0 and moved along the scale by the needle
 * raster's translate, or a fill that grows to the value.
 */
export function barNeedle(style: InstrumentStyle, width: number, height: number, direction: BarDirection | undefined): BarNeedle {
  const f = barFrame(width, height, direction, STYLE_META[style].barTrack)
  if (style === "rally") return rallyBar(f, direction)
  if (style === "night") return nightBar(f, direction)
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
