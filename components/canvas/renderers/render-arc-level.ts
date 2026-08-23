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
import { applyColorDepth } from "@/lib/color-depth"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { calculateLevelIndicatorFill } from "./render-level-indicator"
import {
  ARC_ANGLE_SCALE,
  ARC_COVERAGE_MAX,
  ARC_FULL_TURN,
  arcPixelBands,
  blendBands,
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

function buildGeometry(obj: ScreenObject, fillPercent: number, setpointPercent: number | null): ArcRingGeometry {
  const size = Math.max(1, Math.round(Math.min(obj.width, obj.height)))
  const thickness = Math.max(1, Math.round(obj.properties.thickness ?? ARC_DEFAULT_THICKNESS))
  const { start64, sweep64, fillFromEnd } = resolveArcSweep(obj)

  const filled = sweepForPercent(sweep64, fillPercent)
  const fillStart64 = fillFromEnd ? start64 + sweep64 - filled : start64

  let marker = makeArcSector(0, 0)
  if (setpointPercent !== null) {
    const at = sweepForPercent(sweep64, setpointPercent)
    const centreAt = fillFromEnd ? start64 + sweep64 - at : start64 + at
    const width64 =
      Math.max(1, Math.round(obj.properties.markerWidth ?? ARC_DEFAULT_MARKER_WIDTH_DEGREES)) * ARC_ANGLE_SCALE
    marker = makeArcSector(centreAt - width64 / 2, width64)
  }

  return {
    size,
    thickness: Math.min(thickness, Math.floor(size / 2)),
    track: makeArcSector(start64, sweep64),
    fill: makeArcSector(fillStart64, filled),
    marker,
  }
}

export function renderArcLevel(options: RenderArcLevelOptions): void {
  const { ctx, obj, fonts, bdfFontCache, getPreviewValueFromTopic, colorDepth, screenBackgroundColor, requestRedraw } =
    options

  const rawValue = getPreviewValueFromTopic(obj.properties.topic) || "50"
  const numericValue = Number.parseFloat(rawValue) || 0
  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const fillPercent = calculateLevelIndicatorFill(numericValue, calibrationPoints)

  // No setpoint topic, no marker - a water level has nothing to aim at.
  let setpointPercent: number | null = null
  if (obj.properties.setpointTopic) {
    const rawSetpoint = getPreviewValueFromTopic(obj.properties.setpointTopic)
    if (rawSetpoint !== undefined && rawSetpoint !== "") {
      setpointPercent = calculateLevelIndicatorFill(Number.parseFloat(rawSetpoint) || 0, calibrationPoints)
    }
  }

  const geom = buildGeometry(obj, fillPercent, setpointPercent)

  const backgroundColor = applyColorDepth(obj.properties.backgroundColor || "transparent", colorDepth)
  const backgroundIsTransparent = !backgroundColor || backgroundColor === "transparent"
  const mixInto = toRgb565(
    backgroundIsTransparent ? applyColorDepth(screenBackgroundColor || "#000000", colorDepth) : backgroundColor,
  )
  const trackColour = toRgb565(applyColorDepth(obj.properties.trackColor || "#303030", colorDepth))
  const fillColour = toRgb565(applyColorDepth(obj.properties.fillColor || "#4CAF50", colorDepth))
  const markerColour = toRgb565(applyColorDepth(obj.properties.markerColor || "#ffffff", colorDepth))

  const size = geom.size
  const buffer = document.createElement("canvas")
  buffer.width = size
  buffer.height = size
  const bufferCtx = buffer.getContext("2d")
  if (!bufferCtx) return
  const image = bufferCtx.createImageData(size, size)
  const data = image.data

  const opaqueBackground: Rgb565 | null = backgroundIsTransparent ? null : mixInto
  const flatBackground = opaqueBackground ? fromRgb565(opaqueBackground) : null

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const bands = arcPixelBands(geom, px, py)
      const covered = bands.fill + bands.track + bands.marker
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
          { colour: markerColour, count: bands.marker },
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

  const displayValue = obj.properties.displayValue || "value"
  if (displayValue !== "none") {
    const text = displayValue === "percentage" ? `${Math.round(fillPercent)}%` : rawValue
    drawCentredValue(ctx, obj, text, fonts, bdfFontCache, colorDepth, requestRedraw)
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
function drawCentredValue(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  text: string,
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
    const textX = alignToPixel(obj.x + (obj.width - metrics.width) / 2)
    const baselineY = alignToPixel(obj.y + (obj.height - (ascent + descent)) / 2 + ascent)
    bdfFont.drawText(ctx, text, textX, baselineY)
  } else {
    const isTtf = fontMeta?.format === "ttf"
    if (isTtf && !isTtfFontLoaded(fontMeta)) {
      ensureTtfFontRegistered(fontMeta, requestRedraw ?? (() => {}))
    }
    const fontSize = isTtf ? fontMeta!.size : obj.properties.fontSize || 14
    const fontFamily = isTtf ? (fontMeta!.internalName ?? fontMeta!.name) : obj.properties.fontFamily || "Arial"
    ctx.font = `${obj.properties.fontWeight || "normal"} ${fontSize}px "${fontFamily}"`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, obj.x + obj.width / 2, obj.y + obj.height / 2)
  }

  ctx.restore()
}

// Re-exported so the property panel can offer the same presets the firmware
// defaults to, without either restating the numbers.
export const ARC_PRESETS: { label: string; minAngle: number; maxAngle: number }[] = [
  { label: "Voll", minAngle: 0, maxAngle: 0 },
  { label: "Thermostat", minAngle: 225, maxAngle: 135 },
  { label: "Tacho", minAngle: 240, maxAngle: 120 },
  { label: "Halbrund", minAngle: 270, maxAngle: 90 },
]

export const ARC_FULL_TURN_64 = ARC_FULL_TURN
