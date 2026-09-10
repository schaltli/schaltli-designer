/**
 * Switch renderer - a state control with one entry per
 * obj.properties.states, in one of two modes:
 *
 *   "segmented" (default) - n segments side by side, the active one marked
 *   "single"              - one surface showing whichever state is active,
 *                           a tap advancing to the next state (wrapping)
 *
 * Read-bound in both: the active state is whichever state's readValue
 * matches the current value of obj.properties.topic (design-time preview
 * value here, the real retained MQTT value on a device) - exact trimmed-
 * string match, same comparison style as evaluateCondition()'s "==" in
 * lib/render-screen.ts. No match (including "no topic bound yet" or "no
 * retained value received yet") means no state is active: segmented draws
 * no marker, single draws "?" and nothing else.
 *
 * The active marker is a bar along the top edge, never a filled segment
 * (2026-08-25). The fill it replaced carried three meanings at once through
 * activeBackgroundColor - solid fill = active, 3px ring = pending, 1px ring
 * = pressed - and none of them survived being put next to a screen of
 * bar-marked tiles, which spoke a different visual language for the same
 * fact. There is now exactly one shape with three appearances:
 *
 *   absent  - a confirmed state that carries no marker
 *   hollow  - unconfirmed: finger down, or written and waiting for the
 *             retained value to come back (firmware only, see below)
 *   solid   - a confirmed state that carries a marker
 *
 * In "segmented" the bar always marks the active segment. In "single" it is
 * per-state, via state.showMarker - "which state counts as on" is a
 * question only the author can answer ("Auto" on a thermostat is neither
 * obviously on nor obviously off), and the states list has no reordering UI,
 * so a positional convention like "states[0] is the marked one" would be a
 * trap nobody could correct without deleting and re-adding every state.
 *
 * The hollow bar is deliberately absent here: pressed/pending and the 3s
 * timeout rollback are live round-trip behavior that only exists once a
 * device is running, and by the 2026-08-12 Switch design discussion none of
 * that belongs on the design-time canvas. This preview draws only "absent"
 * and "solid", which is also exactly what a device draws while a HIL run is
 * comparing them - nobody is touching it.
 *
 * Segment labels use the same real BDF/TTF glyph rendering as
 * render-text-box.ts (loadBdfFont/drawTextBox) rather than SoftwareButton's
 * generic-canvas-text approximation - a font choice that only changed the
 * numeric size without changing the glyph shape read as "the font selector
 * doesn't do anything" (2026-08-13 finding). Segment labels are short and
 * single-line, so this only needs the centered-single-line subset of that
 * logic, not the full multi-line/selection-baseline machinery.
 */

import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { getFontAscent, getFontDescent } from "@/lib/font-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { loadBdfFont } from "./render-text-box"
import { fillRoundRect } from "./render-box"
import { tintedIconDataUrl, iconCacheKey, rasterisedIcon } from "@/lib/svg-utils"

/**
 * Marker geometry, in whole pixels on purpose.
 *
 * Every one of these is an integer with no division behind it, because the
 * firmware (ColorScreenRenderer::renderSwitch) has to arrive at the same
 * numbers or a HIL pixel diff lights up on every Switch on the screen. The
 * arc-level rasterizer is the cautionary tale: the moment a shared shape is
 * computed rather than stated, the two copies get to disagree about
 * rounding. Stated values cannot drift.
 */
export const BAR_HEIGHT = 10
export const BAR_TOP_INSET = 4
export const BAR_SIDE_INSET = 6
export const BAR_RADIUS = 3

/**
 * The band the bar occupies, reserved whether or not a bar is currently
 * drawn. Content lays out below it in both modes and in every state, so a
 * Switch does not visibly reflow its icon and label the moment it is
 * switched on.
 */
export const BAR_BAND = BAR_TOP_INSET + BAR_HEIGHT

/**
 * Minimum sizes the designer clamps to while resizing (canvas.tsx). Height
 * is the bar band plus one line of the smallest bundled font; segment width
 * is twice the side inset plus enough bar to see. Already-saved objects
 * below these are left exactly as they are - see renderBar's own clamp for
 * why that is safe.
 */
