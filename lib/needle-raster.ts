/**
 * The moving part of a styled gauge or bar - its needle, pointer, cap -
 * drawn into an RGB565 picture the way every device draws it
 * (docs/2026-11-23-instrument-styles.md, «Two layers»; device contract
 * §2.15 once exported).
 *
 * Like lib/arc-raster.ts and lib/polygon-raster.ts this exists once per
 * platform - here, in each firmware (src/project/NeedleRaster), in the
 * Android app (NeedleRaster.kt) - and every copy has to arrive at the same
 * pixels, so it is integer arithmetic throughout:
 *
 * - Coordinates are eighths of a pixel, in the object's own box.
 * - Rotation uses the shared sine table through arcDirection(): angles in
 *   1/64 degree, 0 = up, clockwise. A point is turned about the pivot and
 *   rounded to the nearest eighth: (v + 8192) >> 14.
 * - A body (no `soft`) is filled with 4 × 4 sub-samples per pixel: polygons
 *   by fillPolygon(), circles and rings sampled the same way. Its alpha is
 *   `alpha` × coverage / 16.
 * - A soft layer (glow, shadow) is a field around its shapes: a pixel whose
 *   centre lies inside takes soft[0], one up to k whole pixels outside takes
 *   soft[k], beyond the table nothing - the rule lib/level-glow.ts uses for a
 *   level's glow, compared as squared distances so nothing is rooted.
 *   Polygons of a soft layer must be convex.
 * - Every pixel is mixed into what already lies there with blend565().
 *
 * Shapes are given in their rest pose: a rotating layer pointing up (angle
 * 0), a moving layer at position 0. `dx`/`dy` is added after turning, so a
 * shadow falls the same way whatever the angle.
 */
import { arcDirection } from "@/lib/arc-raster"
import { blend565 } from "@/lib/level-glow"
import { fillPolygon, type Point8 } from "@/lib/polygon-raster"

export type NeedleShape = { poly: [number, number][] } | { circle: [number, number, number] | [number, number, number, number] }

export interface NeedleLayer {
  /** How the layer follows the value: turned about the pivot, shifted along the scale, or not at all. */
  motion: "rotate" | "translate" | "static"
  shapes: NeedleShape[]
  /** RGB565, packed (r << 11 | g << 5 | b). */
  color: number
  /** Body opacity out of 256. Ignored for a soft layer, whose table carries it. */
  alpha: number
  /** Soft field: alpha out of 256 inside (index 0) and k whole pixels outside (index k). */
  soft?: number[]
  /** Eighths, added after turning. */
  dx?: number
  dy?: number
}

export interface NeedleDescription {
  /** Eighths, in the object's box: what a rotating layer turns about. */
  pivot: { x: number; y: number }
  layers: NeedleLayer[]
}

export interface NeedlePose {
  /** 1/64 degree, 0 = up, clockwise (rotating layers). */
  angle64: number
  /** Eighths (translating layers). */
  shiftX: number
  shiftY: number
}

/** An RGB565 picture to draw into. */
export interface Rgb565Target {
  width: number
  height: number
  get(x: number, y: number): number
  set(x: number, y: number, c: number): void
}

const unpack = (c: number) => ({ r: (c >> 11) & 31, g: (c >> 5) & 63, b: c & 31 })
const pack = (c: { r: number; g: number; b: number }) => (c.r << 11) | (c.g << 5) | c.b

function blendAt(t: Rgb565Target, x: number, y: number, color: number, alpha: number) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= t.width || y >= t.height) return
  if (alpha >= 256) {
    t.set(x, y, color)
    return
  }
  t.set(x, y, pack(blend565(unpack(t.get(x, y)), unpack(color), alpha)))
}

/** Turns (x, y) about the pivot by the direction (S, C) = (sin, cos) × 16384, rounding to the nearest eighth. */
function turn(x: number, y: number, px: number, py: number, s: number, c: number): [number, number] {
  const rx = x - px
  const ry = y - py
  return [px + ((rx * c - ry * s + 8192) >> 14), py + ((rx * s + ry * c + 8192) >> 14)]
}

type Placed =
  | { poly: Point8[] }
  | { cx: number; cy: number; r: number; rIn: number }

function place(shape: NeedleShape, layer: NeedleLayer, desc: NeedleDescription, pose: NeedlePose): Placed {
  const dx = (layer.dx ?? 0) + (layer.motion === "translate" ? pose.shiftX : 0)
  const dy = (layer.dy ?? 0) + (layer.motion === "translate" ? pose.shiftY : 0)
  let s = 0
  let c = 16384
  if (layer.motion === "rotate") {
    const d = arcDirection(pose.angle64)
    s = d.x
    c = -d.y
  }
  const at = (x: number, y: number): [number, number] => {
    const [tx, ty] = layer.motion === "rotate" ? turn(x, y, desc.pivot.x, desc.pivot.y, s, c) : [x, y]
    return [tx + dx, ty + dy]
  }
  if ("poly" in shape) return { poly: shape.poly.map(([x, y]) => at(x, y)).map(([x, y]) => ({ x, y })) }
  const [cx, cy, r, rIn = 0] = shape.circle
  const [tx, ty] = at(cx, cy)
  return { cx: tx, cy: ty, r, rIn }
}

/** Coverage of pixel (px, py) by a circle/ring, out of 16 sub-samples at eighths 1, 3, 5, 7. */
function circleCoverage(px: number, py: number, cx: number, cy: number, r: number, rIn: number): number {
  const r2 = r * r
  const i2 = rIn * rIn
  let n = 0
  for (let sy = 0; sy < 4; sy++) {
    const dy = py * 8 + 1 + sy * 2 - cy
    for (let sx = 0; sx < 4; sx++) {
      const dx = px * 8 + 1 + sx * 2 - cx
      const d2 = dx * dx + dy * dy
      if (d2 <= r2 && (rIn === 0 || d2 >= i2)) n++
    }
  }
  return n
}

