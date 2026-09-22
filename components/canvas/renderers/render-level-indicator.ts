/**
 * Level Indicator renderer - handles level indicator bars with calibration points
 */

import type { ScreenObject, ProjectAsset, ProjectFont, Topic } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { alignToPixel, alignToPixelBoundary } from "@/lib/font-utils"
import { applyColorDepth } from "@/lib/color-depth"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { hasNoValue } from "@/lib/render-screen"
import { iconCacheKey, rasterisedIconOnBaseline, tintedIconDataUrl } from "@/lib/svg-utils"
import { fillRoundRect } from "@/components/canvas/renderers/render-box"
import {
  LEVEL_GAP,
  levelDirection,
  levelEdgeFor,
  levelFillsFromEnd,
  levelEmptyTrack,
  levelFontMetrics,
  levelFontSize,
  levelFrameInner,
  levelHasHandle,
  levelHandleRect,
  levelIsVertical,
  levelLayout,
  levelLineHeight,
  levelName,
  levelSegments,
  levelShowsNumber,
  levelShowsSub,
  levelTrackLook,
  levelTrackRect,
  type LevelLayout,
  type LevelRect,
  type LevelSegment,
} from "@/lib/level-shape"
import { isLevelType, isArcType } from "@/lib/object-types"

interface RenderLevelIndicatorOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  topics: Topic[]
  zoom: number
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  /**
   * What a finger here asked this level to become, keyed by the topic the
   * request was about. A level with a `writeTopic` and no `setpointTopic` -
   * a dimmer - has nowhere else to show its request: the device remembers it
   * itself (docs/2026-09-17-settable-level.md, decision 6c), and so must the
   * preview, or the designer shows nothing where the glass shows a marker.
   */
  getAskedValueFromTopic?: (topicName: string | undefined) => string
  colorDepth?: string
  /**
   * The screen's background colour, which is what the object sits on now that
   * it has none of its own - and half of what the track's colour is mixed from
   * (levelTrackLook). Absent means white, the editor's own default.
   */
  screenBackgroundColor?: string
  requestRedraw?: () => void
  /** For the header line's icon - the same two the icon object itself takes. */
  projectAssets?: ProjectAsset[]
  iconImageCache?: Map<string, HTMLImageElement>
}

