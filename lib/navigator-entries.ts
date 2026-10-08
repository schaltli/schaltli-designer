// A navigator entry as ordinary objects (docs/2026-10-08-navigator.md
// decision 8): the screen's icon - live when the screen icon is - its name
// as a text, and for the open screen a box in the accent behind them.
//
// One builder for both: the canvas draws exactly these objects, and the
// export writes exactly these objects for a device to draw. What the
// designer shows of an entry is then what a device gets, object for object.

import type { ScreenObject } from "@/components/project-editor"
import type { LiveValue } from "@/lib/live-value"
import { screenIconObject } from "@/lib/screen-icon"
import { navigatorLayout, navigatorScreens, type NavigatorLayout, type Shows } from "@/lib/navigator"
import { COLOR_KEYS } from "@/lib/themes"

/** The icon's side, and the gaps around it and between it and the name. */
export const ENTRY_ICON = 32
const GAP = 4
/** How far the open entry's box keeps from the entry's edges, and its corners. */
const ACTIVE_INSET = 4
const ACTIVE_RADIUS = 8

export interface EntryScreen {
  id: string
  name: string
  iconAssetId?: string
  iconLive?: LiveValue
}

/** What an entry is drawn with: the navigator's resolved colours and font. */
export interface EntryLook {
  shows: Shows
  /** The name's font and its line height (ascent plus descent). */
  fontId?: string
  fontSize: number
  textColor: string
  activeColor: string
  activeTextColor: string
}

/** The navigator object's look, its colours as resolved for the screen it is drawn on. */
export function entryLook(navigator: ScreenObject, fonts: { id: string; size?: number }[]): EntryLook {
  const p = navigator.properties
  const font = fonts.find((f) => f.id === p.fontId)
  return {
    shows: p.shows ?? "iconsAndText",
    fontId: p.fontId,
    fontSize: font?.size ?? 16,
    textColor: p.textColor ?? "#000000",
    activeColor: p.activeColor ?? "#6750a4",
    activeTextColor: p.activeTextColor ?? "#ffffff",
  }
}

// A screen name as a text: braces are written double, so a name is never
// read as a placeholder or a live value.
function asText(name: string): string {
  return name.replace(/\{/g, "{{").replace(/\}/g, "}}")
}

/**
 * The objects of one entry, `width` by `height`, at the entry's top left:
 * the icon centred, the name under it when the navigator shows text, and -
 * `active` - a box in the accent behind both, icon and name then in «Text
 * on accent».
 */
export function navigatorEntryObjects(screen: EntryScreen, width: number, height: number, look: EntryLook, active: boolean): ScreenObject[] {
  const ink = active ? look.activeTextColor : look.textColor
  const withText = look.shows === "iconsAndText"
  const contentHeight = withText ? ENTRY_ICON + GAP + look.fontSize : ENTRY_ICON
  const top = Math.floor((height - contentHeight) / 2)
  const objects: ScreenObject[] = []

  if (active) {
    objects.push({
      id: `${screen.id}-active`,
      type: "box",
      x: ACTIVE_INSET,
      y: ACTIVE_INSET,
      width: width - 2 * ACTIVE_INSET,
      height: height - 2 * ACTIVE_INSET,
      zIndex: 0,
      properties: { fillColor: look.activeColor, strokeColor: look.activeColor, strokeWidth: 0, cornerRadius: ACTIVE_RADIUS },
    } as ScreenObject)
  }

  const icon = screenIconObject(screen, ENTRY_ICON)
  objects.push({
    ...icon,
    x: Math.floor((width - ENTRY_ICON) / 2),
    y: top,
    zIndex: 1,
    properties: { ...icon.properties, iconColor: ink, backgroundColor: "transparent" },
  })

  if (withText) {
    objects.push({
      id: `${screen.id}-name`,
      type: "text",
      x: GAP,
      y: top + ENTRY_ICON + GAP,
      width: width - 2 * GAP,
      height: look.fontSize,
      zIndex: 2,
      properties: {
        text: asText(screen.name),
        fontId: look.fontId,
        textColor: ink,
        textAlign: "center",
        backgroundColor: "transparent",
        borderColor: "transparent",
      },
    } as ScreenObject)
  }
  return objects
}

