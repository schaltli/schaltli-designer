import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { arrangeSnapTable, landed, placeInCell, snapPair, snapTableGeometry, SNAP_GAP_MM } from "../lib/snap-table"

// A grid of cards (docs/2026-11-03-card-grid.md): the table's Gap, Width and
// Equal columns; a card filling the cell it lands in.

const SCALE = { pixelsPerMm: 5 }
const GAP = Math.round(SNAP_GAP_MM * SCALE.pixelsPerMm)

let ids = 0
const box = (width: number, height: number, row: number, column: number): ScreenObject =>
  ({ id: `b${++ids}`, type: "box", x: 0, y: 0, width, height, zIndex: ids, properties: { cell: { row, column } } }) as ScreenObject
const table = (children: ScreenObject[], columns: Array<{ mm?: number }>, rows: Array<{ mm?: number }>, extra: Record<string, any> = {}): ScreenObject =>
  ({ id: `t${++ids}`, type: "table", x: 0, y: 0, width: 1, height: 1, zIndex: ids, properties: { grid: 1, columns, rows, ...extra }, children }) as ScreenObject
const geom = (t: ScreenObject) => snapTableGeometry(arrangeSnapTable(t, SCALE), SCALE)
const twoByTwo = (extra: Record<string, any> = {}) =>
  table([box(40, 20, 0, 0), box(60, 30, 0, 1), box(30, 20, 1, 0), box(50, 25, 1, 1)], [{}, {}], [{}, {}], extra)

test.describe("card grid: the table", () => {
  test("without the new properties a table is today's; 1.5 mm set is the same", () => {
    const today = geom(twoByTwo())
    expect(today).toMatchObject({ gap: GAP, widths: [40, 60], heights: [30, 25] })
    expect(geom(twoByTwo({ gapMm: 1.5 }))).toEqual(today)
  })

  test("Gap: the space between columns and between rows", () => {
    const g = geom(twoByTwo({ gapMm: 4 }))
    expect(g.gap).toBe(20)
    expect(g.lefts).toEqual([0, 60])
    expect(g.tops).toEqual([0, 50])
    expect(geom(twoByTwo({ gapMm: 0 })).lefts).toEqual([0, 40])
  })

  test("Width: the last column takes what is left; a table wider than it stays as wide as its content", () => {
    expect(geom(twoByTwo({ widthMm: 40 })).widths).toEqual([40, 200 - 40 - GAP])
    expect(geom(twoByTwo({ widthMm: 10 })).widths).toEqual([40, 60])
  })

  test("Equal columns: as wide as the widest, or sharing the width; a hand-sized column kept; content never squeezed", () => {
    expect(geom(twoByTwo({ equalColumns: true })).widths).toEqual([60, 60])
    const shared = geom(twoByTwo({ equalColumns: true, widthMm: 41 })).widths
    expect(shared[0] + shared[1] + GAP).toBe(205)
    expect(Math.abs(shared[0] - shared[1])).toBeLessThanOrEqual(1)
    // A first column dragged to 20 mm keeps it; the other takes the rest.
    const hand = table([box(40, 20, 0, 0), box(60, 30, 0, 1), box(30, 20, 0, 2)], [{ mm: 20 }, {}, {}], [{}], { equalColumns: true, widthMm: 60 })
    const w = geom(hand).widths
    expect(w[0]).toBe(100)
    expect(Math.abs(w[1] - w[2])).toBeLessThanOrEqual(1)
    expect(w.reduce((a, b) => a + b, 0) + 2 * GAP).toBe(300)
    // A share smaller than what a column holds: all as wide as the widest, the table wider than its width.
    expect(geom(twoByTwo({ equalColumns: true, widthMm: 16 })).widths).toEqual([60, 60])
  })

  test("laying out twice changes nothing", () => {
    const once = arrangeSnapTable(twoByTwo({ equalColumns: true, widthMm: 50, gapMm: 3 }), SCALE)
    expect(arrangeSnapTable(once, SCALE)).toEqual(once)
  })
})

test.describe("card grid: a card fills its cell", () => {
  const card = (id: string, extra: Record<string, any> = {}): ScreenObject =>
    ({ id, type: "free", x: 0, y: 0, width: 40, height: 20, zIndex: 1, properties: { look: "card", ...extra }, children: [] }) as ScreenObject

  test("landed: a card gets Stretch both ways; one with an anchor in its cell, a plain free area, a box do not", () => {
    expect(landed({ ...card("k"), properties: { look: "card", cell: { row: 0, column: 0 } } }).properties!.cell.anchor).toEqual({ x: "stretch", y: "stretch" })
    expect(landed({ ...card("k"), properties: { look: "card", cell: { row: 0, column: 0, anchor: { x: "left" } } } }).properties!.cell.anchor).toEqual({ x: "left" })
    const plain = { ...card("p"), properties: { cell: { row: 0, column: 0 } } }
    expect(landed(plain)).toBe(plain)
    const b = box(10, 10, 0, 0)
    expect(landed(b)).toBe(b)
  })

  test("two cards snapped together, then a third into the table: every card fills its cell", () => {
    const pair = snapPair(card("a"), card("b", { x: 0 }), "right", SCALE)
    expect(pair.children!.map((c) => c.properties!.cell.anchor)).toEqual([
      { x: "stretch", y: "stretch" },
      { x: "stretch", y: "stretch" },
    ])
    const tall = { ...card("c"), height: 60 }
    const t = arrangeSnapTable(placeInCell(arrangeSnapTable(pair, SCALE), tall, 1, 0), SCALE)
    const c = t.children!.find((o) => o.id === "c")!
    expect(c.properties!.cell.anchor).toEqual({ x: "stretch", y: "stretch" })
    // The row is as tall as its tallest card, the cards in row 0 as tall as each other.
    const row0 = t.children!.filter((o) => o.properties!.cell.row === 0)
    expect(new Set(row0.map((o) => o.height)).size).toBe(1)
  })
})
