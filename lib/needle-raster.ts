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
 *
 * A *fill* layer grows with the value instead of moving (a bar's fill, a
 * light ring):
 * - a `rect` grows from its start edge, `grow` naming the way: its moving
 *   edge stands at the start edge plus the pose's shift, held inside the
 *   rectangle. It is then a polygon like any other.
 * - an `arc` - a band of half width `hw` about a circle of radius `r`
 *   around the pivot, with round ends - runs from its `from` angle to the
 *   pose's angle, held inside `from`..`to`. In any other layer it runs
 *   `from`..`to`. A sub-sample is in the band when, inside the arc's
 *   sector, its squared distance from the pivot lies within
 *   (r - hw)² .. (r + hw)², or else when its squared distance to an end
 *   point is at most hw². An end point is r along the angle's direction,
 *   (r × d + 8192) >> 14. The soft field takes the distance to the band's
 *   centre line, rooted with isqrt(): inside the sector
 *   |isqrt(dist²) - r|, outside it isqrt of the squared distance to the
 *   nearer end point; less hw, that is the distance from the band.
 * - The sector test is integer: with u0, u1 the directions of the two
 *   angles and cross(a, b) = a.x·b.y - a.y·b.x, a point p is inside when
 *   cross(u0, p) ≥ 0 and cross(p, u1) ≥ 0 for a span up to 180°, and
 *   unless cross(u1, p) > 0 and cross(p, u0) > 0 for a longer one; a span
 *   of 0 or less draws nothing, 360° or more is the whole circle.
 *
 * A layer with a `gradient` takes its colour per pixel: gradient565() from
 * `color` to `gradient.to`, step (x or y) - start of `length` pixels.
 *
 * A *segments* layer holds still; each of its shapes carries a threshold
 * `t` (out of 4096) and is drawn only while the pose's `level` - the
 * position, floor(clamp(at, 0, 1) × 4096 + 0.5) - has reached it (a VFD's
 * bars). A shape without `t` is always drawn.
 */
import { arcDirection } from "@/lib/arc-raster"
import { blend565, gradient565 } from "@/lib/level-glow"
import { fillPolygon, type Point8 } from "@/lib/polygon-raster"

export type NeedleShape = (
  | { poly: [number, number][] }
  | { circle: [number, number, number] | [number, number, number, number] }
  /** x0, y0, x1, y1 (eighths): a rectangle; in a fill layer, at full scale. */
  | { rect: [number, number, number, number] }
  /** r, hw (eighths), from, to (1/64 degree, from < to): a band about the pivot with round ends. */
  | { arc: [number, number, number, number] }
) & {
  /** Segments layer: the level (out of 4096) from which the shape lights. */
  t?: number
}

/** The way a fill layer's rectangle grows from its start edge. */
export type FillGrow = "right" | "left" | "down" | "up"

export interface NeedleLayer {
  /** How the layer follows the value: turned about the pivot, shifted along the scale, or not at all. */
  motion: "rotate" | "translate" | "static" | "fill" | "segments"
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
  /** Fill layer: the way its rectangles grow (default "right"). */
  grow?: FillGrow
  /** Colour per pixel from `color` to `to`, step by step along x or y from `start` over `length` pixels. */
  gradient?: { to: number; axis: "x" | "y"; start: number; length: number }
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
  /** The position out of 4096 (segments layers); 0 when not given. */
  level?: number
}

