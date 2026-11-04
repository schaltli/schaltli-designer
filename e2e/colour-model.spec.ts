import { test, expect } from "@playwright/test"
import {
  COLOUR_MODEL_ROLES,
  DEFAULT_THEME_ID,
  LEGACY_THEME_ID,
  ROLES,
  ROLE_LABELS,
  THEMES,
  defaultThemeIdFor,
  migrateColorsToRoles,
  nearestRole,
  themeById,
} from "../lib/themes"

// The colour model of docs/2026-11-04-text-sizes-and-colours.md: neutral
// names for the ground, four colours of distinct hues, three states that
// mean the same in every theme; Slate in CamperUI's values as the theme of
// new masters, and old projects still in Lavender.

test.describe("the colour model", () => {
  test("five more roles, every theme filling every role in light and dark", () => {
    expect([...COLOUR_MODEL_ROLES]).toEqual(["accent3", "accent4", "good", "warning", "alarm"])
    for (const role of COLOUR_MODEL_ROLES) expect(ROLES).toContain(role)
    for (const theme of THEMES)
      for (const variant of ["light", "dark"] as const)
        for (const role of ROLES) expect(theme[variant][role], `${theme.id} ${variant} ${role}`).toMatch(/^#[0-9a-f]{6}$|^transparent$/i)
  })

  test("the neutral names the panel shows", () => {
    expect([ROLE_LABELS.surface, ROLE_LABELS.panel, ROLE_LABELS.outline, ROLE_LABELS.textMuted, ROLE_LABELS.accentAlt]).toEqual([
      "Background",
      "Card",
      "Card border",
      "Text low",
      "Accent 2",
    ])
    expect(COLOUR_MODEL_ROLES.map((r) => ROLE_LABELS[r])).toEqual(["Accent 3", "Accent 4", "Good", "Warning", "Alarm"])
  })

  test("the states are the same in every colour theme", () => {
    const colour = THEMES.filter((t) => t.id !== "paper")
    for (const variant of ["light", "dark"] as const)
      for (const role of ["good", "warning", "alarm"] as const)
        expect(new Set(colour.map((t) => t[variant][role])).size, `${variant} ${role}`).toBe(1)
  })

  test("Slate is CamperUI's ground and colours, light and dark", () => {
    const slate = themeById("slate")
    expect(slate.dark).toMatchObject({
      surface: "#101318", panel: "#181c24", outline: "#272d3b", track: "#12151c", text: "#f1f5f9", textMuted: "#94a3b8",
      accent: "#0ea5e9", accentEnd: "#38bdf8", accentAlt: "#f59e0b", accent3: "#06b6d4", accent4: "#a855f7",
      good: "#10b981", warning: "#eab308", alarm: "#ef4444",
    })
    expect(slate.light).toMatchObject({
      surface: "#f1f5f9", panel: "#ffffff", outline: "#e2e8f0", track: "#dbe2ec", text: "#0f172a", textMuted: "#64748b",
      accent: "#0284c7", accentEnd: "#0ea5e9", accentAlt: "#d97706", accent3: "#0891b2", accent4: "#9333ea",
      good: "#059669", warning: "#ca8a04", alarm: "#dc2626",
    })
  })

  test("new masters in Slate, PaperS3 in Paper; an old master without a theme in Lavender", () => {
    expect(DEFAULT_THEME_ID).toBe("slate")
    expect(defaultThemeIdFor("24bit")).toBe("slate")
    expect(defaultThemeIdFor("4bit")).toBe("paper")
    const old = { settings: { colorDepth: "24bit" }, screens: [{ id: "m", isMaster: true, objects: [] }] }
    migrateColorsToRoles(old)
    expect(old.screens[0]).toMatchObject({ themeId: LEGACY_THEME_ID })
    expect(LEGACY_THEME_ID).toBe("lavender")
  })

  test("a colour from before themes is never matched to one of the new roles", () => {
    // Emerald, cyan, violet, yellow, red: each exactly a new role's in Slate,
    // and still matched to a role an old project could have meant.
    const slate = themeById("slate")
    for (const hex of ["#10b981", "#06b6d4", "#a855f7", "#eab308", "#ef4444"])
      expect(COLOUR_MODEL_ROLES as readonly string[], hex).not.toContain(nearestRole(hex, slate, "24bit"))
  })
})
