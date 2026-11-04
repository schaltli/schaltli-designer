/**
 * A software button as whole numbers and colours (docs/2026-11-04-native-
 * buttons.md): what the designer draws and what a device is told to draw,
 * from one place.
 *
 * Until 2026-11-04 the export baked every button into two pictures, normal
 * and pressed, with the screen composited in - 85 % of the CamperUI rebuild,
 * which then no longer fitted the 4". Now the export writes what this module
 * works out, and a device only draws: a rounded rectangle, a 1-px ring, the
 * icon (a picture already in the ink colour) and the label at a position.
 * Every judgement - the colours from one colour and what the button stands
 * on, the radius and its pressed morph, where icon and label go - is made
 * here and nowhere else, so nothing is ported and nothing can drift.
 *
 * Pure: no canvas, no DOM. Integer arithmetic with Math.trunc, as in
 * lib/switch-shape.ts, because the devices' rounded rectangle is Adafruit_GFX's.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"
import { controlPalette } from "@/lib/control-palette"
import { blendColors, onColorFor } from "@/lib/material-colors"
import { fontMetricsOf, levelTrackLook } from "@/lib/level-shape"
import type { PillBand } from "@/lib/pill-raster"

/**
 * Material's three common buttons. Filled for the one action a screen is
 * about, tonal for ordinary switches - the default, because a page of filled
 * buttons is heavy and Material spends them sparingly - and outlined for the
 * quiet ones.
 */
export type ButtonStyle = "filled" | "tonal" | "outlined"

export function buttonStyleOf(obj: ScreenObject): ButtonStyle {
  const style = obj.properties.buttonStyle
  return style === "filled" || style === "outlined" ? style : "tonal"
}

/** The one colour the author sets; the palette's own when there is none. */
export function buttonColorOf(obj: ScreenObject, colorDepth: string | undefined): string {
  const color = obj.properties.buttonColor
  return typeof color === "string" && color.trim() !== "" ? color : controlPalette(colorDepth).fill
}

/** Between the icon and the label - Material's 8. */
export const BUTTON_ICON_GAP = 8

/** What a button is painted with, in one state. */
export interface ButtonLook {
  /** The pill's fill, or null where the background shows through. */
  container: string | null
  /** A 1-px outline, or null. */
  outline: string | null
  /** The label and the icon. */
  content: string
}

/**
 * The colours of a button, all from its one colour and what it stands on.
 *
 * - **filled**: the colour itself, the label white or black - whichever reads
 *   better on it.
 * - **tonal**: the colour halfway to the background - exactly the slider's
 *   empty track (levelTrackLook) - and the label again white or black.
 * - **outlined**: no fill, an outline in that same tint, the label in the
 *   colour. Where the tint is the background (1 bit) the outline takes the
 *   colour instead, and a tonal button becomes an outlined one.
 *
 * Pressed is Material's state layer: the content colour laid over the
 * container at 10 %. On a depth that cannot show 10 % - 1 bit always, some
 * grey pairs - the button turns inside out instead: filled draws outlined, and
 * anything else draws filled.
 */
export function buttonLook(obj: ScreenObject, background: string, colorDepth: string | undefined, pressed: boolean): ButtonLook {
  const color = applyColorDepth(buttonColorOf(obj, colorDepth), colorDepth)
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)
  const tint = levelTrackLook(color, ground, colorDepth)

  let style = buttonStyleOf(obj)
  if (style === "tonal" && tint.framed) style = "outlined"

  const filled: ButtonLook = { container: color, outline: null, content: onColorFor(color, colorDepth) }
  const look: ButtonLook =
    style === "filled"
      ? filled
      : style === "tonal"
        ? { container: tint.track, outline: null, content: onColorFor(tint.track, colorDepth) }
        : { container: null, outline: tint.framed ? color : tint.track, content: color }
  if (!pressed) return look

  const under = look.container ?? ground
  const layer = applyColorDepth(blendColors(under, look.content, 10), colorDepth)
  if (layer.toLowerCase() !== under.toLowerCase()) return { ...look, container: layer }
  return style === "filled" ? { container: null, outline: color, content: color } : filled
}

/**
 * The corner radius: a pill at rest - or the project's button radius
 * (Settings › Cards, `radiusPx`) where one is set - and pressed a fifth of
 * the height, never rounder than at rest: the shape morph of Material 3
 * Expressive. A changed silhouette shows beside a fingertip where a colour
 * change of 10 % does not.
 */
