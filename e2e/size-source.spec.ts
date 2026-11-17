import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects } from "../lib/layout"
import { sizeSourceOf } from "../lib/size-source"

// Where a size comes from, in words (docs/2026-11-16-table-sizes.md,
// decision 8; lib/size-source.ts): what Frame says under W and H. The case
// it is for: a table with two columns of 310 and 181 px, and nothing on the
// screen to say that the first had been pulled by hand (the user,
// 2026-11-16).

const SCALE = { pixelsPerMm: 5 }
type Obj = Record<string, any>

const box = (id: string, width: number, height: number, properties: Obj = {}, at: { x?: number; y?: number } = {}): ScreenObject =>
  ({ id, type: "box", x: at.x ?? 0, y: at.y ?? 0, width, height, zIndex: 1, properties }) as ScreenObject
const table = (id: string, children: ScreenObject[], columns: Obj[], rows: Obj[], extra: Obj = {}): ScreenObject =>
  ({ id, type: "table", x: 0, y: 0, width: 1, height: 1, zIndex: 1, properties: { grid: 1, columns, rows, ...extra }, children }) as ScreenObject
const area = (id: string, width: number, height: number, children: ScreenObject[], properties: Obj = {}): ScreenObject =>
  ({ id, type: "free", x: 0, y: 0, width, height, zIndex: 1, properties, children }) as ScreenObject
const STRETCH = { anchor: { x: "stretch", y: "stretch" } }
const of = (objects: ScreenObject[], id: string) => sizeSourceOf(layoutObjects(objects, SCALE), id, SCALE)

test("in a table: a fixed column says its mm, a fill column that it fills - the user's table", () => {
  const t = table(
    "t",
    [box("a", 40, 20, { cell: { row: 0, column: 0, ...STRETCH } }), box("b", 60, 20, { cell: { row: 0, column: 1, ...STRETCH } })],
    [{ mm: 45.7 }, { fill: true }],
    [{}],
    { tableSize: { width: 500 } },
  )
  expect(of([t], "a")!.width).toBe("its column, fixed at 45.7 mm")
  expect(of([t], "b")!.width).toBe("its column, filling the table")
  expect(of([t], "a")!.height).toContain("its row")
})

test("in a table: an auto column is as wide as the widest object in it, named", () => {
  const t = table(
    "t",
    [box("narrow", 40, 20, { cell: { row: 0, column: 0, ...STRETCH } }), box("wide", 90, 20, { cell: { row: 1, column: 0 }, text: "Wohnraum" })],
    [{}],
    [{}, {}],
  )
  expect(of([t], "narrow")!.width).toBe("its column, as wide as Box «Wohnraum»")
  // The widest itself is not stretched: its width is its own.
  expect(of([t], "wide")!.width).toBe("set by hand")
})

test("in a table: an object across two columns names them", () => {
  const t = table("t", [box("a", 40, 20, { cell: { row: 0, column: 0 } }), box("b", 40, 20, { cell: { row: 0, column: 1 } }), box("c", 40, 20, { cell: { row: 1, column: 0, columnSpan: 2, ...STRETCH } })], [{}, {}], [{}, {}])
  expect(of([t], "c")!.width).toBe("the 2 columns it spans")
})

test("docked: the edge and what it is docked in; along its dock its own", () => {
  const a = area("karte", 200, 100, [box("kopf", 60, 20, { dock: "top" })])
  expect(of([a], "kopf")).toEqual({ width: "docked Top in Area", height: "set by hand" })
  // On the screen itself.
  expect(of([box("leiste", 60, 20, { dock: "bottom" })], "leiste")!.width).toBe("docked Bottom in the screen")
})

test("stretched in its area", () => {
  const a = area("karte", 200, 100, [box("quer", 180, 20, { anchor: { x: "stretch" } }, { x: 10, y: 10 })])
  expect(of([a], "quer")!.width).toBe("stretched in Area")
})

test("an area as large as what it holds says so; one given more room is set by hand", () => {
  const tight = area("a", 50, 30, [box("b", 40, 20, {}, { x: 10, y: 10 })])
  expect(of([tight], "a")).toEqual({ width: "what it holds", height: "what it holds" })
  const roomy = area("a", 200, 30, [box("b", 40, 20, {}, { x: 10, y: 10 })])
  expect(of([roomy], "a")).toEqual({ width: "set by hand", height: "what it holds" })
})

test("a table: its columns and rows, or pulled", () => {
  const cells = () => [box("a", 40, 20, { cell: { row: 0, column: 0 } }), box("b", 60, 20, { cell: { row: 0, column: 1 } })]
  expect(of([table("t", cells(), [{}, {}], [{}])], "t")).toEqual({ width: "its columns", height: "its rows" })
  const pulled = of([table("t", cells(), [{}, { fill: true }], [{}], { tableSize: { width: 300 } })], "t")!
  expect(pulled.width).toBe("pulled to this width; its fill columns share what is left")
  expect(pulled.height).toBe("its rows")
  // Docked across an area, the area says.
  const docked = area("karte", 300, 100, [table("t", cells(), [{}, { fill: true }], [{}], { dock: "top" })])
  expect(of([docked], "t")!.width).toBe("docked Top in Area")
})

test("a panel has its switcher's size", () => {
  const switcher = { id: "sw", type: "switcher", x: 0, y: 0, width: 200, height: 100, zIndex: 1, properties: {}, children: [{ id: "p", type: "panel", x: 0, y: 0, width: 200, height: 100, zIndex: 1, properties: {}, children: [box("b", 40, 20)] }] } as ScreenObject
  expect(of([switcher], "p")!.width).toBe("its switcher: a panel fills it")
})

test("no such object: nothing to say", () => {
  expect(of([box("a", 10, 10)], "b")).toBeNull()
})
