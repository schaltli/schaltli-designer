import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import { arrangeSnapTable } from "../lib/snap-table"
import { layoutProject } from "../lib/layout"
import { migrateProject } from "../lib/object-types"
import { cellAnchorOf, migrateCellAnchor, offsetIn } from "../lib/anchor"

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
