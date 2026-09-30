// The size scale (docs/2026-09-30-size-scale.md): how many millimetres a
// text style or a size step is, and what that makes on a given device.
//
// The device says facts - its screen in millimetres (as pixels per
// millimetre on the project), its fonts' families and weights, and which
// family each style uses in the typographies it offers. The millimetres are
// Schaltli's own, kept here and nowhere else, so that tuning them changes
// every device's result without touching a device description. This file
// only computes; it knows nothing of React or of objects.

import type { Project, ProjectFont, ProjectScreen, ScreenObject } from "@/components/project-editor"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { STANDARD_TYPOGRAPHY, type TextStyle, type Typography } from "@/lib/device-description"
import { themeMaster } from "@/lib/themes"

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
 * The typography a screen uses on its device: the one it names, if the
 * device offers it, else "Standard". undefined when the device offers none.
 */
export function typographyFor(typographies: Typography[] | undefined, name?: string): Typography | undefined {
  if (!typographies || typographies.length === 0) return undefined
  return typographies.find((t) => t.name === name) ?? typographies.find((t) => t.name === STANDARD_TYPOGRAPHY)
}

/**
 * The font a style is set in: from the family the typography names for it,
 * the regular face whose line height comes closest to the style's
 * millimetres (a tie goes to the smaller, which can only fit better); for
 * bold, the bold face of that size. undefined when the family has no fonts
 * on this device. Best effort by design: no warning when the closest is far
 * off (decided 2026-09-30).
 *
 * The size comes from the regular faces, and bold only swaps the face
 * (2026-09-30). Sized apart, a family whose bold lines differ from its
 * regular ones put a bold Caption a size below its regular. A family with
 * no bold of that size stays regular, rather than jumping to another size.
 */
export function fontFor(
  style: TextStyle,
  bold: boolean,
  typography: Typography,
  fonts: ProjectFont[],
  pixelsPerMm: number,
): ProjectFont | undefined {
  const family = fonts.filter((f) => f.family === typography.styles[style])
  const regular = family.filter((f) => f.weight !== "bold")
  const sized = closest(regular.length > 0 ? regular : family, stylePx(style, pixelsPerMm))
  if (!sized || !bold || sized.weight === "bold") return sized
  const boldFace = closest(
    family.filter((f) => f.weight === "bold"),
    lineHeight(sized),
  )
  return boldFace && Math.abs(lineHeight(boldFace) - lineHeight(sized)) <= SAME_SIZE_PX ? boldFace : sized
}

// A bold face counts as the same size as a regular one within this many
// pixels of line height: bold BDFs often run a pixel off their regular
// (FreeUniversal 35: 43 regular, 42 bold).
const SAME_SIZE_PX = 2

// The font whose line height is closest to `px`; a tie goes to the smaller.
function closest(fonts: ProjectFont[], px: number): ProjectFont | undefined {
  let best: ProjectFont | undefined
  for (const font of fonts) {
    if (!best) {
      best = font
      continue
    }
    const d = Math.abs(lineHeight(font) - px)
    const bestD = Math.abs(lineHeight(best) - px)
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

/**
 * The typography a screen's text is set in, by name: its own, else its
 * master's - the same two levels as the theme (lib/themes.ts themeFor),
 * because the two together are a screen's look (user, 2026-09-30).
 * undefined means "Standard". A master's objects keep the master's.
 */
export function typographyNameOf(screen: ProjectScreen, screens: ProjectScreen[]): string | undefined {
  return screen.typography ?? themeMaster(screen, screens)?.typography
}

/**
 * What text needs of the scale on a screen: the typography it uses and
 * the device's pixels per millimetre. undefined on a project whose device
 * gives no scale - its text is set in fonts, as before.
 */
export interface TextScale {
  typography: Typography
  pixelsPerMm: number
}

export function textScaleOf(
  settings: { pixelsPerMm?: number; typographies?: Typography[] },
  typographyName?: string,
): TextScale | undefined {
  const typography = typographyFor(settings.typographies, typographyName)
  return typography && settings.pixelsPerMm ? { typography, pixelsPerMm: settings.pixelsPerMm } : undefined
}

/** The scale a screen's text is set on; no screen: the Standard typography's. */
export function screenTextScale(project: Project, screen: ProjectScreen | undefined): TextScale | undefined {
  return textScaleOf(project.settings, screen ? typographyNameOf(screen, project.screens) : undefined)
}

/**
 * What an object gets written when its style is chosen: the style and bold
 * it keeps, and the font they resolve to now, which is what the renderers,
 * the export and the devices read (the plan's first decision). undefined
 * when the style's family has no font on this device.
 */
export function styledFont(
  style: TextStyle,
  bold: boolean,
  scale: TextScale,
  fonts: ProjectFont[],
): { textStyle: TextStyle; textBold: boolean; fontId: string; fontSize: number } | undefined {
  const font = fontFor(style, bold, scale.typography, fonts, scale.pixelsPerMm)
  return font ? { textStyle: style, textBold: bold, fontId: font.id, fontSize: font.size } : undefined
}

// The object types whose height is their text's line, as the Text and Live
// Text panels set it when a font is chosen.
const TEXT_BOX_TYPES = new Set(["text", "live-text"])

/**
 * Every styled object's font anew, for the project's device as it is now:
 * after a device change, a new DDF on opening, another typography or
 * another master (docs/2026-09-30-size-scale.md). Each screen in its own
 * typography. An object without a style - set in a
 * font by hand, "Custom" - is left exactly as it is. Returns the same
 * project when nothing changes, so an unchanged device changes nothing.
 */
export function resolveScale(project: Project): Project {
  if (!textScaleOf(project.settings)) return project
  let changed = false

  const resolve = (object: ScreenObject, scale: TextScale): ScreenObject => {
    let next = object
    const style = object.properties?.textStyle as TextStyle | undefined
    if (style) {
      const styled = styledFont(style, object.properties.textBold === true, scale, project.fonts)
      if (styled && (styled.fontId !== object.properties.fontId || styled.fontSize !== object.properties.fontSize)) {
        next = {
          ...object,
          ...(TEXT_BOX_TYPES.has(object.type) ? { height: calculateTextObjectHeight(styled.fontSize) } : {}),
          properties: { ...object.properties, ...styled },
        }
        changed = true
      }
    }
    if (object.children) {
      const children = object.children.map((child) => resolve(child, scale))
      if (children.some((child, i) => child !== object.children![i])) next = { ...next, children }
    }
    return next
  }

  const screens = project.screens.map((screen) => {
    const scale = screenTextScale(project, screen)!
    const objects = screen.objects.map((object) => resolve(object, scale))
    return objects.some((o, i) => o !== screen.objects[i]) ? { ...screen, objects } : screen
  })
  return changed ? { ...project, screens } : project
}
