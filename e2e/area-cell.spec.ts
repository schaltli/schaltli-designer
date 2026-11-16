import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject, layoutScaleOf } from "../lib/layout"
import { withCardsGrown } from "../lib/free-min-size"
import { dissolveGroups } from "../lib/object-groups"
import { getAbsolutePosition } from "../lib/object-tree"
import { areaDropAt, moveIntoArea } from "../lib/drop-into-free"
import { cellAreaId, isCellArea, unwrappedCells, withCellArea, wrapInCell } from "../lib/cell-area"

// A table's cell as an area (docs/2026-11-16-areas.md, step 3;
// lib/cell-area.ts): a cell with one object is a slot, as ever; one that
// holds more, or has a look, is an area the designer makes and takes away
// itself. No browser.

const SCALE = { pixelsPerMm: 4 }
const GAP = 6

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
const box = (width: number, height: number, cell: Record<string, unknown>, properties: Record<string, unknown> = {}) =>
  obj("box", { width, height, properties: { ...properties, cell } })
const table = (children: ScreenObject[], columns = 2, rows = 1): ScreenObject =>
  obj("table", { id: "tabelle", x: 10, y: 20, properties: { grid: 1, columns: Array.from({ length: columns }, () => ({})), rows: Array.from({ length: rows }, () => ({})) }, children })
const project = (objects: ScreenObject[]) => ({ name: "p", screenWidth: 480, screenHeight: 480, settings: { pixelsPerMm: 4 } as Record<string, any>, screens: [{ id: "s1", objects }] })
const opened = (objects: ScreenObject[]) => {
  const laid = layoutProject(project(objects))
  return withCardsGrown(laid, layoutScaleOf(laid), layoutProject).screens[0].objects
}
const find = (objects: ScreenObject[], id: string): ScreenObject | undefined => {
  for (const o of objects) {
    if (o.id === id) return o
    const inner = find(o.children ?? [], id)
    if (inner) return inner
  }
  return undefined
}
const at = (objects: ScreenObject[], id: string) => getAbsolutePosition(objects, id)

// A card 150 × 80 beside a button 60 × 30 standing bottom left in its cell:
// the user's «MaxxFan», 2026-11-16.
const fixture = () => {
  const card = box(150, 80, { row: 0, column: 0 })
  const button = box(60, 30, { row: 0, column: 1, anchor: { x: "left", y: "bottom" } })
  return { card, button, objects: opened([table([card, button])]) }
}

