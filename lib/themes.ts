/**
 * Themes: the colours a screen may use, as roles rather than values.
 *
 * A project's screens each pick one of the themes shipped here; every colour
 * property of an object holds the name of a role ("text", "accent", ...) or
 * "transparent", never a hex. The hex is looked up at the boundary to
 * drawing and to export - applyTheme() below - for the variant being shown
 * (light or dark) and the colour depth of the device, so the renderers, the
 * exporter's output and the devices keep seeing what they see today.
 *
 * Decided with the user on 2026-09-24 (docs/2026-09-24-themes.md): a fixed
 * catalogue, not editable; light and dark per theme; grey and 1-bit
 * devices get the light variant only; no hex anywhere in a project file.
 *
 * What a device derives today is not a role and stays derived: a level's
 * track, an arc's marker, a switch's surface, pill and ink, a button's
 * pressed state (lib/level-shape.ts, lib/switch-shape.ts,
 * lib/material-colors.ts, mirrored in C++ and Kotlin). They are computed
 * from the resolved accent and surface, so a theme changes them without
 * touching that code.
 */

import { applyColorDepth } from "@/lib/color-depth"
import { X11_COLOR_PALETTE } from "@/lib/color-palette"

export const ROLES = [
  "surface",
  "panel",
  "outline",
  "text",
  "textMuted",
  "accent",
  "onAccent",
  "accentAlt",
] as const

export type Role = (typeof ROLES)[number]
export type Variant = "light" | "dark"
export type RoleValues = Record<Role, string>

/** What the property panel calls a role. Quoted by the handbook. */
export const ROLE_LABELS: Record<Role, string> = {
  surface: "Surface",
  panel: "Panel",
  outline: "Outline",
  text: "Text",
  textMuted: "Muted text",
  accent: "Accent",
  onAccent: "Text on accent",
  accentAlt: "Second accent",
}

export interface Theme {
  id: string
  name: string
  light: RoleValues
  dark: RoleValues
}

/**
 * The object properties that hold a colour, and the screen's own. The
 * exporter's quantiser finds them by the /color$/i suffix; this list is the
 * same set spelled out, for code that has to write or check them.
 */
export const COLOR_KEYS = [
  "color",
  "backgroundColor",
  "borderColor",
  "fillColor",
  "strokeColor",
  "textColor",
  "buttonColor",
  "switchColor",
  "iconColor",
] as const

