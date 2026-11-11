/**
 * A Toggle Button as whole numbers and colours (docs/2026-11-06-toggle-
 * button.md): one tile that is its state - CamperUI's state tile as one
 * object instead of a switcher, a panel per state and a button in each.
 *
 * Since 2026-11-11 (docs/2026-11-11-led-look.md) the tile stays calm in
 * every state and only a light changes: Korry's window, or an LED strip
 * under the name or at the tile's left. The tile is the native button's
 * face (lib/button-shape.ts: radius, pressed morph, state layer); the light
 * is a rectangle and a word. The export writes what this module works out,
 * so a device picks the reported state's look and draws rectangles and text
 * it can already draw. Nothing is ported (toggle spec decision 7).
 *
 * Pure: no canvas, no DOM. Integer arithmetic with Math.trunc, as in
 * lib/button-shape.ts and lib/switch-shape.ts.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"
import { blendColors, onColorFor } from "@/lib/material-colors"
import { fontMetricsOf, type LevelFontMetrics } from "@/lib/level-shape"
import { buttonCornerRadius, type ButtonFace } from "@/lib/button-shape"
import { switchColorOf, switchStateIsOn } from "@/lib/switch-shape"
import { smallerStyle } from "@/lib/size-scale"

/**
 * The tile's padding, across and along (docs/2026-11-11-led-look.md,
 * decision 2: «8 x 10 px, name and light close together»).
 */
export const TOGGLE_PAD = 8
export const TOGGLE_PAD_X = 10
/** Between the name and the light under it. */
export const TOGGLE_GAP = 6
/**
 * The tile's corner without a project button radius: a card's on the 4"
 * (2 mm, CARD_DEFAULTS), not a pill - the tile is a card with a light, not a
 * push button (docs/2026-11-11-led-look.md, decision 1).
 */
export const TOGGLE_RADIUS = 12
/** The Korry window's padding round its word, above and below. */
export const WINDOW_PAD = 3

/** The three looks of decision 1. */
export type ToggleStyle = "korry" | "led-h" | "led-v"
export const TOGGLE_STYLES: readonly ToggleStyle[] = ["korry", "led-h", "led-v"]

/**
 * The object's style. «Filled» and «Tonal», the styles before 2026-11-11, and
 * none at all, are Korry (decision 6) - a project not yet migrated draws
 * the same as one that is.
 */
export function toggleStyleOf(obj: ScreenObject): ToggleStyle {
  const style = obj.properties?.switchStyle
  return style === "led-h" || style === "led-v" ? style : "korry"
}

/** The light of one look: Korry's window or an LED strip. */
export interface ToggleLight {
  x: number
  y: number
  w: number
  h: number
  r: number
  /** The state's: lit in the LED colour when it means on, the track otherwise. */
  fill: string
  /**
   * While a request is outstanding a device alternates `asked` and
   * `askedDim` (decision 4); where it animates nothing it stands at `asked`.
   */
  asked: string
  askedDim: string
  /** A 1-px ring in the ink where the track could not be told from the tile (1 bit). */
  outline: string | null
  /** The window's word, centred, with its ink per fill; Korry only. */
  label?: { text: string; textX: number; baseline: number; fontId: string; ink: string; askedInk: string }
}

/** One state's look: the calm tile, its name, and the light. */
export interface ToggleLook {
  normal: ButtonFace
  pressed: ButtonFace
  /** What the light says: the state's label, «?» for none. */
  label: string
  /** The name's line: where it starts and stands. */
  textX: number
  baseline: number
  clipX: number
  clipW: number
  /** The state's icon before the name, a capital tall; absent without one. */
  icon?: { x: number; y: number; size: number }
  /**
   * The state's label as a line of text (LED Horizontal: at the end of the
   * name's line; LED Vertical: under the name), in the smaller font and
   * `ink`. Absent for Korry, whose label stands in the window.
   */
  second?: { textX: number; baseline: number; fontId: string; ink: string }
  light: ToggleLight
}

export interface ToggleLooks {
  style: ToggleStyle
  /** One per state, in the states' order. */
  states: ToggleLook[]
  /** Nothing reported: the light off and «?». */
  none: ToggleLook
  /** The LED colour (what the ring was drawn in before 2026-11-11). */
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

/** The size of the second line and of the window's word: the next smaller of the seven. */
export const secondLineStyle = smallerStyle

/**
 * The tile's two faces - the same in every state (decision 1: only the light
 * changes): the card's colour with its 1-px edge, ink the text colour
 * (backgroundColor, borderColor and textColor, which the theme fills with
 * Card, Card border and Text). Where the edge would vanish - the same as the
 * card, the card the same as the ground, as on 1 bit - it takes the ink.
 * Pressed is the button's: the ink laid over the fill at 10 %, and where a
 * depth cannot show that, the face turned inside out.
 */
export function toggleFaces(obj: ScreenObject, background: string, colorDepth: string | undefined): { normal: ButtonFace; pressed: ButtonFace } {
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const own = obj.properties?.buttonRadius
  const radius = typeof own === "number" && Number.isFinite(own) ? own : TOGGLE_RADIUS
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)
  const p = obj.properties ?? {}
  const fill = applyColorDepth(hasText(p.backgroundColor) ? p.backgroundColor : ground, colorDepth)
  const ink = applyColorDepth(hasText(p.textColor) ? p.textColor : onColorFor(fill, colorDepth), colorDepth)
  let edge = applyColorDepth(hasText(p.borderColor) ? p.borderColor : ink, colorDepth)
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  if (same(edge, fill) && same(fill, ground)) edge = ink
  const normal = { fill, outline: edge, ink }
  const layer = applyColorDepth(blendColors(fill, ink, 10), colorDepth)
  const pressed = !same(layer, fill) ? { ...normal, fill: layer } : { fill: ink, outline: null, ink: fill }
  return {
    normal: { r: buttonCornerRadius(w, h, false, radius), ...normal },
    pressed: { r: buttonCornerRadius(w, h, true, radius), ...pressed },
  }
}