export function renderLevelIndicator(options: RenderLevelIndicatorOptions): void {
  const { ctx, obj, fonts, zoom, bdfFontCache, getPreviewValueFromTopic, colorDepth, requestRedraw } = options
  const getAskedValueFromTopic = options.getAskedValueFromTopic || (() => "")

  // No background and no border: the bar is drawn on whatever the screen is,
  // and the unfilled track is worked out from the bar's colour and that
  // background (levelTrackLook, docs/2026-09-19-slider-look.md decision 12).
  // Until 2026-09-19 this painted a box of its own, and until the same day it
  // quantised that box's colour to black or white on 1-bit - a real HIL
  // mismatch found on 2026-07-21. There is no such colour left to get wrong.
  const fillColor = applyColorDepth(obj.properties.fillColor || "#4CAF50", colorDepth)
  const look = levelTrackLook(fillColor, options.screenBackgroundColor || "#ffffff", colorDepth)

  // The header line before anything that depends on a value, because the icon
  // and the name do not. A bar that has heard nothing still says what it is
  // (docs/2026-09-19-slider-look.md, decision 9).
  const layout = levelLayout(obj, fonts)
  const levelFontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const textColor = applyColorDepth(obj.properties.textColor || "#000000", colorDepth)
  const mainText: LevelText = {
    ctx,
    obj,
    fontMeta: levelFontMeta,
    size: levelTextSize(obj, levelFontMeta),
    bdfFontCache,
    colour: textColor,
    requestRedraw,
  }
  if (layout.icon) {
    drawHeaderIcon(ctx, obj, layout.icon, options.projectAssets, options.iconImageCache, requestRedraw)
  }

  // Nothing has arrived yet: the empty track, the name, and neither fill nor
  // number.
  //
  // The track claims no value - it is the shape of the control, the way the arc
  // has always drawn its ring without one - while an empty *fill* would claim
  // an empty tank, which is the rule from docs/2026-09-15-live-data.md and
  // still holds.
  const rawLevelValue = getPreviewValueFromTopic(obj.properties.topic)
  if (hasNoValue(rawLevelValue)) {
    if (layout.text) drawHeaderName(mainText, layout, layout.text.x + layout.text.w)
    drawLevelShape(ctx, obj, null, null, fillColor, look, fonts)
    return
  }
  const numericLevelValue = Number.parseFloat(rawLevelValue) || 0

  // Calculate fill percentage based on calibration points
  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const fillPercent = calculateLevelIndicatorFill(numericLevelValue, calibrationPoints)

  const displayValue = obj.properties.displayValue || "value"

  // The marker: what was asked for, beside what is measured
  // (docs/2026-09-17-settable-level.md, decision 6c). Two ways to know it, in
  // this order - a request a finger just made here, and otherwise whatever the
  // installation reports on a setpoint topic. A request is keyed by the topic
  // it was about (the setpoint topic when there is one, else the read topic),
  // exactly as the firmware keys its own, and it is dropped the moment a
  // message arrives on that topic. Neither one, no marker: a level that has
  // heard nothing shows nothing (decision 6 of 2026-09-15-live-data.md).
  // Only a control that can HAVE a handle ever shows one, whatever is
  // outstanding on its topic.
  //
  // An asked value is keyed by topic, so two objects reading one dimmer both
  // show the request - which is right for two sliders and wrong for a plain
  // tank gauge that happens to share the topic: it has no affordance, and
  // its layout reserved no room, so the handle came out clamped to the
  // track's own thickness. A stub (reported from the preview, 2026-09-22).
  //
  // levelHasHandle is what the geometry already asks, so asking it here too
  // makes the picture and the room agree by construction rather than by
  // coincidence.
  const markerTopic = (obj.properties.setpointTopic as string | undefined) || (obj.properties.topic as string | undefined)
  const rawMarker = (() => {
    if (!levelHasHandle(obj)) return ""
    const asked = getAskedValueFromTopic(markerTopic)
    if (!hasNoValue(asked)) return asked
    if (obj.properties.setpointTopic) return getPreviewValueFromTopic(obj.properties.setpointTopic)
    // A settable bar with no second topic rests its handle on the value the
    // installation reports: with nothing outstanding, what was last commanded
    // IS what is reported. That is what makes the handle an affordance rather
    // than only a pending-command light - the question "kann ich hier etwas
    // einstellen?" that started this (2026-09-19). Displaced from the fill it
    // means a command is still on its way; sitting on the fill's edge it means
    // everything agrees.
    if (isSettableLevel(obj)) return rawLevelValue
    return ""
  })()
  let setpointPercent: number | null = null
  if (!hasNoValue(rawMarker)) {
    setpointPercent = Math.max(
      0,
      Math.min(100, calculateLevelIndicatorFill(Number.parseFloat(rawMarker) || 0, calibrationPoints)),
    )
  }

  drawLevelShape(ctx, obj, fillPercent, setpointPercent, fillColor, look, fonts)

  // The numbers - never over the bar any more.
  //
  // This used to be two passes of one number straddling the fill's edge: the
  // same digits in the fill's colour and again in the background's, clipped to
  // the fill, so they stayed readable on both sides. With Material's 16 px
  // track no number fits inside the bar at all, so the trick has nothing left
  // to do (docs/2026-09-19-slider-look.md, decision 10). One pass, one place.
  //
  // The big one is the commanded value - where the handle points, and what a
  // finger just changed. The measured value only appears when it says
  // something the big one does not.
  const asText = (raw: string, percent: number) => (displayValue === "percentage" ? `${Math.round(percent)}%` : raw)
  const measured = asText(rawLevelValue, fillPercent)
  const commanded = setpointPercent !== null ? asText(rawMarker, setpointPercent) : measured

  if (layout.text) {
    // On the header line, right to left: the commanded number against the
    // object's right edge, the measured one immediately to its left, and the
    // name into whatever is left over. Each at its measured width, so a number
    // is never cut off - a reserve guessed from the font size clipped the
    // bracketed one on the first drag with helvR24 (2026-09-19). Where the line
    // is too short for all three, it is the name that gives way: a clipped name
    // is still recognisable, a clipped number is a wrong number.
    let right = layout.text.x + layout.text.w
    if (levelShowsNumber(obj)) {
      right = drawRightAligned(mainText, layout.text, layout.baseline, commanded, right) - LEVEL_GAP
      if (levelShowsSub(obj) && measured !== commanded) {
        // In brackets rather than behind a word: the designer's own interface
        // is English, the projects on it are not, and a bracket needs no
        // language. Smaller too - and since a BDF font cannot be scaled, that
        // means a different font, picked from the project's own list by
        // levelSubFont(). It stands on the same baseline as the big one.
        const subMeta = levelSubFont(fonts, obj) || levelFontMeta
        const subText: LevelText = { ...mainText, fontMeta: subMeta, size: levelSubTextSize(obj, subMeta, levelFontMeta) }
        right = drawRightAligned(subText, layout.text, layout.baseline, `(${measured})`, right) - LEVEL_GAP
      }
    }
    drawHeaderName(mainText, layout, right)
  } else if (layout.value) {
    drawRightAligned(mainText, layout.value, layout.baseline, commanded, layout.value.x + layout.value.w)
  }
}