export function buttonCornerRadius(w: number, h: number, pressed: boolean, radiusPx?: number): number {
  const round = Math.trunc(Math.min(w, h) / 2)
  const rest = typeof radiusPx === "number" && radiusPx >= 0 ? Math.min(round, Math.trunc(radiusPx)) : round
  return pressed ? Math.min(rest, Math.trunc(h / 5)) : rest
}

/**
 * Where the content goes, relative to the button: the icon (a capital's
 * height, standing on the baseline) and the label, centred together inside
 * the pill's straight part; and the band the content is clipped to, out of
 * the round ends. Needs the label's width, which the caller measures in the
 * button's font.
 */
export interface ButtonContentLayout {
  baseline: number
  textX: number
  icon: { x: number; y: number; size: number } | null
  clipX: number
  clipW: number
}

export function buttonContentLayout(obj: ScreenObject, fonts: ProjectFont[] | undefined, textWidth: number): ButtonContentLayout {
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const m = fontMetricsOf(fontMeta, 14)
  const baseline = Math.trunc((h - (m.ascent + m.descent)) / 2) + m.ascent
  const hasIcon = typeof obj.properties.iconAssetId === "string" && obj.properties.iconAssetId !== ""
  const iconSize = hasIcon ? Math.max(1, m.capHeight) : 0
  const group = (hasIcon ? iconSize + BUTTON_ICON_GAP : 0) + textWidth
  // The half-circles at the ends are the pill's, not the label's.
  const pad = Math.trunc(h / 2)
  const left = pad + Math.max(0, Math.trunc((w - 2 * pad - group) / 2))
  const inset = Math.trunc(h / 4)
  return {
    baseline,
    textX: hasIcon ? left + iconSize + BUTTON_ICON_GAP : left,
    icon: hasIcon ? { x: left, y: baseline - iconSize, size: iconSize } : null,
    clipX: inset,
    clipW: Math.max(0, w - 2 * inset),
  }
}

/**
 * The project's button radius in px (Settings › Cards, `buttonRadiusMm`),
 * undefined while it is unset: a pill.
 */
export function buttonRadiusPxOf(settings: { cards?: { buttonRadiusMm?: number }; pixelsPerMm?: number } | undefined): number | undefined {
  const mm = settings?.cards?.buttonRadiusMm
  const ppm = Number(settings?.pixelsPerMm)
  return typeof mm === "number" && Number.isFinite(mm) && mm >= 0 && ppm > 0 ? Math.round(mm * ppm) : undefined
}

/** One state of a button as a device draws it: radius, fill, ring, ink. */
export interface ButtonFace {
  r: number
  fill: string | null
  outline: string | null
  ink: string
}

const faceOf = (look: ButtonLook, r: number): ButtonFace => ({ r, fill: look.container, outline: look.outline, ink: look.content })

/** Both states of a button on `background`. */
export function buttonFaces(
  obj: ScreenObject,
  background: string,
  colorDepth: string | undefined,
  radiusPx?: number,
): { normal: ButtonFace; pressed: ButtonFace } {
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  // The layout pass writes the project's radius into the button
  // (lib/card.ts withButtonRadius); a caller that knows it may say so.
  const own = obj.properties?.buttonRadius
  const r = radiusPx ?? (typeof own === "number" && Number.isFinite(own) ? own : undefined)
  return {
    normal: faceOf(buttonLook(obj, background, colorDepth, false), buttonCornerRadius(w, h, false, r)),
    pressed: faceOf(buttonLook(obj, background, colorDepth, true), buttonCornerRadius(w, h, true, r)),
  }
}

/**
 * A face as runs for the pill rasteriser (paint-pills.ts; PillRaster.h and
 * PillRaster.kt on the devices), in priority order: a ring is the outer pill
 * in the outline's colour with the inside, 1 px in, taken back - filled where
 * the face has a fill, a hole (null) where it has none, so what is behind the
 * button shows through. The Switch's ring, and the devices build the same.
 */
export function buttonPills(x: number, y: number, w: number, h: number, face: ButtonFace): { band: PillBand; colour: string | null }[] {
  const outer: PillBand = { x, y, w, h, rLow: face.r, rHigh: face.r }
  if (face.outline) {
    const r = Math.max(0, face.r - 1)
    return [
      { band: { x: x + 1, y: y + 1, w: w - 2, h: h - 2, rLow: r, rHigh: r }, colour: face.fill },
      { band: outer, colour: face.outline },
    ]
  }
  return face.fill ? [{ band: outer, colour: face.fill }] : []
}
