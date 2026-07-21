/**
 * Line renderer - handles line rendering with various stroke styles.
 *
 * The default case (strokeWidth 1, solid style) is what the reference
 * e-paper firmware actually draws: Adafruit_GFX's own integer Bresenham
 * line algorithm (canvas_->drawLine(), see ScreenRenderer::renderLine()).
 * That algorithm has no anti-aliasing - every pixel is fully on or off -
 * so a native ctx.stroke() (which anti-aliases diagonal strokes into a
 * gradient of partially-transparent edge pixels) can never match it
 * exactly. drawBresenhamLine() below reimplements the identical algorithm
 * pixel-for-pixel instead. Thick or dashed/dotted lines aren't supported
 * by this device yet, so they keep the old antialiased rendering as a
 * preview for devices/future work that do support them.
 */

import type { ScreenmanObject } from "@/components/screenman-editor"
import { applyColorDepth } from "@/lib/color-depth"

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

  const x0 = obj.x
  const y0 = obj.y
  const x1 = obj.x + obj.width
  const y1 = obj.y + obj.height

  if (strokeStyle === "solid") {
    // Endpoints outside the visible screen need no special handling here:
    // fillRect at coordinates outside the canvas element's own pixel
    // bounds is simply a no-op in every browser, the same free clip a real
    // device's framebuffer gives (GFXcanvas1::drawPixel() bounds-checks
    // and no-ops identically).
    ctx.fillStyle = color
    if (strokeWidth <= 1) {
      drawBresenhamLine(x0, y0, x1, y1, (x, y) => ctx.fillRect(x, y, 1, 1))
    } else {
      fillThickLine(x0, y0, x1, y1, strokeWidth, (x, y) => ctx.fillRect(x, y, 1, 1))
    }
    return
  }

  // Dashed / dotted - not yet supported by any device's firmware, kept as
  // an antialiased preview.
  ctx.strokeStyle = color
  ctx.lineWidth = strokeWidth / zoom

  if (strokeStyle === "dashed") {
    ctx.setLineDash([8 / zoom, 4 / zoom])
  } else if (strokeStyle === "dotted") {
    ctx.setLineDash([2 / zoom, 4 / zoom])
  }

  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()

  ctx.setLineDash([])
}