export const SWITCH_MIN_HEIGHT = BAR_BAND + 18
export const SWITCH_MIN_SEGMENT_WIDTH = 24

export const minSwitchWidth = (stateCount: number): number =>
  SWITCH_MIN_SEGMENT_WIDTH * Math.max(1, stateCount)

export interface SwitchState {
  id: string
  label: string
  readValue: string
  writeValue: string
  iconAssetId?: string
  // A different picture while this state is the active one - a filled bulb
  // against an outlined one, say. Until 2026-08-25 this meant "the same
  // picture baked against activeBackgroundColor", which existed only
  // because the segment's backdrop changed underneath it; with the fill
  // gone the backdrop never changes, and the slot is free to mean what it
  // looks like it means. Only consulted in "segmented" mode: in "single"
  // a state is only ever drawn while it is active, so its own iconAssetId
  // is already its active picture.
  activeIconAssetId?: string
  // "single" mode only: does this state show the marker bar? Ignored in
  // "segmented", where the bar always marks whichever segment is active.
  showMarker?: boolean
}

interface RenderSwitchOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  isSelected: boolean
  zoom: number
  iconImageCache: Map<string, HTMLImageElement>
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  requestRedraw: () => void
}

export function getActiveSwitchStateIndex(
  obj: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
): number {
  const states: SwitchState[] = obj.properties.states || []
  if (!obj.properties.topic) return -1
  const topicValue = getPreviewValueFromTopic(obj.properties.topic).trim()
  return states.findIndex((s) => (s.readValue ?? "").trim() === topicValue)
}

export function getSwitchMode(obj: ScreenObject): "segmented" | "single" {
  return obj.properties.mode === "single" ? "single" : "segmented"
}

/**
 * Which state a tap selects, mirroring the firmware's own dispatchTapAt.
 *
 * Lives here because this is where the segment geometry already lives - the
 * comment in main.cpp's tap handler makes the point the other way round
 * ("Weicht das hier ab, trifft der Finger ein anderes Segment als das, auf
 * das er zeigt"), and the same is true of any second copy on this side.
 *
 * `x` is in screen coordinates. `activeIndex` only matters in single mode,
 * where there are no segments to aim at and a tap advances to the next state
 * instead, wrapping. -1 (nothing matched yet) starts at the first state:
 * tapping a tile showing "?" has to do something, or it reads as broken.
 *
 * Returns -1 when there is nothing to select.
 */
export function switchStateIndexForTap(obj: ScreenObject, x: number, activeIndex: number): number {
  const states: SwitchState[] = obj.properties.states || []
  if (states.length === 0) return -1

  if (getSwitchMode(obj) === "single") {
    return activeIndex < 0 ? 0 : (activeIndex + 1) % states.length
  }

  // Integer division, floored - the firmware does the same with ints, so a
  // finger on the boundary lands on the same segment on both sides.
  const index = Math.floor(((x - obj.x) * states.length) / obj.width)
  return Math.max(0, Math.min(states.length - 1, index))
}

