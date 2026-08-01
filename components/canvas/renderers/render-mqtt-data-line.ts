/**
 * MQTT Data Line renderer - a line whose stroke width and arrowheads react
 * to a bound MQTT topic's live/preview value, for visualizing a flow (e.g.
 * current between a solar panel and a battery): magnitude drives width,
 * sign drives which end (if any) shows an arrow. Added 2026-07-31
 * (/grill-me session) as a separate object type from the plain "line" -
 * not a toggle on it - mirroring how MqttDataField is already a distinct
 * type from Label, so an ordinary static line's behavior/rendering stays
 * completely untouched.
 *
 * Deliberately reuses, rather than reimplements, three already-proven
 * mechanisms:
 * - drawLineBody()/drawArrowhead() (render-line.ts) for pixel-exact
 *   Bresenham/fillet-arc/arrowhead rendering, identical to a plain line.
 * - calculateLevelIndicatorFill() (render-level-indicator.ts) for
 *   value->output interpolation - MqttDataLine's `calibrationPoints` use
 *   the exact same {value, barSizePercent} shape and sort/clamp/linear-
 *   interpolate logic as a level-indicator's fill percentage, with
 *   `barSizePercent` reinterpreted as a stroke width in pixels here. A
 *   parallel, differently-named struct would be clearer in isolation, but
 *   this reuses an already firmware/Android-proven function unchanged
 *   instead of a third near-duplicate copy of the same interpolation math
 *   - a deliberate reuse-over-clarity tradeoff.
 * - evaluateCondition() (lib/render-screen.ts) for the two independent
 *   arrow-visibility conditions (arrowStart/arrowEndOperator+Value) -
 *   the exact same operator set/semantics tab-control panels already use
 *   to pick their active child.
 */

import type { ScreenmanObject, Topic } from "@/components/screenman-editor"
import { applyColorDepth } from "@/lib/color-depth"
import { evaluateCondition } from "@/lib/render-screen"
import { getLinePoints, drawLineBody, drawArrowhead, shortenForArrow } from "./render-line"
import { calculateLevelIndicatorFill } from "./render-level-indicator"

interface RenderMqttDataLineOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  zoom: number
  colorDepth?: string
  topics: Topic[]
  getPreviewValueFromTopic: (topicName: string | undefined) => string
}

const DEFAULT_CALIBRATION_POINTS = [
  { value: 0, barSizePercent: 1 },
  { value: 100, barSizePercent: 6 },
]

export function renderMqttDataLine(options: RenderMqttDataLineOptions): void {
  const { ctx, obj, colorDepth, getPreviewValueFromTopic } = options

  const color = applyColorDepth(obj.properties.color || "#000000", colorDepth)
  const filletRadius = Math.max(0, obj.properties.filletRadius || 0)
  const points = getLinePoints(obj)

  const rawValue = getPreviewValueFromTopic(obj.properties.topic)
  const numericValue = Number.parseFloat(rawValue) || 0

  const calibrationPoints = obj.properties.calibrationPoints || DEFAULT_CALIBRATION_POINTS
  // abs() - magnitude drives width, sign drives direction (the arrow
  // conditions below use the signed rawValue directly). Calibration points
  // are defined over a magnitude range (e.g. 0-100A), not a signed one -
  // -40 and +40 must produce the same stroke width, just opposite arrows.
  // Matches ScreenRenderer::renderMqttDataLine()'s clamp exactly (firmware
  // has no fractional-pixel stroke concept either) - floor at 1 so a
  // near-zero flow still draws a visible (if thin) line rather than
  // disappearing entirely.
  const strokeWidth = Math.max(1, Math.round(calculateLevelIndicatorFill(Math.abs(numericValue), calibrationPoints)))

  const showArrowStart = evaluateCondition(rawValue, obj.properties.arrowStartOperator || "<", obj.properties.arrowStartValue ?? "0")
  const showArrowEnd = evaluateCondition(rawValue, obj.properties.arrowEndOperator || ">", obj.properties.arrowEndValue ?? "0")

  // The line body is drawn shortened at whichever end(s) show an arrow -
  // see shortenForArrow()'s comment (render-line.ts) for why a
  // strokeWidth-wide line drawn all the way to the arrowhead's own tip
  // point pokes out past the triangle's tapering sides once it's thick
  // enough - a flow line's whole point is a data-driven, potentially very
  // thick stroke, so this matters here more than on a plain line.
  const bodyPoints = points.slice()
  if (points.length >= 2) {
    if (showArrowStart) bodyPoints[0] = shortenForArrow(points[0], points[1], strokeWidth)
    if (showArrowEnd) {
      bodyPoints[bodyPoints.length - 1] = shortenForArrow(points[points.length - 1], points[points.length - 2], strokeWidth)
    }
  }
  drawLineBody(ctx, bodyPoints, strokeWidth, color, filletRadius)

  if (points.length < 2) return
  ctx.fillStyle = color
  const plot = (x: number, y: number) => ctx.fillRect(x, y, 1, 1)

  if (showArrowStart) drawArrowhead(points[0], points[1], strokeWidth, plot)
  if (showArrowEnd) drawArrowhead(points[points.length - 1], points[points.length - 2], strokeWidth, plot)
}