function metricsOf(fonts: readonly ProjectFont[] | null | undefined, id: unknown): LevelFontMetrics {
  return fontMetricsOf(fonts?.find((f) => f.id === id), 14)
}

/** An LED strip's thickness for a name in `first`: 6 px under a 22 px name. */
export function stripThickness(first: LevelFontMetrics): number {
  return Math.max(3, Math.trunc((first.capHeight * 2) / 5))
}

/** The Korry window's height: its word and a little room above and below. */
function windowHeight(second: LevelFontMetrics): number {
  return second.ascent + second.descent + 2 * WINDOW_PAD
}

/** The colours of the light, by what it shows (decisions 1, 4). */
export function toggleLightColours(obj: ScreenObject, background: string, colorDepth: string | undefined) {
  const { normal } = toggleFaces(obj, background, colorDepth)
  const face = normal.fill ?? "#ffffff"
  const p = obj.properties ?? {}
  const track = applyColorDepth(hasText(p.trackColor) ? p.trackColor : blendColors(face, normal.ink, 15), colorDepth)
  const lit = applyColorDepth(switchColorOf(obj, colorDepth), colorDepth)
  const asked = applyColorDepth(blendColors(track, lit, 50), colorDepth)
  const askedDim = applyColorDepth(blendColors(track, lit, 20), colorDepth)
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  return {
    face,
    ink: normal.ink,
    track,
    lit,
    asked,
    askedDim,
    // The word on a dark window: the ink, faint.
    offInk: applyColorDepth(blendColors(track, normal.ink, 45), colorDepth),
    litInk: onColorFor(lit, colorDepth),
    askedInk: onColorFor(asked, colorDepth),
    // A state's label beside the name: the ink, quieter.
    mutedInk: applyColorDepth(blendColors(face, normal.ink, 60), colorDepth),
    outline: same(track, face) ? normal.ink : null,
  }
}

/**
 * Every look of a Toggle Button: one per state and «none». `measure` gives
 * a text's width in a font, as the caller draws it.
 *
 * - **Korry**: the name, under it a square-cornered window across the tile,
 *   the state's label centred in it in capitals.
 * - **LED Horizontal**: the name with the state's label at the line's end,
 *   under them a strip across the tile.
 * - **LED Vertical**: a strip at the tile's left, its full height inside the
 *   padding; the name and under it the state's label to its right.
 *
 * The state's icon stands small before the name (decision 5), with room for
 * it in every state wherever any state has an icon, so nothing moves. The
 * name always on the left, the window's word centred - no alignment to
 * choose. Without a name the label takes the name's place (LED) or the
 * window stands alone (Korry).
 */
