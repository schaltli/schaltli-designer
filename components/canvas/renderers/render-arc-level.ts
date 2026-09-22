/**
 * Arc level renderer - the round-display counterpart to the level indicator
 * bar (render-level-indicator.ts), which it shares its value mapping with.
 *
 * On a round display the outer annulus is the one region a rectangle can
 * never use: too narrow for text, clipped at the corners, wasted in every
 * layout. So the level goes there, concentric with the physical knob, and
 * fills in the direction the knob turns.
 *
 * Two topics, one ring. The filled arc is the reading; an optional second
 * topic puts a marker on the same track for a setpoint, which is the pair of
 * questions a thermostat is always asked at once - where am I, where am I
 * going. Without that second topic it is simply a filled arc, which is what
 * a water level wants.
 *
 * All the geometry and every mixed colour come from lib/arc-raster.ts, which
 * exists in this repo and again in each firmware, in integer arithmetic
 * chosen so the two cannot disagree. This file only turns object properties
 * into that rasterizer's inputs and writes the result into an ImageData; see
 * arc-raster.ts for why anti-aliasing forced the pixel-exactness question
 * and how it is answered.
 *
 * The pixels are built at 1:1 in an offscreen canvas and then drawn through
 * ctx, rather than composed with ctx.arc() or handed to putImageData:
 *   - ctx.arc() would anti-alias with the browser's own rasterizer, which no
 *     firmware can reproduce.
 *   - putImageData ignores the canvas transform, so it would land in the
 *     wrong place at any zoom other than 1.
 * drawImage respects the transform, and with smoothing disabled a zoomed
 * view magnifies the same pixels the device will show.
 */

import type { ScreenObject, ProjectFont, Topic } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { alignToPixel } from "@/lib/font-utils"
import { ARC_SIN_SCALE } from "@/lib/arc-sin-table"
import { applyColorDepth } from "@/lib/color-depth"
import { levelTrackLook } from "@/lib/level-shape"
import { levelSubFont } from "@/components/canvas/renderers/render-level-indicator"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { calculateLevelIndicatorFill, levelValueFromFill, snapToStep } from "./render-level-indicator"
import { ARC_CLOCK_STEP_DEGREES } from "@/lib/arc-raster"
import { hasNoValue } from "@/lib/render-screen"
import {
  ARC_ANGLE_SCALE,
  ARC_COVERAGE_MAX,
  ARC_FULL_TURN,
  ARC_SUBPIXEL_SCALE,
  arcDirection,
  arcPixelBands,
  blendBands,
  type ArcCap,
  type ArcHandle,
  fromRgb565,
  makeArcSector,
  toRgb565,
  type ArcRingGeometry,
  type Rgb565,
} from "@/lib/arc-raster"

interface RenderArcLevelOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  topics: Topic[]
  zoom: number
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  /**
   * What a finger here asked this ring to become, keyed by the topic the
   * request was about - the same second source the bar has
   * (render-level-indicator.ts, docs/2026-09-17-settable-level.md 6c). A ring
   * with a write topic and no setpoint topic would otherwise show nothing
   * where the glass shows a marker.
   */
  getAskedValueFromTopic?: (topicName: string | undefined) => string
  colorDepth?: string
  /**
   * What the anti-aliased edges mix into where the object's own background is
   * transparent - which is the common case, since a ring is meant to float on
   * the screen rather than sit in a square of its own colour.
   *
   * Passing a colour rather than reading the canvas underneath is deliberate.
   * The firmware could read its framebuffer easily enough, but the designer
   * cannot do the same at an arbitrary zoom, and an edge that mixes into
   * different things on the two sides is an edge that fails the pixel
   * comparison. A screen's declared background colour is known to both, so
   * both mix into it. Over a background *image* that is an approximation -
   * but it is the same approximation on both sides, so the comparison stays
   * exact and only the eye can tell.
   */
  screenBackgroundColor?: string
  requestRedraw?: () => void
}

export const ARC_DEFAULT_MIN_ANGLE = 225
export const ARC_DEFAULT_MAX_ANGLE = 135
export const ARC_DEFAULT_THICKNESS = 22
export const ARC_DEFAULT_MARKER_WIDTH_DEGREES = 4