/**
 * The smaller font the measured value is written in, out of the project's own
 * list. A BDF font is a grid of bitmaps and cannot be scaled, so "smaller" has
 * to mean *another font* - which is why this is a choice rather than a number.
 *
 * The same family first (`font-helvR12` and `font-helvR08` share `font-helvR`),
 * because mixing a bold face into a regular line looks like a mistake; then any
 * font small enough; and if the project has nothing smaller, the object's own
 * font, which merely looks unremarkable.
 */
export function levelSubFont(fonts: ProjectFont[] | undefined, obj: ScreenObject): ProjectFont | undefined {
  if (!fonts || fonts.length === 0) return undefined
  const own = fonts.find((f) => f.id === obj.properties.fontId)
  // Two thirds of the object's own line, in the unit a project font's `size`
  // is in (ascent plus descent for a BDF): helvR24 -> helvR12, helvR18 ->
  // helvR12, helvR12 -> helvR08. It was two thirds of `fontSize` until
  // 2026-09-19, which the font picker never updates - a helvR24 bar still
  // saying 12 asked for 8, found nothing that small and wrote its bracketed
  // number in helvR24.
  const wanted = Math.trunc((levelLineHeight(levelFontMetrics(obj, fonts)) * 2) / 3)
  const family = (id: string) => id.replace(/\d+$/, "")
  const ownFamily = own ? family(own.id) : ""
  const smaller = fonts.filter((f) => typeof f.size === "number" && f.size <= wanted)
  const best = (list: ProjectFont[]) => list.sort((a, b) => b.size - a.size)[0]
  return best(smaller.filter((f) => family(f.id) === ownFamily)) || best(smaller) || own
}

// Exported for reuse by render-mqtt-data-line.ts: MqttDataLine's own
// {value, barSizePercent} calibration points (reinterpreted there as
// value->strokeWidth-in-px, not a literal percentage) drive through this
// exact same sort/clamp/linear-interpolate function rather than a
// duplicate copy - see that file's header comment for why the field name
// stays as-is (2026-07-31 grill-me session).
export function calculateLevelIndicatorFill(value: number, calibrationPoints: any[]): number {
  if (!calibrationPoints || calibrationPoints.length === 0) {
    return 0
  }

  // Sort calibration points by value
  const sortedPoints = [...calibrationPoints].sort((a, b) => a.value - b.value)

  // If value is below the lowest point, return the lowest bar size
  if (value <= sortedPoints[0].value) {
    return sortedPoints[0].barSizePercent
  }

  // If value is above the highest point, return the highest bar size
  if (value >= sortedPoints[sortedPoints.length - 1].value) {
    return sortedPoints[sortedPoints.length - 1].barSizePercent
  }

  // Find the two points to interpolate between
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const point1 = sortedPoints[i]
    const point2 = sortedPoints[i + 1]

    if (value >= point1.value && value <= point2.value) {
      // Linear interpolation
      const ratio = (value - point1.value) / (point2.value - point1.value)
      return point1.barSizePercent + ratio * (point2.barSizePercent - point1.barSizePercent)
    }
  }

  return 0
}