export const THEMES: Theme[] = [
  {
    id: "lavender",
    name: "Lavender",
    // Today's creation palette (lib/control-palette.ts, 24 bit, and the
    // literals handleCreateObject wrote), value for value: a project from
    // before themes opens in this and looks the same. Material 3's primary
    // as accent, chosen by the user on 2026-09-19.
    light: {
      surface: "#ffffff",
      panel: "#e5e5e5",
      outline: "#cccccc",
      text: "#000000",
      textMuted: "#5f5f5f",
      accent: "#6750A4",
      onAccent: "#ffffff",
      accentAlt: "#625B71",
    },
    // Material 3's dark scheme for the same seed.
    dark: {
      surface: "#1c1b1f",
      panel: "#2b2930",
      outline: "#49454f",
      text: "#e6e1e5",
      textMuted: "#cac4d0",
      accent: "#d0bcff",
      onAccent: "#381e72",
      accentAlt: "#ccc2dc",
    },
  },
  {
    id: "schaltli",
    name: "Schaltli",
    // The brand (brand/README.md, "Die Farben"): black and white, greys on
    // the PaperS3's sixteen levels, signal orange for "on" and nothing
    // else. Text on orange is ink, not white: 7:1 against 2.9:1. There is
    // no second colour in the brand, so the second accent is a grey.
    light: {
      surface: "#ffffff",
      panel: "#eeeeee",
      outline: "#cccccc",
      text: "#111111",
      textMuted: "#555555",
      accent: "#ff6a13",
      onAccent: "#111111",
      accentAlt: "#555555",
    },
    dark: {
      surface: "#111111",
      panel: "#222222",
      outline: "#444444",
      text: "#eeeeee",
      textMuted: "#aaaaaa",
      accent: "#ff8a3d",
      onAccent: "#111111",
      accentAlt: "#aaaaaa",
    },
  },
  {
    id: "slate",
    name: "Slate",
    light: {
      surface: "#f4f6f8",
      panel: "#e3e8ee",
      outline: "#b8c2cc",
      text: "#1e2a36",
      textMuted: "#5b6b7a",
      accent: "#2f6f9f",
      onAccent: "#ffffff",
      accentAlt: "#d98c2b",
    },
    dark: {
      surface: "#15202b",
      panel: "#1f2d3a",
      outline: "#3b4a58",
      text: "#e6edf3",
      textMuted: "#9fb0bf",
      accent: "#6aa8d8",
      onAccent: "#0f1a24",
      accentAlt: "#e8a94f",
    },
  },
  {
    id: "forest",
    name: "Forest",
    light: {
      surface: "#f6f8f2",
      panel: "#e6ecdc",
      outline: "#b9c4a8",
      text: "#1f2a1c",
      textMuted: "#5c6b52",
      accent: "#3f7d4e",
      onAccent: "#ffffff",
      accentAlt: "#b7791f",
    },
    dark: {
      surface: "#121a12",
      panel: "#1c261c",
      outline: "#3a4a3a",
      text: "#e7efe2",
      textMuted: "#a3b39c",
      accent: "#7cc48a",
      onAccent: "#0f1f12",
      accentAlt: "#e0b04a",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    light: {
      surface: "#f3f8fa",
      panel: "#dfeef3",
      outline: "#a9c7d3",
      text: "#15303a",
      textMuted: "#4f6d78",
      accent: "#1c7c9c",
      onAccent: "#ffffff",
      accentAlt: "#e07a3a",
    },
    dark: {
      surface: "#0f1c22",
      panel: "#16282f",
      outline: "#2e4a54",
      text: "#e3f0f4",
      textMuted: "#93b0ba",
      accent: "#4fb3d4",
      onAccent: "#082028",
      accentAlt: "#ff9a5a",
    },
  },
  {
    id: "amber",
    name: "Amber",
    light: {
      surface: "#fbf7f0",
      panel: "#f1e8d8",
      outline: "#d4c4a8",
      text: "#2c2416",
      textMuted: "#6b5c44",
      accent: "#c9821a",
      onAccent: "#1c1200",
      accentAlt: "#4b6b8a",
    },
    dark: {
      surface: "#1a150d",
      panel: "#262016",
      outline: "#4a3f2c",
      text: "#f2ead9",
      textMuted: "#b8a888",
      accent: "#f2a93b",
      onAccent: "#1c1200",
      accentAlt: "#8fb0cf",
    },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    light: {
      surface: "#faf5ef",
      panel: "#efe4d6",
      outline: "#cfb9a2",
      text: "#33261c",
      textMuted: "#6f5b4a",
      accent: "#c2553a",
      onAccent: "#ffffff",
      accentAlt: "#5f7d5a",
    },
    dark: {
      surface: "#1b1512",
      panel: "#29201b",
      outline: "#4d3b31",
      text: "#f1e7df",
      textMuted: "#b8a394",
      accent: "#e8775a",
      onAccent: "#2a110a",
      accentAlt: "#8fb08a",
    },
  },
  {
    id: "garden",
    name: "Garden",
    light: {
      surface: "#f5f5f5",
      panel: "#e4e4e4",
      outline: "#bdbdbd",
      text: "#1a1a1a",
      textMuted: "#616161",
      accent: "#7cb518",
      onAccent: "#0f1a00",
      accentAlt: "#2a8fbd",
    },
    dark: {
      surface: "#161616",
      panel: "#232323",
      outline: "#3d3d3d",
      text: "#ececec",
      textMuted: "#a0a0a0",
      accent: "#a4dd3a",
      onAccent: "#0f1a00",
      accentAlt: "#4fb3d4",
    },
  },
]

export const DEFAULT_THEME_ID = "lavender"

interface ThemedScreen {
  id: string
  themeId?: string
  isMaster?: boolean
  masterScreenId?: string
}

/**
 * The master a screen takes its theme from: the one it is assigned to,
 * whether or not it shows the master's objects ("Show master" hides objects,
 * not the theme). Every screen has one (user, 2026-09-25).
 */
export function themeMaster<S extends ThemedScreen>(screen: S, allScreens: S[]): S | undefined {
  if (screen.isMaster || !screen.masterScreenId) return undefined
  return allScreens.find((s) => s.id === screen.masterScreenId && s.isMaster)
}

/**
 * The theme a screen is drawn in: its own, else its master's. Two levels,
 * master and screen (user, 2026-09-25) - there is no project theme. A
 * master always has a theme; the default stands in only for a file that
 * has not been migrated. A master's objects are drawn in the theme of the
 * screen they appear on, so callers pass the screen being drawn.
 */
export function themeFor<S extends ThemedScreen>(screen: S | undefined, allScreens: S[]): Theme {
  if (!screen) return themeById(undefined)
  return themeById(screen.themeId ?? themeMaster(screen, allScreens)?.themeId)
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
}

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/**
 * The hex a role has in a theme, for the variant shown and the depth of the
 * device. Grey and 1-bit devices have one variant: the light one, quantised
 * as every renderer quantises (decision of 2026-09-24 - e-paper has no light
 * to save, and every redraw costs).
 */
export function resolveRole(theme: Theme, role: Role, variant: Variant, colorDepth: string | undefined): string {
  const values = colorDepth === "24bit" || colorDepth === undefined ? theme[variant] : theme.light
  return applyColorDepth(values[role], colorDepth)
}

/**
 * A colour property's value as the renderers want it: a role becomes its
 * hex, anything else ("transparent", a hex in a device-format file) passes
 * through unchanged.
 */
export function resolveColorValue(
  value: unknown,
  theme: Theme,
  variant: Variant,
  colorDepth: string | undefined,
): unknown {
  return isRole(value) ? resolveRole(theme, value, variant, colorDepth) : value
}

/** A colour value as a string a canvas takes: a role resolved, a hex kept. */
export function resolveColor(value: string, theme: Theme, variant: Variant, colorDepth: string | undefined): string {
  return isRole(value) ? resolveRole(theme, value, variant, colorDepth) : value
}

/**
 * Objects with every colour property resolved for this theme, variant and
 * depth - what is handed to renderScreenObjects() and to the exporters.
 * Children (tab-control panels) are resolved too. Objects that hold no role
 * come back as they are.
 */
export function applyTheme<T extends { properties: Record<string, any>; children?: T[] }>(
  objects: T[],
  theme: Theme,
  variant: Variant,
  colorDepth: string | undefined,
): T[] {
  return objects.map((object) => {
    let properties = object.properties
    for (const key of COLOR_KEYS) {
      const value = properties[key]
      if (!isRole(value)) continue
      if (properties === object.properties) properties = { ...properties }
      properties[key] = resolveRole(theme, value, variant, colorDepth)
    }
    const children = object.children ? applyTheme(object.children, theme, variant, colorDepth) : object.children
    if (properties === object.properties && children === object.children) return object
    return { ...object, properties, children }
  })
}

// Rec. 601 luma-weighted distance in RGB: what the 4-bit quantiser weighs
// by, so "nearest" agrees with how the greys are made.
function distance(a: string, b: string): number {
  const pa = parseHex(a)
  const pb = parseHex(b)
  if (!pa || !pb) return Number.POSITIVE_INFINITY
  const [r, g, bl] = [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]]
  return 0.299 * r * r + 0.587 * g * g + 0.114 * bl * bl
}

