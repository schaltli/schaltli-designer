/**
 * Switch renderer - a state control in one of two Material 3 forms, from the
 * object's `mode` (docs/2026-09-20-switch-look.md):
 *
 *   "segmented" - a **connected button group**: one container, the states side
 *                 by side in it, the chosen one as its own pill. Material has
 *                 retired the segmented button in favour of this.
 *   "single"    - a **switch**: a track with a knob standing at one of n
 *                 positions, the state's icon on the knob, its label beside it.
 *                 n is normally 2, where a tap toggles.
 *
 * Read-bound in both: the active state is whichever state's readValue matches
 * the current value of `topic` - exact trimmed-string match, the same
 * comparison evaluateCondition()'s "==" makes in lib/render-screen.ts. No
 * match (no topic, or nothing retained yet) means no state is active: the
 * group marks nothing, the switch shows no knob and a "?" beside it.
 *
 * What was asked for and what is reported are two different things, and the
 * control shows both, exactly as a settable level does with its handle and its
 * fill (docs/2026-09-17-settable-level.md, decision 6c):
 *
 *   group - the confirmed state keeps its pill; the asked one gets a ring
 *   switch - the knob stands at the asked position at once, and the colour
 *           follows only when the value comes back
 *
 * Nothing here has a background, a border, a corner radius or a text colour of
 * its own any more: everything is worked out from one colour and from what the
 * control stands on (lib/switch-shape.ts).
 *
 * Labels use the same real BDF/TTF glyph rendering as render-text-box.ts, and
 * icons arrive the way a button's does - rasterised once in black, coloured as
 * they are drawn, so one image serves a chosen segment and an unchosen one.
 */

import { applyColorDepth } from "@/lib/color-depth"
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { loadBdfFont } from "./render-text-box"
import { paintPills, type PaintedPill } from "./paint-pills"
import { rasterisedIconOnBaseline } from "@/lib/svg-utils"
import { buttonIconKey, buttonIconUrl, colouredIcon } from "./render-software-button"
import { onColorFor } from "@/lib/material-colors"
import {
  SWITCH_GAP,
  SWITCH_PAD,
  SWITCH_TRACK_OUTLINE,
  switchContainer,
  switchContent,
  switchFontMetrics,
  switchForm,
  switchKnob,
  switchKnobIcon,
  switchKnobLook,
  switchLabelBox,
  switchLook,
  switchRingFill,
  switchSegmentAt,
  switchSegments,
  switchSlotAt,
  switchStateIsOn,
  switchTrack,
  type SwitchRect,
} from "@/lib/switch-shape"

/**
 * Minimum sizes the designer clamps to while resizing (canvas.tsx). A segment
 * has to be wide enough to hold something; the height is one line of the
 * smallest bundled font with room around it. Already-saved objects below these
 * are left exactly as they are.
 */
export const SWITCH_MIN_HEIGHT = 28
export const SWITCH_MIN_SEGMENT_WIDTH = 24

/**
 * One rounded rectangle as a run for the rasterizer, and the run inside it.
 *
 * Everything this control is made of is a pill: the container, a segment, the
 * track, the knob. They are described rather than painted, because the
 * rasterizer needs them all at once to give each sub-sample to exactly one of
 * them (components/canvas/renderers/paint-pills.ts).
 *
 * `pillInside` is what a ring leaves untouched - fillRoundRectRing's own
 * arithmetic, so a ring comes out where it always did. Its colour is whatever
 * lies under the ring, and `null` where that is the screen itself: a run with
 * no colour still claims its pixels, it simply paints nothing in them.
 */
function wholePill(r: SwitchRect, colour: string | null): PaintedPill {
  return { band: { x: r.x, y: r.y, w: r.w, h: r.h, rLow: r.r, rHigh: r.rRight ?? r.r }, colour }
}

function pillInside(r: SwitchRect, thickness: number, colour: string | null): PaintedPill {
  const t = Math.max(1, Math.trunc(thickness))
  return {
    band: {
      x: r.x + t,
      y: r.y + t,
      w: r.w - 2 * t,
      h: r.h - 2 * t,
      rLow: Math.max(0, r.r - t),
      rHigh: Math.max(0, (r.rRight ?? r.r) - t),
    },
    colour,
  }
}

export const minSwitchWidth = (stateCount: number): number =>
  SWITCH_MIN_SEGMENT_WIDTH * Math.max(1, stateCount) + 2 * SWITCH_PAD

