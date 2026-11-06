/**
 * A Toggle Button as whole numbers and colours (docs/2026-11-06-toggle-
 * button.md): one tile that is its state - CamperUI's state tile as one
 * object instead of a switcher, a panel per state and a button in each.
 *
 * It is a native button with a look per state. Everything here builds on
 * lib/button-shape.ts - its faces, its radius and pressed morph, its state
 * layer and the inside-out rule - and the export writes what this module
 * works out, so a device picks the reported state's look and draws it with
 * the button code it already has. Nothing is ported (decision 7).
 *
 * Pure: no canvas, no DOM. Integer arithmetic with Math.trunc, as in
 * lib/button-shape.ts and lib/switch-shape.ts.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"
import { blendColors, onColorFor } from "@/lib/material-colors"
import { fontMetricsOf, levelTrackLook, type LevelFontMetrics } from "@/lib/level-shape"
import { buttonCornerRadius, type ButtonFace } from "@/lib/button-shape"
import { switchColorOf, switchContent, switchStateIsOn, switchStyleOf, SWITCH_GAP } from "@/lib/switch-shape"
import { smallerStyle } from "@/lib/size-scale"

/** The tile's inner padding, and the gap between the disc and the text. Material's 8. */
export const TOGGLE_PAD = SWITCH_GAP
/** The ring that says "asked for, not confirmed": the switch's 2 px. */
export const TOGGLE_RING = 2
/** How much of the ink the disc behind a named tile's icon takes. */
const DISC_TINT = 12

/** One state's look: the native button's, plus what a named tile adds. */
export interface ToggleLook {
  normal: ButtonFace
  pressed: ButtonFace
  /** What this look writes: the state's label, «?» for none. */
  label: string
  /**
   * Where the first line goes. Without a name the first line is `label`;
   * with one it is the object's `text` and `label` moves to [second].
   */
  textX: number
  baseline: number
  clipX: number
  clipW: number
  /** The state's icon, a capital of the first line tall; absent without one. */
  icon?: { x: number; y: number; size: number }
  /** The state's label under the name, one size smaller; only with a name. */
  second?: { textX: number; baseline: number; fontId: string }
  /**
   * The disc behind the icon, per face; only with a name and an icon
   * somewhere. As tall as the two lines beside it (the user, 2026-11-06).
   * `edge` is a 1-px ring in the ink where the disc's tint cannot be told
   * from the face - all of 1 bit - so the disc is still there.
   */
  disc?: {
    cx: number
    cy: number
    r: number
    normal: string
    pressed: string
    edge?: { normal: string | null; pressed: string | null }
  }
}

export interface ToggleLooks {
  /** One per state, in the states' order. */
  states: ToggleLook[]
  /** Nothing reported: the quiet face and «?». */
  none: ToggleLook
  /** The ring's colour. */
  ring: string
}

interface ToggleState {
  label?: string
  iconAssetId?: string
  showAsOn?: boolean
  showMarker?: boolean
}

