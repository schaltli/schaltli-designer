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
  "accentEnd",
  // Since 2026-11-04 (docs/2026-11-04-text-sizes-and-colours.md, module
  // colour-model): two more colours of distinct hues, so each page or each
  // kind of control can have a colour of its own, and three
  // states that mean the same in every theme.
  "accent3",
  "accent4",
  "good",
  "warning",
  "alarm",
  "track",
  "trackEdge",
  // The energy diagram's (docs/2026-10-11-energy-diagram.md decision 12):
  // what a node is - the sun, the grid, the engine, a load - and a storage
  // charging or discharging. One pair for every colour theme (ENERGY_LIGHT).
  "energySun",
  "energyGrid",
  "energyEngine",
  "energyCharge",
  "energyDischarge",
  "energyLoad",
] as const

/** The roles of 2026-11-04: not what a colour from before themes is matched to either (nearestRole). */
export const COLOUR_MODEL_ROLES = ["accent3", "accent4", "good", "warning", "alarm"] as const

/** The energy diagram's roles: not what a colour from before themes is matched to (nearestRole). */
export const ENERGY_ROLES = ["energySun", "energyGrid", "energyEngine", "energyCharge", "energyDischarge", "energyLoad"] as const

export type Role = (typeof ROLES)[number]
export type Variant = "light" | "dark"

/**
 * Where an installation says light or dark (docs/2026-09-25-theme-topic.md):
 * `light` or `dark`, retained; none means light. A colour device follows it,
 * and so does the preview.
 */
export const THEME_STATE_TOPIC = "schaltli/state/theme"

/**
 * Where a device asks for light or dark: `light` or `dark`, answered by the
 * VanPi bridge on THEME_STATE_TOPIC. The navigator's switch sends the other
 * of what THEME_STATE_TOPIC says (2026-10-11).
 */
export const THEME_COMMAND_TOPIC = "schaltli/cmnd/theme"

/** The variant a value on THEME_STATE_TOPIC asks for, or null for anything else. */
export function variantFromTopic(value: string | undefined): Variant | null {
  return value === "light" || value === "dark" ? value : null
}
export type RoleValues = Record<Role, string>

/** What the property panel calls a role. Quoted by the handbook. */
export const ROLE_LABELS: Record<Role, string> = {
  // Neutral names since 2026-11-04, after CamperUI's model (the ids stay).
  surface: "Background",
  panel: "Card",
  outline: "Card border",
  text: "Text",
  textMuted: "Text low",
  accent: "Accent",
  onAccent: "Text on accent",
  accentAlt: "Accent 2",
  accentEnd: "Gradient end",
  accent3: "Accent 3",
  accent4: "Accent 4",
  good: "Good",
  warning: "Warning",
  alarm: "Alarm",
  track: "Track",
  trackEdge: "Track edge",
  energySun: "Sun",
  energyGrid: "Grid",
  energyEngine: "Engine",
  energyCharge: "Charging",
  energyDischarge: "Discharging",
  energyLoad: "Load",
}

/** The colour depths a device declares (its DDF's screen.colorDepth). */
export type ThemeDepth = "24bit" | "4bit" | "1bit"

export interface Theme {
  id: string
  name: string
  /**
   * The colour depths the theme is made for (user, 2026-09-30): on 16 greys
   * the colour themes all come out a similar mid grey and their tracks a
   * pale one, so the PaperS3 gets a theme of its own instead of a rule that
   * patches what a colour theme turns into. The picker offers a device only
   * the themes for its depth (themesFor).
   */
  depths: readonly ThemeDepth[]
  light: RoleValues
  dark: RoleValues
}

// The colour themes: made for an LCD, and what the 1-bit e-paper has used
// since themes began - it keeps them (user, 2026-09-30).
const COLOUR: readonly ThemeDepth[] = ["24bit", "1bit"]

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
  // Where a level's fill ends up along its scale: the fill runs from
  // fillColor to this. Set by the theme (accentEnd) wherever the fill is the
  // accent, and only for 24 bit (withLevelLook below).
  "fillEndColor",
  // A level's empty track and the edge round it (roles track, trackEdge;
  // user 2026-09-30). Until then the track was always derived - half the
  // fill, half the background - which put Paper's at a grey e-paper shows
  // too dark; a hex trackColor from before 2026-09-19 is still dropped by
  // migrateColorsToRoles, never read.
  "trackColor",
  "trackEdgeColor",
  // The navigator's open entry: its ground and its icon and text
  // (docs/2026-10-08-navigator.md decision 7).
  "activeColor",
  "activeTextColor",
  // The energy diagram's (docs/2026-10-11-energy-diagram.md decision 12):
  // its names and quiet lines, the bus, what carries nothing, and a
  // storage charging and discharging. Each node's own colour is its
  // `colorRole`, resolved to `color` by applyTheme.
  "mutedColor",
  "busColor",
  "idleColor",
  "chargeColor",
  "dischargeColor",
  // The text field's container and the line under it (tasks/ha-text-plan.md).
  "fieldColor",
  "lineColor",
  // A chart's line at now and a stack's NowPoint (2026-10-30).
  "nowColor",
] as const