function parseHex(hex: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The role whose light value in `theme` is nearest to a hex - how a colour
 * from before themes is given a role. `preferred` wins a tie: the role the
 * property would have been created with, so a default colour lands where it
 * came from.
 */
export function nearestRole(hex: string, theme: Theme, colorDepth: string | undefined, preferred?: Role): Role {
  // Compared as the device showed it: on a 1-bit panel #4CAF50 was black,
  // and the role it gets has to be black there too, not the role nearest to
  // a green nobody ever saw.
  const shown = applyColorDepth(hex, colorDepth)
  let best: Role = preferred ?? "text"
  let bestDistance = Number.POSITIVE_INFINITY
  for (const role of ROLES) {
    const d = distance(shown, resolveRole(theme, role, "light", colorDepth))
    if (d < bestDistance || (d === bestDistance && role === preferred)) {
      best = role
      bestDistance = d
    }
  }
  return best
}

// What a colour property would have been created with, so that a colour
// from before themes that sits exactly between two roles (white is both
// Surface and Text on accent in Lavender) lands where it came from.
const PREFERRED_ROLE: Record<string, Role> = {
  color: "text",
  textColor: "text",
  strokeColor: "text",
  iconColor: "text",
  backgroundColor: "surface",
  borderColor: "outline",
  fillColor: "accent",
  buttonColor: "accent",
  switchColor: "accent",
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function expandHex(hex: string): string {
  return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
}

// Old files also hold CSS colour names ("black", "white") - the X11 names
// the colour picker offered before themes. Read as the hex they name.
const NAMED = new Map(X11_COLOR_PALETTE.map((entry) => [entry.name.toLowerCase(), entry.hex]))

/** A colour from before themes as a #rrggbb, or undefined if it is none. */
function legacyHex(value: string): string | undefined {
  if (HEX.test(value)) return expandHex(value)
  return NAMED.get(value.trim().toLowerCase())
}

/** A value a colour property may hold since themes: a role, or none at all. */
function isThemeColor(value: unknown): boolean {
  return value === undefined || value === "transparent" || isRole(value)
}

export class ThemeColorError extends Error {}

interface ColouredObject {
  id?: string
  properties?: Record<string, any>
  children?: ColouredObject[]
}

/**
 * Gives every hex colour in a project the nearest role of the default theme,
 * in place, and says whether anything changed. Idempotent; a project without
 * hex passes through untouched. This is for the files that exist from before
 * themes - test fixtures and the generation corpus; there was no productive
 * data (user, 2026-09-24).
 *
 * - The colour keys (COLOR_KEYS) get the role; any other key ending in
 *   "color" holding a hex is a property nothing reads any more
 *   (trackColor, markerColor, activeBackgroundColor, ...) and is dropped.
 * - A screen's backgroundColor gets a role; gridColor is dropped, it is
 *   derived from the background.
 * - Every master gets a theme if it has none.
 *
 * Anything a colour key still holds that is neither a role nor
 * "transparent" is refused, naming the object: a hex must never slip into a
 * project again.
 */
export function migrateColorsToRoles(project: {
  settings?: { colorDepth?: string; themeId?: string }
  screens?: Array<{ id?: string; isMaster?: boolean; themeId?: string; backgroundColor?: string; gridColor?: string; objects?: ColouredObject[] }>
}): boolean {
  const theme = themeById(DEFAULT_THEME_ID)
  const depth = project.settings?.colorDepth
  let changed = false

  const roleFor = (hex: string, key: string): Role => nearestRole(hex, theme, depth, PREFERRED_ROLE[key])

  const walkProperties = (node: Record<string, any>, where: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        value.forEach((item, i) => item && typeof item === "object" && walkProperties(item, `${where}.${key}[${i}]`))
      } else if (value && typeof value === "object") {
        walkProperties(value, `${where}.${key}`)
      } else if (/color$/i.test(key) && typeof value === "string") {
        const isColorKey = (COLOR_KEYS as readonly string[]).includes(key)
        const hex = legacyHex(value)
        if (value.trim() === "") {
          // An empty colour was "not set" to every renderer; now it is absent.
          delete node[key]
          changed = true
        } else if (hex) {
          if (isColorKey) node[key] = roleFor(hex, key)
          else delete node[key]
          changed = true
        } else if (isColorKey && !isThemeColor(value)) {
          throw new ThemeColorError(`${where}: ${key} is "${value}", neither a role of a theme nor "transparent"`)
        }
      }
    }
  }

  const walkObjects = (objects: ColouredObject[] | undefined, where: string) => {
    for (const object of objects ?? []) {
      const at = `${where} › ${object.id ?? "object"}`
      if (object.properties) walkProperties(object.properties, at)
      walkObjects(object.children, at)
    }
  }

  for (const screen of project.screens ?? []) {
    const where = `screen ${screen.id ?? "?"}`
    if (typeof screen.backgroundColor === "string") {
      const hex = legacyHex(screen.backgroundColor)
      if (hex) {
        screen.backgroundColor = nearestRole(hex, theme, depth, "surface")
        changed = true
      } else if (!isRole(screen.backgroundColor)) {
        throw new ThemeColorError(`${where}: backgroundColor is "${screen.backgroundColor}", not a role of a theme`)
      }
    }
    if (screen.gridColor !== undefined) {
      delete screen.gridColor
      changed = true
    }
    if (screen.isMaster && !screen.themeId) {
      screen.themeId = DEFAULT_THEME_ID
      changed = true
    }
    walkObjects(screen.objects, where)
  }
  return changed
}

