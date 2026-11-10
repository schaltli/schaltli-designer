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
      surface: "#101318", panel: "#181c24", outline: "#272d3b", track: "#333a45", text: "#f1f5f9", textMuted: "#94a3b8",
      accent: "#0ea5e9", accentEnd: "#22d3ee", accentAlt: "#f59e0b", accent3: "#06b6d4", accent4: "#a855f7",
      good: "#10b981", warning: "#eab308", alarm: "#ef4444",
    })
    expect(slate.light).toMatchObject({
      surface: "#f1f5f9", panel: "#ffffff", outline: "#e2e8f0", track: "#dbe2ec", text: "#0f172a", textMuted: "#64748b",
      accent: "#0284c7", accentEnd: "#06b6d4", accentAlt: "#d97706", accent3: "#0891b2", accent4: "#9333ea",
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

  test("the other colour themes after the user's choice: cards on a tinted ground, four distinct colours", () => {
    // The proposal of 2026-11-04 (tasks/colour-model-plan.md T3), taken as it was.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
      if (d === 0) return 0
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    const apart = (a: string, b: string) => Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b)))
    for (const theme of THEMES.filter((t) => t.id !== "paper")) {
      expect(theme.light.panel, `${theme.id} light card`).toBe("#ffffff")
      expect(theme.light.surface, `${theme.id} light ground`).not.toBe("#ffffff")
      // Slate's are CamperUI's own, sky and cyan side by side.
      if (theme.id === "slate") continue
      for (const variant of ["light", "dark"] as const) {
        const v = theme[variant]
        const colours = [v.accent, v.accentAlt, v.accent3, v.accent4]
        for (let i = 0; i < colours.length; i++)
          for (let j = i + 1; j < colours.length; j++)
            expect(apart(colours[i], colours[j]), `${theme.id} ${variant} ${colours[i]} ${colours[j]}`).toBeGreaterThan(25)
      }
    }
    expect(themeById("lavender").light).toMatchObject({ surface: "#f6f5fa", accent: "#6750a4", accentAlt: "#db2777", accent3: "#0d9488", accent4: "#d97706" })
    expect(themeById("garden").dark).toMatchObject({ surface: "#121411", accent: "#a4dd3a", accentAlt: "#4fb3d4", accent3: "#fb923c", accent4: "#e879f9" })
  })

  test("a colour from before themes becomes the role it always did, though Lavender changed", () => {
    const project = {
      settings: { colorDepth: "24bit" },
      screens: [{ id: "s", objects: [{ id: "b", type: "box", properties: { fillColor: "#e5e5e5", strokeColor: "#cccccc" } }, { id: "t", type: "text", properties: { color: "#6750A4" } }] }],
    }
    migrateColorsToRoles(project)
    expect(project.screens[0].objects.map((o) => o.properties)).toEqual([{ fillColor: "panel", strokeColor: "outline" }, { color: "accent" }])
  })

  test("a colour from before themes is never matched to one of the new roles", () => {
    // Emerald, cyan, violet, yellow, red: each exactly a new role's in Slate,
    // and still matched to a role an old project could have meant.
    const slate = themeById("slate")
    for (const hex of ["#10b981", "#06b6d4", "#a855f7", "#eab308", "#ef4444"])
      expect(COLOUR_MODEL_ROLES as readonly string[], hex).not.toContain(nearestRole(hex, slate, "24bit"))
  })
})
