import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { applySnapDrop, arrangeSnapTable, dimensions, mergeTables, snapCellOf, snapDropAt, snapTableGeometry } from "../lib/snap-table"
import { carryObjects } from "../lib/carry"
import { findObjectById, findParentOf } from "../lib/object-tree"

// Tables merged, and objects carried from wherever they are
// (docs/2026-11-07-tree-carry-and-merge.md): the model, no page.

const SCALE = { pixelsPerMm: 5 }
let ids = 0
const box = (id: string, row: number, column: number, more: Record<string, unknown> = {}): ScreenObject => ({
  id,
  type: "box",
  x: 0,
  y: 0,
  width: 40,
  height: 20,
  zIndex: ++ids,
  properties: { cell: { row, column, ...more } },
})
const table = (id: string, x: number, y: number, children: ScreenObject[], columns: number, rows: number): ScreenObject =>
  arrangeSnapTable(
    {
      id,
      type: "table",
      x,
      y,
      width: 1,
      height: 1,
      zIndex: ++ids,
      properties: { grid: 1, columns: Array.from({ length: columns }, () => ({})), rows: Array.from({ length: rows }, () => ({})) },
      children,
    },
    SCALE,
  )
const cellOf = (t: ScreenObject, id: string) => {
  const c = snapCellOf(t.children!.find((o) => o.id === id)!)
  return [c.row, c.column, c.rowSpan, c.columnSpan]
}

test.describe("merging tables", () => {
  test("rows appended: a narrower table stands from its start column, the cells beside it stay empty", () => {
    const target = table("t", 0, 0, [box("a", 0, 0), box("b", 0, 1), box("c", 0, 2)], 3, 1)
    const carried = table("u", 0, 0, [box("x", 0, 0), box("y", 1, 0)], 1, 2)
    const merged = mergeTables(target, carried, "row", 1, 1)
    expect(dimensions(merged)).toEqual({ rows: 3, columns: 3 })
    expect(cellOf(merged, "x")).toEqual([1, 1, 1, 1])
    expect(cellOf(merged, "y")).toEqual([2, 1, 1, 1])
    expect(cellOf(merged, "a")).toEqual([0, 0, 1, 1])
  })

  test("a wider table adds the columns the other lacks; spans and sizes set by hand come along", () => {
    const target = table("t", 0, 0, [box("a", 0, 0)], 1, 1)
    const carried = {
      ...table("u", 0, 0, [box("x", 0, 0, { columnSpan: 2 }), box("y", 1, 2)], 3, 2),
    }
    carried.properties = { ...carried.properties, columns: [{}, {}, { mm: 12 }], rows: [{ mm: 9 }, {}] }
    const merged = mergeTables(target, carried, "row", 1, 0)
    expect(dimensions(merged)).toEqual({ rows: 3, columns: 3 })
    expect(cellOf(merged, "x")).toEqual([1, 0, 1, 2])
    expect(cellOf(merged, "y")).toEqual([2, 2, 1, 1])
    expect(merged.properties!.columns[2]).toEqual({ mm: 12 })
    expect(merged.properties!.rows[1]).toEqual({ mm: 9 })
  })

  test("columns inserted beside: rows lined up from the start row", () => {
    const target = table("t", 0, 0, [box("a", 0, 0), box("b", 1, 0), box("c", 2, 0)], 1, 3)
    const carried = table("u", 0, 0, [box("x", 0, 0)], 1, 1)
    const merged = mergeTables(target, carried, "column", 0, 2)
    expect(cellOf(merged, "x")).toEqual([2, 0, 1, 1])
    expect(cellOf(merged, "a")).toEqual([0, 1, 1, 1])
  })

  test("with Alt below a table, a table snaps as a merge, its first column where its middle is", () => {
    const target = table("t", 100, 100, [box("a", 0, 0), box("b", 0, 1), box("c", 0, 2)], 3, 1)
    const carried = table("u", 0, 0, [box("x", 0, 0)], 1, 1)
    const g = snapTableGeometry(target, SCALE)
    // Its top edge 3 px below the table, its middle over the second column.
    const rect = { x: target.x + g.lefts[1], y: target.y + target.height + 3, width: carried.width, height: carried.height }
    const drop = snapDropAt([target, carried], "u", rect, 25, SCALE)
    expect(drop).toEqual({ kind: "table", tableId: "t", merge: true, target: { kind: "row", at: 1, column: 1, span: 1 } })
    // Held over the last column, a table of two columns still fits: it moves back one.
    const two = table("v", 0, 0, [box("p", 0, 0), box("q", 0, 1)], 2, 1)
    const atEnd = { x: target.x + g.lefts[2], y: rect.y, width: two.width, height: two.height }
    expect(snapDropAt([target, two], "v", atEnd, 25, SCALE)).toMatchObject({ target: { kind: "row", column: 1, span: 2 } })
    // Applied: the carried table is gone, its object in the other one, which stays in place.
    const after = applySnapDrop([target, carried], "u", drop!, SCALE)
    expect(after.map((o) => o.id)).toEqual(["t"])
    expect(cellOf(after[0], "x")).toEqual([1, 1, 1, 1])
    expect([after[0].x, after[0].y]).toEqual([target.x, target.y])
  })

  test("a table never goes into a cell, and never forms a pair with a free object", () => {
    const target = table("t", 100, 100, [box("a", 0, 0), box("b", 1, 1)], 2, 2)
    const carried = table("u", 0, 0, [box("x", 0, 0)], 1, 1)
    const g = snapTableGeometry(target, SCALE)
    const pointer = { x: target.x + g.lefts[1] + g.widths[1] / 2, y: target.y + g.tops[0] + g.heights[0] / 2 }
    const over = { x: pointer.x - carried.width / 2, y: pointer.y - carried.height / 2, width: carried.width, height: carried.height }
    // The pointer over the empty cell (0,1): no cell for a table.
    const d = snapDropAt([target, carried], "u", over, 25, SCALE, pointer)
    expect(d === null || (d.kind === "table" && d.target.kind !== "cell")).toBe(true)
    const free: ScreenObject = { id: "f", type: "box", x: 300, y: 300, width: 40, height: 20, zIndex: 99, properties: {} }
    expect(snapDropAt([free, carried], "u", { x: 343, y: 300, width: carried.width, height: carried.height }, 25, SCALE)).toBeNull()
  })
})