// The energy roles of every colour theme, from the target picture the user
// approved (2026-10-11): what a sun, a socket or an engine is coloured
// does not change with a theme's accent. A theme may set its own later.
const ENERGY_LIGHT = {
  energySun: "#c99400",
  energyGrid: "#2f7ad8",
  energyEngine: "#e06c1f",
  energyCharge: "#2f9a52",
  energyDischarge: "#d0453f",
  energyLoad: "#7a5bd1",
}
const ENERGY_DARK = {
  energySun: "#ffd54f",
  energyGrid: "#7fb2ff",
  energyEngine: "#ffab70",
  energyCharge: "#7fd492",
  energyDischarge: "#ff8a80",
  energyLoad: "#c3b0ff",
}

// The states mean the same in every colour theme (spec): good, warning,
// alarm - CamperUI's emerald, yellow and red.
const STATES_LIGHT = { good: "#059669", warning: "#ca8a04", alarm: "#dc2626" }
const STATES_DARK = { good: "#10b981", warning: "#eab308", alarm: "#ef4444" }
// The colour themes after the colour model (the user's choice of
// 2026-11-04, tasks/colour-model-plan.md T3): a calm ground tinted towards
// the theme's colour, cards lighter than the ground in light, the theme's
// own colour as accent and three of clearly different hues beside it. In
// dark the tracks were darker than the card until 2026-11-10, and on the
// ground itself that left them as good as invisible (the user, on the
// demo's sliders): since then the card with 22 % of the muted text, lighter
// than card and ground alike. Slate's gradient ends in cyan since the same
// day, not in a lighter sky blue the eye hardly told from its start.

