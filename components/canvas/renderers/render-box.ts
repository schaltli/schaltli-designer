/**
 * Box renderer - handles rectangle/box rendering with optional rounded
 * corners and border.
 *
 * Rounded corners are drawn with a manual port of Adafruit_GFX's own
 * fillRoundRect()/fillCircleHelper() (a classic integer midpoint-circle
 * algorithm, no floating point, no anti-aliasing) rather than canvas's
 * native roundRect()/arc() path - those rasterize via Bezier curves with
 * anti-aliased edges a 1-bit framebuffer can't reproduce, the same
 * reasoning as the Bresenham line reimplementation in render-line.ts. Both
 * sides need the identical algorithm, not an approximation of each other.
 *
 * The border is drawn inset (border-box style): the strokeWidth-thick band
 * occupies the object's own outer edge, not centered on it like a native
 * canvas strokeRect() (which straddles the path half in/half out and would
 * bleed past the object's declared bounds). Implemented as two nested
 * fillRoundRect() calls - outer full box in strokeColor, then a smaller
 * inset box in fillColor drawn on top - matching
 * ScreenRenderer::renderBox() exactly.
 */

import type { ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"

interface RenderBoxOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  zoom: number
  colorDepth?: string
}

// Mirrors Adafruit_GFX::fillCircleHelper() exactly (see Adafruit_GFX.cpp) -
// same variable names, same loop, same integer arithmetic. `corners` is a
// bitmask: 1 = right half, 2 = left half (matching the library's own
// convention).
//
// It adds its columns to the *current path* rather than filling each one.
// They used to be filled one by one, on the reasoning that "fillRect at
// integer coordinates is always pixel-exact on a canvas (no antialiasing
// possible for an axis-aligned, fully-opaque fill)". True - but only while
// the canvas is aligned to whole pixels, and the editor's is not: it centres
// the screen with `(width / zoom - screenWidth) / 2` and adds a pan offset,
// so it usually sits on a fraction of one.
//
// Off a whole pixel, every one of those forty-odd one-pixel columns is
// anti-aliased on its own, and the seams between them never add back up to
// full coverage. The rounded ends of a control came out visibly washed out
// while its straight middle - one big fillRect - stayed solid. Measured on
// 2026-09-21 from a screenshot: the ends of a chosen button were 80% of the
// colour instead of 100%, over exactly the width of their corner radius, and
// it came and went as entering preview or clicking the canvas moved the
// offset.
//
// As one path the union is rasterised once: identical pixels when aligned,
// and solid when not.
function fillCircleHelper(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  r: number,
  corners: number,
  delta: number,
): void {
  let f = 1 - r
  let ddF_x = 1
  let ddF_y = -2 * r
  let x = 0
  let y = r
  let px = x
  let py = y
  delta++

  while (x < y) {
    if (f >= 0) {
      y--
      ddF_y += 2
      f += ddF_y
    }
    x++
    ddF_x += 2
    f += ddF_x
    if (x < y + 1) {
      if (corners & 1) ctx.rect(x0 + x, y0 - y, 1, 2 * y + delta)
      if (corners & 2) ctx.rect(x0 - x, y0 - y, 1, 2 * y + delta)
    }
    if (y !== py) {
      if (corners & 1) ctx.rect(x0 + py, y0 - px, 1, 2 * px + delta)
      if (corners & 2) ctx.rect(x0 - py, y0 - px, 1, 2 * px + delta)
      py = y
    }
    px = x
  }
}

// Mirrors Adafruit_GFX::fillRoundRect() exactly, including its own radius
// clamp (r > max_radius -> max_radius) so an oversized radius self-corrects
// identically on both sides.
//
// Exported because the Switch's marker bar is the same rounded rectangle
// drawn by the same firmware primitive (2026-08-25). A second copy here
// would be a second chance to disagree with ColorScreenRenderer over a
// corner pixel, which is the whole reason this function exists instead of
// ctx.roundRect().
/**
 * A rounded-rectangle ring `thickness` pixels thick, cut out of a filled shape
 * rather than stroked.
 *
 * Stroked, a thin ring is anti-aliased and breaks up wherever the picture is
 * later cut to one bit; cut out of two integer-rasterised shapes it is whole
 * at any depth. Cut, not painted over, so whatever is behind the control - a
 * background image - still shows inside it.
 */
