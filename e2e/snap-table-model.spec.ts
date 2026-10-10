import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject, naturalWidth } from "../lib/layout"
import { dissolveGroupsInProject } from "../lib/object-groups"
import {
  applySnapDrop,
  arrangeSnapTable,
  freeSideAt,
  snapDropAt,
  insertSnapColumn,
  insertSnapRow,
  isSnapTable,
  keepInPlace,
  placeInCell,
  resizeSpan,
  roleOf,
  setLineSize,
  snapCellOf,
  snapColumnsOf,
  snapPair,
  snapRowsOf,
  snapTableGeometry,
  snapTargetAt,
  takeOutOf,
  SNAP_GAP_MM,
  SNAP_EMPTY_MM,
} from "../lib/snap-table"

// The table put together by snapping (docs/2026-10-09-snap-tables.md,
// module snap-table-model): a flat grid, each object in the cell it names,
// columns and rows as large as their content or as set by hand. No browser.

const SCALE = { pixelsPerMm: 5 }
const GAP = Math.round(SNAP_GAP_MM * SCALE.pixelsPerMm)
const EMPTY = Math.round(SNAP_EMPTY_MM * SCALE.pixelsPerMm)

let ids = 0
// A box is as large as it is drawn: its natural size is its own. `how` is
// how it stands in its cell (align, fill), kept in the cell with its place.
function box(width: number, height: number, cell: Record<string, unknown>, how: Record<string, unknown> = {}): ScreenObject {
  return { id: `b${++ids}`, type: "box", x: 0, y: 0, width, height, zIndex: ids, properties: { cell: { ...cell, ...how } } }
}
function table(children: ScreenObject[], columns: Array<{ mm?: number }>, rows: Array<{ mm?: number }>): ScreenObject {
  return { id: `t${++ids}`, type: "table", x: 10, y: 20, width: 1, height: 1, zIndex: ids, properties: { grid: 1, columns, rows }, children }
}
const child = (t: ScreenObject, id: string) => t.children!.find((c) => c.id === id)!
const rect = (o: ScreenObject) => ({ x: o.x, y: o.y, width: o.width, height: o.height })