/**
 * Turns the object's min/max clock positions into a clockwise sector.
 *
 * Stored as two positions rather than a start and a length because that is
 * what someone setting one up means: here is zero, here is full scale. The
 * direction resolves which way round the dial that runs, and a counter
 * clockwise dial is expressed as the same clockwise sector filled from its
 * other end - so the rasterizer only ever deals with clockwise sweeps.
 *
 * Equal positions mean a full ring. A zero-length arc is not something
 * anyone builds on purpose, so the ambiguous case is given the useful
 * reading.
 */
export function resolveArcSweep(obj: ScreenObject): {
  start64: number
  sweep64: number
  fillFromEnd: boolean
} {
  const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360
  const minA = norm(obj.properties.minAngle ?? ARC_DEFAULT_MIN_ANGLE)
  const maxA = norm(obj.properties.maxAngle ?? ARC_DEFAULT_MAX_ANGLE)
  const counterClockwise = obj.properties.direction === "ccw"

  const startDeg = counterClockwise ? maxA : minA
  const spanDeg = counterClockwise ? (minA - maxA + 360) % 360 : (maxA - minA + 360) % 360

  return {
    start64: startDeg * ARC_ANGLE_SCALE,
    sweep64: (spanDeg === 0 ? 360 : spanDeg) * ARC_ANGLE_SCALE,
    fillFromEnd: counterClockwise,
  }
}

/**
 * The two ends of the scale, as something to take hold of on the canvas
 * (docs/2026-09-21-arc-handles.md).
 *
 * Each handle is a short, slightly thicker piece of the ring drawn just
 * *inside* its own end - a cap, not a square. A square would claim an x and
 * a y, and an angle has neither; a piece of arc says what it is. Drawing
 * each one inwards is also why they can never sit on top of one another:
 * on a full ring, where both ends are the same angle, the two caps end up
 * side by side around that point rather than in the same place.
 */
/**
 * How far past the corners of the object's box a scale end's handle sits.
 *
 * The handle is at `sqrt(2) * size / 2 + 15` from the centre: the corner
 * distance plus a margin. Past the *corners*, not past the ring, because the
 * box's four corner handles are the only other thing out there - and a line
 * of some fixed length past the ring meets one of them exactly when the ring
 * is about 145 px across, and partly overlaps for everything between roughly
 * 100 and 200. Measuring from the corner circle settles it by geometry
 * rather than by a rule about who wins, and keeps the line the same length
 * whatever angle it stands at.
 */
export const ARC_HANDLE_PAST_CORNERS = 15

/** The grid both the drag and the clock positions speak in: half hours. */
export const ARC_HANDLE_STEP_DEGREES = ARC_CLOCK_STEP_DEGREES

/**
 * How short the scale may get. The one rule the drag needs: an end never
 * comes past the other, so the span stays between one step and a full turn.
 * Growing to 360 is how a ring is closed; shrinking to 0 would be the same
 * number meaning the opposite thing (resolveArcSweep reads it as full), and
 * that jump is what this forbids.
 */
export const ARC_MIN_SPAN_DEGREES = ARC_CLOCK_STEP_DEGREES

export interface ArcHandleGeometry {
  cx: number
  /** Where the dashed line starts: the ring's inner edge. */
  innerEdge: number
  cy: number
  /** The ring's outer edge - where the handle sits on the line. */
  ringEdge: number
  /** Where both dashed lines stop and their handles sit. */
  handleEdge: number
  /** Each handle: the angle its line stands at, and the run it covers. */
  min: { angle: number; from: number; to: number }
  max: { angle: number; from: number; to: number }
}

const normDeg = (deg: number) => ((deg % 360) + 360) % 360

/** The drawn span, clockwise from start to end: 1..360, never 0. */
export function arcSpanDegrees(obj: ScreenObject): number {
  const { sweep64 } = resolveArcSweep(obj)
  return sweep64 / ARC_ANGLE_SCALE
}

/**
 * Where to draw the two ends of the scale, and how big a target they are.
 *
 * `handleSize` is in object units - the caller divides the screen size it
 * wants by the zoom, exactly as the corner handles do - because the handle
 * is a fixed size on screen while the ring is not: eight pixels of arc is a
 * different number of degrees on a ring of 40 than on one of 300.
 */