/**
 * Every entry's objects, normal and active, at a nominal size - what has to
 * be loaded before a navigator can be drawn in one go (test-render's icon
 * preload).
 */
export function everyEntryObject(
  navigator: ScreenObject,
  screens: readonly (EntryScreen & { isMaster?: boolean; screenType?: "popup"; hidden?: boolean })[],
  fonts: { id: string; size?: number }[],
): ScreenObject[] {
  const look = entryLook(navigator, fonts)
  return navigatorScreens(screens).flatMap((s) => [
    ...navigatorEntryObjects(s, 88, 88, look, false),
    ...navigatorEntryObjects(s, 88, 88, look, true),
  ])
}

// ------------------------------------------------------------------ export

interface NavigatorProject {
  screenWidth: number
  screenHeight: number
  screens: readonly (EntryScreen & { isMaster?: boolean; screenType?: "popup"; hidden?: boolean; objects: ScreenObject[] })[]
}

/**
 * What a device below the navigator's generation would not show: each
 * navigator, by its master, and each hidden screen - named for the deploy
 * dialog's warning.
 */
export function navigatorNotOnDevices(project: NavigatorProject & { screens: readonly { name: string }[] }): string[] {
  return [
    ...navigatorsOf(project).map(({ master }) => `the navigator on ${(master as { name: string }).name}`),
    ...project.screens.filter((s) => s.hidden && !s.isMaster && s.screenType !== "popup").map((s) => `hidden screen ${(s as { name: string }).name}`),
  ]
}

/** Every master's navigator, in screen-list order (decisions 1, 16). */
export function navigatorsOf<P extends NavigatorProject>(project: P): { master: P["screens"][number]; navigator: ScreenObject }[] {
  return project.screens.flatMap((master) => {
    if (!master.isMaster) return []
    const navigator = master.objects.find((o) => o.type === "navigator")
    return navigator ? [{ master, navigator }] : []
  })
}

/** A navigator's layout on the project's screen, with every listed screen. */
export function exportLayout(project: NavigatorProject, navigator: ScreenObject): NavigatorLayout {
  return navigatorLayout(
    navigator.properties.edge ?? "left",
    navigator.properties.shows ?? "iconsAndText",
    project.screenWidth,
    project.screenHeight,
    navigatorScreens(project.screens).length,
  )
}

/** An entry's width and height. */
export function entrySize(layout: NavigatorLayout): { width: number; height: number } {
  return layout.horizontal
    ? { width: layout.entryLength, height: layout.strip.height }
    : { width: layout.strip.width, height: layout.entryLength }
}

/** The key an entry's bakes go under - a file-name-safe screen id of their own. */
export function entryKey(masterId: string, screenId: string, active: boolean): string {
  return `nav-${masterId}-${screenId}-${active ? "active" : "normal"}`
}

/** A navigator's properties as drawn dark: each colour's `XDark` where it has one. */
export function darkProperties(properties: Record<string, any>): Record<string, any> {
  const out = { ...properties }
  for (const key of COLOR_KEYS) if (properties[`${key}Dark`]) out[key] = properties[`${key}Dark`]
  return out
}

/** Light entry objects with the dark ones' colours beside them as `XDark` (24 bit). */
export function withDarkColours(light: ScreenObject[], dark: ScreenObject[]): ScreenObject[] {
  return light.map((obj, i) => {
    const properties = { ...obj.properties }
    for (const key of COLOR_KEYS) {
      const value = dark[i]?.properties[key]
      if (typeof value === "string" && value !== "transparent") properties[`${key}Dark`] = value
    }
    return { ...obj, properties }
  })
}