// The same interpolation read the other way: a finger has a position, which
// is a percentage of the bar, and what has to be published is the value that
// percentage stands for (docs/2026-09-17-settable-level.md, decision 5).
//
// Written beside its forward counterpart on purpose - the two have to agree
// for a dragged bar to sit where the finger left it once the value comes back
// from the broker.
//
// Sorted by value like the forward direction, so a calibration whose
// percentages fall as the value rises (a bar that empties) inverts too. A
// segment whose two percentages are equal has no value to give - a range of
// positions all mean the same reading - so its lower value is taken rather
// than dividing by zero.
export function levelValueFromFill(fillPercent: number, calibrationPoints: any[]): number {
  if (!calibrationPoints || calibrationPoints.length === 0) return 0
  const sortedPoints = [...calibrationPoints].sort((a, b) => a.value - b.value)
  if (sortedPoints.length === 1) return sortedPoints[0].value

  const first = sortedPoints[0]
  const last = sortedPoints[sortedPoints.length - 1]
  const rising = last.barSizePercent >= first.barSizePercent
  if (rising ? fillPercent <= first.barSizePercent : fillPercent >= first.barSizePercent) return first.value
  if (rising ? fillPercent >= last.barSizePercent : fillPercent <= last.barSizePercent) return last.value

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const point1 = sortedPoints[i]
    const point2 = sortedPoints[i + 1]
    const low = Math.min(point1.barSizePercent, point2.barSizePercent)
    const high = Math.max(point1.barSizePercent, point2.barSizePercent)
    if (fillPercent < low || fillPercent > high) continue
    if (point2.barSizePercent === point1.barSizePercent) return point1.value
    const ratio = (fillPercent - point1.barSizePercent) / (point2.barSizePercent - point1.barSizePercent)
    return point1.value + ratio * (point2.value - point1.value)
  }

  return first.value
}

// Snaps a value to a step, so a drag reports 35 and 40 rather than 37 and
// then 38 (decision 4). A step of 0 or less means no snapping.
export function snapToStep(value: number, step: number | undefined): number {
  if (!step || step <= 0) return value
  return Math.round(value / step) * step
}

// Where a finger is, as a percentage of the bar (docs/2026-09-17-settable-
// level.md, decision 2). Coordinates are the object's own, absolute ones, the
// same ones a hit test works in.
//
// Measured against the TRACK, not the object, so the two cannot drift: the bar
// no longer fills the rectangle it is given - a header line takes room off the
// top and the number takes room off the end - and a finger has to mean the same
// place the picture shows. levelLayout() derives all of that from the object
// and its font's vertical measure, with no text to measure - which is why the
// fonts have to be passed here too: a header as tall as the font's line pushes
// the bar down by exactly that much (lib/level-shape.ts).
//
// A bar with no header and no number is inset by exactly the 4 it always was,
// so no existing calibration moves.
export function levelPercentFromPoint(
  obj: ScreenObject,
  x: number,
  y: number,
  fonts?: readonly ProjectFont[] | null,
): number {
  const barDirection = levelDirection(obj)
  const track = levelTrackRect(obj, fonts)
  const w = Math.max(1, track.w)
  const h = Math.max(1, track.h)

  const along = (() => {
    switch (barDirection) {
      case "right-to-left":
        return (track.x + track.w - x) / w
      case "bottom-to-top":
        return (track.y + track.h - y) / h
      case "top-to-bottom":
        return (y - track.y) / h
      case "left-to-right":
      default:
        return (x - track.x) / w
    }
  })()

  return Math.max(0, Math.min(100, along * 100))
}

// The value a finger at this point stands for: the position as a percentage,
// through the calibration, snapped to the object's step. What a settable
// level publishes.
export function levelValueFromPoint(
  obj: ScreenObject,
  x: number,
  y: number,
  fonts?: readonly ProjectFont[] | null,
): number {
  const percent = levelPercentFromPoint(obj, x, y, fonts)
  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const step = typeof obj.properties.step === "number" ? obj.properties.step : 1
  return snapToStep(levelValueFromFill(percent, calibrationPoints), step)
}