export function arcHandleGeometry(obj: ScreenObject, handleSize: number): ArcHandleGeometry {
  const size = Math.max(1, Math.round(Math.min(obj.width, obj.height)))
  const thickness = Math.min(
    Math.max(1, Math.round(obj.properties.thickness ?? ARC_DEFAULT_THICKNESS)),
    Math.floor(size / 2),
  )
  const counterClockwise = obj.properties.direction === "ccw"
  const minA = normDeg(obj.properties.minAngle ?? ARC_DEFAULT_MIN_ANGLE)
  const maxA = normDeg(obj.properties.maxAngle ?? ARC_DEFAULT_MAX_ANGLE)
  const ringEdge = Math.max(1, size / 2)

  // The circle through the box's four corners, plus a margin: every angle
  // is the same distance out, and none of them can reach a corner handle.
  const handleEdge = Math.SQRT2 * (size / 2) + ARC_HANDLE_PAST_CORNERS

  // The handle sits beside its line, on the side the ring is closed - which
  // is what keeps the two apart on a full ring, where both lines stand at
  // the same angle. Half the span at most, so two handles on the shortest
  // scale there can be still meet rather than cross.
  const span = Math.min(
    (handleSize / Math.max(1, handleEdge)) * (180 / Math.PI),
    arcSpanDegrees(obj) / 2,
  )
  const inward = counterClockwise ? -1 : 1

  return {
    cx: obj.x + size / 2,
    cy: obj.y + size / 2,
    innerEdge: Math.max(1, ringEdge - thickness),
    ringEdge,
    handleEdge,
    min: { angle: minA, from: minA, to: normDeg(minA + span * inward) },
    max: { angle: maxA, from: normDeg(maxA - span * inward), to: maxA },
  }
}

/**
 * The angle a point stands at, twelve o'clock up and clockwise - the same
 * orientation everything else here uses. Unsnapped, and unclamped: what the
 * pointer is pointing at, nothing more.
 */
export function arcAngleAtPoint(obj: ScreenObject, x: number, y: number): number {
  const size = Math.max(1, Math.round(Math.min(obj.width, obj.height)))
  const dx = x - (obj.x + size / 2)
  const dy = y - (obj.y + size / 2)
  if (dx === 0 && dy === 0) return 0
  return normDeg((Math.atan2(dx, -dy) * 180) / Math.PI)
}

/** Whether a clockwise run of degrees contains one. */
function runContains(run: { from: number; to: number }, deg: number, padding: number): boolean {
  const span = normDeg(run.to - run.from)
  const rel = normDeg(deg - run.from)
  return rel <= span + padding || rel >= 360 - padding
}

/**
 * Which cap is under this point, if either. `tolerance` is in object units,
 * so the caller scales it by the zoom to keep the target the same size on
 * screen however far the canvas is zoomed out.
 */
export function arcHandleAtPoint(
  obj: ScreenObject,
  x: number,
  y: number,
  handleSize: number,
  tolerance: number,
): "min" | "max" | null {
  const geo = arcHandleGeometry(obj, handleSize)
  const dist = Math.hypot(x - geo.cx, y - geo.cy)
  const deg = arcAngleAtPoint(obj, x, y)

  const near = (angle: number) =>
    Math.abs(((((deg - angle) % 360) + 540) % 360) - 180) <=
    (tolerance / Math.max(1, dist)) * (180 / Math.PI)

  // The line counts as much as the handle on the end of it. It is what the
  // eye sees - a mark standing at the angle - and aiming at eight pixels
  // when a whole line is drawn there would be a trick. The max end wins a
  // tie: on a full ring the two lines stand at the same angle, and the one
  // that opens the gap is the more useful to hand over.
  if (dist >= geo.innerEdge - tolerance && dist <= geo.handleEdge + tolerance) {
    if (near(geo.max.angle)) return "max"
    if (near(geo.min.angle)) return "min"
  }

  // And the handle itself, a segment across the end of its line, which is
  // wider than the line is.
  if (Math.abs(dist - geo.handleEdge) <= handleSize / 2 + tolerance) {
    const padding = (tolerance / Math.max(1, geo.handleEdge)) * (180 / Math.PI)
    if (runContains(geo.max, deg, padding)) return "max"
    if (runContains(geo.min, deg, padding)) return "min"
  }
  return null
}

