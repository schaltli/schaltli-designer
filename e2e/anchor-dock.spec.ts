import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import { arrangeSnapTable, takeOutOf } from "../lib/snap-table"
import { layoutProject } from "../lib/layout"
import { migrateProject } from "../lib/object-types"
import { areaAnchorOf, cellAnchorOf, migrateCellAnchor, offsetIn, resizeFree, withUpdates } from "../lib/anchor"

// Horizontal and Vertical (docs/2026-11-03-anchor-dock.md): how an object
// stands in its cell, and - from Task 2 - in a free area.

const SCALE = { pixelsPerMm: 5 }

test.describe("anchor: the model", () => {
  test("offsetIn: start, end, centre and stretch on a room", () => {
    expect(offsetIn(100, 20, "left")).toBe(0)
    expect(offsetIn(100, 20, "top")).toBe(0)
    expect(offsetIn(100, 20, "right")).toBe(80)
    expect(offsetIn(100, 20, "bottom")).toBe(80)
    expect(offsetIn(100, 20, "center")).toBe(40)
    expect(offsetIn(100, 21, "middle")).toBe(40)
    expect(offsetIn(100, 100, "stretch")).toBe(0)
  })

  test("a cell's defaults: a text Left, anything else Center; Middle", () => {
    const o = (type: string, cell: Record<string, unknown> = {}) => ({ id: "o", type, x: 0, y: 0, width: 1, height: 1, zIndex: 0, properties: { cell } }) as ScreenObject
    expect(cellAnchorOf(o("text"))).toEqual({ x: "left", y: "middle" })
    expect(cellAnchorOf(o("button"))).toEqual({ x: "center", y: "middle" })
    expect(cellAnchorOf(o("button", { anchor: { y: "bottom" } }))).toEqual({ x: "center", y: "bottom" })
    // A cell saved before 2026-11-03 that reaches the layout unmigrated reads the same.
    expect(cellAnchorOf(o("box", { align: "right", fill: { height: true } }))).toEqual({ x: "right", y: "stretch" })
  })

  test("migrateCellAnchor: Fill wins on its axis, a text's Align becomes its textAlign, a current cell is left alone", () => {
    const box = { type: "box", properties: { cell: { row: 1, column: 2, align: "right", alignY: "top", fill: { width: true }, drawnWidth: 30 } } }
    expect(migrateCellAnchor(box)).toBe(true)
    expect(box.properties.cell).toEqual({ row: 1, column: 2, anchor: { x: "stretch", y: "top" }, drawnWidth: 30 })
    const text = { type: "text", properties: { text: "Bad", textAlign: "left", cell: { row: 0, column: 0, align: "right" } } }
    expect(migrateCellAnchor(text)).toBe(true)
    expect(text.properties).toEqual({ text: "Bad", textAlign: "right", cell: { row: 0, column: 0 } })
    const current = { type: "box", properties: { cell: { row: 0, column: 0, anchor: { x: "right" } } } }
    expect(migrateCellAnchor(current)).toBe(false)
    expect(migrateCellAnchor({ type: "box", properties: {} })).toBe(false)
  })
})

// Every way Align, Vertical align and Fill could stand in a cell, laid out by
// the code before 2026-11-03 and recorded in the fixture: a project saved
// then opens with every object on the same pixels.
const FIXTURE = path.join(__dirname, "..", "lib", "fixtures", "cells-before-anchor.json")

const ALIGNS = [undefined, "left", "center", "right"]
const ALIGNS_Y = [undefined, "top", "middle", "bottom"]
const FILLS = [undefined, { width: true }, { height: true }, { width: true, height: true }]