/** A position 0..1 as a pose's level: floor(clamp(at, 0, 1) × 4096 + 0.5). */
export function levelOf(at: number): number {
  return Math.floor(Math.max(0, Math.min(1, at)) * 4096 + 0.5)
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

/** The colour of a layer at pixel (x, y). */
function colourAt(layer: NeedleLayer, x: number, y: number): number {
  const g = layer.gradient
  if (!g) return layer.color
  return pack(gradient565(unpack(layer.color), unpack(g.to), (g.axis === "y" ? y : x) - g.start, Math.max(1, g.length)))
}

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

type Arc = {
  cx: number
  cy: number
  r: number
  hw: number
  /** Span in 1/64 degree; the ends' directions (×16384) and points, relative to the centre. */
  span: number
  u0: { x: number; y: number }
  u1: { x: number; y: number }
  e0: { x: number; y: number }
  e1: { x: number; y: number }
}

type Placed = { poly: Point8[] } | { cx: number; cy: number; r: number; rIn: number } | { arc: Arc } | null

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function placeArc(shape: { arc: [number, number, number, number] }, layer: NeedleLayer, desc: NeedleDescription, pose: NeedlePose): Placed {
  const [r, hw, from, to] = shape.arc
  const end = layer.motion === "fill" ? clamp(pose.angle64, from, to) : to
  const span = end - from
  if (span <= 0) return null
  const u0 = arcDirection(from)
  const u1 = arcDirection(end)
  const along = (u: { x: number; y: number }) => ({ x: (r * u.x + 8192) >> 14, y: (r * u.y + 8192) >> 14 })
  return {
    arc: { cx: desc.pivot.x + (layer.dx ?? 0), cy: desc.pivot.y + (layer.dy ?? 0), r, hw, span, u0, u1, e0: along(u0), e1: along(u1) },
  }
}

function placeRect(shape: { rect: [number, number, number, number] }, layer: NeedleLayer, pose: NeedlePose): Placed {
  let [x0, y0, x1, y1] = shape.rect
  if (layer.motion === "fill") {
    switch (layer.grow ?? "right") {
      case "right":
        x1 = clamp(x0 + pose.shiftX, x0, x1)
        break
      case "left":
        x0 = clamp(x1 + pose.shiftX, x0, x1)
        break
      case "down":
        y1 = clamp(y0 + pose.shiftY, y0, y1)
        break
      case "up":
        y0 = clamp(y1 + pose.shiftY, y0, y1)
        break
    }
  } else if (layer.motion === "translate") {
    x0 += pose.shiftX
    x1 += pose.shiftX
    y0 += pose.shiftY
    y1 += pose.shiftY
  }
  if (x1 <= x0 || y1 <= y0) return null
  const dx = layer.dx ?? 0
  const dy = layer.dy ?? 0
  return {
    poly: [
      { x: x0 + dx, y: y0 + dy },
      { x: x1 + dx, y: y0 + dy },
      { x: x1 + dx, y: y1 + dy },
      { x: x0 + dx, y: y1 + dy },
    ],
  }
}

function place(shape: NeedleShape, layer: NeedleLayer, desc: NeedleDescription, pose: NeedlePose): Placed {
  if ("arc" in shape) return placeArc(shape, layer, desc, pose)
  if ("rect" in shape) return placeRect(shape, layer, pose)
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

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx

/** Whether (x, y), relative to the arc's centre, lies in its sector. */
function inSector(a: Arc, x: number, y: number): boolean {
  if (a.span >= 360 * 64) return true
  if (a.span <= 180 * 64) return cross(a.u0.x, a.u0.y, x, y) >= 0 && cross(x, y, a.u1.x, a.u1.y) >= 0
  return !(cross(a.u1.x, a.u1.y, x, y) > 0 && cross(x, y, a.u0.x, a.u0.y) > 0)
}

function endDistance2(a: Arc, x: number, y: number): number {
  const d0 = (x - a.e0.x) * (x - a.e0.x) + (y - a.e0.y) * (y - a.e0.y)
  const d1 = (x - a.e1.x) * (x - a.e1.x) + (y - a.e1.y) * (y - a.e1.y)
  return d0 < d1 ? d0 : d1
}

/** Whether the point (relative to the centre) lies in the band. */
function inArc(a: Arc, x: number, y: number): boolean {
  if (inSector(a, x, y)) {
    const d2 = x * x + y * y
    const lo = a.r - a.hw
    const hi = a.r + a.hw
    return d2 >= lo * lo && d2 <= hi * hi
  }
  return endDistance2(a, x, y) <= a.hw * a.hw
}

/** The distance from the band (eighths, 0 or less inside), for the soft field. */
function arcDistance(a: Arc, x: number, y: number): number {
  const centre = inSector(a, x, y) ? Math.abs(isqrt(x * x + y * y) - a.r) : isqrt(endDistance2(a, x, y))
  return centre - a.hw
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

function bounds(p: NonNullable<Placed>, reach8: number): { x0: number; y0: number; x1: number; y1: number } {
  let minX: number, minY: number, maxX: number, maxY: number
  if ("arc" in p) {
    const R = p.arc.r + p.arc.hw
    minX = p.arc.cx - R
    maxX = p.arc.cx + R
    minY = p.arc.cy - R
    maxY = p.arc.cy + R
  } else if ("poly" in p) {
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

function drawSoft(t: Rgb565Target, p: NonNullable<Placed>, layer: NeedleLayer) {
  const soft = layer.soft!
  const levels = soft.length - 1
  const b = bounds(p, levels * 8 + 8)
  for (let y = Math.max(0, b.y0); y <= Math.min(t.height - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(t.width - 1, b.x1); x++) {
      const cx = x * 8 + 4
      const cy = y * 8 + 4
      let d2: number
      if ("arc" in p) {
        const e = arcDistance(p.arc, cx - p.arc.cx, cy - p.arc.cy)
        d2 = e > 0 ? e * e : 0
      } else if ("poly" in p) d2 = polyDistance2(cx, cy, p.poly)
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
      if (k <= levels) blendAt(t, x, y, colourAt(layer, x, y), soft[k])
    }
  }
}

function drawBody(t: Rgb565Target, p: NonNullable<Placed>, layer: NeedleLayer) {
  const a = Math.max(0, Math.min(256, layer.alpha))
  if ("poly" in p) {
    fillPolygon(p.poly, 0, t.height - 1, {
      fullRun: (y, x0, x1) => {
        for (let x = x0; x <= x1; x++) blendAt(t, x, y, colourAt(layer, x, y), a)
      },
      partial: (y, x, cov) => blendAt(t, x, y, colourAt(layer, x, y), (a * cov + 8) >> 4),
    })
    return
  }
  const b = bounds(p, 0)
  if ("arc" in p) {
    const arc = p.arc
    for (let y = Math.max(0, b.y0); y <= Math.min(t.height - 1, b.y1); y++) {
      for (let x = Math.max(0, b.x0); x <= Math.min(t.width - 1, b.x1); x++) {
        let cov = 0
        for (let sy = 0; sy < 4; sy++) {
          const ry = y * 8 + 1 + sy * 2 - arc.cy
          for (let sx = 0; sx < 4; sx++) if (inArc(arc, x * 8 + 1 + sx * 2 - arc.cx, ry)) cov++
        }
        if (cov > 0) blendAt(t, x, y, colourAt(layer, x, y), cov === 16 ? a : (a * cov + 8) >> 4)
      }
    }
    return
  }
  for (let y = Math.max(0, b.y0); y <= Math.min(t.height - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(t.width - 1, b.x1); x++) {
      const cov = circleCoverage(x, y, p.cx, p.cy, p.r, p.rIn)
      if (cov > 0) blendAt(t, x, y, colourAt(layer, x, y), cov === 16 ? a : (a * cov + 8) >> 4)
    }
  }
}

/** Draws every layer of `desc` in `pose` into `t`, back to front. */
export function drawNeedle(t: Rgb565Target, desc: NeedleDescription, pose: NeedlePose): void {
  for (const layer of desc.layers) {
    for (const shape of layer.shapes) {
      if (layer.motion === "segments" && shape.t !== undefined && (pose.level ?? 0) < shape.t) continue
      const p = place(shape, layer, desc, pose)
      if (!p) continue
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