/**
 * The two angles after a drag that leaves the scale `span` degrees long.
 *
 * The end that was not grabbed does not move; the other one is placed at
 * the span from it, in whichever direction the dial runs. A span of 360
 * puts them on the same angle, which is the full ring.
 */
export function arcAnglesForSpan(
  obj: ScreenObject,
  end: "min" | "max",
  span: number,
): { minAngle: number; maxAngle: number } {
  const counterClockwise = obj.properties.direction === "ccw"
  const minA = normDeg(obj.properties.minAngle ?? ARC_DEFAULT_MIN_ANGLE)
  const maxA = normDeg(obj.properties.maxAngle ?? ARC_DEFAULT_MAX_ANGLE)
  const clamped = Math.max(ARC_MIN_SPAN_DEGREES, Math.min(360, span))
  const step = counterClockwise ? -clamped : clamped
  return end === "max"
    ? { minAngle: minA, maxAngle: normDeg(minA + step) }
    : { minAngle: normDeg(maxA - step), maxAngle: maxA }
}

/**
 * How much a drag of the given end changes the span, for a pointer that has
 * moved `delta` degrees clockwise. Growing the scale means moving the max
 * end forwards, or the min end backwards - and the other way round again on
 * a counter-clockwise dial.
 */
export function arcSpanDelta(obj: ScreenObject, end: "min" | "max", delta: number): number {
  const counterClockwise = obj.properties.direction === "ccw"
  const sign = (end === "max" ? 1 : -1) * (counterClockwise ? -1 : 1)
  return delta * sign
}

/** The shortest way round from one angle to another, -180..180. */
export function arcShortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/**
 * Where along the sector a value sits, in 1/64 degree units.
 *
 * Truncated rather than rounded, mirroring the bar's own
 * `Math.trunc((innerWidth * fillPercent) / 100)` and the C assignment to an
 * int that it in turn mirrors. Sixty-fourths of a degree are fine enough
 * that the fill edge still moves smoothly - a whole degree at radius 168
 * would be nearly three pixels of arc, and the fill would visibly jump.
 */
function sweepForPercent(sweep64: number, percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent))
  return Math.trunc((sweep64 * clamped) / 100)
}

/**
 * Where a finger is, as a percentage along the ring's own sector - the
 * inverse of sweepForPercent above, so a ring set by a finger fills to the
 * point the finger touched (docs/2026-09-17-settable-level.md, decision 5).
 *
 * The angle is measured the way arcDirection() builds one: twelve o'clock is
 * up, and degrees run clockwise. A point outside the sector - in the gap at
 * the bottom of a thermostat dial - is answered with the nearer end, which is
 * what someone reaching past the end of a scale means.
 *
 * A counter-clockwise dial fills from the far end of its sector
 * (resolveArcSweep's fillFromEnd), so its zero sits there and the percentage
 * runs the other way.
 */
export function arcPercentFromPoint(obj: ScreenObject, x: number, y: number): number {
  const { start64, sweep64, fillFromEnd } = resolveArcSweep(obj)
  const size = Math.max(1, Math.round(Math.min(obj.width, obj.height)))
  const cx = obj.x + size / 2
  const cy = obj.y + size / 2

  const dx = x - cx
  const dy = y - cy
  if (dx === 0 && dy === 0) return 0

  // atan2(dx, -dy): zero straight up, growing clockwise - the same
  // orientation arcDirection() produces from an angle.
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  if (deg < 0) deg += 360

  const startDeg = start64 / ARC_ANGLE_SCALE
  const spanDeg = sweep64 / ARC_ANGLE_SCALE
  if (spanDeg <= 0) return 0

  let rel = (deg - startDeg + 360) % 360
  if (rel > spanDeg) {
    // Outside the sector: nearer to its end, or back at its start.
    const pastEnd = rel - spanDeg
    const beforeStart = 360 - rel
    rel = pastEnd <= beforeStart ? spanDeg : 0
  }

  const percent = (rel / spanDeg) * 100
  return Math.max(0, Math.min(100, fillFromEnd ? 100 - percent : percent))
}

