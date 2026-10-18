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
import {
  barLayout,
  navigatorScreens,
  NAVIGATOR_DIVIDER,
  navigatorStrip,
  type Edge,
  type NavigatorBar,
  type NavigatorLayout,
  type Shows,
  type ThemeSwitchAt,
} from "@/lib/navigator"
import { COLOR_KEYS, THEME_COMMAND_TOPIC, THEME_STATE_TOPIC } from "@/lib/themes"
import { switchTrack } from "@/lib/switch-shape"
import { backOf, oppositeEdge, type GraphScreen, type ScreenEdge } from "@/lib/screen-graph"

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
  /**
   * The edge whose line lies over the entry's screen side, if the navigator
   * draws one: the open entry's box keeps its distance from the line, not
   * from under it (2026-10-11 - it stood 2 px from the line, 4 px from the
   * other side).
   */
  dividerSide?: Edge
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
    dividerSide: p.borderColor && p.borderColor !== "transparent" ? (p.edge ?? "left") : undefined,
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
/**
 * The marker: the box an entry's active look begins with (device contract
 * §2.7), within an entry `width` by `height`. It is what glides along the
 * strip with a swipe (lib/navigator.ts markerRect).
 */
export function markerBox(id: string, width: number, height: number, look: EntryLook): ScreenObject {
  // The line lies over the strip's last pixels on the screen's side.
  const d = NAVIGATOR_DIVIDER
  const side = look.dividerSide
  return {
    id: `${id}-active`,
    type: "box",
    x: ACTIVE_INSET + (side === "right" ? d : 0),
    y: ACTIVE_INSET + (side === "bottom" ? d : 0),
    width: width - 2 * ACTIVE_INSET - (side === "left" || side === "right" ? d : 0),
    height: height - 2 * ACTIVE_INSET - (side === "top" || side === "bottom" ? d : 0),
    zIndex: 0,
    properties: { fillColor: look.activeColor, strokeColor: look.activeColor, strokeWidth: 0, cornerRadius: ACTIVE_RADIUS },
  } as ScreenObject
}

