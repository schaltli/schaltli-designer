/**
 * Line renderer - handles line rendering with various stroke styles, and
 * now segmented (multi-point) lines with an optional rounded-corner
 * (fillet) radius at interior vertices.
 *
 * The default case (strokeWidth 1, solid style, filletRadius 0) is what the
 * reference e-paper firmware actually draws: Adafruit_GFX's own integer
 * Bresenham line algorithm (canvas_->drawLine(), see
 * ScreenRenderer::renderLine()). That algorithm has no anti-aliasing -
 * every pixel is fully on or off - so a native ctx.stroke() (which
 * anti-aliases diagonal strokes into a gradient of partially-transparent
 * edge pixels) can never match it exactly. drawBresenhamLine() below
 * reimplements the identical algorithm pixel-for-pixel instead, called once
 * per segment for a multi-point line - straight segmented lines stay
 * exactly as portable to firmware as a single segment always was. Thick or
 * dashed/dotted lines aren't supported by this device yet, so they keep the
 * old antialiased rendering as a preview for devices/future work that do
 * support them - a fillet radius is the same story (no firmware supports
 * rounded joints yet), so it always renders through that same antialiased
 * native-path branch, never the pixel-exact one.
 */

import type { ScreenmanObject } from "@/components/screenman-editor"
import { applyColorDepth } from "@/lib/color-depth"

export interface LinePoint {
  x: number
  y: number
}

// A line's points come from `properties.points` (added so the tool can draw
// segmented/multi-point lines) when present, falling back to the object's
// own x/y/width/height as a single two-point segment - the shape every line
// object had before this existed, and what a project saved before this
// feature shipped still uses untouched. Shared by the renderer and by
// canvas.tsx's hit-testing/handle/drag code so both always agree on what a
// given line object's actual vertices are.
export function getLinePoints(obj: ScreenmanObject): LinePoint[] {
  const points = obj.properties?.points
  if (Array.isArray(points) && points.length >= 2) {
    return points
  }
  return [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.height },
  ]
}

interface RenderLineOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  zoom: number
  colorDepth?: string
}

// Mirrors Adafruit_GFX::drawLine()/writeLine() exactly (see
// Adafruit_GFX.cpp): horizontal/vertical lines are drawn as a solid run,
// anything else via the classic integer Bresenham stepper. `plot` receives
// screen-space integer pixel coordinates one at a time, in the same order
// the firmware would touch them (irrelevant for a static image, but keeps
// the two implementations trivially comparable).
function drawBresenhamLine(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  if (x0 === x1) {
    const [ya, yb] = y0 > y1 ? [y1, y0] : [y0, y1]
    for (let y = ya; y <= yb; y++) plot(x0, y)
    return
  }
  if (y0 === y1) {
    const [xa, xb] = x0 > x1 ? [x1, x0] : [x0, x1]
    for (let x = xa; x <= xb; x++) plot(x, y0)
    return
  }

  let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0)
  if (steep) {
    ;[x0, y0] = [y0, x0]
    ;[x1, y1] = [y1, x1]
  }
  if (x0 > x1) {
    ;[x0, x1] = [x1, x0]
    ;[y0, y1] = [y1, y0]
  }

  const dx = x1 - x0
  const dy = Math.abs(y1 - y0)
  let err = Math.trunc(dx / 2)
  const ystep = y0 < y1 ? 1 : -1
  let y = y0

  for (let x = x0; x <= x1; x++) {
    if (steep) plot(y, x)
    else plot(x, y)
    err -= dy
    if (err < 0) {
      y += ystep
      err += dx
    }
  }
}

