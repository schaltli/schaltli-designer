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
 *
 * `arrowStart`/`arrowEnd` (2026-07-31) add an optional filled-triangle
 * arrowhead at either endpoint, drawn pixel-exact via fillTriangle() (a
 * port of Adafruit_GFX::fillTriangle()'s exact scanline algorithm) so it
 * matches ScreenRenderer::renderLine()'s equivalent on real hardware -
 * shared with MqttDataLine (render-mqtt-data-line.ts) via the exported
 * drawArrowhead(), which only differs in *whether* each end's arrow shows
 * (a fixed flag here, a live topic-value condition there).
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
// `center` is the true fillet arc's own center (on the tangent points'
// bisector, at distance effectiveRadius/sin(halfAngle) from the vertex) -
// null when there's no real corner to round (degenerate/near-straight,
// same cases effectiveRadius ends up 0 for). Mirrors
// ScreenRenderer::renderFilletedLine()'s identical center computation on
// the firmware side exactly, so both sides sweep the same arc.
function computeFilletTangent(
  prev: LinePoint,
  curr: LinePoint,
  next: LinePoint,
  filletRadius: number,
): { t1: LinePoint; t2: LinePoint; effectiveRadius: number; center: LinePoint | null } {
  const lenIn = Math.hypot(curr.x - prev.x, curr.y - prev.y)
  const lenOut = Math.hypot(next.x - curr.x, next.y - curr.y)
  const maxDist = Math.min(lenIn / 2, lenOut / 2)

  if (lenIn === 0 || lenOut === 0 || maxDist === 0) {
    return { t1: curr, t2: curr, effectiveRadius: 0, center: null }
  }

  const v1x = (prev.x - curr.x) / lenIn
  const v1y = (prev.y - curr.y) / lenIn
  const v2x = (next.x - curr.x) / lenOut
  const v2y = (next.y - curr.y) / lenOut
  const dot = Math.max(-1, Math.min(1, v1x * v2x + v1y * v2y))
  const halfAngle = Math.acos(dot) / 2
  const tanHalfAngle = Math.tan(halfAngle)
  const sinHalfAngle = Math.sin(halfAngle)

  // tanHalfAngle -> 0 as the corner approaches dead straight (no real turn
  // to round) or a full 180° reversal, either way meaning "use as much of
  // the available segment as the clamp allows" rather than dividing by ~0.
  let tangentDist = tanHalfAngle > 1e-6 ? filletRadius / tanHalfAngle : maxDist
  let effectiveRadius = filletRadius
  if (tangentDist > maxDist) {
    tangentDist = maxDist
    effectiveRadius = tangentDist * tanHalfAngle
  }

  // Rounded to integer pixels here, matching ScreenRenderer::
  // renderFilletedLine()'s (int16_t)roundf(...) casts on t1/t2 exactly -
  // center/effectiveRadius stay float precision on both sides (only t1/t2
  // and each arc step get snapped to pixels). Passing raw floats into
  // drawStraightSegment/drawBresenhamLine (which assumes integer inputs)
  // used to silently disagree with the firmware's rounding by a fraction
  // of a pixel - invisible on a long straight run, but enough to shift a
  // couple of pixels on the short curve hops, the last source of the
  // fillet's residual HIL diff (2026-07-31 finding).
  const t1 = { x: Math.round(curr.x + v1x * tangentDist), y: Math.round(curr.y + v1y * tangentDist) }
  const t2 = { x: Math.round(curr.x + v2x * tangentDist), y: Math.round(curr.y + v2y * tangentDist) }

  let center: LinePoint | null = null
  if (effectiveRadius > 0 && sinHalfAngle > 1e-6) {
    const bx = v1x + v2x
    const by = v1y + v2y
    const bLen = Math.hypot(bx, by)
    if (bLen > 1e-6) {
      const centerDist = effectiveRadius / sinHalfAngle
      center = { x: curr.x + (bx / bLen) * centerDist, y: curr.y + (by / bLen) * centerDist }
    }
  }

  return { t1, t2, effectiveRadius, center }
}

// Mirrors Adafruit_GFX::fillTriangle() exactly (Adafruit_GFX.cpp:734-816) -
// same Y-sort, same flat-top/flat-bottom scanline split, same truncating
// integer division for each scanline's left/right edge - so an arrowhead
// rasterizes identically here and on the real device, same reasoning as
// drawBresenhamLine()/fillThickLine() above. `plot` receives each filled
// pixel's (x, y) one at a time (a whole horizontal run per call from the
// caller's perspective would be a needless second abstraction - every other
// primitive in this file already plots pixel-by-pixel).
function fillTriangle(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  plot: (x: number, y: number) => void,
): void {
  if (y0 > y1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0] }
  if (y1 > y2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1] }
  if (y0 > y1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0] }

  const hline = (xa: number, xb: number, y: number) => {
    if (xa > xb) [xa, xb] = [xb, xa]
    for (let x = xa; x <= xb; x++) plot(x, y)
  }

  if (y0 === y2) {
    let a = x0, b = x0
    if (x1 < a) a = x1; else if (x1 > b) b = x1
    if (x2 < a) a = x2; else if (x2 > b) b = x2
    hline(a, b, y0)
    return
  }

  const dx01 = x1 - x0, dy01 = y1 - y0, dx02 = x2 - x0, dy02 = y2 - y0, dx12 = x2 - x1, dy12 = y2 - y1
  let sa = 0, sb = 0
  let y = y0
  const last = y1 === y2 ? y1 : y1 - 1

  for (; y <= last; y++) {
    const a = x0 + Math.trunc(sa / dy01)
    const b = x0 + Math.trunc(sb / dy02)
    sa += dx01
    sb += dx02
    hline(a, b, y)
  }

  sa = dx12 * (y - y1)
  sb = dx02 * (y - y0)
  for (; y <= y2; y++) {
    const a = x1 + Math.trunc(sa / dy12)
    const b = x0 + Math.trunc(sb / dy02)
    sa += dx12
    sb += dx02
    hline(a, b, y)
  }
}

