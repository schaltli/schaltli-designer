/**
 * The shared rasterizer for arc-level objects - the one piece of this
 * feature that genuinely has to exist twice, here and in every firmware that
 * draws a ring. Everything in it is integer arithmetic, chosen so that the
 * two copies cannot produce different pixels.
 *
 * Why the trouble: a rounded corner is a few pixels of radius, and nobody
 * notices that Adafruit_GFX's midpoint circle has hard edges. A ring at
 * radius 168 has a long, shallow edge, and a hard edge there reads as
 * cheap - so an arc-level is anti-aliased. But anti-aliasing means
 * intermediate colours, and intermediate colours are exactly what this
 * project's verification method cannot tolerate drifting: the designer and
 * the device are compared pixel for pixel, with no tolerance, and that
 * comparison is what has found every real rendering bug so far.
 *
 * So the rules are fixed here rather than left to each side's maths library:
 *
 *   - Angles are whole 1/64 degrees, 0 at twelve o'clock, clockwise
 *     positive. Direction vectors come from the generated integer sine
 *     table (see scripts/gen-arc-sin-table.js), never from sin()/cos().
 *   - Sub-pixel positions live on a 1/8-pixel grid, so every coordinate is
 *     an integer and every radius comparison is an integer square.
 *   - "Is this sub-pixel inside the sector" is decided by the sign of a
 *     cross product. No atan2, nothing to round.
 *   - Coverage is a count out of 16, and colours are mixed in 5/6/5 space
 *     with an explicit rounding rule, because the device's framebuffer is
 *     RGB565 and mixing in 8-bit first would land a step or two away.
 *
 * The last one is worth spelling out. The designer has no RGB565 model at
 * all: it draws CSS colours and the device quantises them, and the pixel
 * comparison has stayed exact only because every colour in the test fixture
 * happens to survive the round trip (`#848284`, `#00fb00` - all 565-exact).
 * Anti-aliasing produces intermediate colours by definition, most of which
 * are not, so this file quantises before mixing and expands afterwards the
 * same way the firmware's BMP writer does.
 */

import { ARC_SIN_TABLE, ARC_SIN_SCALE } from "@/lib/arc-sin-table"

/** Angles are carried in 1/64 degree units. */
export const ARC_ANGLE_SCALE = 64
export const ARC_FULL_TURN = 360 * ARC_ANGLE_SCALE

/** Sub-pixel grid: 4x4 samples per pixel, positions on a 1/8-pixel lattice. */
export const ARC_SUBSAMPLES = 4
export const ARC_COVERAGE_MAX = ARC_SUBSAMPLES * ARC_SUBSAMPLES
export const ARC_SUBPIXEL_SCALE = 8

/**
 * A sector's two boundary rays, prepared once per band rather than per
 * sub-pixel. `wide` selects the union test: a sector wider than a half turn
 * is not the intersection of two half-planes but the union of them.
 */
export interface ArcSector {
  ux: number
  uy: number
  vx: number
  vy: number
  wide: boolean
  full: boolean
  empty: boolean
}

/**
 * Direction vector for an angle in 1/64 degrees, with 0 at twelve o'clock and
 * clockwise positive, in screen coordinates (y downwards).
 *
 * Angles between whole degrees are interpolated linearly between two table
 * entries instead of being looked up. That matters for the fill edge, which
 * has to move smoothly: a whole degree at radius 168 is nearly three pixels
 * of arc, so a table-only lookup would make the filled arc advance in
 * visible jumps. The lerp is not exactly on the unit circle, but only the
 * *direction* is ever used - it feeds cross products, whose sign is
 * unaffected by length - so the small shortening is harmless, and it is
 * identical on both sides, which is the only property that matters.
 *
 * The `>> 6` is a floor, identically in JS and in C++ (arithmetic shift on a
 * value that fits in int32), which is why the division is written as a shift
 * rather than as a divide: C++ integer division truncates toward zero and
 * would disagree with JS for negative values.
 */
export function arcDirection(angle64: number): { x: number; y: number } {
  let a = angle64 % ARC_FULL_TURN
  if (a < 0) a += ARC_FULL_TURN

  const deg = Math.floor(a / ARC_ANGLE_SCALE)
  const frac = a - deg * ARC_ANGLE_SCALE

  const sin0 = ARC_SIN_TABLE[deg]
  const sin1 = ARC_SIN_TABLE[(deg + 1) % 360]
  // cos(d) is sin(d + 90), so the same table serves both.
  const cos0 = ARC_SIN_TABLE[(deg + 90) % 360]
  const cos1 = ARC_SIN_TABLE[(deg + 91) % 360]

  const sinA = (sin0 * (ARC_ANGLE_SCALE - frac) + sin1 * frac + 32) >> 6
  const cosA = (cos0 * (ARC_ANGLE_SCALE - frac) + cos1 * frac + 32) >> 6

  // Twelve o'clock is straight up, which is -y on a screen.
  return { x: sinA, y: -cosA }
}