// A level is settable when it has somewhere to write to - nothing else about
// it changes (decision 1). Both types answer here, but only the bar can be
// dragged so far: levelValueFromPoint above is rectangle geometry, and the
// ring's own sector arithmetic follows (decision 7), so the canvas checks the
// type as well until it does.
export function isSettableLevel(obj: ScreenObject): boolean {
  return (
    (isLevelType(obj.type) || isArcType(obj.type)) &&
    typeof obj.properties.writeTopic === "string" &&
    obj.properties.writeTopic.trim() !== ""
  )
}

// Everything a level indicator paints, in one place: the track in runs, and
// then the handle over it.
//
// The order matters and was paid for once already: the marker used to be drawn
// before the number and ended up underneath the digits - nineteen differing
// pixels in a conformance run, because the designer draws it over them
// (2026-09-17). The fill, then the marker, then the number's second pass.
/**
 * What the handle is painted with: the fill's colour where a finger can move
 * it, the track's where it only reports.
 */
export function handleColourFor(
  obj: ScreenObject,
  fillColor: string,
  look: { track: string; framed: boolean },
): string {
  const write = obj.properties.writeTopic
  const settable = typeof write === "string" && write.trim() !== ""
  return settable || look.framed ? fillColor : look.track
}

function drawLevelShape(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  fillPercent: number | null,
  markerPercent: number | null,
  fillColor: string,
  look: { track: string; framed: boolean },
  fonts: ProjectFont[] | undefined,
): void {
  // One stroke or none, and the stroke is always this one shape: overhanging,
  // with the gap. The tick that used to be drawn inside an unbroken track for a
  // reported-but-not-settable setpoint is gone - it was rejected on glass, and
  // the reason is that a stroke that means "settable" has to look the same
  // everywhere it appears (docs/2026-09-19-slider-look.md, decision 4).
  const handle = markerPercent !== null ? levelHandleRect(obj, markerPercent, fonts) : null

  const width = Math.max(1, Math.trunc(obj.width))
  const height = Math.max(1, Math.trunc(obj.height))

  // Into an offscreen buffer at 1:1, then blitted with smoothing off - the
  // same thing render-arc-level.ts does, and for the same reason.
  //
  // A pill's rounded cap is drawn as a column of one-pixel-wide rectangles
  // (Adafruit's fillCircleHelper, ported whole so the firmware and this agree
  // to the pixel). Painted straight onto a canvas the editor has scaled, every
  // one of those columns gets its own soft edge and they do not add up to an
  // opaque cap: measured on 2026-09-19, #4CAF50 came out as 111,186,115 at the
  // ends against 76,175,80 in the middle, which is exactly what the user saw
  // as "die farben an den enden laufen auseinander". At 1:1 there are no
  // fractional edges to soften.
  const buffer = document.createElement("canvas")
  buffer.width = width
  buffer.height = height
  const bctx = buffer.getContext("2d")
  if (!bctx) return
  const ox = Math.trunc(obj.x)
  const oy = Math.trunc(obj.y)

  const pill = (r: LevelRect, colour: string) => fillRoundRect(bctx, r.x - ox, r.y - oy, r.w, r.h, r.r, colour)

  const vertical = levelIsVertical(obj)

  // One run of track or fill, painted flush at the ends that are not the
  // track's own so two runs meet instead of curving away from each other.
  const run = (seg: LevelSegment, colour: string) => {
    if (colour === "transparent") return
    pill(seg, colour)
    const r = Math.min(seg.r, Math.trunc(Math.min(seg.w, seg.h) / 2))
    if (r <= 0) return
    bctx.fillStyle = colour
    if (!seg.roundStart) {
      if (vertical) bctx.fillRect(seg.x - ox, seg.y - oy, seg.w, r)
      else bctx.fillRect(seg.x - ox, seg.y - oy, r, seg.h)
    }
    if (!seg.roundEnd) {
      if (vertical) bctx.fillRect(seg.x - ox, seg.y - oy + seg.h - r, seg.w, r)
      else bctx.fillRect(seg.x - ox + seg.w - r, seg.y - oy, r, seg.h)
    }
  }

  // The unfilled track: a body in its mixed colour, or - where that colour
  // cannot be told from the background (all of 1-bit) - an outline in the
  // bar's own colour. The outline is the run's outer pixel with the inside
  // painted the background's colour over it, not a ring behind it, so it ends
  // straight where a run is cut instead of in a rounded cap.
  const trackRun = (seg: LevelSegment) => {
    if (!look.framed) return run(seg, look.track)
    run(seg, fillColor)
    const inner = levelFrameInner(seg, vertical)
    if (inner) run(inner, look.track)
  }

  const segments =
    fillPercent === null ? [levelEmptyTrack(obj, fonts)] : levelSegments(obj, fillPercent, handle, fonts)
  for (const seg of segments) {
    if (seg.role === "fill") run(seg, fillColor)
    else trackRun(seg)
  }

  if (handle) {
    // A handle you can move is the fill's own colour: handle and active track
    // are one object that the gap separates (2026-09-19). A handle you cannot
    // move is not an affordance at all - it is a second reading, the target
    // the installation reports - so it takes the track's colour and steps
    // back (2026-09-22). On a panel where the track is only an outline there
    // is no quiet colour to take, so it keeps the bar's.
    pill(handle, handleColourFor(obj, fillColor, look))
  }

  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, ox, oy)
  ctx.imageSmoothingEnabled = smoothing
}