test.describe("a cell made an area", () => {
  test("around the object in it: the area fills the cell, the object stays where it was on the glass", () => {
    const { button, objects } = fixture()
    const before = at(objects, button.id)
    const wrapped = withCellArea(objects, button.id, SCALE)
    expect(wrapped.areaId).toBe(cellAreaId(button.id))
    const area = find(wrapped.objects, wrapped.areaId!)!
    expect(isCellArea(area)).toBe(true)
    // The cell: beside the card, as tall as the row.
    expect([area.x, area.y, area.width, area.height]).toEqual([150 + GAP, 0, 60, 80])
    expect(area.properties.cell).toEqual({ row: 0, column: 1, anchor: { x: "stretch", y: "stretch" } })
    // What it asks of its column and row is what the button asked.
    expect(area.properties.ownSize).toEqual({ width: 60, height: 30 })
    const inner = find(wrapped.objects, button.id)!
    expect(inner.properties).toEqual({ anchor: { y: "bottom" } })
    expect(at(wrapped.objects, button.id)).toEqual(before)
  })

  test("a second object in it: laid out, both stand in the cell, and a device gets them where they are", () => {
    const { card, button, objects } = fixture()
    const label = obj("box", { x: 10 + 150 + GAP + 5, y: 20 + 4, width: 50, height: 16 })
    const wrapped = withCellArea([...objects, label], button.id, SCALE)
    const moved = opened(moveIntoArea(wrapped.objects, [label.id], wrapped.areaId))
    const area = find(moved, wrapped.areaId!)!
    expect(area.children!.map((c) => c.id)).toEqual([button.id, label.id])
    expect(at(moved, label.id)).toEqual({ x: 171, y: 24 })
    expect(at(moved, button.id)).toEqual({ x: 166, y: 70 })
    // The table is as it was: the cell's area asks for no more than the button did.
    expect([find(moved, "tabelle")!.width, find(moved, "tabelle")!.height]).toEqual([150 + GAP + 60, 80])
    const sent = dissolveGroups(moved)
    expect(sent.map((o) => o.id).sort()).toEqual([button.id, card.id, label.id].sort())
    expect(sent.find((o) => o.id === label.id)).toMatchObject({ x: 171, y: 24, width: 50, height: 16 })
  })

  test("what does not fit in it makes its column and row grow", () => {
    const { button, objects } = fixture()
    const wide = obj("box", { x: 10 + 150 + GAP + 20, y: 20 + 4, width: 90, height: 16 })
    const wrapped = withCellArea([...objects, wide], button.id, SCALE)
    const moved = opened(moveIntoArea(wrapped.objects, [wide.id], wrapped.areaId))
    expect(find(moved, wrapped.areaId!)!.width).toBe(20 + 90)
    expect(find(moved, "tabelle")!.width).toBe(150 + GAP + 110)
  })

  test("an object that filled its cell is docked Fill in the area", () => {
    const filling = box(60, 30, { row: 0, column: 1, anchor: { x: "stretch", y: "stretch" } })
    const objects = opened([table([box(150, 80, { row: 0, column: 0 }), filling])])
    const wrapped = withCellArea(objects, filling.id, SCALE)
    expect(find(wrapped.objects, filling.id)!.properties.dock).toBe("fill")
    expect(find(wrapped.objects, wrapped.areaId!)!.properties.ownSize).toEqual({ width: 60, height: 30 })
    // Alone in it and without a look, laid out it is the slot it was.
    const laid = opened(wrapped.objects)
    expect(find(laid, wrapped.areaId!)).toBeUndefined()
    expect(find(laid, filling.id)).toEqual(find(objects, filling.id))
  })

  test("with a look of its own: the area starts with it, and stays though it holds one object", () => {
    const { button, objects } = fixture()
    const wrapped = withCellArea(objects, button.id, SCALE, { look: "card" })
    const laid = opened(wrapped.objects)
    const area = find(laid, wrapped.areaId!)!
    expect(area.properties.look).toBe("card")
    expect(area.children!.map((c) => c.id)).toEqual([button.id])
    // The card is drawn: a box below the button, on a device too.
    expect(dissolveGroups(laid).map((o) => o.id)).toContain(`${wrapped.areaId}-background`)
  })

  test("not around an area, a table or a switcher, nor around what stands in no cell", () => {
    const area = obj("free", { properties: { cell: { row: 0, column: 0 } }, children: [] })
    const loose = obj("box")
    const objects = opened([table([area, box(40, 20, { row: 0, column: 1 })]), loose])
    expect(withCellArea(objects, area.id, SCALE).areaId).toBeNull()
    expect(withCellArea(objects, loose.id, SCALE).areaId).toBeNull()
  })
})