export function makeArcSector(startA64: number, sweepA64: number): ArcSector {
  if (sweepA64 <= 0) {
    return { ux: 0, uy: 0, vx: 0, vy: 0, wide: false, full: false, empty: true }
  }
  if (sweepA64 >= ARC_FULL_TURN) {
    return { ux: 0, uy: 0, vx: 0, vy: 0, wide: false, full: true, empty: false }
  }
  const u = arcDirection(startA64)
  const v = arcDirection(startA64 + sweepA64)
  return {
    ux: u.x,
    uy: u.y,
    vx: v.x,
    vy: v.y,
    wide: sweepA64 >= ARC_FULL_TURN / 2,
    full: false,
    empty: false,
  }
}

/**
 * Whether the point (x, y), given relative to the ring's centre in 1/8-pixel
 * units, lies inside the sector.
 *
 * cross(u, p) > 0 means p is clockwise of u, in a coordinate system with y
 * downwards. For a sector up to a half turn that gives an intersection -
 * clockwise of the start ray and not yet past the end ray. Beyond a half
 * turn the same two half-planes have to be unioned instead, which is the
 * whole reason `wide` exists.
 */
export function inArcSector(s: ArcSector, x: number, y: number): boolean {
  if (s.full) return true
  if (s.empty) return false
  const crossU = s.ux * y - s.uy * x
  const crossV = s.vx * y - s.vy * x
  return s.wide ? crossU >= 0 || crossV < 0 : crossU >= 0 && crossV < 0
}

/** How many of a pixel's 16 sub-samples fall in each band. */
export interface ArcPixelBands {
  fill: number
  track: number
  marker: number
}

export interface ArcRingGeometry {
  /** Side of the (square) object in pixels. */
  size: number
  /** Ring thickness in pixels, measured inwards from the object's edge. */
  thickness: number
  track: ArcSector
  fill: ArcSector
  marker: ArcSector
}

/**
 * Classifies one pixel's sub-samples.
 *
 * Bands are resolved per sub-sample rather than by rasterising each band
 * separately and blending the results in order. That ordering looks
 * equivalent and is not: where the fill's radial edge meets the ring's outer
 * edge, both bands have the same partial coverage, and compositing one over
 * the other leaves a seam of track colour that should not be there
 * (fill*c + track*c*(1-c) + bg*(1-c)^2 instead of fill*c + bg*(1-c)).
 * Counting each sub-sample once, into exactly one band, has no such seam.
 */
export function arcPixelBands(geom: ArcRingGeometry, px: number, py: number): ArcPixelBands {
  const S = ARC_SUBPIXEL_SCALE
  // The ring touches the object's edge, so the outer radius is half the side.
  const centre = (geom.size * S) / 2
  const rOuter = (geom.size * S) / 2
  const rInner = rOuter - geom.thickness * S
  const rOuter2 = rOuter * rOuter
  const rInner2 = rInner > 0 ? rInner * rInner : 0

  let fill = 0
  let track = 0
  let marker = 0

  // Two exact short cuts before sampling - not approximations, so they can
  // live in the shared algorithm without either side having to reproduce a
  // judgement call. A pixel whose nearest point is already past the outer
  // radius cannot contain any sub-sample, and one whose farthest point is
  // still inside the hole cannot either. Between them they dismiss the
  // entire middle of the dial and all four corners, which on a 360px ring is
  // most of the object.
  const xLo = px * S + 1 - centre
  const xHi = px * S + (2 * ARC_SUBSAMPLES - 1) - centre
  const yLo = py * S + 1 - centre
  const yHi = py * S + (2 * ARC_SUBSAMPLES - 1) - centre
  const minAbsX = xLo <= 0 && xHi >= 0 ? 0 : Math.min(Math.abs(xLo), Math.abs(xHi))
  const minAbsY = yLo <= 0 && yHi >= 0 ? 0 : Math.min(Math.abs(yLo), Math.abs(yHi))
  const maxAbsX = Math.max(Math.abs(xLo), Math.abs(xHi))
  const maxAbsY = Math.max(Math.abs(yLo), Math.abs(yHi))
  if (minAbsX * minAbsX + minAbsY * minAbsY >= rOuter2) return { fill: 0, track: 0, marker: 0 }
  if (maxAbsX * maxAbsX + maxAbsY * maxAbsY < rInner2) return { fill: 0, track: 0, marker: 0 }

  for (let j = 0; j < ARC_SUBSAMPLES; j++) {
    // Sub-sample centres sit at (2k+1)/8 of a pixel, i.e. 1/8, 3/8, 5/8, 7/8.
    const y = py * S + 2 * j + 1 - centre
    for (let i = 0; i < ARC_SUBSAMPLES; i++) {
      const x = px * S + 2 * i + 1 - centre
      const d2 = x * x + y * y
      if (d2 >= rOuter2 || d2 < rInner2) continue

      if (inArcSector(geom.marker, x, y)) marker++
      else if (inArcSector(geom.fill, x, y)) fill++
      else if (inArcSector(geom.track, x, y)) track++
      // Inside the annulus but outside the track - the gap at the bottom of
      // a 270 degree dial. Stays background.
    }
  }

  return { fill, track, marker }
}