// An arrowhead pointing from `from` toward `tip` (i.e. outward, in the
// line's direction of travel at that end) - a filled triangle whose length/
// half-width scale with strokeWidth so a thicker line gets a proportionally
// bigger arrow, with a floor so a thin 1px line still gets a legible arrow
// rather than a near-invisible sliver. Shared between the plain "line"
// type's manual arrowStart/arrowEnd flags and MqttDataLine's data-driven
// direction indicator (render-mqtt-data-line.ts) - same primitive either
// way, only what decides whether to call it differs.
export function drawArrowhead(
  tip: LinePoint,
  from: LinePoint,
  strokeWidth: number,
  plot: (x: number, y: number) => void,
): void {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return

  const dirX = dx / len
  const dirY = dy / len
  const perpX = -dirY
  const perpY = dirX

  const arrowLength = Math.max(6, strokeWidth * 3)
  const arrowHalfWidth = Math.max(4, strokeWidth * 2)

  const backX = tip.x - dirX * arrowLength
  const backY = tip.y - dirY * arrowLength
  const p1 = { x: Math.round(backX + perpX * arrowHalfWidth), y: Math.round(backY + perpY * arrowHalfWidth) }
  const p2 = { x: Math.round(backX - perpX * arrowHalfWidth), y: Math.round(backY - perpY * arrowHalfWidth) }
  const tipRounded = { x: Math.round(tip.x), y: Math.round(tip.y) }

  fillTriangle(tipRounded.x, tipRounded.y, p1.x, p1.y, p2.x, p2.y, plot)
}

const FILLET_CURVE_STEPS = 16

// Sweeps the minor arc between t1 and t2 (the one bulging toward the
// vertex - always the shorter arc, since its central angle is
// π - 2*halfAngle < π) in FILLET_CURVE_STEPS straight hops, each drawn
// through `plot` (drawStraightSegment) - same step count and geometry as
// ScreenRenderer::renderFilletedLine()'s firmware-side loop, so the curve
// rasterizes as closely to the real device's stepped pixels as the
// straight segments already do.
function drawFilletArc(
  t1: LinePoint,
  center: LinePoint,
  t2: LinePoint,
  radius: number,
  plot: (x0: number, y0: number, x1: number, y1: number) => void,
): void {
  const startAngle = Math.atan2(t1.y - center.y, t1.x - center.x)
  const endAngle = Math.atan2(t2.y - center.y, t2.x - center.x)
  let delta = endAngle - startAngle
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  let prevPoint = t1
  for (let s = 1; s <= FILLET_CURVE_STEPS; s++) {
    const t = s / FILLET_CURVE_STEPS
    const angle = startAngle + delta * t
    // Rounded per-step, matching the firmware's (int16_t)roundf(px/py) -
    // see computeFilletTangent's comment on t1/t2 for why this matters.
    const curvePoint = {
      x: Math.round(center.x + radius * Math.cos(angle)),
      y: Math.round(center.y + radius * Math.sin(angle)),
    }
    plot(prevPoint.x, prevPoint.y, curvePoint.x, curvePoint.y)
    prevPoint = curvePoint
  }
}