export function toggleLooks(
  obj: ScreenObject,
  background: string,
  colorDepth: string | undefined,
  fonts: readonly ProjectFont[] | null | undefined,
  measure: (text: string, fontId: string) => number,
): ToggleLooks {
  const style = toggleStyleOf(obj)
  const w = Math.max(1, Math.trunc(obj.width))
  const h = Math.max(1, Math.trunc(obj.height))
  const fontId = String(obj.properties?.fontId ?? "")
  const secondFontId = String(obj.properties?.secondFontId ?? fontId)
  const first = metricsOf(fonts, fontId)
  const second = metricsOf(fonts, secondFontId)
  const name = toggleName(obj)
  const states = statesOf(obj)
  const anyIcon = states.some((s) => hasText(s.iconAssetId))
  const faces = toggleFaces(obj, background, colorDepth)
  const c = toggleLightColours(obj, background, colorDepth)
  const firstLine = first.ascent + first.descent
  const secondLine = second.ascent + second.descent
  const strip = stripThickness(first)
  const iconSize = anyIcon ? Math.max(1, first.capHeight) : 0
  const iconRoom = anyIcon ? iconSize + TOGGLE_GAP : 0

  const lookOf = (label: string, iconId: string | undefined, on: boolean): ToggleLook => {
    const hasIcon = hasText(iconId)
    const light = (x: number, y: number, lw: number, lh: number, r: number, word?: { text: string; baseline: number }): ToggleLight => ({
      x,
      y,
      w: Math.max(0, lw),
      h: Math.max(0, lh),
      r,
      fill: on ? c.lit : c.track,
      asked: c.asked,
      askedDim: c.askedDim,
      outline: c.outline,
      ...(word
        ? {
            label: {
              text: word.text,
              textX: x + Math.max(0, Math.trunc((lw - measure(word.text, secondFontId)) / 2)),
              baseline: word.baseline,
              fontId: secondFontId,
              ink: on ? c.litInk : c.offInk,
              askedInk: c.askedInk,
            },
          }
        : {}),
    })

    if (style === "led-v") {
      const sx = TOGGLE_PAD
      const textX = sx + strip + TOGGLE_PAD_X + iconRoom
      const block = name === undefined ? firstLine : firstLine + secondLine
      const top = Math.trunc((h - block) / 2)
      const baseline = top + first.ascent
      return {
        ...faces,
        label,
        textX,
        baseline,
        clipX: textX,
        clipW: Math.max(0, w - TOGGLE_PAD_X - textX),
        ...(hasIcon ? { icon: { x: textX - iconRoom, y: baseline - iconSize, size: iconSize } } : {}),
        ...(name !== undefined ? { second: { textX, baseline: baseline + first.descent + second.ascent, fontId: secondFontId, ink: c.mutedInk } } : {}),
        light: light(sx, TOGGLE_PAD, strip, h - 2 * TOGGLE_PAD, Math.trunc(strip / 2)),
      }
    }

    const korry = style === "korry"
    const alone = korry && name === undefined
    const lightH = korry ? windowHeight(second) : strip
    const lightW = w - 2 * TOGGLE_PAD_X
    const block = (alone ? 0 : firstLine + TOGGLE_GAP) + lightH
    const top = Math.trunc((h - block) / 2)
    const baseline = top + first.ascent
    const textX = TOGGLE_PAD_X + iconRoom
    const lightY = top + (alone ? 0 : firstLine + TOGGLE_GAP)
    const icon = hasIcon ? { icon: { x: TOGGLE_PAD_X, y: baseline - iconSize, size: iconSize } } : {}
    if (korry) {
      return {
        ...faces,
        label,
        textX,
        baseline,
        clipX: textX,
        clipW: Math.max(0, w - TOGGLE_PAD_X - textX),
        ...icon,
        light: light(TOGGLE_PAD_X, lightY, lightW, lightH, 0, { text: label.toUpperCase(), baseline: lightY + WINDOW_PAD + second.ascent }),
      }
    }
    // LED Horizontal: the label at the end of the name's line.
    const labelW = name !== undefined ? measure(label, secondFontId) : 0
    return {
      ...faces,
      label,
      textX,
      baseline,
      clipX: textX,
      clipW: Math.max(0, w - TOGGLE_PAD_X - textX - (name !== undefined ? labelW + TOGGLE_GAP : 0)),
      ...icon,
      ...(name !== undefined ? { second: { textX: Math.max(textX, w - TOGGLE_PAD_X - labelW), baseline, fontId: secondFontId, ink: c.mutedInk } } : {}),
      light: light(TOGGLE_PAD_X, lightY, lightW, lightH, Math.trunc(strip / 2)),
    }
  }

  return {
    style,
    states: states.map((s) => lookOf(String(s.label ?? ""), s.iconAssetId, switchStateIsOn(s))),
    none: lookOf("?", undefined, false),
    ring: c.lit,
  }
}

/** How long each half of the asked pulse lasts, in the preview and on a device. */
export const ASKED_HALF_MS = 500

/**
 * The light's fill as it is drawn: the state's, or - while a request is
 * outstanding - `asked` and `askedDim` in turn, every ASKED_HALF_MS
 * (docs/2026-11-11-led-look.md, decision 4); standing at `asked` where
 * nothing moves.
 */
export function lightFill(look: ToggleLook, asking: boolean, motion: boolean, now: number): string {
  if (!asking) return look.light.fill
  if (!motion) return look.light.asked
  return Math.floor(now / ASKED_HALF_MS) % 2 === 0 ? look.light.asked : look.light.askedDim
}

/**
 * How low a Toggle Button may be (the user, 2026-11-06; LED look decision 2):
 * its lines, the light and the padding above and below.
 */
export function toggleMinHeight(obj: ScreenObject, fonts: readonly ProjectFont[] | null | undefined): number {
  const first = metricsOf(fonts, obj.properties?.fontId)
  const second = metricsOf(fonts, obj.properties?.secondFontId ?? obj.properties?.fontId)
  const firstLine = first.ascent + first.descent
  const named = toggleName(obj) !== undefined
  switch (toggleStyleOf(obj)) {
    case "led-v":
      return (named ? firstLine + second.ascent + second.descent : firstLine) + 2 * TOGGLE_PAD
    case "led-h":
      return firstLine + TOGGLE_GAP + stripThickness(first) + 2 * TOGGLE_PAD
    default:
      return (named ? firstLine + TOGGLE_GAP : 0) + windowHeight(second) + 2 * TOGGLE_PAD
  }
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
