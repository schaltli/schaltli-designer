/**
 * The shared rasterizer for pill-shaped runs - the bar's track and handle,
 * the switch's track, knob and buttons.
 *
 * A sibling of lib/arc-raster.ts, written to the same rules and for the same
 * reason: these shapes are drawn live on every device, so the designer, the
 * firmware and the Android app have to arrive at the same pixels, including
 * the soft ones. `Adafruit_GFX::fillRoundRect` gives all three the same HARD
 * pixels, which is why it has served until now; a stair-stepped pill next to
 * an anti-aliased ring is what asked the question (2026-09-22).
 *
 * The rules are the arc's, unchanged:
 *
 *   - Sub-pixel positions live on a 1/8-pixel grid, so every coordinate is an
 *     integer and every comparison is an integer square.
 *   - Coverage is a count out of 16, from a 4x4 lattice of sub-samples.
 *   - Colours are mixed in 5/6/5 space with an explicit rounding rule, by
 *     arc-raster's own blendBands, because the device's framebuffer is RGB565
 *     and mixing in 8-bit first would land a step or two away.
 *
 * And the arc's hardest-won rule most of all: **a sub-sample is counted into
 * exactly one band.** Where the bar's fill meets its track, compositing one
 * shape over the other leaves a seam of track colour along the value's edge -
 * fill*c + track*c*(1-c) + bg*(1-c)^2 instead of fill*c + bg*(1-c). Counting
 * once has no such seam, and the value's edge is the one place on a bar that
 * anybody looks at.
 *
 * The handle's gap needs no machinery of its own: levelSegments already cuts
 * the runs around it, so the gap is simply where no band is.
 */

/** Sub-pixel grid: 4x4 samples per pixel, positions on a 1/8-pixel lattice. */
export const PILL_SUBSAMPLES = 4
export const PILL_COVERAGE_MAX = PILL_SUBSAMPLES * PILL_SUBSAMPLES
export const PILL_SUBPIXEL_SCALE = 8

/**
 * One run with rounded ends, in whole pixels.
 *
 * The two radii are the run's own ends along its long axis - a segment of a
 * connected button group is round on the outside and barely rounded where it
 * faces its neighbour, and a bar's filled run is round at the bar's end and
 * square where the value cuts it. Each end's radius rounds both of its
 * corners, which is what makes the shape a pill rather than a rectangle with
 * four independent corners.
 */
export interface PillBand {
  x: number
  y: number
  w: number
  h: number
  /** The end at the lower coordinate: left on a horizontal run, top on a vertical one. */
  rLow: number
  /** The end at the higher coordinate. */
  rHigh: number
  /** True when the run's long axis is vertical. */
  vertical?: boolean
}

/**
 * Whether a sub-sample, in 1/8 pixel, lies inside the band.
 *
 * The radius is clamped the way fillRoundRect clamps it - to half the short
 * side - so an oversized radius self-corrects identically on both sides, and
 * a run shorter than it is thick ends in a half-circle rather than a wedge.
 */
export function insidePillBand(band: PillBand, x: number, y: number): boolean {
  const S = PILL_SUBPIXEL_SCALE
  const x0 = band.x * S
  const y0 = band.y * S
  const x1 = x0 + band.w * S
  const y1 = y0 + band.h * S
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false

  const maxRadius = Math.floor(Math.min(band.w, band.h) / 2)
  const rLow = Math.max(0, Math.min(maxRadius, Math.trunc(band.rLow))) * S
  const rHigh = Math.max(0, Math.min(maxRadius, Math.trunc(band.rHigh))) * S
  if (rLow === 0 && rHigh === 0) return true

  // Along the run and across it, so one piece of arithmetic serves both
  // directions.
  const along = band.vertical ? y : x
  const across = band.vertical ? x : y
  const alongLow = band.vertical ? y0 : x0
  const alongHigh = band.vertical ? y1 : x1
  const acrossLow = band.vertical ? x0 : y0
  const acrossHigh = band.vertical ? x1 : y1

  const insideCorner = (cAlong: number, cAcross: number, r: number): boolean => {
    const dAlong = along - cAlong
    const dAcross = across - cAcross
    return dAlong * dAlong + dAcross * dAcross <= r * r
  }

  if (rLow > 0 && along < alongLow + rLow) {
    if (across < acrossLow + rLow) return insideCorner(alongLow + rLow, acrossLow + rLow, rLow)
    if (across >= acrossHigh - rLow) return insideCorner(alongLow + rLow, acrossHigh - rLow, rLow)
  }
  if (rHigh > 0 && along >= alongHigh - rHigh) {
    if (across < acrossLow + rHigh) return insideCorner(alongHigh - rHigh, acrossLow + rHigh, rHigh)
    if (across >= acrossHigh - rHigh) return insideCorner(alongHigh - rHigh, acrossHigh - rHigh, rHigh)
  }
  return true
}

/**
 * How many of a pixel's 16 sub-samples fall in each band.
 *
 * Bands are tried in order and the first one that contains a sub-sample
 * keeps it, so the caller states its own priority by the order it passes
 * them in: a handle before the runs it lies on, a cut before what it cuts.
 */
export function pillPixelBands(bands: readonly PillBand[], px: number, py: number): number[] {
  const S = PILL_SUBPIXEL_SCALE
  const counts = new Array(bands.length).fill(0)

  for (let j = 0; j < PILL_SUBSAMPLES; j++) {
    // Sub-sample centres sit at (2k+1)/8 of a pixel, i.e. 1/8, 3/8, 5/8, 7/8.
    const y = py * S + 2 * j + 1
    for (let i = 0; i < PILL_SUBSAMPLES; i++) {
      const x = px * S + 2 * i + 1
      for (let b = 0; b < bands.length; b++) {
        if (insidePillBand(bands[b], x, y)) {
          counts[b]++
          break
        }
      }
    }
  }

  return counts
}

/** The pixels a set of bands can possibly touch, as a box in whole pixels. */
export function pillBandsBounds(bands: readonly PillBand[]): {
  x: number
  y: number
  w: number
  h: number
} {
  if (bands.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const band of bands) {
    if (band.w <= 0 || band.h <= 0) continue
    x0 = Math.min(x0, band.x)
    y0 = Math.min(y0, band.y)
    x1 = Math.max(x1, band.x + band.w)
    y1 = Math.max(y1, band.y + band.h)
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