test.describe("snap table: layout", () => {
  test("a 3×2 table: columns as wide as their widest object, rows as tall as their tallest, the gap between", () => {
    const a = box(40, 20, { row: 0, column: 0 })
    const b = box(60, 30, { row: 0, column: 1 })
    const c = box(30, 20, { row: 0, column: 2 })
    const d = box(50, 25, { row: 1, column: 0 })
    const e = box(20, 10, { row: 1, column: 2 })
    const t = arrangeSnapTable(table([a, b, c, d, e], [{}, {}, {}], [{}, {}]), SCALE)
    const g = snapTableGeometry(t, SCALE)
    expect(g.widths).toEqual([50, 60, 30])
    expect(g.heights).toEqual([30, 25])
    expect(g.lefts).toEqual([0, 50 + GAP, 50 + GAP + 60 + GAP])
    expect(g.tops).toEqual([0, 30 + GAP])
    // The table is as large as its content, at its own place.
    expect(t.width).toBe(50 + 60 + 30 + 2 * GAP)
    expect(t.height).toBe(30 + 25 + GAP)
    expect([t.x, t.y]).toEqual([10, 20])
    // Centred by default, in both directions; coordinates relative to the table.
    expect(rect(child(t, a.id))).toEqual({ x: 5, y: 5, width: 40, height: 20 })
    expect(rect(child(t, e.id))).toEqual({ x: 50 + GAP + 60 + GAP + 5, y: 30 + GAP + 8, width: 20, height: 10 })
  })

  test("a width set by hand raises a column and never lowers it; a height the same", () => {
    const a = box(50, 20, { row: 0, column: 0 })
    const b = box(50, 20, { row: 0, column: 1 })
    const wider = snapTableGeometry(arrangeSnapTable(table([a, b], [{ mm: 30 }, { mm: 5 }], [{ mm: 8 }]), SCALE), SCALE)
    expect(wider.widths).toEqual([150, 50])
    expect(wider.heights).toEqual([40])
    const lower = snapTableGeometry(arrangeSnapTable(table([a, b], [{}, {}], [{ mm: 1 }]), SCALE), SCALE)
    expect(lower.heights).toEqual([20])
  })

  test("a span does not count for its columns; when it does not fit, only the last of them grows", () => {
    const top1 = box(50, 20, { row: 0, column: 0 })
    const top2 = box(50, 20, { row: 0, column: 1 })
    const wide = box(200, 20, { row: 1, column: 0, columnSpan: 2 })
    const g = snapTableGeometry(arrangeSnapTable(table([top1, top2, wide], [{}, {}], [{}, {}]), SCALE), SCALE)
    expect(g.widths).toEqual([50, 200 - 50 - GAP])
    // Rows the same way.
    const left1 = box(20, 20, { row: 0, column: 0 })
    const left2 = box(20, 20, { row: 1, column: 0 })
    const tall = box(20, 100, { row: 0, column: 1, rowSpan: 2 })
    const h = snapTableGeometry(arrangeSnapTable(table([left1, left2, tall], [{}, {}], [{}, {}]), SCALE), SCALE)
    expect(h.heights).toEqual([20, 100 - 20 - GAP])
  })

  test("a column with nothing of its own is about 4 mm, until a span needs more", () => {
    const a = box(50, 20, { row: 0, column: 0 })
    const spanning = box(30, 20, { row: 1, column: 0, columnSpan: 2 })
    const g = snapTableGeometry(arrangeSnapTable(table([a, spanning], [{}, {}], [{}, {}]), SCALE), SCALE)
    expect(g.widths).toEqual([50, EMPTY])
  })

  test("align and fill place an object in its cell", () => {
    const wide = box(100, 40, { row: 0, column: 0 })
    const place = (extra: Record<string, unknown>) => {
      const o = box(20, 10, { row: 1, column: 0 }, extra)
      return rect(child(arrangeSnapTable(table([wide, o], [{}], [{}, { mm: 8 }]), SCALE), o.id))
    }
    const top = 40 + GAP
    expect(place({ align: "left", alignY: "top" })).toEqual({ x: 0, y: top, width: 20, height: 10 })
    expect(place({ align: "right", alignY: "bottom" })).toEqual({ x: 80, y: top + 30, width: 20, height: 10 })
    expect(place({})).toEqual({ x: 40, y: top + 15, width: 20, height: 10 })
    expect(place({ fill: { width: true } })).toEqual({ x: 0, y: top + 15, width: 100, height: 10 })
    expect(place({ fill: { width: true, height: true } })).toEqual({ x: 0, y: top, width: 100, height: 40 })
  })

  test("fill keeps the drawn size: laying out again changes nothing, and without fill the object is as drawn", () => {
    const top = box(100, 40, { row: 0, column: 0 })
    const filled = box(20, 10, { row: 1, column: 0 }, { fill: { width: true, height: true } })
    const once = arrangeSnapTable(table([top, filled], [{}], [{}, { mm: 8 }]), SCALE)
    const twice = arrangeSnapTable(once, SCALE)
    expect(snapTableGeometry(twice, SCALE).widths).toEqual([100])
    expect(rect(child(twice, filled.id))).toEqual(rect(child(once, filled.id)))
    const was = child(twice, filled.id)
    const unfilled = { ...was, properties: { ...was.properties, cell: { ...was.properties!.cell, fill: {} } } }
    const back = arrangeSnapTable({ ...twice, children: [child(twice, top.id), unfilled] }, SCALE)
    expect([child(back, filled.id).width, child(back, filled.id).height]).toEqual([20, 10])
  })

  test("a text stands left by default", () => {
    const wide = box(100, 20, { row: 0, column: 0 })
    const text: ScreenObject = { id: "txt", type: "text", x: 0, y: 0, width: 30, height: 18, zIndex: 0, properties: { text: "Bad", cell: { row: 1, column: 0 } } }
    expect(child(arrangeSnapTable(table([wide, text], [{}], [{}, {}]), SCALE), "txt").x).toBe(0)
  })

  test("roles: icons are Icon, texts Label, everything else Control", () => {
    const of = (type: string) => roleOf({ id: "x", type, x: 0, y: 0, width: 1, height: 1, zIndex: 0 } as ScreenObject)
    expect(of("icon")).toBe("icon")
    expect(of("live-icon")).toBe("icon")
    expect(of("text")).toBe("label")
    for (const type of ["switch", "button", "button-group", "slider", "bar", "gauge", "dial", "box", "switcher", "free"]) expect(of(type)).toBe("control")
  })

  test("only a table marked grid 1 is the new kind", () => {
    expect(isSnapTable(table([], [], []))).toBe(true)
    expect(isSnapTable({ id: "old", type: "table", x: 0, y: 0, width: 1, height: 1, zIndex: 0, properties: { columns: [] } })).toBe(false)
  })
})

