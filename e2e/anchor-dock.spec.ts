import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import { arrangeSnapTable, takeOutOf } from "../lib/snap-table"
import { layoutProject, layoutObjects } from "../lib/layout"
import { dockFree, dockSets } from "../lib/dock"
import { dissolveGroups } from "../lib/object-groups"
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

// ---------------------------------------------------------------------------
// Task 3: Padding and Dock.

// At 5 px/mm: padding 2 mm is 10 px, the gap 1.5 mm is 8 px.
const PAD = 10
const G = Math.round(1.5 * SCALE.pixelsPerMm)
// zIndex decides the list's order: the highest stands at the top of the list
// and docks first.
const docked = (id: string, type: string, w: number, h: number, dock: string, z: number, extra: Record<string, any> = {}): ScreenObject =>
  ({ id, type, x: 0, y: 0, width: w, height: h, zIndex: z, properties: { dock, ...extra } }) as ScreenObject
const card = (children: ScreenObject[], width = 200, height = 120) =>
  ({ ...obj("card", "free", 0, 0, width, height, { padding: 2 }), children }) as ScreenObject

test.describe("dock: in a free area", () => {
  test("Top, Bottom, Left, Right and Fill in the list's order, inside the padding, the gap between", () => {
    const a = dockFree(
      card([
        docked("head", "box", 40, 20, "top", 5),
        docked("foot", "box", 40, 10, "bottom", 4),
        docked("side", "box", 30, 40, "left", 3),
        docked("east", "box", 20, 40, "right", 2),
        docked("body", "box", 10, 10, "fill", 1),
      ]),
      SCALE,
    )
    const inner = 200 - 2 * PAD
    expect(at(kid(a, "head"))).toEqual([PAD, PAD, inner, 20])
    expect(at(kid(a, "foot"))).toEqual([PAD, 120 - PAD - 10, inner, 10])
    const top = PAD + 20 + G
    const height = 120 - PAD - 10 - G - top
    expect(at(kid(a, "side"))).toEqual([PAD, top, 30, height])
    expect(at(kid(a, "east"))).toEqual([200 - PAD - 20, top, 20, height])
    expect(at(kid(a, "body"))).toEqual([PAD + 30 + G, top, inner - 30 - 20 - 2 * G, height])
  })

  test("across the dock an object that cannot stretch stands by its Horizontal; a text spans; a table is stretched", () => {
    const icon = docked("icon", "icon", 16, 16, "top", 3, { anchor: { x: "right" } })
    const text = docked("title", "text", 30, 18, "top", 2, { text: "Batterie" })
    const t = { ...docked("grid", "table", 1, 1, "top", 1, { grid: 1, columns: [{}, {}], rows: [{}] }), children: [
      { ...obj("l", "box", 0, 0, 20, 10), properties: { cell: { row: 0, column: 0 } } },
      { ...obj("r", "box", 0, 0, 20, 10), properties: { cell: { row: 0, column: 1, anchor: { x: "stretch" } } } },
    ] } as ScreenObject
    const a = dockFree(card([icon, text, t]), SCALE)
    expect(at(kid(a, "icon"))).toEqual([200 - PAD - 16, PAD, 16, 16])
    expect(kid(a, "title").width).toBe(200 - 2 * PAD)
    expect(kid(a, "grid").width).toBe(200 - 2 * PAD)
  })

  // «Unser Bus», 2026-11-14: the value card «Innen» kept its name 34 px tall
  // in an 18 px font - the panel showed 18 and locked it, the dock took 34.
  test("a docked text of one line is as tall as its font's line, whatever height it was saved with", () => {
    const fonts = [{ id: "m18", name: "m18", size: 18, ascent: 14, descent: 4 }] as any
    const name = docked("name", "text", 30, 34, "top", 2, { text: "Innen", fontId: "m18", fontSize: 18 })
    const two = docked("two", "text", 30, 40, "top", 3, { text: "Zwei\nZeilen", fontId: "m18", fontSize: 18 })
    const body = docked("body", "box", 10, 10, "fill", 1)
    const a = dockFree(card([two, name, body]), { ...SCALE, fonts })
    expect(at(kid(a, "name"))).toEqual([PAD, PAD + 40 + G, 200 - 2 * PAD, 18])
    expect(kid(a, "name").properties).not.toHaveProperty("ownSize.height")
    // The rest follows right below it.
    expect(kid(a, "body").y).toBe(PAD + 40 + G + 18 + G)
    // Several lines keep their height.
    expect(kid(a, "two").height).toBe(40)
    // Without the fonts (a scale that has none) as before.
    expect(kid(dockFree(card([name]), SCALE), "name").height).toBe(34)
  })

  // The user, 2026-11-14: the 1.5 mm between «Innen» and its table wasted room - a setting on the area.
  test("the area's Gap between what is docked: 1.5 mm unless set, 0 puts them edge to edge", () => {
    const parts = () => [docked("head", "box", 40, 20, "top", 3), docked("foot", "box", 40, 10, "bottom", 2), docked("body", "box", 10, 10, "fill", 1)]
    const flush = dockFree({ ...card(parts()), properties: { padding: 2, gapMm: 0 } } as ScreenObject, SCALE)
    expect(kid(flush, "body").y).toBe(PAD + 20)
    expect(kid(flush, "body").height).toBe(120 - 2 * PAD - 20 - 10)
    const half = dockFree({ ...card(parts()), properties: { padding: 2, gapMm: 0.5 } } as ScreenObject, SCALE)
    expect(kid(half, "body").y).toBe(PAD + 20 + Math.round(0.5 * SCALE.pixelsPerMm))
    expect(kid(dockFree(card(parts()), SCALE), "body").y).toBe(PAD + 20 + G)
  })

  test("too little room: what can be cut is cut along the dock, what cannot is left out of export and preview", () => {
    const a = dockFree(
      card([docked("head", "text", 50, 18, "top", 3, { text: "Kopf" }), docked("big", "box", 50, 200, "top", 2), docked("late", "text", 50, 18, "top", 1, { text: "Rest" })], 200, 60),
      SCALE,
    )
    // The box is cut to what is left; the text after it has no room and is left out.
    expect(kid(a, "big").height).toBe(60 - 2 * PAD - 18 - G)
    expect(kid(a, "big").properties!.ownSize).toEqual({ width: 50, height: 200 })
    expect(kid(a, "late").properties!.dockedOut).toBe(true)
    expect(kid(a, "head").properties!.dockedOut).toBeUndefined()
    const exported = dissolveGroups([a]).map((o) => o.id)
    expect(exported).toContain("big")
    expect(exported).not.toContain("late")
    // Made larger again, the box has its own height back and the text is in.
    const larger = dockFree({ ...a, height: 400 }, SCALE)
    expect(kid(larger, "big").height).toBe(200)
    expect(kid(larger, "big").properties!.ownSize).toEqual({ width: 50 })
    expect(kid(larger, "late").properties).not.toHaveProperty("dockedOut")
  })

  test("undocked, an object has its own size back; docking again and laying out twice changes nothing", () => {
    const a = dockFree(card([docked("head", "box", 40, 20, "top", 1)]), SCALE)
    expect(kid(a, "head").properties!.ownSize).toEqual({ width: 40 })
    const { dock: _d, ...rest } = kid(a, "head").properties!
    const freed = dockFree({ ...a, children: [{ ...kid(a, "head"), properties: rest }] }, SCALE)
    expect([kid(freed, "head").width, kid(freed, "head").height]).toEqual([40, 20])
    expect(kid(freed, "head").properties).toEqual({})
    expect(dockFree(a, SCALE)).toEqual(a)
    const once = layoutObjects([card([docked("head", "box", 40, 20, "top", 2), docked("body", "box", 10, 10, "fill", 1)])], SCALE)
    expect(layoutObjects(once, SCALE)).toEqual(once)
  })

  test("a resized area docks again; anchors leave docked objects to the dock", () => {
    const a = dockFree(card([docked("head", "box", 40, 20, "top", 1), obj("free", "box", 150, 90, 20, 10, { anchor: { x: "right" } })]), SCALE)
    const wider = layoutObjects([withUpdates(a, { width: 300 })], SCALE)[0]
    expect(kid(wider, "head").width).toBe(300 - 2 * PAD)
    expect(kid(wider, "free").x).toBe(250)
  })

  test("what docking sets of the frame: x and y, and the size across where it stretches", () => {
    expect(dockSets(docked("b", "box", 1, 1, "top", 0))).toEqual(["x", "y", "width"])
    expect(dockSets(docked("i", "icon", 1, 1, "top", 0))).toEqual(["x", "y"])
    expect(dockSets(docked("b", "box", 1, 1, "fill", 0))).toEqual(["x", "y", "width", "height"])
    expect(dockSets(docked("b", "box", 1, 1, "left", 0))).toEqual(["x", "y", "height"])
    expect(dockSets(obj("b", "box", 0, 0, 1, 1))).toEqual([])
  })
})