/**
 * How wide a switch in its knob form has to be for a label to fit beside it.
 *
 * The group form tiles its buttons inside the object, so its width follows
 * the state count. The knob form does not: the track takes what its height
 * gives it, and the label stands to the right of it with SWITCH_GAP between
 * (switchLabelBox). Too narrow and the label is simply clipped - which is
 * what a building block placing one would otherwise hand the user.
 *
 * `labelWidth` is the widest of the state labels, measured in the font the
 * object will actually be drawn in.
 */
export function minKnobSwitchWidth(height: number, stateCount: number, labelWidth: number): number {
  // The real track arithmetic rather than a copy of it: given more room than
  // it wants, switchTrack returns exactly what it wants.
  const track = switchTrack(
    { x: 0, y: 0, width: Number.MAX_SAFE_INTEGER, height, properties: {} } as unknown as ScreenObject,
    stateCount,
  )
  return track.w + SWITCH_GAP + Math.max(0, Math.ceil(labelWidth))
}

export interface SwitchState {
  id: string
  label: string
  readValue: string
  writeValue: string
  iconAssetId?: string
  /** A different picture while this state is the chosen one. */
  activeIconAssetId?: string
  /**
   * Switch form only: does this state count as "switched on", which is what
   * makes the track take the colour rather than the quiet pair? Renamed from
   * `showMarker` on 2026-09-20 (switchStateIsOn reads both).
   */
  showAsOn?: boolean
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
  /** What a finger here asked this switch to become - see the header. */
  getAskedValueFromTopic?: (topicName: string | undefined) => string
  requestRedraw: () => void
  colorDepth?: string
  /** What the control stands on: half of every colour it derives. */
  screenBackgroundColor?: string
  /** The state a finger is holding down, in the preview. */
  pressedStateIndex?: number
}

export function getActiveSwitchStateIndex(
  obj: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
): number {
  const states: SwitchState[] = obj.properties.states || []
  if (!obj.properties.topic) return -1
  const topicValue = getPreviewValueFromTopic(obj.properties.topic).trim()
  // No value, no active state - not even one whose readValue is empty.
  if (topicValue === "") return -1
  return states.findIndex((s) => (s.readValue ?? "").trim() === topicValue)
}

/**
 * The state a finger here asked for and that nothing has confirmed yet, keyed
 * by the topic an answer would arrive on - the read topic, since that is what
 * the device waits for. -1 when nothing is outstanding.
 */
export function getAskedSwitchStateIndex(
  obj: ScreenObject,
  getAskedValueFromTopic: ((topicName: string | undefined) => string) | undefined,
): number {
  if (!getAskedValueFromTopic || !obj.properties.topic) return -1
  const asked = (getAskedValueFromTopic(obj.properties.topic) || "").trim()
  if (asked === "") return -1
  const states: SwitchState[] = obj.properties.states || []
  return states.findIndex((s) => (s.readValue ?? "").trim() === asked)
}

export function getSwitchMode(obj: ScreenObject): "segmented" | "single" {
  return obj.properties.mode === "single" ? "single" : "segmented"
}

/**
 * Which state a tap selects, mirroring the firmware's own dispatchTapAt.
 *
 * Lives here because this is where the segment geometry already lives. `x` is
 * in screen coordinates; `activeIndex` is what is currently reported.
 *
 * In the switch form with two states a tap anywhere toggles - which is what a
 * switch does, wherever it is hit. With more than two, a tap on the track
 * picks the slot under it and a tap beside the track advances by one, so that
 * a finger on the label still does something predictable.
 *
 * Returns -1 when there is nothing to select.
 */
export function switchStateIndexForTap(obj: ScreenObject, x: number, activeIndex: number): number {
  const states: SwitchState[] = obj.properties.states || []
  if (states.length === 0) return -1

  if (switchForm(obj) === "knob") {
    if (states.length === 2) return activeIndex === 0 ? 1 : 0
    const slot = switchSlotAt(obj, states.length, x)
    if (slot >= 0) return slot
    return activeIndex < 0 ? 0 : (activeIndex + 1) % states.length
  }

  return switchSegmentAt(obj, states.length, x)
}

