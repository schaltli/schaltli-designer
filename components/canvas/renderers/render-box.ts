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

import type { ScreenmanObject } from "@/components/screenman-editor"
import { applyColorDepth } from "@/lib/color-depth"

interface RenderBoxOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  zoom: number
  colorDepth?: string
}

// Mirrors Adafruit_GFX::fillCircleHelper() exactly (see Adafruit_GFX.cpp) -
// same variable names, same loop, same integer arithmetic. `corners` is a
// bitmask: 1 = right half, 2 = left half (matching the library's own
// convention). fillRect at integer coordinates is always pixel-exact on a
// canvas (no antialiasing possible for an axis-aligned, fully-opaque fill),
// so no per-pixel plotting trick is needed here, unlike stroked paths.
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
      if (corners & 1) ctx.fillRect(x0 + x, y0 - y, 1, 2 * y + delta)
      if (corners & 2) ctx.fillRect(x0 - x, y0 - y, 1, 2 * y + delta)
    }
    if (y !== py) {
      if (corners & 1) ctx.fillRect(x0 + py, y0 - px, 1, 2 * px + delta)
      if (corners & 2) ctx.fillRect(x0 - py, y0 - px, 1, 2 * px + delta)
      py = y
    }
    px = x
  }
}

// Mirrors Adafruit_GFX::fillRoundRect() exactly, including its own radius
// clamp (r > max_radius -> max_radius) so an oversized radius self-corrects
// identically on both sides.
function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  const maxRadius = Math.floor(Math.min(w, h) / 2)
  if (r > maxRadius) r = maxRadius
  if (r < 0) r = 0

  ctx.fillStyle = color
  ctx.fillRect(x + r, y, w - 2 * r, h)
  fillCircleHelper(ctx, x + w - r - 1, y + r, r, 1, h - 2 * r - 1)
  fillCircleHelper(ctx, x + r, y + r, r, 2, h - 2 * r - 1)
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