export const THEMES: Theme[] = [
  {
    id: "lavender",
    name: "Lavender",
    depths: COLOUR,
    // Material 3's primary as accent, chosen by the user on 2026-09-19. A
    // project from before themes opens in this; its colours are matched to
    // roles against Lavender as it was then (LEGACY_PALETTE), so the roles
    // they become stay the same.
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#f6f5fa",
      panel: "#ffffff",
      outline: "#e6e3ef",
      track: "#dcd8e8",
      text: "#1c1b1f",
      textMuted: "#6b6878",
      accent: "#6750a4",
      accentEnd: "#7f67be",
      accentAlt: "#db2777",
      accent3: "#0d9488",
      accent4: "#d97706",
      onAccent: "#ffffff",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#141318",
      panel: "#1d1b24",
      outline: "#2e2b38",
      track: "#3c3945",
      text: "#f3f1f8",
      textMuted: "#a8a3b8",
      accent: "#d0bcff",
      accentEnd: "#e8ddff",
      accentAlt: "#f472b6",
      accent3: "#2dd4bf",
      accent4: "#f59e0b",
      onAccent: "#381e72",
      trackEdge: "transparent",
    },
  },
  {
    id: "schaltli",
    name: "Schaltli",
    depths: COLOUR,
    // The brand (brand/README.md, "Die Farben"): warm greys, signal orange
    // as accent, and since the colour model three more beside it. Text on
    // orange is ink, not white: 7:1 against 2.9:1.
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#f5f5f4",
      panel: "#ffffff",
      outline: "#e7e5e4",
      track: "#dedbd8",
      text: "#1c1917",
      textMuted: "#78716c",
      accent: "#ff6a13",
      accentEnd: "#ff8a3d",
      accentAlt: "#0284c7",
      accent3: "#65a30d",
      accent4: "#7c3aed",
      onAccent: "#1c1917",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#121110",
      panel: "#1c1a19",
      outline: "#2c2927",
      track: "#3b3836",
      text: "#f5f5f4",
      textMuted: "#a8a29e",
      accent: "#ff8a3d",
      accentEnd: "#ffab70",
      accentAlt: "#38bdf8",
      accent3: "#a3e635",
      accent4: "#a78bfa",
      onAccent: "#1c1917",
      trackEdge: "transparent",
    },
  },
  {
    id: "slate",
    name: "Slate",
    depths: COLOUR,
    // CamperUI's own slate theme in Schaltli's roles (docs/2026-11-04-text-
    // sizes-and-colours.md, the user's choice of 2026-11-04): a neutral
    // ground, four colours of distinct hues, the shared states. The theme
    // of new masters since then.
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#f1f5f9",
      panel: "#ffffff",
      outline: "#e2e8f0",
      text: "#0f172a",
      textMuted: "#64748b",
      accent: "#0284c7",
      onAccent: "#ffffff",
      accentAlt: "#d97706",
      accentEnd: "#06b6d4",
      accent3: "#0891b2",
      accent4: "#9333ea",
      track: "#dbe2ec",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#101318",
      panel: "#181c24",
      outline: "#272d3b",
      text: "#f1f5f9",
      textMuted: "#94a3b8",
      accent: "#0ea5e9",
      onAccent: "#ffffff",
      accentAlt: "#f59e0b",
      accentEnd: "#22d3ee",
      accent3: "#06b6d4",
      accent4: "#a855f7",
      track: "#333a45",
      trackEdge: "transparent",
    },
  },
  {
    id: "forest",
    name: "Forest",
    depths: COLOUR,
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#f4f7f2",
      panel: "#ffffff",
      outline: "#e1e8dc",
      track: "#d5dfd0",
      text: "#16211a",
      textMuted: "#5e6d63",
      accent: "#3f7d4e",
      accentEnd: "#2b8f9a",
      accentAlt: "#b7791f",
      accent3: "#0369a1",
      accent4: "#be123c",
      onAccent: "#ffffff",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#101510",
      panel: "#182019",
      outline: "#263127",
      track: "#354037",
      text: "#eef4ee",
      textMuted: "#9db0a1",
      accent: "#7cc48a",
      accentEnd: "#7fd0d2",
      accentAlt: "#e0b04a",
      accent3: "#38bdf8",
      accent4: "#fb7185",
      onAccent: "#0f1a12",
      trackEdge: "transparent",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    depths: COLOUR,
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#f2f7f9",
      panel: "#ffffff",
      outline: "#dde8ed",
      track: "#d0dfe6",
      text: "#0f1d24",
      textMuted: "#5a6d77",
      accent: "#1c7c9c",
      accentEnd: "#2bb3b8",
      accentAlt: "#e07a3a",
      accent3: "#4f46e5",
      accent4: "#db2777",
      onAccent: "#ffffff",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#0d171c",
      panel: "#142228",
      outline: "#213239",
      track: "#314148",
      text: "#eaf4f7",
      textMuted: "#98aeb8",
      accent: "#4fb3d4",
      accentEnd: "#7fe0d8",
      accentAlt: "#ff9a5a",
      accent3: "#818cf8",
      accent4: "#f472b6",
      onAccent: "#0b1a20",
      trackEdge: "transparent",
    },
  },
  {
    id: "amber",
    name: "Amber",
    depths: COLOUR,
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#faf7f1",
      panel: "#ffffff",
      outline: "#ece5d8",
      track: "#e2d9c8",
      text: "#231c12",
      textMuted: "#75695a",
      accent: "#c9821a",
      accentEnd: "#e0a63a",
      accentAlt: "#4b6b8a",
      accent3: "#0f766e",
      accent4: "#9333ea",
      onAccent: "#ffffff",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#16120c",
      panel: "#201a12",
      outline: "#322a1e",
      track: "#40392e",
      text: "#f7f1e7",
      textMuted: "#b3a690",
      accent: "#f2a93b",
      accentEnd: "#ffd27a",
      accentAlt: "#8fb0cf",
      accent3: "#2dd4bf",
      accent4: "#c084fc",
      onAccent: "#1a1208",
      trackEdge: "transparent",
    },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    depths: COLOUR,
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#faf6f2",
      panel: "#ffffff",
      outline: "#ede3da",
      track: "#e3d6ca",
      text: "#241914",
      textMuted: "#7a6a60",
      accent: "#c2553a",
      accentEnd: "#e08a3a",
      accentAlt: "#5f7d5a",
      accent3: "#2563eb",
      accent4: "#0f766e",
      onAccent: "#ffffff",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#17120f",
      panel: "#211a16",
      outline: "#342923",
      track: "#423833",
      text: "#f7efe9",
      textMuted: "#b6a398",
      accent: "#e8775a",
      accentEnd: "#ffab70",
      accentAlt: "#8fb08a",
      accent3: "#60a5fa",
      accent4: "#2dd4bf",
      onAccent: "#1b1210",
      trackEdge: "transparent",
    },
  },
  {
    id: "garden",
    name: "Garden",
    depths: COLOUR,
    light: {
      ...ENERGY_LIGHT,
      ...STATES_LIGHT,
      surface: "#f5f6f3",
      panel: "#ffffff",
      outline: "#e3e6de",
      track: "#d8dcd1",
      text: "#1a1d16",
      textMuted: "#6b7163",
      accent: "#7cb518",
      accentEnd: "#2bb05e",
      accentAlt: "#2a8fbd",
      accent3: "#ea580c",
      accent4: "#c026d3",
      onAccent: "#16210a",
      trackEdge: "transparent",
    },
    dark: {
      ...ENERGY_DARK,
      ...STATES_DARK,
      surface: "#121411",
      panel: "#1b1e19",
      outline: "#2b2f28",
      track: "#3a3d36",
      text: "#f1f4ec",
      textMuted: "#a6ad9c",
      accent: "#a4dd3a",
      accentEnd: "#5ee08f",
      accentAlt: "#4fb3d4",
      accent3: "#fb923c",
      accent4: "#e879f9",
      onAccent: "#16210a",
      trackEdge: "transparent",
    },
  },
  {
    id: "paper",
    name: "Paper",
    // For 16 greys, the PaperS3 (user, 2026-09-30): black on white, so what
    // is mixed from the accent - a level's track, halfway to the surface;
    // a tonal button - lands on a plain mid grey rather than the pale one
    // every colour theme's mid-grey accent gives. Each value is one of the
    // sixteen already. Grey devices show the light variant only; the dark
    // one is its inverse, for completeness.
    depths: ["4bit"],
    light: {
      // Greys on the ramp, apart from one another (the PaperS3 does not
      // draw the energy diagram; a text may still pick them).
      energySun: "#777777",
      energyGrid: "#555555",
      energyEngine: "#666666",
      energyCharge: "#444444",
      energyDischarge: "#333333",
      energyLoad: "#999999",
      surface: "#ffffff",
      panel: "#dddddd",
      outline: "#888888",
      text: "#000000",
      textMuted: "#444444",
      accent: "#000000",
      onAccent: "#ffffff",
      accentAlt: "#555555",
      accentEnd: "#000000",
      // The colours and states of 2026-11-04 as greys of the ramp: Alarm
      // black as the strongest, Good and Warning apart from it.
      accent3: "#444444",
      accent4: "#666666",
      good: "#333333",
      warning: "#777777",
      alarm: "#000000",
      // One grey lighter than first tried (#cccccc) - the user, on the
      // PaperS3, 2026-09-30.
      track: "#dddddd",
      trackEdge: "#000000",
    },
    dark: {
      energySun: "#888888",
      energyGrid: "#aaaaaa",
      energyEngine: "#999999",
      energyCharge: "#bbbbbb",
      energyDischarge: "#cccccc",
      energyLoad: "#666666",
      accent3: "#bbbbbb",
      accent4: "#999999",
      good: "#cccccc",
      warning: "#888888",
      alarm: "#ffffff",
      surface: "#000000",
      panel: "#222222",
      outline: "#777777",
      text: "#ffffff",
      textMuted: "#bbbbbb",
      accent: "#ffffff",
      onAccent: "#000000",
      accentAlt: "#aaaaaa",
      accentEnd: "#ffffff",
      track: "#333333",
      trackEdge: "#ffffff",
    },
  },
]

