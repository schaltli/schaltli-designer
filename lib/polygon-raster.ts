// A filled polygon, anti-aliased, as the firmware's PolygonRaster fills it
// (schaltli-firmware src/project/PolygonRaster.cpp) - a line-by-line port,
// so the designer's energy diagram and a board's are the same pixels
// (device contract 2.8; energy-firmware, 2026-10-12: the canvas's own
// anti-aliasing left 866 pixels between them at every edge).
//
// - The outline's corners are in eighths of a pixel, whole numbers.
// - Each pixel is sampled at 4 x 4 points, at eighths 1, 3, 5, 7 in x and y;
//   its coverage is how many of the 16 are inside (1..16).
// - Even-odd: a sub-sample is inside when a ray to its left crosses the
//   outline an odd number of times - so one outline can hold a hole.
// - Where the outline crosses a sub-sample row is rounded to the nearest
//   eighth, in whole numbers.

export interface Point8 {
  x: number
  y: number
}

export interface RasterSink {
  /** Pixels x0..x1 of row y wholly inside. */
  fullRun?: (y: number, x0: number, x1: number) => void
  /** Pixel (x, y) partly inside: `coverage` of 16 sub-samples. */
  partial?: (y: number, x: number, coverage: number) => void
}

/** A length in eighths of a pixel, rounded half away from nought. */
export function toEighths(px: number): number {
  const e = px * 8
  return e < 0 ? -Math.floor(-e + 0.5) : Math.floor(e + 0.5)
}

function crossings(pts: readonly Point8[], y: number): number[] {
  const out: number[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    if (a.y === b.y) continue
    const top = a.y < b.y ? a : b
    const bottom = a.y < b.y ? b : a
    if (y < top.y || y >= bottom.y) continue
    // x = top.x + (y - top.y) * dx / dy, rounded to the nearest eighth.
    const num = (y - top.y) * (bottom.x - top.x)
    const den = bottom.y - top.y
    const q = num >= 0 ? Math.floor((2 * num + den) / (2 * den)) : -Math.floor((-2 * num + den) / (2 * den))
    out.push(top.x + q)
  }
  return out.sort((p, q) => p - q)
}

/** Fills `points` (eighths) between pixel rows clipY0 and clipY1, telling `sink` what it covers. */
export function fillPolygon(points: readonly Point8[], clipY0: number, clipY1: number, sink: RasterSink): void {
  if (points.length < 3) return
  let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const px0 = Math.floor(minX / 8)
  const px1 = Math.floor(maxX / 8)
  const py0 = Math.max(Math.floor(minY / 8), clipY0)
  const py1 = Math.min(Math.floor(maxY / 8), clipY1)
  if (px1 < px0 || py1 < py0) return
  const width = px1 - px0 + 1
  const cover = new Uint8Array(width)
  for (let py = py0; py <= py1; py++) {
    cover.fill(0)
    let any = false
    for (let sub = 0; sub < 4; sub++) {
      const xs = crossings(points, py * 8 + 1 + sub * 2)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = xs[k], to = xs[k + 1]
        if (to <= from) continue
        // Sub-sample columns at 2c + 1 inside [from, to).
        const c0 = Math.ceil((from - 1) / 2)
        const c1 = Math.ceil((to - 1) / 2) - 1
        for (let c = c0; c <= c1; c++) {
          const pixel = Math.floor(c / 4)
          if (pixel < px0 || pixel > px1) continue
          cover[pixel - px0]++
          any = true
        }
      }
    }
    if (!any) continue
    let runStart = -1
    for (let i = 0; i <= width; i++) {
      const c = i < width ? cover[i] : 0
      if (c === 16) {
        if (runStart < 0) runStart = i
        continue
      }
      if (runStart >= 0) {
        sink.fullRun?.(py, px0 + runStart, px0 + i - 1)
        runStart = -1
      }
      if (i < width && c > 0) sink.partial?.(py, px0 + i, c)
    }
  }
}