/**
 * Every screen has a master, and so a theme (user, 2026-09-25): a project
 * without a master gets one, and a screen without one - or assigned to one
 * that no longer exists - is assigned to the first. Such a screen showed no
 * master's objects before, so it keeps not showing them (showMaster: false);
 * what it gains is the master's theme. Idempotent, in place, says whether
 * anything changed.
 */
export function ensureEveryScreenHasAMaster(project: {
  screens?: Array<{ id: string; name?: string; isMaster?: boolean; masterScreenId?: string; showMaster?: boolean; themeId?: string; objects?: unknown[] }>
}): boolean {
  const screens = project.screens
  if (!screens || screens.length === 0) return false
  let changed = false
  let masters = screens.filter((s) => s.isMaster)
  if (masters.length === 0) {
    let n = 1
    while (screens.some((s) => s.id === `master-${n}`)) n++
    // At the end, not the start: the editor opens a project on its first
    // screen, and that should stay the screen the user had, not a new empty
    // master.
    screens.push({ id: `master-${n}`, name: `Master ${n}`, isMaster: true, themeId: DEFAULT_THEME_ID, objects: [] })
    masters = [screens[screens.length - 1]]
    changed = true
  }
  for (const screen of screens) {
    if (screen.isMaster) continue
    if (screen.masterScreenId && masters.some((m) => m.id === screen.masterScreenId)) continue
    screen.masterScreenId = masters[0].id
    screen.showMaster = false
    changed = true
  }
  return changed
}