/** The theme of a new master since 2026-11-04 (the user): Slate, CamperUI's model. */
export const DEFAULT_THEME_ID = "slate"

/**
 * What a file from before themes opens in, and what an old master without a
 * theme is given: Lavender, the palette such a project was drawn in. Not
 * the default for new work any more, so an old project still looks as it did.
 */
export const LEGACY_THEME_ID = "lavender"

/**
 * The themes a device of this depth is offered, in catalogue order. A depth
 * no theme is made for - or none given - gets the colour themes.
 */
export function themesFor(colorDepth: string | undefined): Theme[] {
  const made = THEMES.filter((t) => t.depths.includes((colorDepth ?? "24bit") as ThemeDepth))
  return made.length > 0 ? made : THEMES.filter((t) => t.depths.includes("24bit"))
}

/** The theme a new project's master, or a new master, starts in on this depth. */
export function defaultThemeIdFor(colorDepth: string | undefined): string {
  const offered = themesFor(colorDepth)
  return (offered.find((t) => t.id === DEFAULT_THEME_ID) ?? offered[0]).id
}

export interface ThemedScreen {
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
 * What an object draws with where a colour is not set: the renderers' own
 * fallbacks (render-text-box.ts, render-box.ts, render-level-indicator.ts,
 * render-arc-level.ts, render-line.ts, switch-shape.ts, render-software-
 * button.ts), as roles. Before themes those were fixed hex - black text, a
 * white text box, green fills - which ignored the theme and the dark variant;
 * applyTheme() fills them in as roles before resolving (review, 2026-09-25).
 *
 * Not here on purpose: an icon's tint (unset means "the icon's own colours")
 * and an icon's background (unset means none).
 */
const DEFAULT_ROLES: Record<string, Partial<Record<string, Role>>> = {
  text: { backgroundColor: "surface", borderColor: "outline" },
  box: { fillColor: "panel", strokeColor: "text" },
  // «Panel» and a line in «Outline» towards the screen: on «Surface», as
  // the screen, it read as one button, not as a bar (2026-10-10, mockup C).
  navigator: { backgroundColor: "panel", borderColor: "outline", textColor: "text", activeColor: "accent", activeTextColor: "onAccent" },
  line: { color: "text" },
  "live-line": { color: "text" },
  bar: { fillColor: "accent", textColor: "text", trackColor: "track", trackEdgeColor: "trackEdge" },
  slider: { fillColor: "accent", textColor: "text", trackColor: "track", trackEdgeColor: "trackEdge" },
  gauge: { fillColor: "accent", trackColor: "track", trackEdgeColor: "trackEdge" },
  dial: { fillColor: "accent", trackColor: "track", trackEdgeColor: "trackEdge" },
  button: { buttonColor: "accent" },
  "text-field": { fieldColor: "panel", lineColor: "accent", textColor: "text" },
  "time-field": { fieldColor: "panel", lineColor: "accent", textColor: "text" },
  switch: { switchColor: "accent" },
  // The LED form's labels, lines and dark strips (docs/2026-11-11-led-look.md, decision 7).
  "button-group": { switchColor: "accent", textColor: "text", borderColor: "outline", trackColor: "track" },
  // A calm card - its colour, its edge, its text - and a light dark in the
  // track until it is lit (docs/2026-11-11-led-look.md, decision 1).
  "toggle-button": { switchColor: "accent", backgroundColor: "panel", borderColor: "outline", textColor: "text", trackColor: "track" },
  "energy-diagram": {
    textColor: "text",
    mutedColor: "textMuted",
    busColor: "accent",
    idleColor: "track",
    chargeColor: "energyCharge",
    dischargeColor: "energyDischarge",
  },
  // A chart's axis labels and legend, what is quiet in it, and its grid
  // (docs/2026-10-16-charts.md); each series and zone names its own colour.
  chart: { textColor: "text", mutedColor: "textMuted", lineColor: "outline", nowColor: "accent" },
}

const NAVIGATOR_ACCENT_ROLES: Partial<Record<string, Role>> = {
  backgroundColor: "accent",
  textColor: "onAccent",
  activeColor: "surface",
  activeTextColor: "accent",
}

// Text is read from `color` or `textColor`, whichever is set (older objects
// carry the one, newer the other): a default is filled only when neither is.
const TEXT_EITHER_KEYS: Record<string, readonly ["color", "textColor"] | readonly ["textColor", "color"]> = {
  text: ["color", "textColor"],
  gauge: ["textColor", "color"],
  dial: ["textColor", "color"],
}

function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === ""
}

