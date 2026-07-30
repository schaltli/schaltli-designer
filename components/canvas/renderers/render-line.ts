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

// The distance from a corner to where a fillet of a given radius is
// tangent to each adjacent segment is radius / tan(halfAngle) - NOT the
// radius itself. A previous version assumed the tangent point sits at
// distance `radius` along each segment, which is only true for a
// perfectly square (90°) corner; for anything sharper (an acute angle -
// the tip of a narrow zigzag, say) the true tangent distance is *larger*
// than the radius, growing without bound as the angle approaches 0 (a
// razor-thin spike needs the fillet's straight run-up to start very far
// from the tip to still end up tangent to both segments at that small
// radius). Using the wrong, too-short distance for a manually-drawn
// straight run made it visibly overshoot past where ctx.arcTo() itself
// would compute the corner's actual tangent point, toward the vertex -
// exactly the "runs past the tangent point toward the apex" bug report
// this fixes (2026-07-30). `effectiveRadius` shrinks below the requested
// filletRadius only when even the correct tangent distance would exceed
// half of the shorter adjacent segment (so two corners on a short middle
// segment still can't overlap) - the radius that fits in what's left, not
// the raw requested one.
function computeFilletTangent(
  prev: LinePoint,
  curr: LinePoint,
  next: LinePoint,
  filletRadius: number,
): { t1: LinePoint; t2: LinePoint; effectiveRadius: number } {
  const lenIn = Math.hypot(curr.x - prev.x, curr.y - prev.y)
  const lenOut = Math.hypot(next.x - curr.x, next.y - curr.y)
  const maxDist = Math.min(lenIn / 2, lenOut / 2)

  if (lenIn === 0 || lenOut === 0 || maxDist === 0) {
    return { t1: curr, t2: curr, effectiveRadius: 0 }
  }

  const v1x = (prev.x - curr.x) / lenIn
  const v1y = (prev.y - curr.y) / lenIn
  const v2x = (next.x - curr.x) / lenOut
  const v2y = (next.y - curr.y) / lenOut
  const dot = Math.max(-1, Math.min(1, v1x * v2x + v1y * v2y))
  const halfAngle = Math.acos(dot) / 2
  const tanHalfAngle = Math.tan(halfAngle)

  // tanHalfAngle -> 0 as the corner approaches dead straight (no real turn
  // to round) or a full 180° reversal, either way meaning "use as much of
  // the available segment as the clamp allows" rather than dividing by ~0.
  let tangentDist = tanHalfAngle > 1e-6 ? filletRadius / tanHalfAngle : maxDist
  let effectiveRadius = filletRadius
  if (tangentDist > maxDist) {
    tangentDist = maxDist
    effectiveRadius = tangentDist * tanHalfAngle
  }

  return {
    t1: { x: curr.x + v1x * tangentDist, y: curr.y + v1y * tangentDist },
    t2: { x: curr.x + v2x * tangentDist, y: curr.y + v2y * tangentDist },
    effectiveRadius,
  }
}

export function renderLine(options: RenderLineOptions): void {
  const { ctx, obj, zoom, colorDepth } = options

  const color = applyColorDepth(obj.properties.color || "#000000", colorDepth)
  const strokeWidth = obj.properties.strokeWidth || 1
  const strokeStyle = obj.properties.strokeStyle || "solid"
  const filletRadius = Math.max(0, obj.properties.filletRadius || 0)
  const points = getLinePoints(obj)

  // Endpoints outside the visible screen need no special handling for any
  // of the fillRect-based drawing below: fillRect at coordinates outside
  // the canvas element's own pixel bounds is simply a no-op in every
  // browser, the same free clip a real device's framebuffer gives
  // (GFXcanvas1::drawPixel() bounds-checks and no-ops identically).
  const drawStraightSegment = (x0: number, y0: number, x1: number, y1: number) => {
    if (strokeWidth <= 1) {
      drawBresenhamLine(x0, y0, x1, y1, (x, y) => ctx.fillRect(x, y, 1, 1))
    } else {
      fillThickLine(x0, y0, x1, y1, strokeWidth, (x, y) => ctx.fillRect(x, y, 1, 1))
    }
  }

  if (strokeStyle === "solid") {
    ctx.fillStyle = color

    if (filletRadius === 0 || points.length < 3) {
      for (let i = 0; i < points.length - 1; i++) {
        drawStraightSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
      }
      return
    }

    // A fillet radius only needs the curved corner itself to fall back to
    // an antialiased native path (no device firmware rasterizes a true arc
    // pixel-for-pixel - ScreenRenderer::renderFilletedLine on the firmware
    // side approximates it with a quadratic Bezier instead, a different
    // enough curve that this canvas path was never going to pixel-match it
    // either) - every straight run, including the two runs leading into and
    // out of a fillet, still goes through the exact same pixel-exact
    // Bresenham/fillThickLine calls as a fillet-free line. The previous
    // version fell back to a fully antialiased whole-line path as soon as
    // any fillet was involved, which meant even the long straight stretches
    // of a mostly-straight filleted line never matched a real device -
    // a real, measurable HIL regression once the firmware actually gained
    // fillet support to compare against (2026-07-30 finding).
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = strokeWidth / zoom
    ctx.lineJoin = "round"
    ctx.lineCap = "round"

    let segStart = points[0]
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const next = points[i + 1]
      const { t1, t2, effectiveRadius } = computeFilletTangent(prev, curr, next, filletRadius)

      drawStraightSegment(segStart.x, segStart.y, t1.x, t1.y)

      if (effectiveRadius > 0) {
        ctx.beginPath()
        ctx.moveTo(t1.x, t1.y)
        ctx.arcTo(curr.x, curr.y, t2.x, t2.y, effectiveRadius)
        ctx.lineTo(t2.x, t2.y)
        ctx.stroke()
      }

      segStart = t2
    }
    const last = points[points.length - 1]
    drawStraightSegment(segStart.x, segStart.y, last.x, last.y)
    ctx.restore()
    return
  }

  // Dashed/dotted - not supported by any device's firmware at all, kept as
  // a fully antialiased whole-line preview (unrelated to the fillet-only
  // fallback above - even a straight dashed line was never firmware-
  // matchable, so there's no equivalent "straight runs still pixel-exact"
  // improvement available here).
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = strokeWidth / zoom
  ctx.setLineDash(strokeStyle === "dashed" ? [8 / zoom, 4 / zoom] : [2 / zoom, 4 / zoom])
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
      const { effectiveRadius } = computeFilletTangent(prev, curr, next, filletRadius)
      ctx.arcTo(curr.x, curr.y, next.x, next.y, effectiveRadius)
    }
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
  ctx.stroke()
  ctx.restore()
}
