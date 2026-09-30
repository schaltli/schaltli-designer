// The size scale (docs/2026-09-30-size-scale.md): how many millimetres a
// text style or a size step is, and what that makes on a given device.
//
// The device says facts - its screen in millimetres (as pixels per
// millimetre on the project), its fonts' families and weights, and which
// family each style uses in the typographies it offers. The millimetres are
// Schaltli's own, kept here and nowhere else, so that tuning them changes
// every device's result without touching a device description. This file
// only computes; it knows nothing of React or of objects.

import type { ProjectFont } from "@/components/project-editor"
import { STANDARD_TYPOGRAPHY, type TextStyle, type Typography } from "@/lib/device-description"

export type { TextStyle } from "@/lib/device-description"
export { TEXT_STYLES } from "@/lib/device-description"

/**
 * Line height per text style, in millimetres. A starting point from
 * 2026-09-30, to be checked on the devices (Checkpoint B).
 */
export const TEXT_STYLE_MM: Record<TextStyle, number> = {
  caption: 2.0,
  label: 3.0,
  title: 4.5,
  display: 7.0,
}

export const SIZE_STEPS = ["s", "m", "l"] as const
export type SizeStep = (typeof SIZE_STEPS)[number]

/**
 * What a step sets differs by object: a bar's thickness, a dial's
 * diameter, a switch's height, an icon's edge. Objects of a kind share one
 * row of millimetres.
 */
export type StepKind = "level" | "arc" | "control" | "icon"

/**
 * S / M / L per kind, in millimetres. A starting point from 2026-09-30, to
 * be checked on the devices (Checkpoint C); a finger-sized M control
 * (about 8 mm) is the one that matters.
 */
export const STEP_MM: Record<StepKind, Record<SizeStep, number>> = {
  level: { s: 4, m: 6, l: 9 },
  arc: { s: 15, m: 25, l: 35 },
  control: { s: 6, m: 8, l: 11 },
  icon: { s: 4, m: 6, l: 9 },
}

/** The kind an object type's step belongs to; undefined for types without steps. */
export function stepKindOf(objectType: string): StepKind | undefined {
  switch (objectType) {
    case "bar":
    case "slider":
      return "level"
    case "gauge":
    case "dial":
      return "arc"
    case "switch":
    case "button-group":
    case "button":
      return "control"
    case "icon":
    case "live-icon":
      return "icon"
    default:
      return undefined
  }
}

/**
 * A font's line height in pixels: ascent plus descent where it says them.
 * For a firmware BDF that is its `size`; for a TTF `size` is the font size
 * and the line is taller (Roboto 16 is 15 + 4 = 19), which is why `size`
 * alone is only the fallback.
 */
export function lineHeight(font: Pick<ProjectFont, "size" | "ascent" | "descent">): number {
  return typeof font.ascent === "number" && typeof font.descent === "number" ? font.ascent + font.descent : font.size
}

/** A style's line height in this device's pixels. */
export function stylePx(style: TextStyle, pixelsPerMm: number): number {
  return TEXT_STYLE_MM[style] * pixelsPerMm
}

/** A step's size in this device's pixels, whole. */
export function stepPx(kind: StepKind, step: SizeStep, pixelsPerMm: number): number {
  return Math.round(STEP_MM[kind][step] * pixelsPerMm)
}

/**
 * The typography a project uses on its device: the one it names, if the
 * device offers it, else "Standard". undefined when the device offers none.
 */
export function typographyFor(typographies: Typography[] | undefined, name?: string): Typography | undefined {
  if (!typographies || typographies.length === 0) return undefined
  return typographies.find((t) => t.name === name) ?? typographies.find((t) => t.name === STANDARD_TYPOGRAPHY)
}

/**
 * The font a style is set in: from the family the typography names for
 * it, in the weight asked for if the family has it (else regular), the one
 * whose line height comes closest to the style's millimetres. A tie goes to
 * the smaller, which can only fit better. undefined when the family has no
 * fonts on this device. Best effort by design: no warning when the closest
 * is far off (decided 2026-09-30).
 */
export function fontFor(
  style: TextStyle,
  bold: boolean,
  typography: Typography,
  fonts: ProjectFont[],
  pixelsPerMm: number,
): ProjectFont | undefined {
  const family = fonts.filter((f) => f.family === typography.styles[style])
  const weighted = bold ? family.filter((f) => f.weight === "bold") : []
  const candidates = weighted.length > 0 ? weighted : family.filter((f) => f.weight !== "bold")
  const target = stylePx(style, pixelsPerMm)
  let best: ProjectFont | undefined
  for (const font of candidates) {
    if (!best) {
      best = font
      continue
    }
    const d = Math.abs(lineHeight(font) - target)
    const bestD = Math.abs(lineHeight(best) - target)
    if (d < bestD || (d === bestD && lineHeight(font) < lineHeight(best))) best = font
  }
  return best
}

/** The step whose size comes closest to `px`; a tie goes to the smaller. */
export function nearestStep(kind: StepKind, px: number, pixelsPerMm: number): SizeStep {
  let best: SizeStep = "s"
  for (const step of SIZE_STEPS) {
    if (Math.abs(stepPx(kind, step, pixelsPerMm) - px) < Math.abs(stepPx(kind, best, pixelsPerMm) - px)) best = step
  }
  return best
}

/**
 * Whether `px` is one of the kind's steps, give or take the pixel that
 * rounding and a resize by hand can leave.
 */
export function isOnScale(kind: StepKind, px: number, pixelsPerMm: number): boolean {
  return SIZE_STEPS.some((step) => Math.abs(stepPx(kind, step, pixelsPerMm) - px) <= 1)
}

/** The style whose line height comes closest to `px`; a tie goes to the smaller. */
export function nearestStyle(px: number, pixelsPerMm: number): TextStyle {
  const styles = Object.keys(TEXT_STYLE_MM) as TextStyle[]
  let best: TextStyle = styles[0]
  for (const style of styles) {
    if (Math.abs(stylePx(style, pixelsPerMm) - px) < Math.abs(stylePx(best, pixelsPerMm) - px)) best = style
  }
  return best
}
