import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject, layoutScaleOf } from "../lib/layout"
import { withCardsGrown } from "../lib/free-min-size"
import { dissolveGroups } from "../lib/object-groups"
import { getAbsolutePosition } from "../lib/object-tree"
import { migrateToAreas, FORMAT_VERSION } from "../lib/area-migration"

// Projects from before areas, brought to them (docs/2026-11-16-areas.md,
// «Old projects», step 1; lib/area-migration.ts). The rule: nothing moves.
// Each case is exported twice - as the old project, which this designer
// still lays out as it was, and migrated - and the two are the same objects.
// No browser.

type Obj = Record<string, any>

let ids = 0
const obj = (type: string, fields: Partial<ScreenObject> = {}): ScreenObject => ({
  id: `${type}-${++ids}`,
  type: type as ScreenObject["type"],
  x: 0,
  y: 0,
  width: 40,
  height: 20,
  zIndex: ids,
  properties: {},
  ...fields,
})
const box = (x: number, y: number, width: number, height: number, properties: Obj = {}) => obj("box", { x, y, width, height, properties })
const project = (objects: ScreenObject[], settings: Obj = {}) => ({ name: "p", settings: { pixelsPerMm: 4, ...settings } as Obj, screens: [{ id: "s1", objects }] })
type P = ReturnType<typeof project>

const opened = (p: P): P => {
  const laid = layoutProject(p)
  return withCardsGrown(laid, layoutScaleOf(laid), layoutProject)
}
const exported = (p: P) => dissolveGroups(opened(p).screens[0].objects)
const migratedCopy = (p: P): P => {
  const copy = structuredClone(p)
  migrateToAreas(copy)
  return copy
}
const find = (objects: ScreenObject[], id: string): ScreenObject | undefined => {
  for (const o of objects) {
    if (o.id === id) return o
    const inner = find(o.children ?? [], id)
    if (inner) return inner
  }
  return undefined
}

// A switcher 200 × 120 at 30, 40 whose one panel holds `children`.
const switcherWith = (children: ScreenObject[], fields: Partial<ScreenObject> = {}) =>
  obj("switcher", { x: 30, y: 40, width: 200, height: 120, children: [obj("panel", { width: 200, height: 120, children })], ...fields })

test.describe("a panel takes over the one area that filled it", () => {
  test("a card filling its panel: the panel has its look, padding and what it held; the area is gone", () => {
    const title = box(0, 0, 60, 20, { dock: "top" })
    const value = box(20, 50, 60, 30)
    const card = obj("free", { id: "karte", width: 200, height: 120, zIndex: 3, properties: { look: "card", gapMm: 2 }, children: [title, value] })
    const before = project([switcherWith([card])])
    const after = migratedCopy(before)

    const panel = after.screens[0].objects[0].children![0]
    expect(panel.properties).toMatchObject({ look: "card", gapMm: 2, areaBox: { id: "karte-background", zIndex: 3 } })
    expect(panel.children!.map((c) => c.id)).toEqual([title.id, value.id])
    expect(find(after.screens[0].objects, "karte")).toBeUndefined()
    expect(after.settings.formatVersion).toBe(FORMAT_VERSION)

    // What a device gets is what it got: the box under the id it had, the
    // clip, each object in its place - and no property of an area on the panel.
    expect(exported(after)).toEqual(exported(before))
    const sent = exported(after)[0].children![0]
    expect(sent.children!.map((c) => c.id)).toEqual(["karte-background", title.id, value.id])
    expect(Object.keys(sent.properties)).toEqual([])
    expect(sent.children![1].properties.clip).toHaveLength(1)
  })

  test("an area with a fill of its own and no look", () => {
    const card = obj("free", { width: 200, height: 120, properties: { fillColor: "#102030", strokeColor: "#ffffff", strokeWidth: 2, cornerRadius: 6, padding: 1.5 }, children: [box(0, 0, 50, 20, { dock: "fill" })] })
    const before = project([switcherWith([card])])
    const after = migratedCopy(before)
    expect(after.screens[0].objects[0].children![0].properties).toMatchObject({ fillColor: "#102030", strokeWidth: 2, cornerRadius: 6, padding: 1.5 })
    expect(exported(after)).toEqual(exported(before))
  })

  test("an area nobody sees: taken over too, and the panel draws no box", () => {
    const area = obj("free", { width: 200, height: 120, properties: { padding: 2 }, children: [box(0, 0, 50, 20, { dock: "bottom" })] })
    const before = project([switcherWith([area])])
    const after = migratedCopy(before)
    expect(exported(after)).toEqual(exported(before))
    expect(exported(after)[0].children![0].children!.map((c) => c.type)).toEqual(["box"])
  })

  test("in a table's cell: the switcher stays as large as the card made it", () => {
    const card = obj("free", { width: 200, height: 120, properties: { look: "card" }, children: [box(0, 0, 60, 20, { dock: "top" })] })
    const sw = switcherWith([card], { properties: { cell: { row: 0, column: 0 } } })
    const table = obj("table", { x: 10, y: 10, properties: { grid: 1, columns: [{}], rows: [{}] }, children: [sw] })
    const before = project([table])
    const after = migratedCopy(before)
    expect(find(after.screens[0].objects, sw.id)!.properties.ownSize).toEqual({ width: 200, height: 120 })
    const laid = find(opened(after).screens[0].objects, sw.id)!
    expect([laid.width, laid.height]).toEqual([200, 120])
    // The same but for that note, which no device reads.
    const sent = exported(after)
    const { ownSize: _least, ...properties } = sent[0].properties
    expect([{ ...sent[0], properties }]).toEqual(exported(before))
  })

  test("an area that does not fill its panel stays an area in it", () => {
    const card = obj("free", { x: 10, y: 0, width: 150, height: 120, properties: { look: "card" }, children: [box(5, 5, 20, 20)] })
    const before = project([switcherWith([card])])
    const after = migratedCopy(before)
    expect(after.screens[0].objects[0].children![0].children!.map((c) => c.type)).toEqual(["free"])
    expect(exported(after)).toEqual(exported(before))
  })

  test("an area beside something else in its panel stays", () => {
    const card = obj("free", { width: 200, height: 120, properties: { look: "card" }, children: [] })
    const after = migratedCopy(project([switcherWith([card, box(5, 5, 20, 20)])]))
    expect(after.screens[0].objects[0].children![0].children!.map((c) => c.type)).toEqual(["free", "box"])
  })

  test("each panel on its own: one takes its card over, the other keeps its table", () => {
    const card = obj("free", { width: 200, height: 120, properties: { look: "card" }, children: [box(5, 5, 20, 20)] })
    const other = obj("panel", { width: 200, height: 120, children: [box(0, 0, 30, 30)] })
    const sw = obj("switcher", { x: 30, y: 40, width: 200, height: 120, children: [obj("panel", { width: 200, height: 120, children: [card] }), other] })
    const before = project([sw])
    const after = migratedCopy(before)
    const [first, second] = after.screens[0].objects[0].children!
    expect(first.properties.look).toBe("card")
    expect(second.properties.look).toBeUndefined()
    expect(exported(after)).toEqual(exported(before))
  })
})