/** An object's properties with every unset colour it draws given its default role. */
function withDefaultRoles(type: string, properties: Record<string, any>): Record<string, any> {
  let out = properties
  const set = (key: string, role: Role) => {
    if (out === properties) out = { ...properties }
    out[key] = role
  }
  // A navigator in the accent (2026-10-11): its ground «Accent», ink «Text
  // on accent», the open entry the other way round - and no line.
  const defaults = type === "navigator" && properties.ground === "accent" ? NAVIGATOR_ACCENT_ROLES : DEFAULT_ROLES[type]
  for (const [key, role] of Object.entries(defaults ?? {})) {
    if (role && isUnset(properties[key])) set(key, role)
  }
  const either = TEXT_EITHER_KEYS[type]
  if (either && isUnset(properties[either[0]]) && isUnset(properties[either[1]])) set(either[0], "text")
  return out
}

// The level types whose fill the theme can give a gradient.
const LEVEL_TYPES = new Set(["bar", "slider", "gauge", "dial"])

/**
 * A level's look where its fill is the theme's accent: the fill runs from the
 * accent to the theme's second accent (accentEnd) along the scale - what the
 * competition showed on 2026-09-28. Only for 24 bit: a grey or 1-bit panel
 * has no tones for it, and stays flat. A fill the author coloured stays flat
 * too - the gradient belongs to the theme.
 *
 * No glow any more. The theme gave one - 8 px, weak - from the first version
 * until the user saw it on the 4.3B the same evening: "ich denke ohne ist es
 * doch cleaner", and it was a sixth of that screen's render. The renderers
 * still draw a `glow` property (lib/level-glow.ts); nothing sets it, and a
 * `glow` a file still carries is taken off here.
 */

