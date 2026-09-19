/**
 * Level Indicator renderer - handles level indicator bars with calibration points
 */

import type { ScreenObject, ProjectFont, Topic } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { alignToPixel, alignToPixelBoundary } from "@/lib/font-utils"
import { applyColorDepth } from "@/lib/color-depth"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { hasNoValue } from "@/lib/render-screen"
import { fillRoundRect } from "@/components/canvas/renderers/render-box"
import {
  levelEdgeFor,
  levelFillsFromEnd,
  levelHandleRect,
  levelIsVertical,
  levelSegments,
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
    const track = levelTrackRect(obj)
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

  // Draw the value text (first pass - with fill color, visible outside bar area)
  const levelFontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
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

  // What the number is drawn in where it crosses the fill. The object's own
  // background while it has one; white otherwise, which is what every depth's
  // palette calls textOnFill - a bar whose background is transparent would
  // otherwise draw this pass in nothing at all.
  const overFillColor = levelBgColor === "transparent" ? applyColorDepth("#ffffff", colorDepth) : levelBgColor

  // The shape first, then the number over it - both passes.
  //
  // It used to be text, then bar, then text-clipped-to-the-bar, because the
  // unfilled part of the bar was the object's own background and so was never
  // painted over. It is a tinted track now, which covered the first pass and
  // left a fragment of the number showing (seen 2026-09-19 in the first
  // render). The order that matters and was paid for in 2026-09-17's
  // conformance run still holds inside drawLevelShape: fill, then marker.
  drawLevelShape(ctx, obj, fillPercent, setpointPercent, fillColor, trackColor, levelBorderColor, colorDepth)

  if (displayValue !== "none") {
    const displayText = displayValue === "percentage" ? `${Math.round(fillPercent)}%` : rawLevelValue

    // First pass: the number in the text colour, over the unfilled track.
    //
    // It used to be the fill's colour - the old invert trick, from when the
    // unfilled part was the object's white background. With a tinted track and
    // a handle in that same fill colour, a digit the handle passes behind
    // simply disappeared into it (seen 2026-09-19).
    const overTrackColor = applyColorDepth(obj.properties.textColor || "#000000", colorDepth)
    drawLevelText(ctx, obj, displayText, levelFontMeta, fonts, bdfFontCache, overTrackColor, false, undefined, requestRedraw)

    // Second pass: the same number over the fill, clipped to it.
    drawLevelText(ctx, obj, displayText, levelFontMeta, fonts, bdfFontCache, overFillColor, true, fillPercent, requestRedraw)
  }
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

// Computes the filled sub-rect of the bar, matching the firmware exactly:
// `int fillWidth = (innerWidth * fillPercent) / 100;` truncates toward zero
// on assignment to an int. A plain JS float division left here produced a
// fractional-height/width fillRect, which the canvas anti-aliases into a
// partial-coverage (non-pure black/white) edge row/column - a real 1-pixel-
// row HIL mismatch even though every color involved was already quantized
// to pure black or white (2026-07-21 finding). Math.trunc (not Math.floor)
// mirrors C's toward-zero truncation, though for these non-negative inputs
// the two agree.
function computeBarFillRect(obj: ScreenObject, fillPercent: number): { x: number; y: number; w: number; h: number } {
  const track = levelTrackRect(obj)
  const vertical = levelIsVertical(obj)
  const fromEnd = levelFillsFromEnd(obj)
  const edge = levelEdgeFor(track, vertical, fromEnd, fillPercent)
  if (vertical) {
    return fromEnd
      ? { x: track.x, y: edge, w: track.w, h: track.y + track.h - edge }
      : { x: track.x, y: track.y, w: track.w, h: edge - track.y }
  }
  return fromEnd
    ? { x: edge, y: track.y, w: track.x + track.w - edge, h: track.h }
    : { x: track.x, y: track.y, w: edge - track.x, h: track.h }
}

// Where a finger is, as a percentage of the bar - the inverse of
// computeBarFillRect above, so a bar dragged to a point fills to that same
// point (docs/2026-09-17-settable-level.md, decision 2). Coordinates are the
// object's own, absolute ones, the same ones a hit test works in.
//
// Inside the padding, so the ends are reachable: a finger on the object's
// very edge means empty or full rather than "4px short of it".
export function levelPercentFromPoint(obj: ScreenObject, x: number, y: number): number {
  const barDirection = obj.properties.barDirection || "left-to-right"
  const padding = 4
  const innerX = obj.x + padding
  const innerY = obj.y + padding
  const innerWidth = Math.max(1, obj.width - padding * 2)
  const innerHeight = Math.max(1, obj.height - padding * 2)

  const along = (() => {
    switch (barDirection) {
      case "right-to-left":
        return (innerX + innerWidth - x) / innerWidth
      case "bottom-to-top":
        return (innerY + innerHeight - y) / innerHeight
      case "top-to-bottom":
        return (y - innerY) / innerHeight
      case "left-to-right":
      default:
        return (x - innerX) / innerWidth
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

function drawLevelText(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  displayText: string,
  levelFontMeta: ProjectFont | undefined,
  fonts: ProjectFont[],
  bdfFontCache: Map<string, BDFFont>,
  textColor?: string,
  clipToBar: boolean = false,
  fillPercent?: number,
  requestRedraw?: () => void
): void {
  // textColor is always passed explicitly by both call sites below (already
  // quantized), so this fallback is dead in practice - left unquantized
  // rather than threading colorDepth through for a path that never runs.
  const finalTextColor = textColor || obj.properties.textColor || "#000000"
  ctx.fillStyle = finalTextColor
  
  const fontId = obj.properties.fontId
  let bdfFont: BDFFont | null = null
  
  if (fontId && levelFontMeta && levelFontMeta.format !== "ttf") {
    // Try to get from cache first
    bdfFont = bdfFontCache.get(fontId) || null

    // If not in cache, try to parse and cache it
    if (!bdfFont && levelFontMeta.data) {
      try {
        bdfFont = new BDFFont(levelFontMeta.data)
        bdfFontCache.set(fontId, bdfFont)
      } catch (error) {
        console.error("Failed to parse BDF font for level indicator:", error)
        bdfFont = null
      }
    }
  }
  
  if (bdfFont) {
    // Use BDF font rendering with pixel-perfect alignment
    ctx.save()
    
    // Clip to level indicator bounding box
    ctx.beginPath()
    ctx.rect(obj.x, obj.y, obj.width, obj.height)
    ctx.clip()
    
    const textMetrics = bdfFont.measureText(displayText)
    const textX = alignToPixel(obj.x + (obj.width - textMetrics.width) / 2)
    
    // Calculate baseline position for vertical centering
    const fontAscent = bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14
    const fontDescent = bdfFont.properties["FONT_DESCENT"] || bdfFont.properties["DESCENT"] || 4
    const fontHeight = fontAscent + fontDescent
    
    // Center the text vertically in the bounding box
    // dist = (bb.height - (fontAscent + fontDescent)) / 2
    // baselineY = bb.y + dist + fontAscent
    const dist = (obj.height - fontHeight) / 2
    const baselineY = alignToPixel(obj.y + dist + fontAscent)
    
    // Apply additional clipping to bar region if needed - same truncated
    // geometry as the bar fill itself (computeBarFillRect), so the clip
    // edge lands on exactly the same pixel the bar's own edge does.
    if (clipToBar && fillPercent !== undefined) {
      ctx.save()
      const r = computeBarFillRect(obj, fillPercent)
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
    }
    
    // Draw the text using BDF font
    bdfFont.drawText(ctx, displayText, textX, baselineY)
    
    // Restore twice if we added bar clipping (once for bar clip, once for bounding box clip)
    if (clipToBar && fillPercent !== undefined) {
      ctx.restore() // Restore bar clip
    }
    ctx.restore() // Restore bounding box clip
  } else {
    // Fall back to standard font rendering - a real TTF font when fontId
    // resolves to one (registering it if needed), otherwise the original
    // generic fallback. Both use the same centered "middle" baseline
    // positioning; only the family/size source differs.
    ctx.save()

    // Clip to level indicator bounding box
    ctx.beginPath()
    ctx.rect(obj.x, obj.y, obj.width, obj.height)
    ctx.clip()

    const isTtf = levelFontMeta?.format === "ttf"
    if (isTtf && !isTtfFontLoaded(levelFontMeta)) {
      ensureTtfFontRegistered(levelFontMeta, requestRedraw ?? (() => {}))
    }
    const fontSize = isTtf ? levelFontMeta.size : obj.properties.fontSize || 14
    const fontFamily = isTtf ? (levelFontMeta.internalName ?? levelFontMeta.name) : obj.properties.fontFamily || "Arial"
    const fontWeight = obj.properties.fontWeight || "normal"

    // Apply additional clipping to bar region if needed - same truncated
    // geometry as the bar fill itself (computeBarFillRect), so the clip
    // edge lands on exactly the same pixel the bar's own edge does.
    if (clipToBar && fillPercent !== undefined) {
      ctx.save()
      const r = computeBarFillRect(obj, fillPercent)
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
    }

    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(displayText, obj.x + obj.width / 2, obj.y + obj.height / 2)

    // Restore twice if we added bar clipping (once for bar clip, once for bounding box clip)
    if (clipToBar && fillPercent !== undefined) {
      ctx.restore() // Restore bar clip
    }
    ctx.restore() // Restore bounding box clip
  }
}
