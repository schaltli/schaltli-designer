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

/**
 * The theme a screen is drawn in: its own; else its master's (a master
 * always has one - Lavender unless chosen, user 2026-09-24); else the
 * project's; else the default. A master's objects are drawn in the theme of
 * the screen they appear on, so callers pass the screen being drawn and its
 * master, never the master alone.
 */
export function themeFor(
  settings: { themeId?: string } | undefined,
  screen: { themeId?: string } | undefined,
  masterScreen?: { themeId?: string },
): Theme {
  return themeById(screen?.themeId ?? masterScreen?.themeId ?? settings?.themeId)
}

/** Where a screen's theme comes from - what the Theme select shows. */
export function themeSource(
  screen: { themeId?: string; isMaster?: boolean },
  masterScreen?: { themeId?: string },
): "local" | "master" | "project" {
  if (screen.themeId) return "local"
  if (!screen.isMaster && masterScreen) return "master"
  return "project"
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
  let best: Role = preferred ?? "text"
  let bestDistance = Number.POSITIVE_INFINITY
  for (const role of ROLES) {
    const d = distance(hex, resolveRole(theme, role, "light", colorDepth))
    if (d < bestDistance || (d === bestDistance && role === preferred)) {
      best = role
      bestDistance = d
    }
  }
  return best
}