function statesOf(obj: ScreenObject): ToggleState[] {
  return Array.isArray(obj.properties?.states) ? obj.properties.states : []
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

/** The object's name, the first line of a named tile; undefined when it has none. */
export function toggleName(obj: ScreenObject): string | undefined {
  return hasText(obj.properties?.text) ? obj.properties.text : undefined
}

/** The size of the second line: the next smaller of the seven (decision 4). */
export const secondLineStyle = smallerStyle

/**
 * Both faces of one state on `background`.
 *
 * - **means on** (`showAsOn`): filled in the colour, the ink white or black by
 *   the tone rule; `tonal` takes the colour halfway to the background instead,
 *   as a tonal button and a group's chosen pill do.
 * - **anything else**: the card's colour with its 1-px edge, ink the text
 *   colour (backgroundColor, borderColor and textColor, which the theme fills
 *   with Card, Card border and Text) - CamperUI's look rather than the knob's
 *   half mixture (decision 2). Where the edge would vanish - the same as the
 *   card, the card the same as the ground, as on 1 bit - it takes the ink.
 *
 * Pressed is the button's: the ink laid over the fill at 10 %, and where a
 * depth cannot show that, the face turned inside out (decision 5).
 */
export function toggleFaces(
  obj: ScreenObject,
  background: string,
  colorDepth: string | undefined,
  on: boolean,
): { normal: ButtonFace; pressed: ButtonFace } {
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const own = obj.properties?.buttonRadius
  const radius = typeof own === "number" && Number.isFinite(own) ? own : undefined
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)
  const color = applyColorDepth(switchColorOf(obj, colorDepth), colorDepth)

  let normal: Omit<ButtonFace, "r">
  if (on) {
    const tint = levelTrackLook(color, ground, colorDepth)
    const fill = switchStyleOf(obj) === "tonal" && !tint.framed ? tint.track : color
    normal = { fill, outline: null, ink: onColorFor(fill, colorDepth) }
  } else {
    const p = obj.properties ?? {}
    const fill = applyColorDepth(hasText(p.backgroundColor) ? p.backgroundColor : ground, colorDepth)
    const ink = applyColorDepth(hasText(p.textColor) ? p.textColor : onColorFor(fill, colorDepth), colorDepth)
    let edge = applyColorDepth(hasText(p.borderColor) ? p.borderColor : color, colorDepth)
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
    if (same(edge, fill) && same(fill, ground)) edge = ink
    normal = { fill, outline: edge, ink }
  }

  const under = normal.fill ?? ground
  const layer = applyColorDepth(blendColors(under, normal.ink, 10), colorDepth)
  let pressed: Omit<ButtonFace, "r">
  if (layer.toLowerCase() !== under.toLowerCase()) pressed = { ...normal, fill: layer }
  else if (on) pressed = { fill: null, outline: under, ink: under }
  else pressed = { fill: normal.ink, outline: null, ink: under }

  return {
    normal: { r: buttonCornerRadius(w, h, false, radius), ...normal },
    pressed: { r: buttonCornerRadius(w, h, true, radius), ...pressed },
  }
}

function metricsOf(fonts: readonly ProjectFont[] | null | undefined, id: unknown): LevelFontMetrics {
  return fontMetricsOf(fonts?.find((f) => f.id === id), 14)
}

/**
 * Every look of a Toggle Button: one per state, «none», and the ring.
 * `measure` gives a text's width in a font, as the caller draws it.
 *
 * Without a name, a state's icon and label are centred - side by side in a
 * strip, stacked in a tile - exactly as in a segment of a button group
 * (switchContent). With a name, the icon sits in a disc on the left and the
 * name and the state's label are two lines beside it. The disc stands in
 * every state wherever any state has an icon, so nothing moves sideways
 * when the state changes.
 */