/** One piece of text on a level indicator: what it is written in, and in what colour. */
interface LevelText {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fontMeta: ProjectFont | undefined
  /** The pixel size for a font the browser draws; a BDF font has its own. */
  size: number
  bdfFontCache: Map<string, BDFFont>
  colour: string
  requestRedraw?: () => void
}

/** The size the browser draws the object's own text at: a TTF's own, else `fontSize`. */
function levelTextSize(obj: ScreenObject, fontMeta: ProjectFont | undefined): number {
  if (fontMeta?.format === "ttf" && fontMeta.size > 0) return fontMeta.size
  return levelFontSize(obj)
}

/**
 * The size the bracketed number is drawn at. A different font carries its own
 * size; the object's own font, when nothing smaller was found, is drawn at two
 * thirds - which only a font the browser draws can be.
 */
function levelSubTextSize(obj: ScreenObject, subMeta: ProjectFont | undefined, ownMeta: ProjectFont | undefined): number {
  if (subMeta && subMeta !== ownMeta) return levelTextSize(obj, subMeta)
  return Math.max(6, Math.trunc((levelTextSize(obj, ownMeta) * 2) / 3))
}

function setBrowserFont(t: LevelText): void {
  const isTtf = t.fontMeta?.format === "ttf"
  if (isTtf && t.fontMeta && !isTtfFontLoaded(t.fontMeta)) ensureTtfFontRegistered(t.fontMeta, t.requestRedraw ?? (() => {}))
  const family = isTtf && t.fontMeta ? (t.fontMeta.internalName ?? t.fontMeta.name) : t.obj.properties.fontFamily || "Arial"
  const weight = t.obj.properties.fontWeight || "normal"
  t.ctx.font = `${weight} ${t.size}px "${family}"`
}

/** How wide a piece of text is drawn, in whole pixels. */
function levelTextWidth(t: LevelText, text: string): number {
  const bdfFont = loadBdfFont(t.fontMeta, t.bdfFontCache)
  if (bdfFont) return Math.ceil(bdfFont.measureText(text).width)
  t.ctx.save()
  setBrowserFont(t)
  const width = Math.ceil(t.ctx.measureText(text).width)
  t.ctx.restore()
  return width
}

/**
 * One piece of text, its left end at `x` and standing on `baseline`, clipped to
 * `clip`. Every piece on the header line stands on the one baseline, whatever
 * font it is in, so a smaller bracketed number sits beside the big one the way
 * a footnote sits in a line rather than floating half-way up it.
 */
