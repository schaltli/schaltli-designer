import {
  PILL_COVERAGE_MAX,
  PILL_SUBPIXEL_SCALE,
  insidePillTip,
  pillBandsBounds,
  pillCoverage,
  type PillBand,
} from "@/lib/pill-raster"
import { blendBands, fromRgb565, toRgb565, type Rgb565 } from "@/lib/arc-raster"
import { GLOW_ALPHA, blend565, rgb565FromBytes } from "@/lib/level-glow"
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
  /**
   * A colour per pixel instead of `colour` - a fill that runs from one
   * colour to another along its bar (lib/level-glow.ts). Always through
   * 5/6/5, even where the run owns a pixel outright, since every step of the
   * gradient is a 5/6/5 colour on the device too.
   */
  colourAt?: (px: number, py: number) => Rgb565
}

/**
 * A glow around part of the control (lib/level-glow.ts): how near a pixel is
 * (1 .. GLOW_LEVELS, 0 beyond), in which colour, and the box it may reach -
 * the object's own, never beyond.
 */
export interface PillGlow {
  levelAt: (px: number, py: number) => number
  colourAt: (px: number, py: number) => Rgb565
  box: { x: number; y: number; w: number; h: number }
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
  glow?: PillGlow | null,
): void {
  const runs = painted.filter((p) => p.band.w > 0 && p.band.h > 0 && p.colour !== "transparent")
  if (runs.length === 0) return

  let bounds = pillBandsBounds(runs.map((r) => r.band))
  if (glow) {
    // Out to where the glow may reach, and no further than the object.
    const x0 = Math.max(glow.box.x, bounds.x - 8)
    const y0 = Math.max(glow.box.y, bounds.y - 8)
    const x1 = Math.min(glow.box.x + glow.box.w, bounds.x + bounds.w + 8)
    const y1 = Math.min(glow.box.y + glow.box.h, bounds.y + bounds.h + 8)
    bounds = { x: Math.min(x0, bounds.x), y: Math.min(y0, bounds.y), w: 0, h: 0 }
    bounds.w = Math.max(x1, bounds.x) - bounds.x
    bounds.h = Math.max(y1, bounds.y) - bounds.y
  }
  if (bounds.w <= 0 || bounds.h <= 0) return

  const buffer = document.createElement("canvas")
  buffer.width = bounds.w
  buffer.height = bounds.h
  const bctx = buffer.getContext("2d")
  if (!bctx) return

  if ((colorDepth ?? "24bit") !== "24bit") hardPills(bctx, runs, bounds)
  else softPills(bctx, runs, bounds, background, glow ?? null, underOf(ctx, bounds, glow))

  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, bounds.x, bounds.y)
  ctx.imageSmoothingEnabled = smoothing
}

/**
 * What lies under the control, for a glow to be mixed into - exactly, where
 * the canvas is drawn at 1:1 (the reference render every device is compared
 * against). The zoomed editor canvas gets null, and the glow is left to the
 * canvas's own alpha mixing there.
 */
function underOf(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  glow: PillGlow | null | undefined,
): Uint8ClampedArray | null {
  if (!glow) return null
  const t = ctx.getTransform()
  const exact = t.a === 1 && t.d === 1 && t.b === 0 && t.c === 0 && Number.isInteger(t.e) && Number.isInteger(t.f)
  return exact ? ctx.getImageData(bounds.x + t.e, bounds.y + t.f, bounds.w, bounds.h).data : null
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
  // A triangle: every pixel whose centre it contains, by the same test the
  // soft path samples with - so a device that draws it in whole pixels has
  // one rule to copy, and no line-drawing algorithm of its own to agree with.
  if (band.tip) {
    const S = PILL_SUBPIXEL_SCALE
    bctx.fillStyle = colour
    for (let py = band.y; py < band.y + band.h; py++) {
      for (let px = band.x; px < band.x + band.w; px++) {
        if (insidePillTip(band, px * S + S / 2, py * S + S / 2)) bctx.fillRect(px - band.x + x, py - band.y + y, 1, 1)
      }
    }
    return
  }
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
  glow: PillGlow | null,
  under: Uint8ClampedArray | null,
): void {
  const image = bctx.createImageData(bounds.w, bounds.h)
  const data = image.data

  const bands = runs.map((r) => r.band)
  const colours = runs.map((r) => (r.colour === null ? null : toRgb565(r.colour)))
  const exact = runs.map((r) => (r.colour === null ? null : exactRgb(r.colour)))
  const mixInto = toRgb565(background)

  // The counts come from the cache (#58): only the colouring below runs on
  // every draw.
  const coverage = pillCoverage(bands, bounds)
  const n = bands.length
  const counts = new Array<number>(n).fill(0)

  for (let py = 0; py < bounds.h; py++) {
    for (let px = 0; px < bounds.w; px++) {
      const base = (py * bounds.w + px) * n
      for (let b = 0; b < n; b++) counts[b] = coverage[base + b]
      const inked: { colour: ReturnType<typeof toRgb565>; count: number }[] = []
      let covered = 0
      let claimed = 0
      for (let b = 0; b < counts.length; b++) {
        claimed += counts[b]
        const colour = runs[b].colourAt && colours[b] !== null ? runs[b].colourAt!(bounds.x + px, bounds.y + py) : colours[b]
        if (counts[b] === 0 || colour === null) continue
        inked.push({ colour, count: counts[b] })
        covered += counts[b]
      }
      const at = (py * bounds.w + px) * 4

      // The glow, mixed into what already stands there (lib/level-glow.ts).
      let mixHere = mixInto
      const level = glow && claimed < PILL_COVERAGE_MAX ? glow.levelAt(bounds.x + px, bounds.y + py) : 0
      if (level > 0) {
        const colour = glow!.colourAt(bounds.x + px, bounds.y + py)
        if (under) {
          mixHere = blend565(rgb565FromBytes(under[at], under[at + 1], under[at + 2]), colour, GLOW_ALPHA[level])
        } else if (claimed > 0) {
          mixHere = blend565(mixInto, colour, GLOW_ALPHA[level])
        } else {
          const out = fromRgb565(colour)
          data[at] = out.r
          data[at + 1] = out.g
          data[at + 2] = out.b
          data[at + 3] = GLOW_ALPHA[level]
          continue
        }
        if (covered === 0) {
          const out = fromRgb565(mixHere)
          data[at] = out.r
          data[at + 1] = out.g
          data[at + 2] = out.b
          data[at + 3] = 255
          continue
        }
      }
      if (covered === 0) continue

      // A pixel that one run owns outright keeps that run's colour exactly -
      // no trip through 5/6/5 and back. Every other object here paints the
      // author's colour as it is, and a bar whose body came back a step off
      // would not match the box beside it. The mixing below is only for the
      // pixels an edge passes through, where a step is what nobody can see
      // anyway.
      const ownerIndex = counts.findIndex((c) => c > 0)
      const only =
        inked.length === 1 && covered === PILL_COVERAGE_MAX
          ? runs[ownerIndex].colourAt
            ? fromRgb565(inked[0].colour)
            : exact[ownerIndex]
          : null
      if (only) {
        data[at] = only.r
        data[at + 1] = only.g
        data[at + 2] = only.b
        data[at + 3] = 255
        continue
      }

      const mixed = blendBands(inked, mixHere, PILL_COVERAGE_MAX - covered)
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