// A laid-out 3×3 table of 40×20 boxes at 100,100, with a gap at row 1, column 1.
function grid3(): ScreenObject {
  const cells: ScreenObject[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 1 && c === 1)) cells.push({ ...box(40, 20, { row: r, column: c }), id: `r${r}c${c}` })
  return arrangeSnapTable({ ...table(cells, [{}, {}, {}], [{}, {}, {}]), x: 100, y: 100 }, SCALE)
}
const abs = (t: ScreenObject, id: string) => ({ x: t.x + child(t, id).x, y: t.y + child(t, id).y })
const cellOfId = (t: ScreenObject, id: string) => snapCellOf(child(t, id))

test.describe("snap table: editing", () => {
  test("a column inserted inside a span widens it; one at its edge does not", () => {
    const wide = box(100, 20, { row: 0, column: 0, columnSpan: 2 })
    const t = table([wide, box(20, 20, { row: 0, column: 2 })], [{}, {}, {}], [{}])
    expect(cellOfId(insertSnapColumn(t, 1), wide.id).columnSpan).toBe(3)
    expect(cellOfId(insertSnapColumn(t, 2), wide.id).columnSpan).toBe(2)
    const before = insertSnapColumn(t, 0)
    expect(cellOfId(before, wide.id)).toMatchObject({ column: 1, columnSpan: 2 })
    expect(snapColumnsOf(before)).toHaveLength(4)
    // Rows the same way.
    const tall = box(20, 60, { row: 0, column: 0, rowSpan: 2 })
    const r = insertSnapRow(table([tall, box(20, 20, { row: 0, column: 1 }), box(20, 20, { row: 1, column: 1 })], [{}, {}], [{}, {}]), 1)
    expect(cellOfId(r, tall.id).rowSpan).toBe(3)
    expect(snapRowsOf(r)).toHaveLength(3)
  })

  test("a column width set by hand moves with its column when one is inserted before it", () => {
    const t = setLineSize(table([box(20, 20, { row: 0, column: 0 }), box(20, 20, { row: 0, column: 1 })], [{}, {}], [{}]), "column", 1, 12)
    expect(snapColumnsOf(insertSnapColumn(t, 0)).map((c) => c.mm)).toEqual([undefined, undefined, 12])
    expect(snapColumnsOf(setLineSize(t, "column", 1, undefined))[1].mm).toBeUndefined()
  })

  test("taking out the last object of a row removes the row; it comes out where it stood, without its cell", () => {
    const t = grid3()
    const before = abs(t, "r1c0")
    const first = takeOutOf(t, "r1c0")
    expect(first.taken).toMatchObject({ id: "r1c0", ...before })
    expect(first.taken.properties?.cell).toBeUndefined()
    expect(snapRowsOf(first.table!)).toHaveLength(3)
    const second = takeOutOf(arrangeSnapTable(first.table!, SCALE), "r1c2")
    expect(snapRowsOf(second.table!)).toHaveLength(2)
    expect(second.table!.children!.map((c) => snapCellOf(c).row).sort()).toEqual([0, 0, 0, 1, 1, 1])
  })

  test("a table left with one object dissolves into it, at its place", () => {
    const pair = arrangeSnapTable({ ...table([{ ...box(40, 20, { row: 0, column: 0 }), id: "a" }, { ...box(40, 20, { row: 0, column: 1 }), id: "b" }], [{}, {}], [{}]), x: 50, y: 60 }, SCALE)
    const where = abs(pair, "a")
    const out = takeOutOf(pair, "b")
    expect(out.table).toBeNull()
    expect(out.left).toMatchObject({ id: "a", ...where })
    expect(out.left!.properties?.cell).toBeUndefined()
  })

  test("a filled object taken out is as drawn again", () => {
    const top = { ...box(100, 20, { row: 0, column: 0 }), id: "top" }
    const filled = { ...box(20, 10, { row: 1, column: 0 }, { fill: { width: true } }), id: "filled" }
    const out = takeOutOf(arrangeSnapTable(table([top, filled, { ...box(20, 10, { row: 1, column: 1 }), id: "x" }], [{}, {}], [{}, {}]), SCALE), "filled")
    expect([out.taken.width, out.taken.height]).toEqual([20, 10])
    // Nothing of its place in the table is left; its own properties are untouched.
    expect(out.taken.properties).toEqual({})
  })

  test("a span grows left over empty cells, is refused over an occupied one, and shrinks back", () => {
    const t = table([{ ...box(20, 20, { row: 0, column: 2 }), id: "s" }, { ...box(20, 20, { row: 1, column: 0 }), id: "o" }], [{}, {}, {}], [{}, {}])
    const grown = resizeSpan(t, "s", "left", 0)!
    expect(cellOfId(grown, "s")).toMatchObject({ column: 0, columnSpan: 3 })
    expect(resizeSpan(grown, "s", "bottom", 1)).toBeNull()
    expect(cellOfId(resizeSpan(grown, "s", "left", 2)!, "s")).toMatchObject({ column: 2, columnSpan: 1 })
    expect(cellOfId(resizeSpan(t, "s", "bottom", 1)!, "s")).toMatchObject({ row: 0, rowSpan: 2 })
    // Never past the table's edge.
    expect(cellOfId(resizeSpan(t, "s", "right", 7)!, "s").columnSpan).toBe(1)
  })

  test("after inserting a column at the left, every other object keeps its place on the screen", () => {
    const t = grid3()
    const added = placeInCell(insertSnapColumn(t, 0), box(30, 20, {}), 0, 0)
    const kept = keepInPlace(t, added, SCALE)
    expect(abs(kept, "r0c0")).toEqual(abs(t, "r0c0"))
    expect(abs(kept, "r2c2")).toEqual(abs(t, "r2c2"))
  })

  test("two free objects become a table, the one that stood keeping its place", () => {
    const still: ScreenObject = { id: "still", type: "box", x: 200, y: 50, width: 40, height: 20, zIndex: 1, properties: {} }
    const moving: ScreenObject = { id: "moving", type: "box", x: 0, y: 0, width: 30, height: 20, zIndex: 2, properties: {} }
    const left = snapPair(still, moving, "left", SCALE)
    expect(isSnapTable(left)).toBe(true)
    expect(abs(left, "still")).toEqual({ x: 200, y: 50 })
    expect([cellOfId(left, "moving").column, cellOfId(left, "still").column]).toEqual([0, 1])
    const below = snapPair(still, moving, "bottom", SCALE)
    expect([cellOfId(below, "still").row, cellOfId(below, "moving").row]).toEqual([0, 1])
    expect(abs(below, "still")).toEqual({ x: 200, y: 50 })
  })

  test("the drop target: an empty cell, the nearest edge of an occupied one, a line outside, nothing far away", () => {
    const t = grid3()
    const g = snapTableGeometry(t, SCALE)
    const at = (c: number, r: number, fx: number, fy: number) => ({ x: t.x + g.lefts[c] + fx * g.widths[c], y: t.y + g.tops[r] + fy * g.heights[r] })
    const zone = 25
    expect(snapTargetAt(t, at(1, 1, 0.5, 0.5), zone, SCALE)).toEqual({ kind: "cell", row: 1, column: 1 })
    expect(snapTargetAt(t, at(0, 0, 0.1, 0.5), zone, SCALE)).toEqual({ kind: "column", at: 0, row: 0 })
    expect(snapTargetAt(t, at(2, 0, 0.9, 0.5), zone, SCALE)).toEqual({ kind: "column", at: 3, row: 0 })
    expect(snapTargetAt(t, at(0, 2, 0.5, 0.95), zone, SCALE)).toEqual({ kind: "row", at: 3, column: 0 })
    expect(snapTargetAt(t, at(2, 2, 0.5, 0.05), zone, SCALE)).toEqual({ kind: "row", at: 2, column: 2 })
    expect(snapTargetAt(t, { x: t.x - 10, y: t.y + 5 }, zone, SCALE)).toEqual({ kind: "column", at: 0, row: 0 })
    expect(snapTargetAt(t, { x: t.x - 100, y: t.y + 5 }, zone, SCALE)).toBeNull()
    // An object being dragged out leaves its cell free.
    expect(snapTargetAt(t, at(0, 0, 0.5, 0.5), zone, SCALE, "r0c0")).toEqual({ kind: "cell", row: 0, column: 0 })
  })

  test("the side of a free object a drop goes to", () => {
    const o: ScreenObject = { id: "o", type: "box", x: 100, y: 100, width: 40, height: 20, zIndex: 1, properties: {} }
    expect(freeSideAt(o, { x: 95, y: 110 }, 25)).toBe("left")
    expect(freeSideAt(o, { x: 145, y: 110 }, 25)).toBe("right")
    expect(freeSideAt(o, { x: 120, y: 125 }, 25)).toBe("bottom")
    expect(freeSideAt(o, { x: 120, y: 60 }, 25)).toBeNull()
  })
})