export function fillRoundRectRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  thickness: number,
  color: string,
  rRight: number = r,
): void {
  const t = Math.max(1, Math.trunc(thickness))
  if (w <= 0 || h <= 0) return
  const ring = document.createElement("canvas")
  ring.width = w
  ring.height = h
  const rctx = ring.getContext("2d")
  if (!rctx) return
  fillRoundRectSides(rctx, 0, 0, w, h, r, rRight, color)
  if (w > 2 * t && h > 2 * t) {
    rctx.globalCompositeOperation = "destination-out"
    fillRoundRectSides(rctx, t, t, w - 2 * t, h - 2 * t, Math.max(0, r - t), Math.max(0, rRight - t), "#000000")
  }
  ctx.drawImage(ring, x, y)
}

export function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  fillRoundRectSides(ctx, x, y, w, h, r, r, color)
}

/**
 * The same rectangle with a radius per side.
 *
 * One radius cannot describe a button in a connected button group, which is
 * what a Switch in its group form is (docs/2026-09-20-switch-look.md).
 * Material 3 gives such a button a fully round outer end and a small inner
 * one, and a single radius forces a choice between an outer end that does not
 * follow its container and an inner end that rounds away from its neighbour.
 * Asked for either, a segment about as tall as it is wide simply clamps to a
 * circle - which is what a group narrow enough to hold two short words did
 * until 2026-09-21.
 *
 * With both radii equal this is exactly the shape it always drew, down to the
 * pixel, so every other caller is untouched: the straight middle runs between
 * the two arcs and each end is the same Adafruit_GFX quarter-circle pair.
 */
export function fillRoundRectSides(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rLeft: number,
  rRight: number,
  color: string,
): void {
  if (w <= 0 || h <= 0) return
  const maxRadius = Math.floor(Math.min(w, h) / 2)
  const left = Math.max(0, Math.min(maxRadius, Math.trunc(rLeft)))
  const right = Math.max(0, Math.min(maxRadius, Math.trunc(rRight)))

  ctx.fillStyle = color
  // One path, one fill: the straight middle and both rounded ends together,
  // so no seam between them can show. See fillCircleHelper.
  ctx.beginPath()
  ctx.rect(x + left, y, w - left - right, h)
  if (right > 0) fillCircleHelper(ctx, x + w - right - 1, y + right, right, 1, h - 2 * right - 1)
  if (left > 0) fillCircleHelper(ctx, x + left, y + left, left, 2, h - 2 * left - 1)
  ctx.fill()
}

export function renderBox(options: RenderBoxOptions): void {
  const { ctx, obj, colorDepth } = options

  const fillColor = applyColorDepth(obj.properties.fillColor || "#e5e5e5", colorDepth)
  const strokeColor = applyColorDepth(obj.properties.strokeColor || "#000000", colorDepth)
  const strokeWidth = obj.properties.strokeWidth || 0
  const cornerRadius = Math.max(0, obj.properties.cornerRadius || 0)
  const hasBorder = Boolean(obj.properties.strokeColor) && strokeWidth > 0

  const x = obj.x
  const y = obj.y
  const w = obj.width
  const h = obj.height

  if (cornerRadius > 0) {
    fillRoundRect(ctx, x, y, w, h, cornerRadius, hasBorder ? strokeColor : fillColor)
  } else {
    ctx.fillStyle = hasBorder ? strokeColor : fillColor
    ctx.fillRect(x, y, w, h)
  }

  if (hasBorder) {
    const innerX = x + strokeWidth
    const innerY = y + strokeWidth
    const innerW = w - 2 * strokeWidth
    const innerH = h - 2 * strokeWidth
    const innerRadius = Math.max(0, cornerRadius - strokeWidth)

    if (innerW > 0 && innerH > 0) {
      if (innerRadius > 0) {
        fillRoundRect(ctx, innerX, innerY, innerW, innerH, innerRadius, fillColor)
      } else {
        ctx.fillStyle = fillColor
        ctx.fillRect(innerX, innerY, innerW, innerH)
      }
    }
  }
}
