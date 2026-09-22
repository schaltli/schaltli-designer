import {
  PILL_COVERAGE_MAX,
  pillBandsBounds,
  pillPixelBands,
  type PillBand,
} from "@/lib/pill-raster"
import { blendBands, fromRgb565, toRgb565 } from "@/lib/arc-raster"
import { fillRoundRectSides } from "@/components/canvas/renderers/render-box"

/**
 * One run and the colour it is painted in.
 *
 * `colour: null` is a hole: the run claims its pixels - nothing behind it
 * shows through - but paints nothing, which is how an outline is described
 * (the outer pill in the outline's colour, the inside knocked out of it).
 */
export interface PaintedPill {
  band: PillBand
  colour: string | null
}

/**
 * Paints a set of pill-shaped runs, anti-aliased, in one pass.
 *
 * The runs are given in priority order - a handle before the track it lies
 * on, a hole before the ring it cuts - because every sub-sample is counted
 * into exactly one of them. That is the whole reason this exists rather than a
 * sequence of fillRoundRect calls: where two runs meet, painting one over the
 * other leaves a seam of the lower one's colour along the join
 * (lib/pill-raster.ts says why in full).
 *
 * Into an offscreen buffer at 1:1 and blitted with smoothing off, the way
 * render-arc-level.ts does it, because the editor's canvas is scaled and a
 * soft edge drawn onto a scaled canvas is softened twice. That holds for the
 * hard path below too: a pill's cap is a column of one-pixel rectangles, and
 * scaled, each one gets its own soft edge and they do not add up to an opaque
 * cap - "die farben an den enden laufen auseinander" (2026-09-19).
 *
 * **Not anti-aliased below 24 bit.** On a 1-bit panel there is nothing to
 * mix into: every soft pixel snaps to black or white on the way to the glass,
 * and the device draws these shapes with whole pixels anyway. A 4-bit panel
 * could take a soft edge in its sixteen greys, but only once its own copy of
 * this quantises the blend the same way - so it keeps the hard path until
 * that is settled, which is a decision about the firmware and not about the
 * designer.
 */
export function paintPills(
  ctx: CanvasRenderingContext2D,
  painted: readonly PaintedPill[],
  background: string,
  colorDepth: string | undefined,
): void {
  const runs = painted.filter((p) => p.band.w > 0 && p.band.h > 0 && p.colour !== "transparent")
  if (runs.length === 0) return

  const bounds = pillBandsBounds(runs.map((r) => r.band))
  if (bounds.w <= 0 || bounds.h <= 0) return

  const buffer = document.createElement("canvas")
  buffer.width = bounds.w
  buffer.height = bounds.h
  const bctx = buffer.getContext("2d")
  if (!bctx) return

  if ((colorDepth ?? "24bit") !== "24bit") hardPills(bctx, runs, bounds)
  else softPills(bctx, runs, bounds, background)

  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, bounds.x, bounds.y)
  ctx.imageSmoothingEnabled = smoothing
}

/** Whole pixels, one shape over another - what every device draws today. */
function hardPills(
  bctx: CanvasRenderingContext2D,
  runs: readonly PaintedPill[],
  bounds: { x: number; y: number },
): void {
  // Lowest priority first, because here one shape really does paint over
  // another - which is exactly what the soft path is built to avoid.
  for (let i = runs.length - 1; i >= 0; i--) {
    const { band, colour } = runs[i]
    const x = band.x - bounds.x
    const y = band.y - bounds.y
    // A hole is knocked out rather than painted, the way fillRoundRectRing
    // makes its ring - so what is behind the control still shows through it.
    if (colour === null) {
      bctx.save()
      bctx.globalCompositeOperation = "destination-out"
      hardPill(bctx, x, y, band, "#000000")
      bctx.restore()
      continue
    }
    hardPill(bctx, x, y, band, colour)
  }
}

/**
 * One run in whole pixels, exactly as every device draws it today.
 *
 * `fillRoundRectSides` rounds the LEFT and RIGHT ends, which are a horizontal
 * run's own two ends and not a vertical one's. A vertical run is therefore
 * drawn the way the bar always drew it: the whole pill, then its cut ends
 * squared off again - the same pixels, and no second rounding rule to keep in
 * step with the firmware.
 */
function hardPill(
  bctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  band: PillBand,
  colour: string,
): void {
  if (!band.vertical) {
    fillRoundRectSides(bctx, x, y, band.w, band.h, band.rLow, band.rHigh, colour)
    return
  }
  const r = Math.min(Math.max(band.rLow, band.rHigh), Math.trunc(Math.min(band.w, band.h) / 2))
  fillRoundRectSides(bctx, x, y, band.w, band.h, r, r, colour)
  if (r <= 0) return
  bctx.fillStyle = colour
  if (band.rLow <= 0) bctx.fillRect(x, y, band.w, r)
  if (band.rHigh <= 0) bctx.fillRect(x, y + band.h - r, band.w, r)
}

/** A colour as the eight bits a canvas takes, parsed the way toRgb565 parses it. */
function exactRgb(colour: string): { r: number; g: number; b: number } {
  const c = colour.trim()
  if (c[0] === "#" && c.length >= 7) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
    }
  }
  return fromRgb565(toRgb565(c))
}

/** Sixteen sub-samples a pixel, mixed in RGB565 - the arc's rules exactly. */
function softPills(
  bctx: CanvasRenderingContext2D,
  runs: readonly PaintedPill[],
  bounds: { x: number; y: number; w: number; h: number },
  background: string,
): void {
  const image = bctx.createImageData(bounds.w, bounds.h)
  const data = image.data

  const bands = runs.map((r) => r.band)
  const colours = runs.map((r) => (r.colour === null ? null : toRgb565(r.colour)))
  const exact = runs.map((r) => (r.colour === null ? null : exactRgb(r.colour)))
  const mixInto = toRgb565(background)

  for (let py = 0; py < bounds.h; py++) {
    for (let px = 0; px < bounds.w; px++) {
      const counts = pillPixelBands(bands, bounds.x + px, bounds.y + py)
      const inked: { colour: ReturnType<typeof toRgb565>; count: number }[] = []
      let covered = 0
      for (let b = 0; b < counts.length; b++) {
        const colour = colours[b]
        if (counts[b] === 0 || colour === null) continue
        inked.push({ colour, count: counts[b] })
        covered += counts[b]
      }
      if (covered === 0) continue

      const at = (py * bounds.w + px) * 4
      // A pixel that one run owns outright keeps that run's colour exactly -
      // no trip through 5/6/5 and back. Every other object here paints the
      // author's colour as it is, and a bar whose body came back a step off
      // would not match the box beside it. The mixing below is only for the
      // pixels an edge passes through, where a step is what nobody can see
      // anyway.
      const only = inked.length === 1 && covered === PILL_COVERAGE_MAX ? exact[counts.findIndex((c) => c > 0)] : null
      if (only) {
        data[at] = only.r
        data[at + 1] = only.g
        data[at + 2] = only.b
        data[at + 3] = 255
        continue
      }

      const mixed = blendBands(inked, mixInto, PILL_COVERAGE_MAX - covered)
      const out = fromRgb565(mixed)
      data[at] = out.r
      data[at + 1] = out.g
      data[at + 2] = out.b
      // Opaque, with the background already mixed into the soft pixels -
      // not alpha, which would mix it a second time when the buffer is
      // blitted. The arc does exactly this, for exactly this reason. Over a
      // background *image* it is an approximation, and the same one on every
      // side, so only the eye can tell.
      data[at + 3] = 255
    }
  }

  bctx.putImageData(image, 0, 0)
}
