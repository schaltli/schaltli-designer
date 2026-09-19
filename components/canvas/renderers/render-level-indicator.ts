/**
 * Level Indicator renderer - handles level indicator bars with calibration points
 */

import type { ScreenObject, ProjectAsset, ProjectFont, Topic } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { alignToPixel, alignToPixelBoundary } from "@/lib/font-utils"
import { applyColorDepth } from "@/lib/color-depth"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { hasNoValue } from "@/lib/render-screen"
import { iconCacheKey, rasterisedIcon, tintedIconDataUrl } from "@/lib/svg-utils"
import { fillRoundRect } from "@/components/canvas/renderers/render-box"
import {
  levelEdgeFor,
  levelFillsFromEnd,
  levelFontSize,
  levelHandleRect,
  levelIsVertical,
  levelLayout,
  levelName,
  levelSegments,
  levelSubFontSize,
  levelTrackRect,
  type LevelRect,
} from "@/lib/level-shape"

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
  requestRedraw?: () => void
  /** For the header line's icon - the same two the icon object itself takes. */
  projectAssets?: ProjectAsset[]
  iconImageCache?: Map<string, HTMLImageElement>
}

export function renderLevelIndicator(options: RenderLevelIndicatorOptions): void {
  const { ctx, obj, fonts, zoom, bdfFontCache, getPreviewValueFromTopic, colorDepth, requestRedraw } = options
  const getAskedValueFromTopic = options.getAskedValueFromTopic || (() => "")

  // Draw background - quantized to pure black/white on 1-bit devices, same
  // as labels/fields (lib/color-depth.ts). This used to draw the literal
  // CSS color unquantized, so e.g. "#cccccc" showed as light gray here but
  // resolved to solid white on the real (1-bit) device - a real HIL
  // mismatch that was never caught because no level-indicator test project
  // existed yet (2026-07-21 finding).
  const levelBgColor = applyColorDepth(obj.properties.backgroundColor || "#ffffff", colorDepth)
  if (levelBgColor !== "transparent") {
    ctx.fillStyle = levelBgColor
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // The frame outlines the TRACK, as a pill one pixel larger than it - not the
  // object's rectangle, which is what it used to stroke.
  //
  // Two reasons. A sharp box around a pill is the "container with something in
  // it" look this redesign exists to get rid of. And on a 1-bit panel the
  // frame is not decoration: the unfilled track is white on white there
  // (lib/control-palette.ts), so without an outline a bar that has heard no
  // value yet would be invisible. Drawn as a filled pill underneath rather
  // than as a stroke, the way render-box.ts draws its border, so it is the
  // same pixels the firmware's fillRoundRect produces.
  const levelBorderColor = applyColorDepth(obj.properties.borderColor || "transparent", colorDepth)

  // The header line - icon and name - before anything that depends on a value,
  // because it does not depend on one. A bar that has heard nothing still says
  // what it is (docs/2026-09-19-slider-look.md, decision 9).
  const layout = levelLayout(obj)
  const levelFontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const textColor = applyColorDepth(obj.properties.textColor || "#000000", colorDepth)
  if (layout.icon) {
    drawHeaderIcon(ctx, obj, layout.icon, options.projectAssets, options.iconImageCache, requestRedraw)
  }
  if (layout.name) {
    drawLevelTextIn(ctx, obj, layout.name, levelName(obj), "left", textColor, levelFontMeta, bdfFontCache, levelFontSize(obj), requestRedraw)
  }

  // Nothing has arrived yet: the empty track, and neither fill nor number.
  //
  // Until 2026-09-19 this drew nothing at all, and the white box with a grey
  // border was what showed something was there. The box is gone now, so
  // drawing nothing would make an unanswered bar invisible. The track claims
  // no value - it is the shape of the control, the way the arc has always
  // drawn its ring without one - while an empty *fill* would claim an empty
  // tank, which is the rule from docs/2026-09-15-live-data.md and still holds.
  const rawLevelValue = getPreviewValueFromTopic(obj.properties.topic)
  if (hasNoValue(rawLevelValue)) {
    const emptyTrack = applyColorDepth(obj.properties.trackColor || "#E8DEF8", colorDepth)
    const track = layout.track
    if (levelBorderColor !== "transparent") {
      fillRoundRect(ctx, track.x - 1, track.y - 1, track.w + 2, track.h + 2, track.r + 1, levelBorderColor)
    }
    if (emptyTrack !== "transparent") {
      fillRoundRect(ctx, track.x, track.y, track.w, track.h, track.r, emptyTrack)
    }
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

  const fillColor = applyColorDepth(obj.properties.fillColor || "#4CAF50", colorDepth)
  // The unfilled part of the track. The arc has had this as `trackColor` all
  // along; the bar used to leave that space as its own background, which is
  // what made the whole control read as a box with a coloured rectangle in it
  // rather than as one shape (docs/2026-09-19-slider-look.md).
  const trackColor = applyColorDepth(obj.properties.trackColor || "#E8DEF8", colorDepth)

  // The marker: what was asked for, beside what is measured
  // (docs/2026-09-17-settable-level.md, decision 6c). Two ways to know it, in
  // this order - a request a finger just made here, and otherwise whatever the
  // installation reports on a setpoint topic. A request is keyed by the topic
  // it was about (the setpoint topic when there is one, else the read topic),
  // exactly as the firmware keys its own, and it is dropped the moment a
  // message arrives on that topic. Neither one, no marker: a level that has
  // heard nothing shows nothing (decision 6 of 2026-09-15-live-data.md).
  const markerTopic = (obj.properties.setpointTopic as string | undefined) || (obj.properties.topic as string | undefined)
  const rawMarker = (() => {
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

  drawLevelShape(ctx, obj, fillPercent, setpointPercent, fillColor, trackColor, levelBorderColor, colorDepth)

  // The numbers, in their own column - never over the bar any more.
  //
  // This used to be two passes of one number straddling the fill's edge: the
  // same digits in the fill's colour and again in the background's, clipped to
  // the fill, so they stayed readable on both sides. With Material's 16 px
  // track no number fits inside the bar at all, so the trick has nothing left
  // to do (docs/2026-09-19-slider-look.md, decision 10). One pass, one place.
  if (layout.value) {
    const asText = (raw: string, percent: number) =>
      displayValue === "percentage" ? `${Math.round(percent)}%` : raw

    // The big one is the commanded value - where the handle points, and what a
    // finger just changed. The measured value only appears when it says
    // something the big one does not.
    const measured = asText(rawLevelValue, fillPercent)
    const commanded = setpointPercent !== null ? asText(rawMarker, setpointPercent) : measured
    drawLevelTextIn(ctx, obj, layout.value, commanded, "right", textColor, levelFontMeta, bdfFontCache, levelFontSize(obj), requestRedraw)

    if (layout.sub && measured !== commanded) {
      // In brackets rather than behind a word: the designer's own interface is
      // English, the projects on it are not, and a bracket needs no language.
      // Smaller too - and since a BDF font cannot be scaled, that means a
      // different font, picked from the project's own list by levelSubFont().
      const subMeta = levelSubFont(fonts, obj) || levelFontMeta
      const subSize = subMeta?.format === "ttf" ? levelSubFontSize(obj) : subMeta?.size || levelSubFontSize(obj)
      drawLevelTextIn(ctx, obj, layout.sub, `(${measured})`, "right", textColor, subMeta, bdfFontCache, subSize, requestRedraw)
    }
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
  const wanted = levelSubFontSize(obj)
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
// alone, with no font to load, which is the reason it is arithmetic on
// properties rather than measured text (lib/level-shape.ts, levelDigitWidth).
//
// A bar with no header and no number is inset by exactly the 4 it always was,
// so no existing calibration moves.
export function levelPercentFromPoint(obj: ScreenObject, x: number, y: number): number {
  const barDirection = obj.properties.barDirection || "left-to-right"
  const track = levelTrackRect(obj)
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
export function levelValueFromPoint(obj: ScreenObject, x: number, y: number): number {
  const percent = levelPercentFromPoint(obj, x, y)
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
    (obj.type === "level-indicator" || obj.type === "arc-level") &&
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
function drawLevelShape(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  fillPercent: number,
  markerPercent: number | null,
  fillColor: string,
  trackColor: string,
  frameColor: string,
  colorDepth: string | undefined,
): void {
  // One stroke or none, and the stroke is always this one shape: overhanging,
  // with the gap. The tick that used to be drawn inside an unbroken track for a
  // reported-but-not-settable setpoint is gone - it was rejected on glass, and
  // the reason is that a stroke that means "settable" has to look the same
  // everywhere it appears (docs/2026-09-19-slider-look.md, decision 4).
  const handle = markerPercent !== null ? levelHandleRect(obj, markerPercent) : null

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

  const pill = (r: LevelRect, colour: string, inflate = 0) =>
    fillRoundRect(
      bctx,
      r.x - ox - inflate,
      r.y - oy - inflate,
      r.w + 2 * inflate,
      r.h + 2 * inflate,
      r.r + inflate,
      colour,
    )

  const vertical = levelIsVertical(obj)
  for (const seg of levelSegments(obj, fillPercent, handle)) {
    const colour = seg.role === "fill" ? fillColor : trackColor
    // The frame goes behind each run rather than behind the whole track. As
    // one pill behind everything it showed through the handle's gap - the
    // grey halo the user reported, measured as the border's own #cccccc - and
    // the gap has to show the background or it says nothing at all.
    if (frameColor !== "transparent") pill(seg, frameColor, 1)
    if (colour === "transparent") continue
    pill(seg, colour)
    // Square off the ends that are not the track's own, so two runs meet flush
    // instead of curving away from each other.
    const r = Math.min(seg.r, Math.trunc(Math.min(seg.w, seg.h) / 2))
    if (r > 0) {
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
  }

  if (handle) {
    // The fill's own colour, and deliberately not `markerColor`: handle and
    // active track are one object that the gap separates - Material's reading,
    // and the user's choice on 2026-09-19 over a darker handle.
    const handleColour = applyColorDepth(obj.properties.fillColor || "#6750A4", colorDepth)
    if (handleColour !== "transparent") pill(handle, handleColour)
  }

  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, ox, oy)
  ctx.imageSmoothingEnabled = smoothing
}

/**
 * One run of text inside a box, pushed against one of its edges and centred in
 * its height. Clipped to the box, so a font wider than the reserve is cut off
 * rather than allowed to run into the bar - the reserve is guessed from the
 * font size (levelDigitWidth), and this is what keeps a wrong guess harmless.
 *
 * Replaces the old drawLevelText, which centred one number in the whole object
 * and drew it twice, once clipped to the fill. With the number in a column of
 * its own there is nothing for it to straddle.
 */
function drawLevelTextIn(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  rect: LevelRect,
  text: string,
  align: "left" | "right",
  colour: string,
  fontMeta: ProjectFont | undefined,
  bdfFontCache: Map<string, BDFFont>,
  fontSize: number,
  requestRedraw?: () => void,
): void {
  if (!text || rect.w <= 0 || rect.h <= 0 || colour === "transparent") return

  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.fillStyle = colour

  const bdfFont = loadBdfFont(fontMeta, bdfFontCache)
  if (bdfFont) {
    const width = bdfFont.measureText(text).width
    const x = alignToPixel(align === "right" ? rect.x + rect.w - width : rect.x)
    const ascent = bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14
    const descent = bdfFont.properties["FONT_DESCENT"] || bdfFont.properties["DESCENT"] || 4
    const baselineY = alignToPixel(rect.y + (rect.h - (ascent + descent)) / 2 + ascent)
    bdfFont.drawText(ctx, text, x, baselineY)
  } else {
    const isTtf = fontMeta?.format === "ttf"
    if (isTtf && !isTtfFontLoaded(fontMeta)) ensureTtfFontRegistered(fontMeta, requestRedraw ?? (() => {}))
    const family = isTtf ? (fontMeta.internalName ?? fontMeta.name) : obj.properties.fontFamily || "Arial"
    const weight = obj.properties.fontWeight || "normal"
    ctx.font = `${weight} ${fontSize}px "${family}"`
    ctx.textAlign = align
    ctx.textBaseline = "middle"
    ctx.fillText(text, align === "right" ? rect.x + rect.w : rect.x, rect.y + rect.h / 2)
  }
  ctx.restore()
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
    const raster = rasterisedIcon(img, rect.w, rect.h, key)
    if (raster) ctx.drawImage(raster, rect.x, rect.y)
    else ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h)
  }
}