function drawLevelText(t: LevelText, clip: LevelRect, text: string, x: number, baseline: number): void {
  if (!text || clip.w <= 0 || clip.h <= 0 || t.colour === "transparent") return
  const { ctx } = t
  ctx.save()
  ctx.beginPath()
  ctx.rect(clip.x, clip.y, clip.w, clip.h)
  ctx.clip()
  ctx.fillStyle = t.colour
  const bdfFont = loadBdfFont(t.fontMeta, t.bdfFontCache)
  if (bdfFont) {
    bdfFont.drawText(ctx, text, alignToPixel(x), baseline)
  } else {
    setBrowserFont(t)
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(text, x, baseline)
  }
  ctx.restore()
}

/** Text whose right end is at `right`. Returns where its left end landed. */
function drawRightAligned(t: LevelText, clip: LevelRect, baseline: number, text: string, right: number): number {
  const left = right - levelTextWidth(t, text)
  drawLevelText(t, clip, text, left, baseline)
  return left
}

/** The name, from the start of the header's text run up to `right`. */
function drawHeaderName(t: LevelText, layout: LevelLayout, right: number): void {
  const name = levelName(t.obj)
  const run = layout.text
  if (!name || !run || right <= run.x) return
  drawLevelText(t, { ...run, w: right - run.x }, name, run.x, layout.baseline)
}

/** The object's font as a parsed BDF, or null when it is a TTF or missing. */
function loadBdfFont(fontMeta: ProjectFont | undefined, cache: Map<string, BDFFont>): BDFFont | null {
  if (!fontMeta || fontMeta.format === "ttf") return null
  const cached = cache.get(fontMeta.id)
  if (cached) return cached
  if (!fontMeta.data) return null
  try {
    const font = new BDFFont(fontMeta.data)
    cache.set(fontMeta.id, font)
    return font
  } catch (error) {
    console.error("Failed to parse BDF font for level indicator:", error)
    return null
  }
}

/**
 * The header's icon. The same asset, the same tint and the same cache the icon
 * object itself uses (render-icon.ts) - a second way of drawing an icon would
 * be a second set of pixels to keep in step with the firmware.
 */
function drawHeaderIcon(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  rect: LevelRect,
  projectAssets: ProjectAsset[] | undefined,
  cache: Map<string, HTMLImageElement> | undefined,
  requestRedraw?: () => void,
): void {
  if (!projectAssets || !cache) return
  const asset = projectAssets.find((a) => a.id === obj.properties.iconAssetId)
  if (!asset || asset.type !== "icon" || !asset.data) return

  const key = iconCacheKey(asset.id, obj.properties.iconColor, obj.properties.iconColorFlatten)
  let img = cache.get(key)
  if (!img) {
    img = new Image()
    img.crossOrigin = "anonymous"
    cache.set(key, img)
    const pending = img
    pending.onload = () => {
      if (pending.complete && pending.naturalWidth > 0) requestAnimationFrame(() => requestRedraw?.())
    }
    pending.onerror = () => cache.delete(key)
    pending.src = tintedIconDataUrl(asset.data, obj.properties.iconColor, obj.properties.iconColorFlatten)
  }
  if (img.complete && img.naturalWidth > 0) {
    // Into its own canvas at the icon's size, then blitted 1:1 - not scaled
    // onto the editor's grid.
    //
    // Which of the two is right follows from how this icon reaches a device,
    // and it is not the way a plain icon object goes. A level indicator paints
    // its own rectangle before anything else, so an icon baked into the screen
    // background underneath it would be painted over; it has to arrive as its
    // own bitmap and be blitted by the bar itself, the way a Switch state's
    // icon does. That bitmap is rasterised at the icon's own size, so an SVG's
    // edge lands on that grid - and the preview has to use the same one or the
    // conformance run finds the difference (asset-export.ts, 2026-09-19).
    // Its ink, not its box, fills the rectangle and stands on the baseline -
    // an icon's own margin would otherwise make it smaller than the capitals
    // and float it above them (rasterisedIconOnBaseline).
    const raster = rasterisedIconOnBaseline(img, rect.w, rect.h, key)
    if (raster) ctx.drawImage(raster, rect.x, rect.y)
    else ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h)
  }
}