// Fills a strokeWidth>1 line as a rotated rectangle with butt caps (the
// line's own W-px-wide band, cut off perpendicular to its direction at
// each end, matching canvas's default lineCap) - mirrors
// ScreenRenderer::fillThickLine() exactly: same corner construction, same
// "test the pixel center against all 4 edges, same-sign-or-zero-cross
// means inside" test, same iteration order, so both sides rasterize the
// identical polygon the identical way. A native ctx.stroke() with
// lineWidth>1 antialiases its edges into a gradient - no way to match a
// device's binary on/off framebuffer with that, same reasoning as
// drawBresenhamLine() above.
function fillThickLine(x0: number, y0: number, x1: number, y1: number, width: number, plot: (x: number, y: number) => void): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return // degenerate (zero-length, butt caps draw nothing)

  const nx = -dy / len
  const ny = dx / len
  const hw = width / 2

  // Rectangle corners, in order around the perimeter (A->B->C->D->A): A/B
  // are the two ends of the start cap, C/D the two ends of the end cap.
  const cornersX = [x0 + nx * hw, x0 - nx * hw, x1 - nx * hw, x1 + nx * hw]
  const cornersY = [y0 + ny * hw, y0 - ny * hw, y1 - ny * hw, y1 + ny * hw]

  const minX = Math.floor(Math.min(...cornersX))
  const maxX = Math.ceil(Math.max(...cornersX))
  const minY = Math.floor(Math.min(...cornersY))
  const maxY = Math.ceil(Math.max(...cornersY))

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const testX = px + 0.5
      const testY = py + 0.5
      let sign = 0
      let inside = true
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        const edgeX = cornersX[j] - cornersX[i]
        const edgeY = cornersY[j] - cornersY[i]
        const toPointX = testX - cornersX[i]
        const toPointY = testY - cornersY[i]
        const cross = edgeX * toPointY - edgeY * toPointX
        if (cross !== 0) {
          const s = cross > 0 ? 1 : -1
          if (sign === 0) {
            sign = s
          } else if (s !== sign) {
            inside = false
            break
          }
        }
      }
      if (inside) plot(px, py)
    }
  }
}

export function renderLine(options: RenderLineOptions): void {
  const { ctx, obj, zoom, colorDepth } = options

  const color = applyColorDepth(obj.properties.color || "#000000", colorDepth)
  const strokeWidth = obj.properties.strokeWidth || 1
  const strokeStyle = obj.properties.strokeStyle || "solid"
  const filletRadius = Math.max(0, obj.properties.filletRadius || 0)
  const points = getLinePoints(obj)

  if (strokeStyle === "solid" && filletRadius === 0) {
    // Endpoints outside the visible screen need no special handling here:
    // fillRect at coordinates outside the canvas element's own pixel
    // bounds is simply a no-op in every browser, the same free clip a real
    // device's framebuffer gives (GFXcanvas1::drawPixel() bounds-checks
    // and no-ops identically).
    ctx.fillStyle = color
    for (let i = 0; i < points.length - 1; i++) {
      const { x: x0, y: y0 } = points[i]
      const { x: x1, y: y1 } = points[i + 1]
      if (strokeWidth <= 1) {
        drawBresenhamLine(x0, y0, x1, y1, (x, y) => ctx.fillRect(x, y, 1, 1))
      } else {
        fillThickLine(x0, y0, x1, y1, strokeWidth, (x, y) => ctx.fillRect(x, y, 1, 1))
      }
    }
    return
  }

  // Dashed/dotted, and/or a rounded fillet at interior vertices - neither is
  // supported by any device's firmware yet, kept as an antialiased preview
  // (the same reasoning this branch already used for dashed/dotted alone).
  // A fillet radius is drawn via ctx.arcTo() per interior vertex - the
  // standard "line toward the corner, arc, continue toward the next point"
  // construction - with the radius clamped to half of whichever adjacent
  // segment is shorter, so two fillets on a short middle segment can never
  // overlap or overshoot their own segment.
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = strokeWidth / zoom

  if (strokeStyle === "dashed") {
    ctx.setLineDash([8 / zoom, 4 / zoom])
  } else if (strokeStyle === "dotted") {
    ctx.setLineDash([2 / zoom, 4 / zoom])
  }

  if (filletRadius > 0) {
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
  }

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  if (filletRadius > 0 && points.length > 2) {
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const next = points[i + 1]
      const lenIn = Math.hypot(curr.x - prev.x, curr.y - prev.y)
      const lenOut = Math.hypot(next.x - curr.x, next.y - curr.y)
      const r = Math.min(filletRadius, lenIn / 2, lenOut / 2)
      ctx.arcTo(curr.x, curr.y, next.x, next.y, r)
    }
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
  ctx.stroke()
  ctx.restore()
}