/**
 * The value a finger at this point stands for on a ring: its position as a
 * percentage, through the calibration read backwards, snapped to the object's
 * step. What a settable arc publishes.
 */
export function arcValueFromPoint(obj: ScreenObject, x: number, y: number): number {
  const percent = arcPercentFromPoint(obj, x, y)
  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const step = typeof obj.properties.step === "number" ? obj.properties.step : 1
  return snapToStep(levelValueFromFill(percent, calibrationPoints), step)
}

/**
 * The handle's own measurements, in pixels - the slider's, bent onto a ring.
 *
 * Eleven quarters of the thickness long, an eleventh of that wide, with a gap
 * of three twenty-seconds each side: exactly lib/level-shape.ts's
 * levelHandleLength/Width/Gap, because "looks like the slider's" was the
 * whole point (docs/2026-09-22-arc-look.md).
 *
 * Two clamps a straight bar never needs. A handle longer than twice the
 * centreline's radius would reach through the middle of the dial and out the
 * other side; and one longer than a third of the scale's own run leaves the
 * fill nowhere to show. Both mirror the clamps levelHandleRect already makes.
 */
/**
 * The band's thickness, under the name both shapes now use.
 *
 * `thickness` is the arc's own name and became the bar's too on 2026-09-22 -
 * one thing, one name. `barThickness` is still read, because the projects in
 * the van are full of it and nothing here rewrites a file someone else owns.
 */
export function arcThickness(obj: ScreenObject): number {
  const named = obj.properties.thickness ?? obj.properties.barThickness
  return named ?? ARC_DEFAULT_THICKNESS
}

function arcHandleSize(thickness: number, midRadius: number, runLength: number): {
  length: number
  width: number
  gap: number
} {
  const wanted = Math.trunc((thickness * 11) / 4)
  const length = Math.max(2, Math.min(wanted, 2 * midRadius, Math.trunc(runLength / 3)))
  return {
    length,
    width: Math.max(3, Math.trunc(length / 11)),
    gap: Math.max(2, Math.trunc((length * 3) / 22)),
  }
}

/** The ring's centreline radius, in 1/8 pixel - where caps and handle sit. */
function arcMidRadius(size: number, thickness: number): number {
  return (size * ARC_SUBPIXEL_SCALE) / 2 - (thickness * ARC_SUBPIXEL_SCALE) / 2
}

/** A point on the centreline, in 1/8 pixel from the object's centre. */
function arcPointAt(size: number, thickness: number, angle64: number): { cx: number; cy: number } {
  const d = arcDirection(angle64)
  const rMid = arcMidRadius(size, thickness)
  return {
    cx: Math.round((d.x * rMid) / ARC_SIN_SCALE),
    cy: Math.round((d.y * rMid) / ARC_SIN_SCALE),
  }
}

/**
 * The two rounded ends of a scale - null where it goes all the way round,
 * because then there are no ends.
 *
 * Exported so the reference harness can drive this rather than a copy of it:
 * a cap half a pixel out of place is exactly the kind of difference the
 * pixel comparison exists to catch, and a second implementation of it in a
 * test would be a second chance to get it wrong.
 */
export function arcCaps(
  size: number,
  thickness: number,
  start64: number,
  sweep64: number,
): { startCap: ArcCap | null; endCap: ArcCap | null } {
  if (sweep64 >= ARC_FULL_TURN) return { startCap: null, endCap: null }
  const r = Math.trunc((thickness * ARC_SUBPIXEL_SCALE) / 2)
  const startTangent = arcDirection(start64 - 90 * ARC_ANGLE_SCALE)
  const endTangent = arcDirection(start64 + sweep64 + 90 * ARC_ANGLE_SCALE)
  return {
    startCap: { ...arcPointAt(size, thickness, start64), tx: startTangent.x, ty: startTangent.y, r },
    endCap: {
      ...arcPointAt(size, thickness, start64 + sweep64),
      tx: endTangent.x,
      ty: endTangent.y,
      r,
    },
  }
}