/** One state's icon, black and rasterised once, coloured as it is drawn. */
function drawStateIcon(
  options: RenderSwitchOptions,
  assetId: string | undefined,
  rect: SwitchRect,
  colour: string,
): void {
  if (!assetId) return
  const asset = options.projectAssets.find((a) => a.id === assetId)
  if (!asset || asset.type !== "icon" || !asset.data) return
  const key = buttonIconKey(asset.id)
  let img = options.iconImageCache.get(key)
  if (!img) {
    img = new Image()
    img.crossOrigin = "anonymous"
    options.iconImageCache.set(key, img)
    const pending = img
    pending.onload = () => {
      if (pending.complete && pending.naturalWidth > 0) requestAnimationFrame(() => options.requestRedraw())
    }
    pending.onerror = () => options.iconImageCache.delete(key)
    pending.src = buttonIconUrl(asset)
  }
  if (!img.complete || img.naturalWidth === 0) return
  const raster = rasterisedIconOnBaseline(img, rect.w, rect.h, key)
  if (raster) options.ctx.drawImage(colouredIcon(raster, key, colour), rect.x, rect.y)
}

/** How wide a label is drawn, in whole pixels. */
function measureLabel(options: RenderSwitchOptions, text: string): number {
  const { ctx, obj, fonts, bdfFontCache } = options
  const bdfFont = loadBdfFont(obj, fonts, bdfFontCache)
  if (bdfFont) return Math.ceil(bdfFont.measureText(text).width)
  ctx.save()
  setBrowserFont(options)
  const width = Math.ceil(ctx.measureText(text).width)
  ctx.restore()
  return width
}

function setBrowserFont(options: RenderSwitchOptions): void {
  const { ctx, obj, fonts } = options
  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const isTtf = fontMeta?.format === "ttf"
  if (isTtf && fontMeta && !isTtfFontLoaded(fontMeta)) ensureTtfFontRegistered(fontMeta, options.requestRedraw)
  const family = isTtf && fontMeta ? `"${fontMeta.internalName ?? fontMeta.name}"` : "sans-serif"
  ctx.font = `${obj.properties.fontWeight || "normal"} ${fontMeta?.size || 14}px ${family}`
}

/** One label, its left end at `x`, standing on `baseline`, clipped to `clip`. */
function drawLabel(options: RenderSwitchOptions, clip: SwitchRect, text: string, x: number, baseline: number, colour: string): void {
  if (!text || clip.w <= 0 || clip.h <= 0) return
  const { ctx, obj, fonts, bdfFontCache } = options
  ctx.save()
  ctx.beginPath()
  ctx.rect(clip.x, clip.y, clip.w, clip.h)
  ctx.clip()
  ctx.fillStyle = colour
  const bdfFont = loadBdfFont(obj, fonts, bdfFontCache)
  if (bdfFont) bdfFont.drawText(ctx, text, x, baseline)
  else {
    setBrowserFont(options)
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(text, x, baseline)
  }
  ctx.restore()
}

export function renderSwitch(options: RenderSwitchOptions): void {
  const { ctx, obj, colorDepth } = options
  const states: SwitchState[] = obj.properties.states || []

  if (states.length === 0) {
    // An empty/misconfigured Switch stays visible instead of being a blank box.
    ctx.fillStyle = "#999999"
    ctx.font = "11px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("No states defined", obj.x + obj.width / 2, obj.y + obj.height / 2)
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    return
  }

  const background = applyColorDepth(options.screenBackgroundColor || "#ffffff", colorDepth)
  const metrics = switchFontMetrics(obj, options.fonts)
  const activeIndex = getActiveSwitchStateIndex(obj, options.getPreviewValueFromTopic)
  const askedIndex = getAskedSwitchStateIndex(obj, options.getAskedValueFromTopic)
  const pressedIndex = options.pressedStateIndex ?? -1

  if (switchForm(obj) === "knob") {
    drawKnobSwitch(options, states, metrics, background, activeIndex, askedIndex, pressedIndex)
    return
  }
  drawGroup(options, states, metrics, background, activeIndex, askedIndex, pressedIndex)
}