/** floor(√n) for a non-negative integer, without floating point. */
export function isqrt(n: number): number {
  if (n < 2) return n
  let x = n
  let y = Math.floor((x + 1) / 2)
  while (y < x) {
    x = y
    y = Math.floor((x + Math.floor(n / x)) / 2)
  }
  return x
}

/** Squared distance, in eighths², from the point to a convex polygon; 0 inside. */
function polyDistance2(x: number, y: number, pts: Point8[]): number {
  const n = pts.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    area += a.x * b.y - b.x * a.y
  }
  const sign = area >= 0 ? 1 : -1
  let inside = true
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const wx = x - a.x
    const wy = y - a.y
    const cross = vx * wy - vy * wx
    if (cross * sign < 0) inside = false
    const len2 = vx * vx + vy * vy
    const dot = wx * vx + wy * vy
    let d2: number
    if (len2 === 0 || dot <= 0) d2 = wx * wx + wy * wy
    else if (dot >= len2) {
      const ex = x - b.x
      const ey = y - b.y
      d2 = ex * ex + ey * ey
    } else d2 = Math.floor((cross * cross) / len2)
    if (d2 < best) best = d2
  }
  return inside ? 0 : best
}

function bounds(p: Placed, reach8: number): { x0: number; y0: number; x1: number; y1: number } {
  let minX: number, minY: number, maxX: number, maxY: number
  if ("poly" in p) {
    minX = Math.min(...p.poly.map((q) => q.x))
    maxX = Math.max(...p.poly.map((q) => q.x))
    minY = Math.min(...p.poly.map((q) => q.y))
    maxY = Math.max(...p.poly.map((q) => q.y))
  } else {
    minX = p.cx - p.r
    maxX = p.cx + p.r
    minY = p.cy - p.r
    maxY = p.cy + p.r
  }
  return {
    x0: Math.floor((minX - reach8) / 8),
    y0: Math.floor((minY - reach8) / 8),
    x1: Math.floor((maxX + reach8) / 8),
    y1: Math.floor((maxY + reach8) / 8),
  }
}

function drawSoft(t: Rgb565Target, p: Placed, layer: NeedleLayer) {
  const soft = layer.soft!
  const levels = soft.length - 1
  const b = bounds(p, levels * 8 + 8)
  for (let y = Math.max(0, b.y0); y <= Math.min(t.height - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(t.width - 1, b.x1); x++) {
      const cx = x * 8 + 4
      const cy = y * 8 + 4
      let d2: number
      if ("poly" in p) d2 = polyDistance2(cx, cy, p.poly)
      else {
        const ddx = cx - p.cx
        const ddy = cy - p.cy
        const dc2 = ddx * ddx + ddy * ddy
        if (dc2 <= p.r * p.r && (p.rIn === 0 || dc2 >= p.rIn * p.rIn)) d2 = 0
        else {
          // Outside a ring's outer edge or inside its hole: distance to the nearer circle.
          const dc = isqrt(dc2)
          const out = dc - p.r
          const inn = p.rIn - dc
          const e = p.rIn > 0 && dc2 < p.rIn * p.rIn ? inn : out
          d2 = e > 0 ? e * e : 0
        }
      }
      let k = 0
      if (d2 > 0) {
        k = levels + 1
        for (let j = 1; j <= levels; j++) {
          if (d2 < j * 8 * (j * 8)) {
            k = j
            break
          }
        }
      }
      if (k <= levels) blendAt(t, x, y, layer.color, soft[k])
    }
  }
}

function drawBody(t: Rgb565Target, p: Placed, layer: NeedleLayer) {
  const a = Math.max(0, Math.min(256, layer.alpha))
  if ("poly" in p) {
    fillPolygon(p.poly, 0, t.height - 1, {
      fullRun: (y, x0, x1) => {
        for (let x = x0; x <= x1; x++) blendAt(t, x, y, layer.color, a)
      },
      partial: (y, x, cov) => blendAt(t, x, y, layer.color, (a * cov + 8) >> 4),
    })
    return
  }
  const b = bounds(p, 0)
  for (let y = Math.max(0, b.y0); y <= Math.min(t.height - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(t.width - 1, b.x1); x++) {
      const cov = circleCoverage(x, y, p.cx, p.cy, p.r, p.rIn)
      if (cov > 0) blendAt(t, x, y, layer.color, cov === 16 ? a : (a * cov + 8) >> 4)
    }
  }
}

/** Draws every layer of `desc` in `pose` into `t`, back to front. */
export function drawNeedle(t: Rgb565Target, desc: NeedleDescription, pose: NeedlePose): void {
  for (const layer of desc.layers) {
    for (const shape of layer.shapes) {
      const p = place(shape, layer, desc, pose)
      if (layer.soft && layer.soft.length) drawSoft(t, p, layer)
      else drawBody(t, p, layer)
    }
  }
}

/** The angle a gauge needle stands at, in 1/64 degree, rounded half up - the one rounding every platform makes. */
export function angle64Of(degrees: number): number {
  return Math.floor(degrees * 64 + 0.5)
}

/** A picture of `width` × `height` RGB565 pixels filled with `ground`, for tests and baking. */
export function rgb565Picture(width: number, height: number, ground = 0): Rgb565Target & { pixels: Uint16Array } {
  const pixels = new Uint16Array(width * height).fill(ground)
  return {
    width,
    height,
    pixels,
    get: (x, y) => pixels[y * width + x],
    set: (x, y, c) => {
      pixels[y * width + x] = c
    },
  }
}