// Draws `label` centered horizontally within [centerX - maxWidth/2, centerX + maxWidth/2].
// `anchorTop` is either a fixed top Y (text starts there, used below an icon) or
// undefined to center vertically within the content band instead.
// Takes the whole Switch `obj` (not just its fontId) because loadBdfFont's
// shared signature reads obj.properties.fontId itself.
function drawSegmentLabel(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  label: string,
  centerX: number,
  maxWidth: number,
  bandTop: number,
  bandHeight: number,
  anchorTop: number | undefined,
  fonts: ProjectFont[],
  bdfFontCache: Map<string, BDFFont>,
  requestRedraw: () => void,
): void {
  const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
  const bdfFont = loadBdfFont(obj, fonts, bdfFontCache)

  if (bdfFont && fontMeta) {
    const ascent = getFontAscent(fontMeta)
    const descent = getFontDescent(fontMeta)
    const baselineY =
      anchorTop !== undefined ? anchorTop + ascent : bandTop + (bandHeight - (ascent + descent)) / 2 + ascent
    const textWidth = bdfFont.measureText(label).width
    const textX = Math.round(centerX - Math.min(textWidth, maxWidth) / 2)
    bdfFont.drawText(ctx, label, textX, Math.round(baselineY))
    return
  }

  if (fontMeta?.format === "ttf") {
    if (!isTtfFontLoaded(fontMeta)) {
      ensureTtfFontRegistered(fontMeta, requestRedraw)
    }
    const familyName = fontMeta.internalName ?? fontMeta.name
    ctx.font = `${fontMeta.size}px "${familyName}"`
    ctx.textAlign = "center"
    ctx.textBaseline = anchorTop !== undefined ? "top" : "middle"
    ctx.fillText(label, centerX, anchorTop !== undefined ? anchorTop : bandTop + bandHeight / 2, maxWidth)
    return
  }

  // No font resolved at all (no fontId, or a dangling reference) - generic
  // fallback so the designer stays usable/previewable, matching
  // render-text-box.ts's own final fallback.
  ctx.font = "11px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = anchorTop !== undefined ? "top" : "middle"
  ctx.fillText(label, centerX, anchorTop !== undefined ? anchorTop : bandTop + bandHeight / 2, maxWidth)
}

// A solid rounded bar, centered horizontally in [x, x + width).
//
// The width clamp is the one guard the renderer keeps for objects saved
// before the resize minimums existed: a five-state Switch 60px wide gives
// each segment 12px, and 12 - 2*6 is zero - a Switch that silently shows
// nothing at all about its own state. One integer max() is cheaper than
// any amount of warning UI, and it mirrors trivially in C++.
function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string): void {
  const barWidth = Math.max(4, Math.round(width) - 2 * BAR_SIDE_INSET)
  const barX = Math.round(x) + BAR_SIDE_INSET
  const barY = Math.round(y) + BAR_TOP_INSET

  // render-box.ts's port of Adafruit_GFX::fillRoundRect, not ctx.roundRect:
  // the firmware draws this bar with the integer midpoint-circle algorithm
  // and no anti-aliasing, and a Bezier-rasterized approximation of it would
  // differ on the corner pixels of every marker on the screen.
  fillRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS, color)
}

// One state's icon + label, laid out inside the content band. Shared by both
// modes so a state cannot look different depending on which mode drew it.
function drawStateContent(
  options: RenderSwitchOptions,
  state: SwitchState,
  iconAssetId: string | undefined,
  x: number,
  width: number,
  bandTop: number,
  bandHeight: number,
  textColor: string,
): void {
  const { ctx, obj, fonts, projectAssets, iconImageCache, bdfFontCache, requestRedraw } = options

  const centerX = x + width / 2
  const asset = iconAssetId ? projectAssets.find((a) => a.id === iconAssetId) : undefined
  const hasIcon = !!(asset && asset.data)
  const label = state.label || ""

  let iconBottom = bandTop
  if (hasIcon) {
    // Rounded, not left fractional: lib/asset-export.ts bakes the bitmap at
    // Math.round of this same expression, and the firmware blits that
    // bitmap at an integer position. 0.62 * a 32px band is 19.84 - a size
    // where "truncate" and "round" disagree, which is exactly the kind of
    // 1px drift a HIL run reports as hundreds of differing pixels. All
    // three sides round.
    const iconSize = Math.max(1, Math.round(Math.min(width - 8, bandHeight * 0.62)))
    const iconX = Math.round(centerX - iconSize / 2)
    const iconY = bandTop + 2
    iconBottom = iconY + iconSize + 2

    // One iconColor for the whole Switch, alongside its one textColor -
    // states differ by icon and label, not by color.
    const cacheKey = iconCacheKey(asset!.id, obj.properties.iconColor, obj.properties.iconColorFlatten)
    let img = iconImageCache.get(cacheKey)
    if (!img) {
      img = new Image()
      img.crossOrigin = "anonymous"
      iconImageCache.set(cacheKey, img)
      img.onload = () => {
        if (img!.complete && img!.naturalWidth > 0) {
          requestAnimationFrame(() => requestRedraw())
        }
      }
      img.onerror = () => iconImageCache.delete(cacheKey)
      img.src = tintedIconDataUrl(asset!.data, obj.properties.iconColor, obj.properties.iconColorFlatten)
    }

    if (img.complete && img.naturalWidth > 0) {
      try {
        // Rasterised into a canvas of exactly iconSize and then blitted 1:1,
        // which is what lib/asset-export.ts does when it bakes the bitmap
        // the device blits. Scaling the SVG straight onto the screen here
        // instead put it on a different pixel grid, and the two disagreed
        // along every diagonal edge - see rasterisedIcon() for the numbers.
        const raster = rasterisedIcon(img, iconSize, cacheKey)
        if (raster) ctx.drawImage(raster, iconX, iconY)
      } catch {
        // Image not decodable yet - skip this frame, redraw fires on load
      }
    }
  }

  if (label) {
    ctx.fillStyle = textColor
    drawSegmentLabel(
      ctx,
      obj,
      label,
      centerX,
      width - 4,
      bandTop,
      bandHeight,
      hasIcon ? iconBottom : undefined,
      fonts,
      bdfFontCache,
      requestRedraw,
    )
  }
}