function drawGroup(
  options: RenderSwitchOptions,
  states: SwitchState[],
  metrics: ReturnType<typeof switchFontMetrics>,
  background: string,
  activeIndex: number,
  askedIndex: number,
  pressedIndex: number,
): void {
  const { ctx, obj, colorDepth } = options
  const look = switchLook(obj, background, colorDepth)
  const box = switchContainer(obj)
  const segments = switchSegments(obj, states.length)

  // Every shape at once, in priority order, through one rasterizer
  // (paint-pills.ts): a sub-sample belongs to the first run that contains it
  // and to no other. Drawn one over the other, each rounded end would carry a
  // rim of whatever it covers - which is what the arc was fixed for, and what
  // a stair-stepped pill beside an anti-aliased ring asked about (2026-09-22).
  const painted: PaintedPill[] = []
  segments.forEach((seg, index) => {
    const chosen = index === activeIndex
    // A finger on a segment, and a tap whose answer has not come back: the
    // same ring. Both mean "this is not what is reported - yet".
    if (index === askedIndex || index === pressedIndex) {
      // A ring is its outer pill with the inside taken back, so what the ring
      // encloses has to be said out loud: the chosen pill, the container, or -
      // where the container is only an outline - nothing at all
      // (switchRingFill, which every port of this reads too).
      painted.push(pillInside(seg, 2, switchRingFill(look, chosen)))
      painted.push(wholePill(seg, look.ring))
      return
    }
    if (chosen) painted.push(wholePill(seg, look.chosen))
  })
  if (look.surfaceOutline) {
    painted.push(pillInside(box, 1, null))
    painted.push(wholePill(box, look.surfaceOutline))
  } else {
    painted.push(wholePill(box, look.surface))
  }
  paintPills(ctx, painted, background, colorDepth)

  segments.forEach((seg, index) => {
    const state = states[index]
    const chosen = index === activeIndex
    const ink = chosen ? look.onChosen : look.onSurface
    const label = state.label || ""
    const assetId = (chosen && state.activeIconAssetId) || state.iconAssetId
    const content = switchContent(seg, metrics, !!assetId, measureLabel(options, label))
    ctx.save()
    ctx.beginPath()
    ctx.rect(seg.x, seg.y, seg.w, seg.h)
    ctx.clip()
    if (content.icon) drawStateIcon(options, assetId, content.icon, ink)
    drawLabel(options, seg, label, content.textX, content.baseline, ink)
    ctx.restore()
  })
}

function drawKnobSwitch(
  options: RenderSwitchOptions,
  states: SwitchState[],
  metrics: ReturnType<typeof switchFontMetrics>,
  background: string,
  activeIndex: number,
  askedIndex: number,
  pressedIndex: number,
): void {
  const { ctx, obj, colorDepth } = options
  // The colour says what is reported; the knob says what was asked for.
  const on = activeIndex >= 0 && switchStateIsOn(states[activeIndex])
  const look = switchKnobLook(obj, background, colorDepth, on)
  const track = switchTrack(obj, states.length)
  const shownIndex = askedIndex >= 0 ? askedIndex : activeIndex
  const state = shownIndex >= 0 ? states[shownIndex] : null
  const knob = state ? switchKnob(obj, states.length, shownIndex, { on, pressed: pressedIndex >= 0 }) : null

  // Knob first, then the track it stands on: the knob wins every sub-sample
  // it covers, so no rim of track colour is left around it (paint-pills.ts).
  const painted: PaintedPill[] = []
  if (knob) {
    const d = knob.r * 2
    painted.push(wholePill({ x: knob.cx - knob.r, y: knob.cy - knob.r, w: d, h: d, r: knob.r }, look.knob))
  }
  if (look.trackOutline) {
    painted.push(pillInside(track, SWITCH_TRACK_OUTLINE, look.track))
    painted.push(wholePill(track, look.trackOutline))
  } else {
    painted.push(wholePill(track, look.track))
  }
  paintPills(ctx, painted, background, colorDepth)

  const ink = onColorFor(background, colorDepth)
  const box = switchLabelBox(obj, states.length)

  if (!state || !knob) {
    // Nothing reported: no knob, because every position belongs to a state and
    // standing somewhere would claim one nobody has reported.
    const content = switchContent(box, metrics, false, measureLabel(options, "?"))
    drawLabel(options, box, "?", content.textX, content.baseline, ink)
    return
  }

  // The icon belongs to the state that means "on", and only while that state
  // is the one being shown. A knob that is not on is the small one, and a
  // picture squeezed into it says nothing anyone can read - so it is left
  // out, which is also what the state's own size already says
  // (docs/2026-09-22-switch-look.md).
  //
  // Through switchKnobIcon rather than three fifths written out here, because
  // the bake has to arrive at the same number and once did not.
  const assetId = on ? state.activeIconAssetId || state.iconAssetId : undefined
  if (assetId) {
    drawStateIcon(options, assetId, switchKnobIcon(knob), look.onKnob)
  }

  const label = state.label || ""
  const content = switchContent(box, metrics, false, measureLabel(options, label))
  drawLabel(options, box, label, box.x, content.baseline, ink)
}
