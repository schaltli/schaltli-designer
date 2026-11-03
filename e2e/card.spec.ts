import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { CARD_DEFAULTS, cardSettingsOf, withCardLook } from "../lib/card"
import { layoutProject } from "../lib/layout"
import { dissolveGroups } from "../lib/object-groups"

// A card (docs/2026-11-03-card.md): a free area whose look comes from
// Settings › Cards, its colours from the theme.

const area = (properties: Record<string, any> = {}, children: ScreenObject[] = []): ScreenObject =>
  ({ id: "karte", type: "free", x: 10, y: 10, width: 200, height: 120, zIndex: 1, properties, children }) as ScreenObject

const project = (objects: ScreenObject[], cards?: Record<string, number>, pixelsPerMm = 5) => ({
  settings: { pixelsPerMm, ...(cards ? { cards } : {}) },
  screens: [{ id: "s1", name: "S", objects }],
})

test.describe("card: the model", () => {
  test("the defaults; a setting overrides only itself; nonsense is the default", () => {
    expect(cardSettingsOf(undefined)).toEqual({ radiusMm: 2, edgePx: 1, accentEdgePx: 2, paddingMm: 2 })
    expect(cardSettingsOf({ cards: { radiusMm: 3 } })).toEqual({ ...CARD_DEFAULTS, radiusMm: 3 })
    expect(cardSettingsOf({ cards: { edgePx: -1, paddingMm: NaN } as any })).toEqual(CARD_DEFAULTS)
  })

  test("Card and Card, accent: Panel fill, an Outline or Accent edge, radius in px at the scale, padding in mm", () => {
    expect(withCardLook(area({ look: "card" }), CARD_DEFAULTS, 5).properties).toEqual({
      look: "card",
      fillColor: "panel",
      strokeColor: "outline",
      strokeWidth: 1,
      cornerRadius: 10,
      padding: 2,
    })
    expect(withCardLook(area({ look: "card-accent" }), CARD_DEFAULTS, 7.88).properties).toMatchObject({
      strokeColor: "accent",
      strokeWidth: 2,
      cornerRadius: 16,
    })
  })

  test("an area without a look, or set back to None, keeps what it has; a look already applied is the same object", () => {
    const plain = area({ fillColor: "surface", cornerRadius: 3 })
    expect(withCardLook(plain, CARD_DEFAULTS, 5)).toBe(plain)
    const card = withCardLook(area({ look: "card" }), CARD_DEFAULTS, 5)
    expect(withCardLook(card, CARD_DEFAULTS, 5)).toBe(card)
    const { look: _l, ...none } = card.properties!
    const back = withCardLook({ ...card, properties: none }, CARD_DEFAULTS, 5)
    expect(back.properties).toEqual({ fillColor: "panel", strokeColor: "outline", strokeWidth: 1, cornerRadius: 10, padding: 2 })
  })

  test("the layout pass applies looks on every screen and at any depth, before docking; a second pass changes nothing", () => {
    const heading = { id: "kopf", type: "box", x: 0, y: 0, width: 50, height: 20, zIndex: 1, properties: { dock: "top" } } as ScreenObject
    const inner = { ...area({ look: "card-accent" }), id: "innen", x: 20, y: 40, width: 80, height: 50 }
    const p = project([area({ look: "card" }, [heading, inner])], { radiusMm: 3, paddingMm: 4 })
    const once = layoutProject(p)
    const outer = once.screens[0].objects[0]
    expect(outer.properties).toMatchObject({ cornerRadius: 15, padding: 4, strokeColor: "outline" })
    // Docked inside the card's padding: 4 mm, 20 px.
    expect(outer.children!.find((c) => c.id === "kopf")!).toMatchObject({ x: 20, y: 20, width: 160 })
    expect(outer.children!.find((c) => c.id === "innen")!.properties).toMatchObject({ cornerRadius: 15, strokeColor: "accent", strokeWidth: 2 })
    expect(layoutProject(once)).toBe(once)
  })

  test("a changed setting reaches every card on every screen", () => {
    const p = { ...project([area({ look: "card" })]), screens: [{ id: "s1", name: "A", objects: [area({ look: "card" })] }, { id: "s2", name: "B", objects: [area({ look: "card-accent" })] }] }
    const before = layoutProject(p)
    const after = layoutProject({ ...before, settings: { ...before.settings, cards: { radiusMm: 1 } } })
    expect(after.screens.map((s) => s.objects[0].properties!.cornerRadius)).toEqual([5, 5])
  })

  test("on the device a card is a box with role colours behind its objects", () => {
    const laid = layoutProject(project([area({ look: "card" }, [{ id: "wert", type: "box", x: 10, y: 10, width: 20, height: 10, zIndex: 1, properties: {} } as ScreenObject])]))
    const exported = dissolveGroups(laid.screens[0].objects)
    expect(exported.map((o) => o.type)).toEqual(["box", "box"])
    expect(exported[0].properties).toMatchObject({ fillColor: "panel", strokeColor: "outline", strokeWidth: 1, cornerRadius: 10 })
  })
})