function oldProject() {
  const children: Record<string, any>[] = []
  let i = 0
  for (const align of ALIGNS)
    for (const alignY of ALIGNS_Y)
      for (const fill of FILLS) {
        const cell: Record<string, any> = { row: Math.floor(i / 8), column: i % 8 }
        if (align) cell.align = align
        if (alignY) cell.alignY = alignY
        if (fill) cell.fill = fill
        children.push({ id: `box-${i}`, type: "box", x: 0, y: 0, width: 20 + (i % 3) * 5, height: 10 + (i % 2) * 4, zIndex: i, properties: { cell } })
        i++
      }
  // A text with an Align, across two cells; a button filling a span of three.
  children.push({ id: "text", type: "text", x: 0, y: 0, width: 30, height: 18, zIndex: i++, properties: { text: "Bad", textStyle: "label", cell: { row: 8, column: 0, columnSpan: 2, align: "right" } } })
  children.push({ id: "text-centre", type: "text", x: 0, y: 0, width: 30, height: 18, zIndex: i++, properties: { text: "Licht", textStyle: "label", cell: { row: 8, column: 2, align: "center", alignY: "bottom" } } })
  children.push({ id: "button", type: "button", x: 0, y: 0, width: 40, height: 20, zIndex: i++, properties: { text: "Weiter", cell: { row: 8, column: 3, columnSpan: 3, fill: { width: true } } } })
  const table = { id: "grid", type: "table", x: 10, y: 20, width: 1, height: 1, zIndex: 0, properties: { grid: 1, columns: Array.from({ length: 8 }, () => ({ mm: 12 })), rows: Array.from({ length: 9 }, () => ({ mm: 7 })) }, children }
  return { settings: { pixelsPerMm: SCALE.pixelsPerMm }, screens: [{ id: "s1", name: "S", objects: [table] }] }
}

const placed = (project: any) =>
  Object.fromEntries(
    project.screens[0].objects
      .find((o: any) => o.id === "grid")
      .children.map((c: any) => [c.id, { x: c.x, y: c.y, width: c.width, height: c.height, ...(c.type === "text" ? { textAlign: c.properties.textAlign ?? "left" } : {}) }]),
  )

test.describe("anchor: old cells", () => {
  // Run once against the code before the change, with ANCHOR_RECORD=1.
  test("record the layout of the old cells", () => {
    test.skip(!process.env.ANCHOR_RECORD, "only to record the fixture")
    fs.writeFileSync(FIXTURE, JSON.stringify(placed(layoutProject(oldProject() as any)), null, 1) + "\n")
  })

  test("a project saved with Align, Vertical align and Fill opens with every object on the same pixels", () => {
    const before = JSON.parse(fs.readFileSync(FIXTURE, "utf8"))
    const project = migrateProject(oldProject() as any)
    const grid = project.screens[0].objects.find((o: any) => o.id === "grid") as any
    for (const c of grid.children) {
      expect(c.properties.cell, c.id).not.toHaveProperty("align")
      expect(c.properties.cell, c.id).not.toHaveProperty("alignY")
      expect(c.properties.cell, c.id).not.toHaveProperty("fill")
    }
    expect(placed(layoutProject(project as any))).toEqual(before)
  })

  test("laying out a migrated table again moves nothing", () => {
    const project = layoutProject(migrateProject(oldProject() as any) as any)
    const grid = project.screens[0].objects.find((o: any) => o.id === "grid") as ScreenObject
    expect(arrangeSnapTable(grid, SCALE).children).toEqual(grid.children)
  })
})

// ---------------------------------------------------------------------------
// Task 2: in a free area.

const obj = (id: string, type: string, x: number, y: number, width: number, height: number, properties: Record<string, any> = {}): ScreenObject =>
  ({ id, type, x, y, width, height, zIndex: 0, properties }) as ScreenObject
const area = (children: ScreenObject[], width = 100, height = 60) => ({ ...obj("area", "free", 10, 20, width, height), children })
const kid = (a: ScreenObject, id: string) => a.children!.find((c) => c.id === id)!
const at = (o: ScreenObject) => [o.x, o.y, o.width, o.height]

