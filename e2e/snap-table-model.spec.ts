import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { arrangeSnapTable, isSnapTable, roleOf, snapTableGeometry, SNAP_GAP_MM, SNAP_EMPTY_MM } from "../lib/snap-table"

// The table put together by snapping (docs/2026-10-09-snap-tables.md,
// module snap-table-model): a flat grid, each object in the cell it names,
// columns and rows as large as their content or as set by hand. No browser.

const SCALE = { pixelsPerMm: 5 }
const GAP = Math.round(SNAP_GAP_MM * SCALE.pixelsPerMm)
const EMPTY = Math.round(SNAP_EMPTY_MM * SCALE.pixelsPerMm)

let ids = 0
// A box is as large as it is drawn: its natural size is its own.
function box(width: number, height: number, cell: Record<string, unknown>, extra: Record<string, unknown> = {}): ScreenObject {
  return { id: `b${++ids}`, type: "box", x: 0, y: 0, width, height, zIndex: ids, properties: { cell, ...extra } }
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
    const unfilled = { ...child(twice, filled.id), properties: { ...child(twice, filled.id).properties, fill: {} } }
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
