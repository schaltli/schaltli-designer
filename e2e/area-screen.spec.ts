import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject, layoutScaleOf } from "../lib/layout"
import { withCardsGrown } from "../lib/free-min-size"
import { migrateToAreas } from "../lib/area-migration"
import type { ScreenArea } from "../lib/area"

// The screen is an area (docs/2026-11-16-areas.md, step 1): what is docked
// on it is placed along the panel's edges inside the screen's padding; what
// stands free lies anywhere (E1a); what is docked and needs more than the
// panel makes the area grow to the right and downwards (E1). No browser.

const W = 400
const H = 300
const GAP = 6 // 1.5 mm at 4 px per mm

let ids = 0
const box = (x: number, y: number, width: number, height: number, properties: Record<string, unknown> = {}): ScreenObject => ({
  id: `b${++ids}`,
  type: "box",
  x,
  y,
  width,
  height,
  zIndex: ids,
  properties,
})
// An icon stretches neither way: docked, it cannot be made smaller.
const icon = (width: number, height: number, properties: Record<string, unknown> = {}): ScreenObject => ({ ...box(0, 0, width, height, properties), type: "icon" })
type Screen = { id: string; objects: ScreenObject[]; area?: ScreenArea; areaSize?: { width: number; height: number }; isMaster?: boolean; masterScreenId?: string }
const project = (screens: Screen[], settings: Record<string, unknown> = {}) => ({ name: "p", screenWidth: W, screenHeight: H, settings: { pixelsPerMm: 4, ...settings } as Record<string, any>, screens })
const laid = (objects: ScreenObject[], area?: ScreenArea) => layoutProject(project([{ id: "s1", objects, area }])).screens[0]
const rect = (o: ScreenObject) => ({ x: o.x, y: o.y, width: o.width, height: o.height })

test.describe("docked on a screen", () => {
  test("Top, Bottom, Left, Right and Fill along the panel's edges, the gap between", () => {
    // The front of the stacking first, which is the top of the object list.
    const fill = box(50, 50, 10, 10, { dock: "fill" })
    const right = box(50, 50, 25, 20, { dock: "right" })
    const left = box(50, 50, 40, 20, { dock: "left" })
    const bottom = box(50, 50, 30, 10, { dock: "bottom" })
    const top = box(50, 50, 30, 20, { dock: "top" })
    const [f, r, l, b, t] = laid([fill, right, left, bottom, top]).objects
    expect(rect(t)).toEqual({ x: 0, y: 0, width: W, height: 20 })
    expect(rect(b)).toEqual({ x: 0, y: H - 10, width: W, height: 10 })
    const between = H - 20 - 10 - 2 * GAP
    expect(rect(l)).toEqual({ x: 0, y: 20 + GAP, width: 40, height: between })
    expect(rect(r)).toEqual({ x: W - 25, y: 20 + GAP, width: 25, height: between })
    expect(rect(f)).toEqual({ x: 40 + GAP, y: 20 + GAP, width: W - 40 - 25 - 2 * GAP, height: between })
  })

  test("inside the screen's Padding, with its Gap", () => {
    const fill = box(0, 0, 10, 10, { dock: "fill" })
    const top = box(0, 0, 30, 20, { dock: "top" })
    const [f, t] = laid([fill, top], { padding: 2, gapMm: 1 }).objects
    expect(rect(t)).toEqual({ x: 8, y: 8, width: W - 16, height: 20 })
    expect(rect(f)).toEqual({ x: 8, y: 8 + 20 + 4, width: W - 16, height: H - 16 - 20 - 4 })
  })

  test("what stands free lies anywhere, past every edge, and is not moved (E1a)", () => {
    const parked = [box(-80, -30, 40, 20), box(W + 50, 10, 40, 20), box(10, H + 40, 40, 20)]
    const screen = laid([...parked, box(0, 0, 30, 20, { dock: "top" })], { padding: 2 })
    expect(screen.objects.slice(0, 3).map(rect)).toEqual(parked.map(rect))
    // And the area does not grow for it.
    expect(screen.areaSize).toBeUndefined()
  })

  test("nothing docked: nothing changes, the same project back", () => {
    const p = project([{ id: "s1", objects: [box(10, 10, 40, 20), box(-5, 500, 40, 20)], area: { padding: 3 } }])
    expect(layoutProject(p)).toBe(p)
  })

  test("laid out twice, and its cards grown, nothing changes", () => {
    const once = layoutProject(project([{ id: "s1", objects: [box(0, 0, 30, 20, { dock: "top" }), box(0, 0, 30, 20, { dock: "fill" })] }]))
    expect(layoutProject(once)).toBe(once)
    expect(withCardsGrown(once, layoutScaleOf(once), layoutProject)).toBe(once)
  })

  test("a master lays out on its own area, a screen showing it on its own (E7)", () => {
    const bar = box(0, 0, 30, 24, { dock: "top" })
    const content = box(0, 0, 30, 20, { dock: "fill" })
    const p = layoutProject(
      project([
        { id: "m", isMaster: true, objects: [bar], area: { padding: 1 } },
        { id: "s1", masterScreenId: "m", objects: [content] },
      ]),
    )
    expect(rect(p.screens[0].objects[0])).toEqual({ x: 4, y: 4, width: W - 8, height: 24 })
    // The screen's own object fills the screen: it does not dock against the master's bar.
    expect(rect(p.screens[1].objects[0])).toEqual({ x: 0, y: 0, width: W, height: H })
  })
})