test.describe("a cell that is a slot again", () => {
  test("left with one object and no look, the area goes: the object is in the cell as it stood", () => {
    const { button, objects } = fixture()
    const label = obj("box", { x: 171, y: 24, width: 50, height: 16 })
    const wrapped = withCellArea([...objects, label], button.id, SCALE)
    const both = opened(moveIntoArea(wrapped.objects, [label.id], wrapped.areaId))
    // The label out again, onto the screen.
    const out = opened(moveIntoArea(both, [label.id], null))
    expect(find(out, wrapped.areaId!)).toBeUndefined()
    const back = find(out, button.id)!
    expect(back.properties.cell).toEqual({ row: 0, column: 1, anchor: { x: "left", y: "bottom" } })
    expect(at(out, button.id)).toEqual({ x: 166, y: 70 })
    expect(find(out, "tabelle")!.children!.map((c) => c.id)).toContain(button.id)
  })

  test("wrapped and unwrapped at once, a table is what it was", () => {
    for (const anchor of [{ x: "left", y: "bottom" }, { x: "stretch", y: "stretch" }, { x: "center", y: "middle" }, { x: "right", y: "top" }, { x: "stretch", y: "top" }]) {
      const b = box(60, 30, { row: 0, column: 1, anchor })
      const objects = opened([table([box(150, 80, { row: 0, column: 0 }), b])])
      const t = find(objects, "tabelle")!
      const round = opened([unwrappedCells(wrapInCell(t, b.id, SCALE))])
      expect(find(round, b.id), JSON.stringify(anchor)).toEqual(find(objects, b.id))
    }
  })

  test("a text is back across its cell", () => {
    const text = obj("text", { width: 80, height: 18, properties: { text: "Deckel", cell: { row: 0, column: 1 } } })
    const objects = opened([table([box(150, 80, { row: 0, column: 0 }), text])])
    const t = find(objects, "tabelle")!
    const wrapped = wrapInCell(t, text.id, SCALE)
    expect(find([wrapped], text.id)!.properties.anchor).toEqual({ x: "stretch", y: "middle" })
    const round = opened([unwrappedCells(wrapped)])
    expect([find(round, text.id)!.x, find(round, text.id)!.width]).toEqual([find(objects, text.id)!.x, find(objects, text.id)!.width])
  })

  test("with a look it stays, empty too (E4); without one an empty area is gone (E3)", () => {
    const { button, objects } = fixture()
    const looked = withCellArea(objects, button.id, SCALE, { look: "card" })
    const emptied = opened(moveIntoArea(looked.objects, [button.id], null))
    expect(find(emptied, looked.areaId!)!.children).toEqual([])

    // Without a look, the area emptied is gone with its cell's column.
    const second = fixture()
    const plain = withCellArea(second.objects, second.button.id, SCALE)
    const gone = opened(moveIntoArea(plain.objects, [second.button.id], null))
    expect(find(gone, plain.areaId!)).toBeUndefined()
  })

  test("an object docked to an edge of its cell keeps the area", () => {
    const { button, objects } = fixture()
    const wrapped = withCellArea(objects, button.id, SCALE)
    const docked = wrapped.objects.map(function dock(o): ScreenObject {
      if (o.id === button.id) return { ...o, properties: { dock: "top" } }
      return o.children ? { ...o, children: o.children.map(dock) } : o
    })
    const laid = opened(docked)
    expect(isCellArea(find(laid, wrapped.areaId!))).toBe(true)
    expect(at(laid, button.id)).toEqual({ x: 166, y: 20 })
  })
})

test.describe("a drop onto an occupied cell (E6)", () => {
  test("the cell under the pointer takes it, its empty part too; an empty cell and the gap do not", () => {
    const { button, objects } = fixture()
    const label = obj("box", { x: 300, y: 300, width: 50, height: 16 })
    const all = [...objects, label]
    // Above the button, in its cell: 166..226 × 20..100 on the glass.
    expect(areaDropAt(all, [label.id], null, { x: 190, y: 30 }, undefined, SCALE)).toEqual({ into: button.id })
    expect(areaDropAt(all, [label.id], null, { x: 190, y: 85 }, undefined, SCALE)).toEqual({ into: button.id })
    // In the gap between the cells, and beside the table.
    expect(areaDropAt(all, [label.id], null, { x: 163, y: 50 }, undefined, SCALE)).toBeNull()
    expect(areaDropAt(all, [label.id], null, { x: 400, y: 50 }, undefined, SCALE)).toBeNull()
  })

  test("a cell that is an area already takes it as any area does", () => {
    const { button, objects } = fixture()
    const wrapped = withCellArea(objects, button.id, SCALE, { look: "card" })
    const laid = opened(wrapped.objects)
    const label = obj("box", { x: 300, y: 300, width: 50, height: 16 })
    expect(areaDropAt([...laid, label], [label.id], null, { x: 190, y: 30 }, undefined, SCALE)).toEqual({ into: wrapped.areaId })
  })

  test("without a scale nothing of a cell is looked for, as before", () => {
    const { objects } = fixture()
    const label = obj("box", { x: 300, y: 300, width: 50, height: 16 })
    expect(areaDropAt([...objects, label], [label.id], null, { x: 190, y: 30 })).toBeNull()
  })
})