test.describe("a switcher holds what its panels held outside (E2a)", () => {
  const places = (p: P, list: string[]) => {
    const objects = opened(p).screens[0].objects
    return Object.fromEntries(list.map((id) => [id, getAbsolutePosition(objects, id)]))
  }

  test("past the left and the top: the corner moves out, every object stays where it was on the glass", () => {
    const outside = box(-25, -10, 40, 20)
    const inside = box(50, 50, 40, 20)
    const before = project([switcherWith([outside, inside])])
    const was = Object.fromEntries([outside, inside].map((o) => [o.id, { x: 30 + o.x, y: 40 + o.y }]))
    const after = migratedCopy(before)
    const sw = opened(after).screens[0].objects[0]
    expect([sw.x, sw.y, sw.width, sw.height]).toEqual([5, 30, 225, 130])
    expect(places(after, [outside.id, inside.id])).toEqual(was)
  })

  test("past the right and the bottom: it grows there once laid out, its corner staying", () => {
    const outside = box(190, 110, 40, 30)
    const after = migratedCopy(project([switcherWith([outside])]))
    const sw = opened(after).screens[0].objects[0]
    expect([sw.x, sw.y, sw.width, sw.height]).toEqual([30, 40, 230, 140])
    expect(places(after, [outside.id])).toEqual({ [outside.id]: { x: 220, y: 150 } })
  })

  test("a panel that holds nothing outside is left alone", () => {
    const before = project([switcherWith([box(10, 10, 40, 20)])])
    const after = migratedCopy(before)
    expect(after.screens[0].objects).toEqual(before.screens[0].objects)
  })
})

test.describe("once per project", () => {
  test("a project at the format is not touched: an area a panel was given later stays", () => {
    const card = obj("free", { width: 200, height: 120, properties: { look: "card" }, children: [] })
    const current = project([switcherWith([card])], { formatVersion: FORMAT_VERSION })
    const copy = structuredClone(current)
    expect(migrateToAreas(copy)).toBe(false)
    expect(copy).toEqual(current)
  })

  test("a project of a newer format is refused, saying so", () => {
    const newer = project([], { formatVersion: FORMAT_VERSION + 1 })
    expect(() => migrateToAreas(newer)).toThrow(/newer Schaltli designer/)
  })

  test("migrated twice is migrated once", () => {
    const inner = obj("free", { width: 200, height: 120, properties: { look: "card" }, children: [box(5, 5, 20, 20)] })
    const outer = obj("free", { width: 200, height: 120, children: [inner] })
    const once = migratedCopy(project([switcherWith([outer])]))
    const twice = migratedCopy(once)
    expect(twice).toEqual(once)
    // The area that filled the area that filled the panel is still one.
    expect(once.screens[0].objects[0].children![0].children!.map((c) => c.type)).toEqual(["free"])
  })
})