test.describe("snap table: drops", () => {
  const free = (id: string, x: number, y: number, extra: Partial<ScreenObject> = {}): ScreenObject => ({ id, type: "box", x, y, width: 40, height: 20, zIndex: ids++, properties: {}, ...extra })

  // Where a 40×20 object stands when let go.
  const at = (x: number, y: number, width = 40, height = 20) => ({ x, y, width, height })

  test("three free objects dragged one next to the other become one table of one row", () => {
    const a = free("a", 100, 100)
    const b = free("b", 0, 200)
    const c = free("c", 0, 250)
    let objects = [a, b, c]
    // b let go with its left edge 3 px right of a's right edge (140).
    const first = snapDropAt(objects, "b", at(143, 104), 25, SCALE)
    expect(first).toEqual({ kind: "pair", stillId: "a", side: "right" })
    objects = applySnapDrop(objects, "b", first!, SCALE)
    expect(objects.map((o) => o.type)).toEqual(["table", "box"])
    const pair = objects[0]
    expect(abs(pair, "a")).toEqual({ x: 100, y: 100 })
    // c let go with its left edge just right of the table.
    const second = snapDropAt(objects, "c", at(pair.x + pair.width + 5, pair.y), 25, SCALE)
    expect(second).toEqual({ kind: "table", tableId: pair.id, target: { kind: "column", at: 2, row: 0 } })
    objects = applySnapDrop(objects, "c", second!, SCALE)
    expect(objects).toHaveLength(1)
    const row = objects[0]
    expect(row.children!.map((o) => [o.id, snapCellOf(o).column, snapCellOf(o).row])).toEqual([
      ["a", 0, 0],
      ["b", 1, 0],
      ["c", 2, 0],
    ])
    expect(abs(row, "a")).toEqual({ x: 100, y: 100 })
  })

  test("dropped on an empty cell it fills it; left of a row it adds a column, what stood there keeping its place", () => {
    const table = grid3()
    const g = snapTableGeometry(table, SCALE)
    const label = free("label", 0, 0, { width: 30 })
    // Its middle over the empty cell.
    const over = at(table.x + g.lefts[1] + 5, table.y + g.tops[1], 30)
    const into = applySnapDrop([table, label], "label", snapDropAt([table, label], "label", over, 25, SCALE)!, SCALE)
    expect(cellOfId(into[0], "label")).toMatchObject({ row: 1, column: 1 })
    // Its right edge 4 px short of the table's left edge, level with row 0.
    const beside = at(table.x - 34, table.y, 30)
    const left = applySnapDrop([table, label], "label", snapDropAt([table, label], "label", beside, 25, SCALE)!, SCALE)
    expect(cellOfId(left[0], "label")).toMatchObject({ row: 0, column: 0 })
    expect(cellOfId(left[0], "r0c0")).toMatchObject({ row: 0, column: 1 })
    expect(abs(left[0], "r0c0")).toEqual(abs(table, "r0c0"))
  })

  test("a group, a table and anything far away do not snap", () => {
    const a = free("a", 100, 100)
    const group = free("g", 0, 0, { type: "group", children: [] })
    expect(snapDropAt([a, group], "g", at(143, 104), 25, SCALE)).toBeNull()
    expect(snapDropAt([a, free("b", 0, 0)], "b", at(300, 300), 25, SCALE)).toBeNull()
    const t = grid3()
    expect(snapDropAt([a, t], t.id, at(143, 104), 25, SCALE)).toBeNull()
  })

  test("the edges decide, not where the object was held: near and level, it snaps; apart or out of line, not", () => {
    const a = free("a", 100, 100)
    const b = free("b", 0, 200, { width: 200 })
    // A wide object whose left edge lies 4 px right of a: its middle is far away, it snaps all the same.
    expect(snapDropAt([a, b], "b", at(144, 102, 200), 25, SCALE)).toEqual({ kind: "pair", stillId: "a", side: "right" })
    // Overlapping a's edge by a little counts too.
    expect(snapDropAt([a, b], "b", at(130, 102, 200), 25, SCALE)).toEqual({ kind: "pair", stillId: "a", side: "right" })
    // 30 px apart: beyond the zone.
    expect(snapDropAt([a, b], "b", at(170, 102, 200), 25, SCALE)).toBeNull()
    // Near in x, but wholly above a: not side by side.
    expect(snapDropAt([a, b], "b", at(144, 50, 200), 25, SCALE)).toBeNull()
    // Below a, in line with it.
    expect(snapDropAt([a, free("c", 0, 0)], "c", at(110, 123), 25, SCALE)).toEqual({ kind: "pair", stillId: "a", side: "bottom" })
  })

  test("a line goes into its cell with its points, and comes out with them where it stands", () => {
    const t = grid3()
    const g = snapTableGeometry(t, SCALE)
    // Drawn right to left on the screen: its width is negative, its points say where it is.
    const line: ScreenObject = { id: "line", type: "line", x: 340, y: 300, width: -40, height: 0, zIndex: 50, properties: { points: [{ x: 340, y: 300 }, { x: 300, y: 300 }] } }
    const into = applySnapDrop([t, line], "line", { kind: "table", tableId: t.id, target: { kind: "cell", row: 1, column: 1 } }, SCALE)
    const table = into[0]
    const placed = child(table, "line")
    const xs = placed.properties!.points.map((p: { x: number }) => p.x)
    const ys = placed.properties!.points.map((p: { y: number }) => p.y)
    // Inside its cell, in the table's space, 40 wide as drawn.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(g.lefts[1])
    expect(Math.max(...xs)).toBeLessThanOrEqual(g.lefts[1] + g.widths[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBe(40)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(g.tops[1])
    expect(Math.max(...ys)).toBeLessThanOrEqual(g.tops[1] + g.heights[1])
    // Its x and its points still agree.
    expect(placed.properties!.points[0].x).toBe(placed.x)
    // Out again: the points on the screen, where the line stood in the table.
    const out = takeOutOf(table, "line").taken
    expect(out.properties!.points[0]).toEqual({ x: table.x + placed.properties!.points[0].x, y: table.y + placed.properties!.points[0].y })
    expect(out.x).toBe(out.properties!.points[0].x)
  })

  test("beside a table, the new column goes to the row of the object's middle", () => {
    const t = grid3()
    const g = snapTableGeometry(t, SCALE)
    const c = free("c", 0, 0)
    const drop = snapDropAt([t, c], "c", at(t.x + t.width + 3, t.y + g.tops[2]), 25, SCALE)
    expect(drop).toEqual({ kind: "table", tableId: t.id, target: { kind: "column", at: 3, row: 2 } })
  })
})

test.describe("snap table: in a project", () => {
  // A table as a file holds it before the layout pass: children unplaced.
  const unlaid = () =>
    table(
      [
        { ...box(40, 20, { row: 0, column: 0 }), id: "p" },
        { ...box(60, 30, { row: 0, column: 1 }), id: "q" },
        { ...box(30, 20, { row: 1, column: 1 }, { align: "right" }), id: "s" },
      ],
      [{}, {}],
      [{}, {}],
    )
  const project = (objects: ScreenObject[]) => ({ settings: { pixelsPerMm: SCALE.pixelsPerMm }, screens: [{ id: "s1", objects }] })

  test("the layout pass after every change lays a new table out, and changes nothing the second time", () => {
    const t = unlaid()
    const once = layoutProject(project([t]))
    expect(once.screens[0].objects[0]).toEqual(arrangeSnapTable(t, SCALE))
    expect(layoutProject(once)).toBe(once)
  })

  test("the export dissolves a new table into objects where they stand on the screen", () => {
    const laid = layoutProject(project([unlaid()]))
    const t = laid.screens[0].objects[0]
    const out = dissolveGroupsInProject(laid).screens[0].objects
    expect(out.map((o) => o.type)).toEqual(["box", "box", "box"])
    for (const id of ["p", "q", "s"]) expect(out.find((o) => o.id === id)).toMatchObject(abs(t, id))
  })

  test("a new table is as wide as its columns for whatever measures it", () => {
    const laid = arrangeSnapTable(unlaid(), SCALE)
    expect(naturalWidth(unlaid(), SCALE)).toBe(laid.width)
  })
})