/** The handle lying across the band at `angle64`. See [arcHandleSize]. */
export function arcHandleBand(
  size: number,
  thickness: number,
  angle64: number,
  sweep64: number,
): ArcHandle {
  const rMid = arcMidRadius(size, thickness)
  // The scale's own length along the centreline: 2*pi*r * sweep/turn, in
  // whole 1/8 pixels. 355/113 is pi to seven digits, in integers, so every
  // copy of this arrives at the same number.
  const runLength = Math.trunc((2 * 355 * rMid * sweep64) / (113 * ARC_FULL_TURN))
  const measured = arcHandleSize(thickness * ARC_SUBPIXEL_SCALE, rMid, runLength)
  const radial = arcDirection(angle64)
  const tangent = arcDirection(angle64 + 90 * ARC_ANGLE_SCALE)
  return {
    ...arcPointAt(size, thickness, angle64),
    tx: tangent.x,
    ty: tangent.y,
    rx: radial.x,
    ry: radial.y,
    halfWidth: Math.max(1, Math.trunc(measured.width / 2)),
    halfLength: Math.max(1, Math.trunc(measured.length / 2)),
    gap: measured.gap,
  }
}

function buildGeometry(
  obj: ScreenObject,
  fillPercent: number,
  setpointPercent: number | null,
  framed: boolean,
): ArcRingGeometry {
  const size = Math.max(1, Math.round(Math.min(obj.width, obj.height)))
  const thickness = Math.min(
    Math.max(1, Math.round(arcThickness(obj))),
    Math.floor(size / 2),
  )
  const { start64, sweep64, fillFromEnd } = resolveArcSweep(obj)

  const filled = sweepForPercent(sweep64, fillPercent)
  const fillStart64 = fillFromEnd ? start64 + sweep64 - filled : start64
  const { startCap, endCap } = arcCaps(size, thickness, start64, sweep64)

  let handle: ArcHandle | null = null
  if (setpointPercent !== null) {
    const atSetpoint = sweepForPercent(sweep64, setpointPercent)
    const angle64 = fillFromEnd ? start64 + sweep64 - atSetpoint : start64 + atSetpoint
    handle = arcHandleBand(size, thickness, angle64, sweep64)
  }

  return {
    size,
    thickness,
    track: makeArcSector(start64, sweep64),
    fill: makeArcSector(fillStart64, filled),
    startCap,
    endCap,
    // A cap belongs to the fill when the fill actually reaches that end.
    startCapFilled: filled > 0 && fillStart64 === start64,
    endCapFilled: filled > 0 && fillStart64 + filled >= start64 + sweep64,
    handle,
    framed,
  }
}