test.describe("what is docked needs more than the panel (E1)", () => {
  test("the area grows downwards, its top left corner staying; nothing docked is left out", () => {
    const b = icon(40, 150, { dock: "top" })
    const a = icon(40, 200, { dock: "top" })
    const screen = laid([b, a])
    expect(screen.areaSize).toEqual({ width: W, height: 200 + GAP + 150 })
    const [lower, upper] = screen.objects
    expect([upper.y, lower.y]).toEqual([0, 200 + GAP])
    expect(screen.objects.some((o) => o.properties.dockedOut)).toBe(false)
  })

  test("to the right: what is docked Right lies on the grown edge, past the panel", () => {
    const b = icon(200, 40, { dock: "right" })
    const a = icon(300, 40, { dock: "left" })
    const screen = laid([b, a])
    expect(screen.areaSize).toEqual({ width: 300 + GAP + 200, height: H })
    expect(screen.objects[0].x).toBe(300 + GAP)
  })

  test("it fits again: the area is the panel's, and says nothing of a size", () => {
    const grown = layoutProject(project([{ id: "s1", objects: [icon(40, 200, { dock: "top" }), icon(40, 150, { dock: "top" })] }]))
    expect(grown.screens[0].areaSize).toBeDefined()
    const smaller = { ...grown, screens: [{ ...grown.screens[0], objects: grown.screens[0].objects.map((o) => ({ ...o, height: 100 })) }] }
    expect(layoutProject(smaller).screens[0].areaSize).toBeUndefined()
  })
})

test.describe("a project from before areas", () => {
  test("a Dock or Position an object kept from an area it left is gone: it stays where it was", () => {
    const stale = box(120, 80, 40, 20, { dock: "top", anchor: { x: "right" }, ownSize: { width: 60 }, fillColor: "#111111" })
    const inPanel = box(10, 10, 40, 20, { dock: "fill" })
    const inArea = box(0, 0, 40, 20, { dock: "top" })
    const sw: ScreenObject = { ...box(200, 100, 100, 80), type: "switcher", children: [{ ...box(0, 0, 100, 80), type: "panel", children: [inPanel] }] }
    const area: ScreenObject = { ...box(20, 200, 100, 60), type: "free", children: [inArea] }
    const p = project([{ id: "s1", objects: [stale, sw, area] }])
    migrateToAreas(p)
    const [a, b, c] = p.screens[0].objects
    expect(a.properties).toEqual({ fillColor: "#111111" })
    expect(b.children![0].children![0].properties).toEqual({})
    // In an area standing alone it was in use, and stays.
    expect(c.children![0].properties).toEqual({ dock: "top" })
    expect(rect(layoutProject(p).screens[0].objects[0])).toEqual({ x: 120, y: 80, width: 40, height: 20 })
  })

  test("a project at the format keeps what is docked on its screens", () => {
    const p = project([{ id: "s1", objects: [box(0, 0, 40, 20, { dock: "top" })] }], { formatVersion: 2 })
    migrateToAreas(p)
    expect(p.screens[0].objects[0].properties).toEqual({ dock: "top" })
  })
})