test.describe("anchor: in a free area", () => {
  test("the default is Left/Top, and an untouched area's objects stay where they are", () => {
    expect(areaAnchorOf(obj("b", "box", 0, 0, 1, 1))).toEqual({ x: "left", y: "top" })
    const a = resizeFree(area([obj("b", "box", 30, 10, 20, 10)]), 160, 90)
    expect(at(kid(a, "b"))).toEqual([30, 10, 20, 10])
    expect([a.width, a.height]).toEqual([160, 90])
  })

  test("Right/Bottom keep their distance to that edge, Center/Middle their offset from the middle, Stretch grows", () => {
    const a = resizeFree(
      area([
        obj("rb", "box", 70, 40, 20, 10, { anchor: { x: "right", y: "bottom" } }),
        obj("cm", "box", 40, 25, 20, 10, { anchor: { x: "center", y: "middle" } }),
        obj("st", "box", 10, 5, 80, 10, { anchor: { x: "stretch", y: "stretch" } }),
      ]),
      160,
      90,
    )
    expect(at(kid(a, "rb"))).toEqual([130, 70, 20, 10])
    expect(at(kid(a, "cm"))).toEqual([70, 40, 20, 10])
    expect(at(kid(a, "st"))).toEqual([10, 5, 140, 40])
    // Smaller again: back where they were.
    const back = resizeFree(a, 100, 60)
    expect(at(kid(back, "rb"))).toEqual([70, 40, 20, 10])
    expect(at(kid(back, "cm"))).toEqual([40, 25, 20, 10])
    expect(at(kid(back, "st"))).toEqual([10, 5, 80, 10])
  })

  test("a resize to the same size moves nothing; a line moves with its points; an area in it is resized too", () => {
    const a = area([
      obj("ln", "line", 70, 40, 20, 0, { anchor: { x: "right" }, points: [{ x: 70, y: 40 }, { x: 90, y: 40 }] }),
      { ...obj("inner", "free", 10, 10, 50, 30, { anchor: { x: "stretch" } }), children: [obj("deep", "box", 30, 5, 10, 10, { anchor: { x: "right" } })] },
    ])
    expect(resizeFree(a, 100, 60).children).toBe(a.children)
    const r = resizeFree(a, 130, 60)
    expect(kid(r, "ln").properties!.points).toEqual([{ x: 100, y: 40 }, { x: 120, y: 40 }])
    expect(at(kid(r, "inner"))).toEqual([10, 10, 80, 30])
    expect(at(kid(kid(r, "inner"), "deep"))).toEqual([60, 5, 10, 10])
  })

  test("every edit of a free area's size takes its objects along: withUpdates", () => {
    const a = area([obj("rb", "box", 70, 40, 20, 10, { anchor: { x: "right", y: "bottom" } })])
    expect(at(kid(withUpdates(a, { width: 120 }), "rb"))).toEqual([90, 40, 20, 10])
    // Moving it or changing anything else leaves them; so does an edit that brings its children.
    expect(withUpdates(a, { x: 50 }).children).toBe(a.children)
    const given = [obj("rb", "box", 0, 0, 1, 1)]
    expect(withUpdates(a, { width: 120, children: given }).children).toBe(given)
    // Anything else just takes the update.
    expect(withUpdates(obj("b", "box", 0, 0, 10, 10), { width: 30 }).width).toBe(30)
  })

  test("a free area stretched in its cell takes its objects along, and back again when taken out", () => {
    const wide = { ...obj("wide", "box", 0, 0, 150, 10), properties: { cell: { row: 0, column: 0 } } }
    const inCell = { ...area([obj("rb", "box", 70, 40, 20, 10, { anchor: { x: "right" } })]), properties: { cell: { row: 1, column: 0, anchor: { x: "stretch" } } } }
    const t = { ...obj("t", "table", 0, 0, 1, 1, { grid: 1, columns: [{}], rows: [{}, {}] }), children: [wide, inCell, { ...obj("x", "box", 0, 0, 10, 10), properties: { cell: { row: 1, column: 1 } } }] }
    t.properties!.columns = [{}, {}]
    const once = arrangeSnapTable(t, SCALE)
    const stretched = kid(once, "area")
    expect(stretched.width).toBe(150)
    expect(kid(stretched, "rb").x).toBe(120)
    // Laid out again: nothing moves.
    expect(kid(kid(arrangeSnapTable(once, SCALE), "area"), "rb").x).toBe(120)
    // Taken out, it is as drawn, its object back at its distance to the right edge.
    const out = takeOutOf(once, "area")
    expect(out.taken.width).toBe(100)
    expect(kid(out.taken, "rb").x).toBe(70)
  })
})