export function renderArcLevel(options: RenderArcLevelOptions): void {
  const { ctx, obj, fonts, bdfFontCache, getPreviewValueFromTopic, colorDepth, screenBackgroundColor, requestRedraw } =
    options
  const getAskedValueFromTopic = options.getAskedValueFromTopic || (() => "")

  // Without a value (hasNoValue()) the track alone is drawn: no fill - not
  // even what the calibration makes of 0 - no marker, no number.
  const rawValue = getPreviewValueFromTopic(obj.properties.topic)
  const noValue = hasNoValue(rawValue)
  const numericValue = Number.parseFloat(rawValue) || 0
  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const fillPercent = noValue ? 0 : calculateLevelIndicatorFill(numericValue, calibrationPoints)

  // What was asked for, if anything: a request a finger just made here first,
  // otherwise a setpoint topic's reported value. Nothing asked and nothing
  // reported, no marker - a water level has nothing to aim at.
  const markerTopic = (obj.properties.setpointTopic as string | undefined) || (obj.properties.topic as string | undefined)
  const rawMarker = (() => {
    const asked = getAskedValueFromTopic(markerTopic)
    if (!hasNoValue(asked)) return asked
    if (obj.properties.setpointTopic) return getPreviewValueFromTopic(obj.properties.setpointTopic)
    return ""
  })()
  let setpointPercent: number | null = null
  if (!noValue && !hasNoValue(rawMarker)) {
    setpointPercent = calculateLevelIndicatorFill(Number.parseFloat(rawMarker) || 0, calibrationPoints)
  }

  // One colour the author sets; everything else follows from it and from
  // what the ring stands on - the same rule, and the same function, the bar
  // uses for its own track (docs/2026-09-22-arc-look.md). The ring has no
  // background, no track colour and no marker colour of its own any more.
  const fill = applyColorDepth(obj.properties.fillColor || "#4CAF50", colorDepth)
  const ground = applyColorDepth(screenBackgroundColor || "#ffffff", colorDepth)
  const look = levelTrackLook(fill, ground, colorDepth)
  const mixInto = toRgb565(ground)
  const fillColour = toRgb565(fill)
  // Where the mixed track cannot be told from the background, the band is
  // drawn as an outline in the bar's own colour instead of a body in a
  // colour nobody would see.
  const trackColour = look.framed ? fillColour : toRgb565(applyColorDepth(look.track, colorDepth))
  // The handle is the fill's colour: handle and filled track are one object
  // that the gap separates, which is the slider's reading and the user's own
  // choice on 2026-09-19.
  const handleColour = fillColour

  const geom = buildGeometry(obj, fillPercent, setpointPercent, look.framed)

  const size = geom.size
  const buffer = document.createElement("canvas")
  buffer.width = size
  buffer.height = size
  const bufferCtx = buffer.getContext("2d")
  if (!bufferCtx) return
  const image = bufferCtx.createImageData(size, size)
  const data = image.data

  // Nothing but the ring is painted: the object has no background of its
  // own, so whatever is behind it - a screen colour, a background image -
  // shows through everywhere the band is not.
  const flatBackground = null as { r: number; g: number; b: number } | null

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const bands = arcPixelBands(geom, px, py)
      const covered = bands.fill + bands.track + bands.handle
      const at = (py * size + px) * 4

      if (covered === 0) {
        // Nothing of the ring here. With an opaque background the object
        // still owns its square; with a transparent one the pixel is left
        // alone, exactly as "transparent" means everywhere else in this
        // system - skip the draw, never mix.
        if (flatBackground) {
          data[at] = flatBackground.r
          data[at + 1] = flatBackground.g
          data[at + 2] = flatBackground.b
          data[at + 3] = 255
        }
        continue
      }

      const mixed = blendBands(
        [
          { colour: fillColour, count: bands.fill },
          { colour: trackColour, count: bands.track },
          { colour: handleColour, count: bands.handle },
        ],
        mixInto,
        ARC_COVERAGE_MAX - covered,
      )
      const out = fromRgb565(mixed)
      data[at] = out.r
      data[at + 1] = out.g
      data[at + 2] = out.b
      data[at + 3] = 255
    }
  }

  bufferCtx.putImageData(image, 0, 0)

  const previousSmoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, Math.round(obj.x), Math.round(obj.y))
  ctx.imageSmoothingEnabled = previousSmoothing

  // The numbers, the way the bar says them (render-level-indicator.ts):
  // the big one is the COMMANDED value - where the handle points, and what a
  // finger just changed - and the measured one only appears when it says
  // something the big one does not. A ring shows them one above the other
  // rather than side by side: it has the room, and it has no header line to
  // lay them out on.
  const displayValue = obj.properties.displayValue || "value"
  if (displayValue !== "none" && !noValue) {
    const asText = (raw: string, percent: number) =>
      displayValue === "percentage" ? `${Math.round(percent)}%` : raw
    const measured = asText(rawValue, fillPercent)
    const commanded = setpointPercent !== null ? asText(rawMarker, setpointPercent) : measured
    const showsSub = setpointPercent !== null && measured !== commanded
    drawCentredValue(
      ctx,
      obj,
      commanded,
      showsSub ? `(${measured})` : null,
      fonts,
      bdfFontCache,
      colorDepth,
      requestRedraw,
    )
  }
}

/**
 * Centres the value in the ring.
 *
 * Follows render-level-indicator.ts's own centring rather than the label
 * engine's: the bar and the ring are siblings showing the same value the
 * same way, and both are ported to the same firmware routine. Matching the
 * bar keeps that port honest; matching the label would not.
 */
/** Between the commanded number and the measured one under it. */
const ARC_SUB_GAP = 2

/**
 * The smaller font the bracketed number is written in - the bar's own choice
 * (levelSubFont), so the two controls pick the same face for the same job.
 */
