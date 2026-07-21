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

export function renderLine(options: RenderLineOptions): void {
  const { ctx, obj, zoom, colorDepth } = options

  const color = applyColorDepth(obj.properties.color || "#000000", colorDepth)
  const strokeWidth = obj.properties.strokeWidth || 1
  const strokeStyle = obj.properties.strokeStyle || "solid"

  const x0 = obj.x
  const y0 = obj.y
  const x1 = obj.x + obj.width
  const y1 = obj.y + obj.height

  if (strokeWidth <= 1 && strokeStyle === "solid") {
    // Endpoints outside the visible screen need no special handling here:
    // fillRect at coordinates outside the canvas element's own pixel
    // bounds is simply a no-op in every browser, the same free clip a real
    // device's framebuffer gives (GFXcanvas1::drawPixel() bounds-checks
    // and no-ops identically).
    ctx.fillStyle = color
    drawBresenhamLine(x0, y0, x1, y1, (x, y) => ctx.fillRect(x, y, 1, 1))
    return
  }

  // Thick / dashed / dotted - not yet supported by any device's firmware,
  // kept as an antialiased preview.
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