export function navigatorEntryObjects(screen: EntryScreen, width: number, height: number, look: EntryLook, active: boolean): ScreenObject[] {
  const ink = active ? look.activeTextColor : look.textColor
  // An entry without a name - the way back - is its icon alone: an empty
  // text would draw the text's stand-in «Label».
  const withText = look.shows === "iconsAndText" && screen.name !== ""
  const contentHeight = withText ? ENTRY_ICON + GAP + look.fontSize : ENTRY_ICON
  const top = Math.floor((height - contentHeight) / 2)
  const objects: ScreenObject[] = []

  if (active) objects.push(markerBox(screen.id, width, height, look))

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

// ------------------------------------------------------- the light/dark switch
//
// A place on the strip that does not scroll (2026-10-11): a switch reading
// THEME_STATE_TOPIC, its knob on the left with a sun while the installation
// is light, on the right with a moon while it is dark - an ordinary switch,
// which every device draws already. A tap asks THEME_COMMAND_TOPIC for the
// other. (First a sun or moon icon; the user wanted it to read as a switch.)

const themeSvg = (body: string) =>
  `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`) : Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`

export const THEME_SWITCH_SUN = "schaltli-theme-sun"
export const THEME_SWITCH_MOON = "schaltli-theme-moon"

/** The switch's two icons, as project assets the switch's objects name. */
export const THEME_SWITCH_ASSETS = [
  {
    id: THEME_SWITCH_SUN,
    name: "Light",
    type: "icon" as const,
    data: themeSvg(
      '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
    ),
  },
  {
    id: THEME_SWITCH_MOON,
    name: "Dark",
    type: "icon" as const,
    data: themeSvg('<path fill="currentColor" d="M14.5 2.5a9.5 9.5 0 1 0 7 15.6A8 8 0 0 1 14.5 2.5z"/>'),
  },
]

// The way back from a screen off the main row (docs/2026-10-17-screen-graph.md
// decision 7): one arrow, pointing to where its page lies - on a screen above
// its page, down. Keyed by the side the screen lies on (the opposite of its
// `back`), as the export's navigators[].back is: the arrow points the other way.
const BACK_ARROW_PATHS: Record<ScreenEdge, string> = {
  up: "M12 4v16M5 13l7 7 7-7",
  down: "M12 20V4M5 11l7-7 7 7",
  left: "M4 12h16M13 5l7 7-7 7",
  right: "M20 12H4M11 5l-7 7 7 7",
}

export const backArrowAssetId = (edge: ScreenEdge) => `schaltli-back-${edge}`

export const BACK_ARROW_ASSETS = (Object.keys(BACK_ARROW_PATHS) as ScreenEdge[]).map((edge) => ({
  id: backArrowAssetId(edge),
  name: "Back",
  type: "icon" as const,
  data: themeSvg(`<path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="${BACK_ARROW_PATHS[edge]}"/>`),
}))

/**
 * The way back as an entry of its own, for the export: its arrow pointing
 * `edge`, no name (device contract §2.10). A device draws it as the one entry
 * on a screen with `back`, and a tap on it shows `neighbours[back]`.
 */
export const backEntryScreen = (edge: ScreenEdge): EntryScreen => ({ id: `back-${edge}`, name: "", iconAssetId: backArrowAssetId(edge) })

/** The sides the screens off the main row lie on, each once, in the order up, down, left, right: one arrow each, pointing the other way. */
export function backArrowEdges(screens: readonly GraphScreen[]): ScreenEdge[] {
  const used = new Set(screens.flatMap((s) => {
    const back = backOf(screens, s.id)
    return back ? [oppositeEdge(back)] : []
  }))
  return (["up", "down", "left", "right"] as ScreenEdge[]).filter((e) => used.has(e))
}

/** The project with the arrows' icons among its assets, where a screen lies off the main row - as the switch's (withThemeSwitchAssets). */
export function withBackArrowAssets<P extends { assets?: any[]; screens: readonly GraphScreen[] }>(project: P): P {
  const edges = backArrowEdges(project.screens)
  if (edges.length === 0) return project
  const have = new Set((project.assets ?? []).map((a) => a.id))
  const needed = BACK_ARROW_ASSETS.filter((a) => edges.some((e) => a.id === backArrowAssetId(e)) && !have.has(a.id))
  return { ...project, assets: [...(project.assets ?? []), ...needed] }
}

/**
 * What a navigator lists on the screen it is shown on: the main row, or on a
 * screen docked off it the single «←» - an entry without a name whose id is
 * the screen it goes back to, so a tap on it opens that one as on any entry.
 */
export function navigatorEntries<S extends EntryScreen & GraphScreen>(screens: readonly S[], activeScreenId: string | undefined): EntryScreen[] {
  const back = activeScreenId === undefined ? undefined : backOf(screens, activeScreenId)
  if (!back) return navigatorScreens(screens)
  const docked = screens.find((s) => s.id === activeScreenId)!
  return [{ id: docked.dock!.screenId, name: "", iconAssetId: backArrowAssetId(oppositeEdge(back)) }]
}

/** The switch as an entry: no name, its icon the moon while dark, the sun otherwise. */
export const THEME_SWITCH_ENTRY: EntryScreen = {
  id: "theme-switch",
  name: "",
  iconAssetId: THEME_SWITCH_SUN,
  iconLive: {
    id: "lv1",
    source: { namespace: "topic", path: THEME_STATE_TOPIC },
    rules: [{ op: "==", operand: "dark", result: { kind: "icon", icon: THEME_SWITCH_MOON } }],
    otherwise: { kind: "icon", icon: THEME_SWITCH_SUN },
    // No value means light (device contract 4), so the sun before any arrives.
    noValueYet: { kind: "icon", icon: THEME_SWITCH_SUN },
  },
}

/** Where the navigator's switch stands. */
export function themeSwitchAt(navigator: ScreenObject): ThemeSwitchAt {
  const at = navigator.properties?.themeSwitch
  return at === "near" || at === "far" ? at : "none"
}

/** How tall the switch is in its place (its track two thirds of it); its width is its track's. */
const THEME_SWITCH_HEIGHT = 30

/**
 * The switch's objects in its place, `width` by `height`: one switch,
 * centred, in the colour the open entry stands out in - the accent on
 * «Panel», the screen's ground on «Accent».
 */
export function themeSwitchObjects(width: number, height: number, look: EntryLook): ScreenObject[] {
  const h = Math.min(THEME_SWITCH_HEIGHT, height - 2 * GAP)
  // Both «on»: light and dark are two choices, not on and off, and a switch
  // shows a state's icon on its knob only while that state counts as on -
  // with light «off» the sun never showed and the switch did not say what
  // it was for (the user, 2026-10-11).
  const states = [
    { id: "sun", label: "", readValue: "light", writeValue: "light", showAsOn: true, iconAssetId: THEME_SWITCH_SUN },
    { id: "moon", label: "", readValue: "dark", writeValue: "dark", showAsOn: true, iconAssetId: THEME_SWITCH_MOON },
  ]
  const base = { id: "theme-switch", type: "switch", x: 0, y: 0, width: 1000, height: h, zIndex: 1, properties: { states } } as ScreenObject
  const w = Math.min(width - 2 * GAP, switchTrack(base, 2).w)
  return [
    {
      ...base,
      x: Math.floor((width - w) / 2),
      y: Math.floor((height - h) / 2),
      width: w,
      properties: {
        topic: THEME_STATE_TOPIC,
        writeTopic: THEME_COMMAND_TOPIC,
        states,
        switchStyle: "filled",
        switchColor: look.activeColor,
        fontId: look.fontId,
      },
    } as ScreenObject,
  ]
}

/**
 * The project with what the switch needs, where a navigator shows it: its
 * icons among the assets, and THEME_STATE_TOPIC among the topics - a board
 * keeps the value of a topic its project names, and no other (found on the
 * 4.3B, 2026-10-11: the moon never came).
 */
export function withThemeSwitchAssets<P extends { assets?: any[]; topics?: any[]; screens: readonly { isMaster?: boolean; objects?: ScreenObject[] }[] }>(project: P): P {
  const shows = project.screens.some((s) => s.isMaster && (s.objects ?? []).some((o) => o.type === "navigator" && themeSwitchAt(o) !== "none"))
  if (!shows) return project
  const have = new Set((project.assets ?? []).map((a) => a.id))
  const topics = project.topics ?? []
  return {
    ...project,
    assets: [...(project.assets ?? []), ...THEME_SWITCH_ASSETS.filter((a) => !have.has(a.id))],
    topics: topics.some((t) => t.topic === THEME_STATE_TOPIC)
      ? topics
      : [...topics, { id: "schaltli-theme-state", topic: THEME_STATE_TOPIC, type: "text", examples: ["light", "dark"] }],
  }
}

/** The key the switch's bakes go under. */
export function themeSwitchKey(masterId: string): string {
  return `nav-${masterId}-theme-switch`
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
  return [
    ...navigatorScreens(screens).flatMap((s) => [...navigatorEntryObjects(s, 88, 88, look, false), ...navigatorEntryObjects(s, 88, 88, look, true)]),
    ...(themeSwitchAt(navigator) !== "none" ? themeSwitchObjects(88, 88, look) : []),
    // The way back's arrows, where a screen lies off the main row.
    ...backArrowEdges(screens as any).flatMap((edge) => navigatorEntryObjects(backEntryScreen(edge), 88, 88, look, false)),
  ]
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

/** What a device below 1.6 would not show: each navigator's light/dark switch, by its master. */
export function themeSwitchNotOnDevices(project: NavigatorProject & { screens: readonly { name: string }[] }): string[] {
  return navigatorsOf(project)
    .filter(({ navigator }) => themeSwitchAt(navigator) !== "none")
    .map(({ master }) => `the light/dark switch on ${(master as { name: string }).name}`)
}

/** Every master's navigator, in screen-list order (decisions 1, 16). */
export function navigatorsOf<P extends NavigatorProject>(project: P): { master: P["screens"][number]; navigator: ScreenObject }[] {
  return project.screens.flatMap((master) => {
    if (!master.isMaster) return []
    const navigator = master.objects.find((o) => o.type === "navigator")
    return navigator ? [{ master, navigator }] : []
  })
}

/** A navigator's bar on the project's screen: its entries laid out with every listed screen, and the switch's place. */
export function exportBar(project: NavigatorProject, navigator: ScreenObject): NavigatorBar {
  const edge = navigator.properties.edge ?? "left"
  const shows = navigator.properties.shows ?? "iconsAndText"
  const bar = navigatorStrip(edge, shows, project.screenWidth, project.screenHeight)
  return barLayout(edge, shows, bar, navigatorScreens(project.screens).length, themeSwitchAt(navigator))
}

/** The entries' layout of exportBar. */
export function exportLayout(project: NavigatorProject, navigator: ScreenObject): NavigatorLayout {
  return exportBar(project, navigator).layout
}

/**
 * The way back's bar (device contract §2.10): its one entry as long as the
 * strip's entries' part, as the designer's preview lays it out.
 */
export function exportBackBar(project: NavigatorProject, navigator: ScreenObject): NavigatorBar {
  const edge = navigator.properties.edge ?? "left"
  const shows = navigator.properties.shows ?? "iconsAndText"
  const bar = navigatorStrip(edge, shows, project.screenWidth, project.screenHeight)
  return barLayout(edge, shows, bar, 1, themeSwitchAt(navigator))
}

/** The key a way back's bakes go under. */
export const backEntryKey = (masterId: string, edge: ScreenEdge) => entryKey(masterId, `back-${edge}`, false)

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