function loadSubBdf(
  obj: ScreenObject,
  fonts: ProjectFont[],
  cache: Map<string, BDFFont>,
): BDFFont | null {
  const meta = levelSubFont(fonts, obj)
  if (!meta || meta.format === "ttf" || !meta.data) return null
  const hit = cache.get(meta.id)
  if (hit) return hit
  try {
    const font = new BDFFont(meta.data)
    cache.set(meta.id, font)
    return font
  } catch (error) {
    console.error("Failed to parse the arc's smaller font:", error)
    return null
  }
}

function drawCentredValue(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  text: string,
  /** The measured value in brackets, under the commanded one - or null. */
  sub: string | null,
  fonts: ProjectFont[],
  bdfFontCache: Map<string, BDFFont>,
  colorDepth: string | undefined,
  requestRedraw?: () => void,
): void {
  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const textColor = applyColorDepth(obj.properties.textColor || obj.properties.color || "#ffffff", colorDepth)
  ctx.fillStyle = textColor

  let bdfFont: BDFFont | null = null
  if (obj.properties.fontId && fontMeta && fontMeta.format !== "ttf") {
    bdfFont = bdfFontCache.get(obj.properties.fontId) || null
    if (!bdfFont && fontMeta.data) {
      try {
        bdfFont = new BDFFont(fontMeta.data)
        bdfFontCache.set(obj.properties.fontId, bdfFont)
      } catch (error) {
        console.error("Failed to parse BDF font for arc level:", error)
        bdfFont = null
      }
    }
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(obj.x, obj.y, obj.width, obj.height)
  ctx.clip()

  if (bdfFont) {
    const metrics = bdfFont.measureText(text)
    const ascent = bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14
    const descent = bdfFont.properties["FONT_DESCENT"] || bdfFont.properties["DESCENT"] || 4
    const line = ascent + descent
    // A second line, when there is one: the pair is centred together, so the
    // big number does not jump the moment a setpoint arrives.
    const subFont = sub ? loadSubBdf(obj, fonts, bdfFontCache) : null
    const subLine = subFont
      ? (subFont.properties["FONT_ASCENT"] || 10) + (subFont.properties["FONT_DESCENT"] || 3)
      : 0
    const block = line + (sub ? subLine + ARC_SUB_GAP : 0)
    const top = obj.y + (obj.height - block) / 2
    const textX = alignToPixel(obj.x + (obj.width - metrics.width) / 2)
    bdfFont.drawText(ctx, text, textX, alignToPixel(top + ascent))
    if (sub && subFont) {
      const subMetrics = subFont.measureText(sub)
      subFont.drawText(
        ctx,
        sub,
        alignToPixel(obj.x + (obj.width - subMetrics.width) / 2),
        alignToPixel(top + line + ARC_SUB_GAP + (subFont.properties["FONT_ASCENT"] || 10)),
      )
    }
  } else {
    const isTtf = fontMeta?.format === "ttf"
    if (isTtf && !isTtfFontLoaded(fontMeta)) {
      ensureTtfFontRegistered(fontMeta, requestRedraw ?? (() => {}))
    }
    const fontSize = isTtf ? fontMeta!.size : obj.properties.fontSize || 14
    const fontFamily = isTtf ? (fontMeta!.internalName ?? fontMeta!.name) : obj.properties.fontFamily || "Arial"
    const weight = obj.properties.fontWeight || "normal"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    if (!sub) {
      ctx.font = `${weight} ${fontSize}px "${fontFamily}"`
      ctx.fillText(text, obj.x + obj.width / 2, obj.y + obj.height / 2)
    } else {
      // Two thirds, like the bar's bracketed number, and the pair centred
      // together so the big one keeps its place.
      const subSize = Math.max(6, Math.trunc((fontSize * 2) / 3))
      const block = fontSize + ARC_SUB_GAP + subSize
      const middle = obj.y + obj.height / 2
      ctx.font = `${weight} ${fontSize}px "${fontFamily}"`
      ctx.fillText(text, obj.x + obj.width / 2, middle - block / 2 + fontSize / 2)
      ctx.font = `${weight} ${subSize}px "${fontFamily}"`
      ctx.fillText(sub, obj.x + obj.width / 2, middle + block / 2 - subSize / 2)
    }
  }

  ctx.restore()
}

export const ARC_FULL_TURN_64 = ARC_FULL_TURN