function withLevelLook(type: string, properties: Record<string, any>, colorDepth: string | undefined): Record<string, any> {
  if (!LEVEL_TYPES.has(type)) return properties
  const deep = (colorDepth ?? "24bit") === "24bit"
  const accentFill = isUnset(properties.fillColor) || properties.fillColor === "accent"
  if (deep && accentFill && isUnset(properties.fillEndColor)) {
    const { glow: _glow, ...rest } = properties
    return { ...rest, fillEndColor: "accentEnd" }
  }
  if (!deep && (!isUnset(properties.fillEndColor) || properties.glow)) {
    const { fillEndColor: _end, glow: _glow, ...rest } = properties
    return rest
  }
  return properties
}

/**
 * Objects with every colour property resolved for this theme, variant and
 * depth - what is handed to renderScreenObjects() and to the exporters.
 * Children (tab-control panels) are resolved too. Objects that hold no role
 * come back as they are.
 */
export function applyTheme<T extends { type?: string; properties: Record<string, any>; children?: T[] }>(
  objects: T[],
  theme: Theme,
  variant: Variant,
  colorDepth: string | undefined,
): T[] {
  return objects.map((object) => {
    const type = (object as { type?: string }).type ?? ""
    let properties = withLevelLook(type, withDefaultRoles(type, object.properties), colorDepth)
    for (const key of COLOR_KEYS) {
      const value = properties[key]
      if (!isRole(value)) continue
      if (properties === object.properties) properties = { ...properties }
      properties[key] = resolveRole(theme, value, variant, colorDepth)
    }
    // An energy diagram's nodes each name a role (decision 12) or a colour
    // of their own, as any colour field may; a node without one is a load.
    if (type === "energy-diagram" && Array.isArray(properties.nodes)) {
      if (properties === object.properties) properties = { ...properties }
      properties.nodes = properties.nodes.map((n: { colorRole?: string }) => {
        if (!isRole(n.colorRole) && typeof n.colorRole === "string" && /^#[0-9a-f]{6}$/i.test(n.colorRole)) {
          return { ...n, color: applyColorDepth(n.colorRole, colorDepth) }
        }
        const role = isRole(n.colorRole) ? n.colorRole : "energyLoad"
        return { ...n, color: resolveRole(theme, role, variant, colorDepth) }
      })
    }
    // A chart's series and zones each name a role or a hex, as any colour
    // field may; a series without one is the accent, a zone the track.
    if (type === "chart") {
      const colour = (c: unknown, fallback: Role) =>
        isRole(c) ? resolveRole(theme, c, variant, colorDepth) : typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? applyColorDepth(c, colorDepth) : resolveRole(theme, fallback, variant, colorDepth)
      if (properties === object.properties) properties = { ...properties }
      if (Array.isArray(properties.series)) properties.series = properties.series.map((s: { color?: string }) => ({ ...s, color: colour(s.color, "accent") }))
      if (Array.isArray(properties.zones)) properties.zones = properties.zones.map((z: { color?: string }) => ({ ...z, color: colour(z.color, "track") }))
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
    // Never the gradient's end: it exists for the theme's own fills, and an
    // old hand-picked colour near it was meant as an accent (2026-09-28).
    if (role === "accentEnd") continue
    // Nor an energy role: a green from before themes was an accent, not a
    // storage charging.
    if ((ENERGY_ROLES as readonly string[]).includes(role)) continue
    // Nor one of 2026-11-04: a project from before themes matches what it
    // always matched.
    if ((COLOUR_MODEL_ROLES as readonly string[]).includes(role)) continue
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
  const trimmed = value.trim()
  if (HEX.test(trimmed)) return expandHex(trimmed)
  return NAMED.get(trimmed.toLowerCase())
}

// Colours the designer itself used to create objects with, and the role each
// stood for. Nearest-colour would send the canvas's old green fill to "Muted
// text" at 24 bit and to "Accent" at 1 bit (review, 2026-09-25); what it
// meant was the fill colour, at every depth.
const LEGACY_DEFAULTS: Record<string, Partial<Record<string, Role>>> = {
  "#4caf50": { fillColor: "accent", switchColor: "accent", buttonColor: "accent" },
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
/**
 * Lavender as it was until the colour model (2026-11-04), and with it the
 * creation palette before themes (lib/control-palette.ts, 24 bit, and the
 * literals handleCreateObject wrote), value for value. A colour from before
 * themes is matched to a role against this, so it becomes the same role it
 * always did, whatever Lavender looks like today.
 */
export const LEGACY_PALETTE: Theme = {
  id: "lavender-2026-09",
  name: "Lavender (2026-09)",
  depths: COLOUR,
  light: {
    ...ENERGY_LIGHT,
    ...STATES_LIGHT,
    accent3: "#0891b2",
    accent4: "#9333ea",
    surface: "#ffffff",
    panel: "#e5e5e5",
    outline: "#cccccc",
    text: "#000000",
    textMuted: "#5f5f5f",
    accent: "#6750A4",
    onAccent: "#ffffff",
    accentAlt: "#625B71",
    accentEnd: "#4f6bd8",
    track: "#b3a8d2",
    trackEdge: "transparent",
  },
  dark: {
    ...ENERGY_DARK,
    ...STATES_DARK,
    accent3: "#06b6d4",
    accent4: "#a855f7",
    surface: "#1c1b1f",
    panel: "#2b2930",
    outline: "#49454f",
    text: "#e6e1e5",
    textMuted: "#cac4d0",
    accent: "#d0bcff",
    onAccent: "#381e72",
    accentAlt: "#ccc2dc",
    accentEnd: "#9ec5ff",
    track: "#766b8f",
    trackEdge: "transparent",
  },
}

const CHART_OWN_COLOURS: ReadonlySet<string> = new Set(["series", "zones"])

export function migrateColorsToRoles(project: {
  settings?: { colorDepth?: string; themeId?: string }
  screens?: Array<{ id?: string; isMaster?: boolean; themeId?: string; backgroundColor?: string; gridColor?: string; objects?: ColouredObject[] }>
}): boolean {
  const theme = LEGACY_PALETTE
  const depth = project.settings?.colorDepth
  let changed = false

  const roleFor = (hex: string, key: string): Role =>
    LEGACY_DEFAULTS[hex.toLowerCase()]?.[key] ?? nearestRole(hex, theme, depth, PREFERRED_ROLE[key])

  // `nested` is true below an object's own properties - inside states[],
  // valueIconPairs[] and the like. Nothing resolves a role there (applyTheme
  // reads an object's own colour keys) and nothing reads a colour there any
  // more, so a colour found there is dropped rather than turned into a role
  // that would reach a device unresolved (review, 2026-09-25).
  const walkProperties = (node: Record<string, any>, where: string, nested = false, skip?: ReadonlySet<string>) => {
    for (const [key, value] of Object.entries(node)) {
      if (skip?.has(key)) continue
      if (Array.isArray(value)) {
        value.forEach((item, i) => item && typeof item === "object" && walkProperties(item, `${where}.${key}[${i}]`, true))
      } else if (value && typeof value === "object") {
        walkProperties(value, `${where}.${key}`, true)
      } else if (/color$/i.test(key) && typeof value === "string" && nested) {
        delete node[key]
        changed = true
      } else if (/color$/i.test(key) && typeof value === "string") {
        const isColorKey = (COLOR_KEYS as readonly string[]).includes(key)
        const hex = legacyHex(value)
        if (value.trim() === "") {
          // An empty colour was "not set" to every renderer; now it is absent.
          delete node[key]
          changed = true
        } else if (hex) {
          // A hex trackColor is from before 2026-09-19, when the track
          // stopped being set per object: nothing read it since, and a role
          // guessed from it now would change the look. Dropped, like the
          // keys nothing reads.
          if (isColorKey && key !== "trackColor") node[key] = roleFor(hex, key)
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
      if (object.properties) {
        // A chart's series and zones each hold a colour of their own, a role
        // or a hex (docs/2026-10-16-charts.md decision 8), which applyTheme
        // resolves: kept as they are, not dropped as other nested colours.
        walkProperties(object.properties, at, false, (object as { type?: string }).type === "chart" ? CHART_OWN_COLOURS : undefined)
      }
      walkObjects(object.children, at)
    }
  }

  for (const screen of project.screens ?? []) {
    const where = `screen ${screen.id ?? "?"}`
    if (typeof screen.backgroundColor === "string") {
      const hex = legacyHex(screen.backgroundColor)
      if (screen.backgroundColor.trim() === "" || screen.backgroundColor === "transparent") {
        // Unset, as it is on an object: the screen then inherits, or shows
        // the theme's surface. A screen was never transparent to anything.
        delete screen.backgroundColor
        changed = true
      } else if (hex) {
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
      screen.themeId = LEGACY_THEME_ID
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
    screens.push({ id: `master-${n}`, name: `Master ${n}`, isMaster: true, themeId: LEGACY_THEME_ID, objects: [] })
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

/**
 * Refuses, naming the object, any colour that is about to leave for a device
 * as something other than a hex or "transparent" - a role that was not
 * resolved, a typo, a name. The spec's promise that a device never meets a
 * role (review, 2026-09-25): called by the exporters after applyTheme().
 */
export function assertDeviceColours(
  objects: Array<{ id?: string; properties?: Record<string, any>; children?: any[] }>,
  where: string,
): void {
  for (const object of objects) {
    for (const key of [...COLOR_KEYS, ...COLOR_KEYS.map((k) => `${k}Dark`)]) {
      const value = object.properties?.[key]
      if (value === undefined || value === null || value === "" || value === "transparent") continue
      if (typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())) continue
      throw new ThemeColorError(`${where} › ${object.id ?? "object"}: ${key} is "${value}", not a colour a device can draw`)
    }
    if (object.children) assertDeviceColours(object.children, `${where} › ${object.id ?? "object"}`)
  }
}

/**
 * The light objects a device draws by default, each colour that comes from a
 * role joined by its dark value under the same key with "Dark" appended -
 * the one rule of the export for the dark variant: beside a field X, an
 * optional XDark (docs/2026-09-25-themes-export.md; user, 2026-09-25).
 *
 * Only for 24-bit: grey and 1-bit devices have one variant, and get plain
 * applyTheme(). A colour that is not a role - "transparent", a hex in a
 * device-format file - gets no dark value: it is the same in both.
 */
export function applyThemeWithDark<T extends { type?: string; properties: Record<string, any>; children?: T[] }>(
  objects: T[],
  theme: Theme,
  colorDepth: string | undefined,
): T[] {
  const light = applyTheme(objects, theme, "light", colorDepth)
  if (colorDepth !== undefined && colorDepth !== "24bit") return light
  const dark = applyTheme(objects, theme, "dark", colorDepth)
  const join = (sources: T[], lights: T[], darks: T[]): T[] =>
    lights.map((l, i) => {
      const source = withLevelLook(sources[i].type ?? "", withDefaultRoles(sources[i].type ?? "", sources[i].properties), colorDepth)
      let properties = l.properties
      for (const key of COLOR_KEYS) {
        if (!isRole(source[key])) continue
        if (properties === l.properties) properties = { ...properties }
        properties[`${key}Dark`] = darks[i].properties[key]
      }
      // An energy diagram's nodes: each colour beside its dark one (device contract 2.8).
      if (sources[i].type === "energy-diagram" && Array.isArray(properties.nodes) && Array.isArray(darks[i].properties.nodes)) {
        if (properties === l.properties) properties = { ...properties }
        properties.nodes = properties.nodes.map((n: { color?: string }, k: number) =>
          n.color !== undefined ? { ...n, colorDark: darks[i].properties.nodes[k]?.color } : n,
        )
      }
      // A chart's series and zones: each colour beside its dark one.
      if (sources[i].type === "chart") {
        if (properties === l.properties) properties = { ...properties }
        for (const key of ["series", "zones"] as const) {
          const lights = properties[key]
          const darkList = darks[i].properties[key]
          if (Array.isArray(lights) && Array.isArray(darkList)) {
            properties[key] = lights.map((x: { color?: string }, k: number) => ({ ...x, colorDark: darkList[k]?.color }))
          }
        }
      }
      const children =
        l.children && sources[i].children && darks[i].children ? join(sources[i].children!, l.children, darks[i].children!) : l.children
      if (properties === l.properties && children === l.children) return l
      return { ...l, properties, children }
    })
  return join(objects, light, dark)
}

/**
 * What a device that knows the dark variant reads while the theme is dark:
 * every XDark in place of its X, anywhere in the value - colours, a screen's
 * background, files - and X where there is no XDark or an empty one. The reader's half of the
 * export's one rule; the reference render uses it to draw an exported
 * project in dark (docs/2026-09-25-themes-export.md).
 */
export function darkVariantOf<T>(value: T): T {
  if (Array.isArray(value)) return value.map(darkVariantOf) as T
  if (!value || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  const entries = Object.entries(value as Record<string, unknown>)
  for (const [key, v] of entries) {
    if (key.endsWith("Dark") && key.length > 4) {
      // An XDark with no X is still the dark value of X.
      const base = key.slice(0, -4)
      if (!(base in (value as object)) && v !== "") out[base] = v
      continue
    }
    const dark = (value as Record<string, unknown>)[`${key}Dark`]
    out[key] = dark !== undefined && dark !== "" ? dark : darkVariantOf(v)
  }
  return out as T
}