// --- colour -----------------------------------------------------------------

/** A colour reduced to the device's framebuffer, as separate 5/6/5 channels. */
export interface Rgb565 {
  r: number
  g: number
  b: number
}

/**
 * Mirrors ColorScreenRenderer::parseHexColor()'s truncation exactly:
 * `(r & 0xF8) << 8 | (g & 0xFC) << 3 | b >> 3`. Truncation, not rounding -
 * matching the device's actual behaviour is the point, not being more
 * correct than it.
 */
export function toRgb565(color: string): Rgb565 {
  const c = color.trim()
  let r = 0
  let g = 0
  let b = 0
  if (c[0] === "#" && c.length >= 7) {
    r = parseInt(c.slice(1, 3), 16)
    g = parseInt(c.slice(3, 5), 16)
    b = parseInt(c.slice(5, 7), 16)
  } else if (c.toLowerCase() === "white") {
    r = g = b = 255
  }
  return { r: r >> 3, g: g >> 2, b: b >> 3 }
}

/**
 * Expands 5/6/5 back to 8 bits per channel by bit replication - the high bits
 * repeated into the low ones - which is what the firmware's BMP writer does
 * when it hands a snapshot to the HIL comparison. Getting this wrong (a
 * plain left shift) would put a constant few-LSB bias into every compared
 * pixel.
 */
export function fromRgb565(c: Rgb565): { r: number; g: number; b: number } {
  return {
    r: (c.r << 3) | (c.r >> 2),
    g: (c.g << 2) | (c.g >> 4),
    b: (c.b << 3) | (c.b >> 2),
  }
}

/**
 * Mixes up to four bands by coverage, in 5/6/5 space.
 *
 * The rounding is written out rather than inherited: the existing grayscale
 * mask blend in ColorAssetLoader divides by 255 without rounding, and an
 * unrounded divide here would bias every anti-aliased edge half a step
 * darker on one side.
 */
export function blendBands(
  bands: { colour: Rgb565; count: number }[],
  background: Rgb565,
  backgroundCount: number,
): Rgb565 {
  let r = background.r * backgroundCount
  let g = background.g * backgroundCount
  let b = background.b * backgroundCount
  for (const band of bands) {
    r += band.colour.r * band.count
    g += band.colour.g * band.count
    b += band.colour.b * band.count
  }
  const half = ARC_COVERAGE_MAX / 2
  return {
    r: Math.floor((r + half) / ARC_COVERAGE_MAX),
    g: Math.floor((g + half) / ARC_COVERAGE_MAX),
    b: Math.floor((b + half) / ARC_COVERAGE_MAX),
  }
}

// --- clock positions --------------------------------------------------------

/**
 * The designer talks clock positions because that is how anyone describes a
 * position on a round face - "from eight to four" rather than "240 degrees".
 * The stored format stays whole degrees: the rasterizer needs them, and a
 * firmware should never have to parse a human format.
 *
 * Half hours are the finest step offered, and that is arithmetic rather than
 * taste: twelve hours span 360 degrees, so an hour is 30 and a half hour is
 * 15, both whole. A quarter hour would be 7.5 and could not be stored.
 */
export const ARC_CLOCK_STEP_DEGREES = 15

export function clockToDegrees(hour: number, minute: number = 0): number {
  const h = ((hour % 12) + 12) % 12
  return (h * 30 + (minute / 60) * 30 + 360) % 360
}

export function degreesToClock(degrees: number): { hour: number; minute: number } {
  const d = ((degrees % 360) + 360) % 360
  const totalMinutes = Math.round((d / 30) * 60)
  const hour = Math.floor(totalMinutes / 60) % 12
  return { hour: hour === 0 ? 12 : hour, minute: totalMinutes % 60 }
}

export function formatClock(degrees: number): string {
  const { hour, minute } = degreesToClock(degrees)
  return minute === 0 ? `${hour}` : `${hour}:${String(minute).padStart(2, "0")}`
}