// Draws a line's body (straight segments + pixel-exact stepped fillet arcs)
// - everything renderLine's "solid" style does, minus the color/strokeWidth/
// arrow-flag bookkeeping that's specific to the plain "line" object type.
// Exported so MqttDataLine (render-mqtt-data-line.ts) can draw its own
// data-driven strokeWidth/color through the exact same pixel-exact path,
// rather than duplicating the Bresenham/fillet-arc logic a second time.
export function drawLineBody(
  ctx: CanvasRenderingContext2D,
  points: LinePoint[],
  strokeWidth: number,
  color: string,
  filletRadius: number,
): void {
  ctx.fillStyle = color

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

  if (filletRadius === 0 || points.length < 3) {
    for (let i = 0; i < points.length - 1; i++) {
      drawStraightSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
    }
    return
  }

  // The curved corner itself is also drawn pixel-exact - a stepped circular
  // arc via drawStraightSegment (Bresenham/fillThickLine), the same
  // FILLET_CURVE_STEPS-segment sweep ScreenRenderer::renderFilletedLine()
  // draws on the firmware side - rather than a native ctx.arcTo()/stroke()
  // antialiased path. That native path used to be the only option here
  // because the firmware drew the corner as a quadratic Bezier, different
  // enough from a true arc that pixel-matching either rendering method to
  // it was never going to work anyway; now that the firmware draws a true
  // stepped arc too (2026-07-30 fillet-radius-accuracy fix), matching its
  // exact stepped/aliased pixels here removes the last source of soft
  // antialiased edge pixels on an otherwise fully pixel-exact line
  // (2026-07-30 finding: the straight segments were already stair-stepped
  // like the device, but the curve stood out as visibly smoother, still
  // costing real HIL diff pixels along its edge even after the radius
  // itself matched).
  let segStart = points[0]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]
    const { t1, t2, effectiveRadius, center } = computeFilletTangent(prev, curr, next, filletRadius)

    drawStraightSegment(segStart.x, segStart.y, t1.x, t1.y)

    if (effectiveRadius > 0 && center) {
      drawFilletArc(t1, center, t2, effectiveRadius, drawStraightSegment)
    }

    segStart = t2
  }
  const last = points[points.length - 1]
  drawStraightSegment(segStart.x, segStart.y, last.x, last.y)
}

export function renderLine(options: RenderLineOptions): void {
  const { ctx, obj, zoom, colorDepth } = options

  const color = applyColorDepth(obj.properties.color || "#000000", colorDepth)
  const strokeWidth = obj.properties.strokeWidth || 1
  const strokeStyle = obj.properties.strokeStyle || "solid"
  const filletRadius = Math.max(0, obj.properties.filletRadius || 0)
  const points = getLinePoints(obj)

  // Manual, fixed arrowheads for a plain line (as opposed to MqttDataLine's
  // data-driven ones) - independent start/end flags, same as most vector
  // drawing tools' line-cap options. Drawn after the line body itself using
  // the same pixel-exact fillTriangle plotter, regardless of stroke style,
  // since the arrowhead is a separate primitive from however the line
  // itself got drawn.
  const drawArrows = () => {
    if (points.length < 2) return
    ctx.fillStyle = color
    const plot = (x: number, y: number) => ctx.fillRect(x, y, 1, 1)
    if (obj.properties.arrowStart) {
      drawArrowhead(points[0], points[1], strokeWidth, plot)
    }
    if (obj.properties.arrowEnd) {
      drawArrowhead(points[points.length - 1], points[points.length - 2], strokeWidth, plot)
    }
  }

  if (strokeStyle === "solid") {
    drawLineBody(ctx, points, strokeWidth, color, filletRadius)
    drawArrows()
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
  drawArrows()
}
