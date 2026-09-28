/**
 * A level's fill as a gradient, and the weak glow around it - the look a
 * theme gives a bar, slider, gauge or dial whose fill is its accent
 * (lib/themes.ts withLevelLook; the user's choice on 2026-09-28, after the
 * competition showed a ring like it).
 *
 * Like lib/arc-raster.ts and lib/pill-raster.ts this exists once per
 * platform - here, in each firmware, in the Android app - and every copy has
 * to arrive at the same pixels, so all of it is integer arithmetic on the
 * RGB565 channels the devices' framebuffers hold.
 *
 * The glow is not painted in a colour of its own: it is mixed into whatever
 * already stands on the screen where it falls - the screen's colour, an icon
 * behind the control, another control (the user: "ein pixel gehört dann
 * nicht mehr nur einem control"). Every renderer draws back to front into a
 * buffer, so when the level's turn comes, what lies under it is already
 * there to be read. It stays inside the object's own box, so a redraw of
 * anything under it redraws the level as well and the glow lands again.
 */

import type { Rgb565 } from "@/lib/arc-raster"

/** How far the glow reaches beyond the band, in whole pixels (the "weak" glow). */
export const GLOW_LEVELS = 8

/**
 * How strongly the glow is mixed in, out of 256, by how many pixels away
 * from the band the pixel lies: index 1 touches the band, 8 is the last.
 * Index 0 is "no glow".
 */
export const GLOW_ALPHA: readonly number[] = [0, 128, 100, 76, 56, 40, 26, 15, 7]

/** `col` over `dst` at `alpha`/256, rounded, per 5/6/5 channel. */
export function blend565(dst: Rgb565, col: Rgb565, alpha: number): Rgb565 {
  const mix = (d: number, c: number) => (d * (256 - alpha) + c * alpha + 128) >> 8
  return { r: mix(dst.r, col.r), g: mix(dst.g, col.g), b: mix(dst.b, col.b) }
}

/**
 * Step `step` of `steps` between two colours, taken at the middle of the
 * step: (2*step + 1) / (2*steps) of the way from `from` to `to`. Every
 * operand non-negative, so the division floors on every platform alike.
 */
export function gradient565(from: Rgb565, to: Rgb565, step: number, steps: number): Rgb565 {
  const s = Math.max(0, Math.min(steps - 1, step))
  const w = 2 * s + 1
  const n = 2 * steps
  const at = (a: number, b: number) => Math.floor((a * (n - w) + b * w + steps) / n)
  return { r: at(from.r, to.r), g: at(from.g, to.g), b: at(from.b, to.b) }
}

/** An 8-bit pixel as the device's framebuffer holds it: bits thrown away, not rounded. */
export function rgb565FromBytes(r: number, g: number, b: number): Rgb565 {
  return { r: r >> 3, g: g >> 2, b: b >> 3 }
}

/**
 * The glow level of a point from its squared distance to the band, given the
 * band's half width: 1 inside or touching, up to GLOW_LEVELS, 0 beyond.
 * Everything in 1/8 pixel, compared as squares, so nothing is rooted.
 */
export function glowLevelFromDistance2(d2: number, halfWidth: number): number {
  if (d2 < halfWidth * halfWidth) return 1
  for (let k = 1; k <= GLOW_LEVELS; k++) {
    const r = halfWidth + k * 8
    if (d2 < r * r) return k
  }
  return 0
}

/** Squared distance from (x, y) to the segment (ax, ay)-(bx, by), all integers. */
export function segmentDistance2(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const wx = x - ax
  const wy = y - ay
  const len2 = vx * vx + vy * vy
  const dot = wx * vx + wy * vy
  if (len2 === 0 || dot <= 0) return wx * wx + wy * wy
  if (dot >= len2) {
    const ex = x - bx
    const ey = y - by
    return ex * ex + ey * ey
  }
  // Axis-aligned only (a bar's centre line): the perpendicular distance is
  // the other coordinate's, exact without division.
  if (vx === 0) return wx * wx
  if (vy === 0) return wy * wy
  // Not used by any caller; kept exact by staying in rationals.
  const cross = wx * vy - wy * vx
  return Math.floor((cross * cross) / len2)
}

/** How far a level's glow reaches, in pixels, from its `glow` property (set by the theme). */
export function levelGlowPx(properties: Record<string, any>): number {
  const g = Math.trunc(Number(properties.glow))
  return Number.isFinite(g) && g > 0 ? Math.min(g, GLOW_LEVELS) : 0
}