test.describe("carrying from anywhere", () => {
  // Two cards on the screen, each a table in it; the first table holds two boxes.
  const screen = () => {
    const first = table("t1", 10, 10, [box("a", 0, 0), box("b", 1, 0)], 1, 2)
    const second = table("t2", 10, 10, [box("c", 0, 0), box("d", 0, 1)], 2, 1)
    const card = (id: string, y: number, child: ScreenObject): ScreenObject => ({
      id,
      type: "free",
      x: 20,
      y,
      width: 200,
      height: 100,
      zIndex: ++ids,
      properties: { look: "card" },
      children: [child],
    })
    return [card("k1", 20, first), card("k2", 200, second)]
  }

  test("out of a table in one card onto the screen: shifted on the glass, no cell left", () => {
    const objects = screen()
    const before = findObjectById(objects, "a")!
    const after = carryObjects(objects, ["a"], { into: null, shift: { x: 100, y: 50 } }, SCALE)
    const a = after.find((o) => o.id === "a")!
    expect(a.properties?.cell).toBeUndefined()
    // On the glass: card at 20,20, table at 10,10 in it.
    expect([a.x, a.y]).toEqual([20 + 10 + before.x + 100, 20 + 10 + before.y + 50])
    // The table left with one box dissolves into it.
    expect(findObjectById(after, "t1")).toBeNull()
    expect(findParentOf(after, "b")?.parent?.id).toBe("k1")
  })

  test("a table carried onto another table's last row merges: one table, in the other card", () => {
    const objects = screen()
    const after = carryObjects(
      objects,
      ["t1"],
      { into: "k2", snap: { kind: "table", tableId: "t2", target: { kind: "row", at: 1, column: 0, span: 1 }, merge: true } },
      SCALE,
    )
    expect(findObjectById(after, "t1")).toBeNull()
    expect(findObjectById(after, "k1")!.children).toEqual([])
    const t2 = findObjectById(after, "t2")!
    expect(t2.children!.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"])
    expect(cellOf(t2, "a")).toEqual([1, 0, 1, 1])
    expect(cellOf(t2, "b")).toEqual([2, 0, 1, 1])
  })

  test("never into itself or what it holds", () => {
    const objects = screen()
    expect(carryObjects(objects, ["k1"], { into: "k1" }, SCALE)).toBe(objects)
    expect(carryObjects(objects, ["k1"], { into: null, snap: { kind: "table", tableId: "t1", target: { kind: "row", at: 2, column: 0 } } }, SCALE)).toBe(objects)
  })
})