export function toggleLooks(
  obj: ScreenObject,
  background: string,
  colorDepth: string | undefined,
  fonts: readonly ProjectFont[] | null | undefined,
  measure: (text: string, fontId: string) => number,
): ToggleLooks {
  const w = Math.max(1, Math.trunc(obj.width))
  const h = Math.max(1, Math.trunc(obj.height))
  const fontId = String(obj.properties?.fontId ?? "")
  const secondFontId = String(obj.properties?.secondFontId ?? fontId)
  const first = metricsOf(fonts, fontId)
  const second = metricsOf(fonts, secondFontId)
  const name = toggleName(obj)
  const states = statesOf(obj)
  const anyIcon = states.some((s) => hasText(s.iconAssetId))
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)

  const lookOf = (label: string, iconId: string | undefined, faces: { normal: ButtonFace; pressed: ButtonFace }): ToggleLook => {
    const hasIcon = hasText(iconId)
    if (name === undefined) {
      const content = switchContent({ x: 0, y: 0, w, h, r: 0 }, first, hasIcon, measure(label, fontId))
      return {
        ...faces,
        label,
        textX: content.textX,
        baseline: content.baseline,
        clipX: TOGGLE_PAD,
        clipW: Math.max(0, w - 2 * TOGGLE_PAD),
        ...(content.icon ? { icon: { x: content.icon.x, y: content.icon.y, size: content.icon.w } } : {}),
      }
    }
    const block = first.ascent + first.descent + second.ascent + second.descent
    const discD = anyIcon ? Math.max(0, Math.min(h - 2 * TOGGLE_PAD, block)) : 0
    const discR = Math.trunc(discD / 2)
    // Two capitals tall, and a third of the disc left round it.
    const iconSize = Math.max(1, Math.min(2 * first.capHeight, Math.trunc((2 * discD) / 3)))
    const cx = TOGGLE_PAD + discR
    const cy = Math.trunc(h / 2)
    const textX = anyIcon ? cx + discR + TOGGLE_PAD : TOGGLE_PAD
    const top = Math.trunc((h - block) / 2)
    const under = (face: ButtonFace) => face.fill ?? ground
    const tint = (face: ButtonFace) => applyColorDepth(blendColors(under(face), face.ink, DISC_TINT), colorDepth)
    const lost = (face: ButtonFace) => tint(face).toLowerCase() === applyColorDepth(under(face), colorDepth).toLowerCase()
    const edge = lost(faces.normal) || lost(faces.pressed)
      ? { normal: lost(faces.normal) ? faces.normal.ink : null, pressed: lost(faces.pressed) ? faces.pressed.ink : null }
      : undefined
    return {
      ...faces,
      label,
      textX,
      baseline: top + first.ascent,
      clipX: textX,
      clipW: Math.max(0, w - TOGGLE_PAD - textX),
      ...(hasIcon ? { icon: { x: cx - Math.trunc(iconSize / 2), y: cy - Math.trunc(iconSize / 2), size: iconSize } } : {}),
      second: { textX, baseline: top + first.ascent + first.descent + second.ascent, fontId: secondFontId },
      ...(anyIcon ? { disc: { cx, cy, r: discR, normal: tint(faces.normal), pressed: tint(faces.pressed), ...(edge ? { edge } : {}) } } : {}),
    }
  }

  const quiet = toggleFaces(obj, background, colorDepth, false)
  const loud = toggleFaces(obj, background, colorDepth, true)
  return {
    states: states.map((s) => lookOf(String(s.label ?? ""), s.iconAssetId, switchStateIsOn(s) ? loud : quiet)),
    none: lookOf("?", undefined, quiet),
    ring: applyColorDepth(switchColorOf(obj, colorDepth), colorDepth),
  }
}

/**
 * How low a Toggle Button may be (the user, 2026-11-06): its text and the
 * padding above and below - two lines with a name, one without.
 */
export function toggleMinHeight(obj: ScreenObject, fonts: readonly ProjectFont[] | null | undefined): number {
  const first = metricsOf(fonts, obj.properties?.fontId)
  const line = first.ascent + first.descent
  if (toggleName(obj) === undefined) return line + 2 * TOGGLE_PAD
  const second = metricsOf(fonts, obj.properties?.secondFontId ?? obj.properties?.fontId)
  return line + second.ascent + second.descent + 2 * TOGGLE_PAD
}

/**
 * The state a tap sends (decision 3): the next one, wrapping after the last,
 * for any number of states. With nothing reported yet, the first state that
 * means on - a grey tile tapped is meant to come on - or the first state.
 */
export function toggleNextIndex(states: readonly ToggleState[], activeIndex: number): number {
  if (states.length === 0) return -1
  if (activeIndex < 0 || activeIndex >= states.length) {
    const on = states.findIndex((s) => switchStateIsOn(s))
    return on >= 0 ? on : 0
  }
  return (activeIndex + 1) % states.length
}