export function renderSwitch(options: RenderSwitchOptions): void {
  const { ctx, obj, fonts, bdfFontCache, getPreviewValueFromTopic, requestRedraw } = options

  const states: SwitchState[] = obj.properties.states || []
  const backgroundColor = obj.properties.backgroundColor || "#ffffff"
  // Was the active segment's fill until 2026-08-25, now the marker bar (and,
  // on a device, the hollow unconfirmed bar). Deliberately not renamed: the
  // value in every saved project is already the right colour for its new
  // job, and a rename would have needed a migration to say nothing new.
  const markerColor = obj.properties.activeBackgroundColor || "#2563eb"
  const borderColor = obj.properties.borderColor || "#cccccc"
  const textColor = obj.properties.textColor || "#000000"

  // Draw order, and why it is this one:
  //
  //   1 background, once over the whole object
  //   2 outer border
  //   3 dividers
  //   4 marker bars
  //   5 icons and labels
  //
  // Until 2026-08-25 the border was stroked first and then overpainted by
  // the per-segment fills - all 396 of its pixels, verified by counting
  // them; only the dividers survived, because those were drawn after their
  // own segment's fill. Nobody noticed while a large coloured block made
  // the control obvious anyway. With the fill gone the border is the only
  // thing left that says where the object is, so it had to survive.
  //
  // Filling once instead of per segment is what makes that free: no segment
  // has a fill of its own any more, so there is nothing left to overpaint
  // with. Content still comes last, matching drawTextBox's own order and
  // the reason recorded there on 2026-07-20 - a border stroked after text
  // erases glyph ink wherever a descender reaches the box edge.
  // Rounded body, drawn the way render-box.ts draws one: the border is not
  // a stroke but a slightly larger filled shape with the background filled
  // on top of it, which is the only way to get a rounded border out of the
  // integer, un-anti-aliased primitive both sides share. A stroked path
  // would anti-alias its curve, and an anti-aliased edge is the one thing
  // that provably cannot survive the trip to a 16-bit panel unchanged
  // (2026-08-25, the SoftwareButton's corners).
  //
  // Default 0 - square, exactly as every Switch has looked since the type
  // existed. The design sheets that led to the marker rebuild drew their
  // tiles rounded, but those were `box` objects standing in for a Switch;
  // the object itself never had the property, so nothing about an existing
  // project changes until someone sets it.
  const cornerRadius = Math.max(0, obj.properties.cornerRadius || 0)
  const hasBorder = borderColor !== "transparent"

  if (cornerRadius > 0) {
    if (hasBorder) {
      fillRoundRect(ctx, obj.x, obj.y, obj.width, obj.height, cornerRadius, borderColor)
      if (backgroundColor !== "transparent" && obj.width > 2 && obj.height > 2) {
        fillRoundRect(ctx, obj.x + 1, obj.y + 1, obj.width - 2, obj.height - 2, Math.max(0, cornerRadius - 1), backgroundColor)
      }
    } else if (backgroundColor !== "transparent") {
      fillRoundRect(ctx, obj.x, obj.y, obj.width, obj.height, cornerRadius, backgroundColor)
    }
  } else {
    if (backgroundColor !== "transparent") {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
    }
    if (hasBorder) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.strokeRect(obj.x + 0.5, obj.y + 0.5, obj.width - 1, obj.height - 1)
    }
  }

  if (states.length === 0) {
    ctx.fillStyle = "#999999"
    ctx.font = "11px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("No states defined", obj.x + obj.width / 2, obj.y + obj.height / 2)
    return
  }

  const activeIndex = getActiveSwitchStateIndex(obj, getPreviewValueFromTopic)
  const bandTop = obj.y + BAR_BAND
  const bandHeight = obj.height - BAR_BAND

  if (getSwitchMode(obj) === "single") {
    // Nothing matched: no state is active, so there is no label to show
    // either - every label belongs to a state, and claiming one would be
    // claiming a state nobody reported. "?" alone, which after a boot is
    // what every tile shows until its retained value arrives.
    if (activeIndex < 0) {
      ctx.fillStyle = textColor
      drawSegmentLabel(
        ctx,
        obj,
        "?",
        obj.x + obj.width / 2,
        obj.width - 4,
        bandTop,
        bandHeight,
        undefined,
        fonts,
        bdfFontCache,
        requestRedraw,
      )
      return
    }

    const state = states[activeIndex]
    if (state.showMarker) {
      drawBar(ctx, obj.x, obj.y, obj.width, markerColor)
    }
    // No activeIconAssetId here: a state is only ever drawn in this mode
    // while it is the active one, so its own icon already is its active
    // picture. Reaching for the active variant would leave iconAssetId
    // permanently unreachable.
    drawStateContent(options, state, state.iconAssetId, obj.x, obj.width, bandTop, bandHeight, textColor)
    return
  }

  const segmentWidth = obj.width / states.length

  states.forEach((state, index) => {
    const segX = obj.x + index * segmentWidth
    const isActive = index === activeIndex

    // Divider between segments (not before the first one - the outer
    // border already covers that edge). Full height even on a rounded
    // body: a divider runs through the middle of the control, nowhere near
    // a corner, and shortening it would only make the two sides disagree
    // about where it stops.
    if (index > 0 && borderColor !== "transparent") {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(segX) + 0.5, obj.y)
      ctx.lineTo(Math.round(segX) + 0.5, obj.y + obj.height)
      ctx.stroke()
    }

    // showMarker is a "single" mode concept: here the bar's whole job is to
    // say which of the n segments is the active one, which is not a
    // question the author gets to answer per state.
    if (isActive) {
      drawBar(ctx, segX, obj.y, segmentWidth, markerColor)
    }

    // Clip icon+label drawing to this segment's own rect. A large font (or
    // a long label) would otherwise bleed into the neighboring segment or
    // past the control's outer edge - not just visually wrong, but actively
    // misleading if/when a segment is ever exported as its own cropped
    // bitmap (matching SoftwareButton's pathNormal/pathActive baking): the
    // export would crop exactly at this boundary regardless, so the
    // preview has to show that same cropping, not a false uncropped
    // impression (2026-08-13 finding).
    ctx.save()
    ctx.beginPath()
    ctx.rect(segX, obj.y, segmentWidth, obj.height)
    ctx.clip()

    const iconAssetId = (isActive && state.activeIconAssetId) || state.iconAssetId
    drawStateContent(options, state, iconAssetId, segX, segmentWidth, bandTop, bandHeight, textColor)

    ctx.restore()
  })
}
