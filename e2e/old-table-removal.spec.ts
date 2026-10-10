import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { migrateProject } from "../lib/object-types"
import { dissolveOldTables } from "../lib/table"

// Old tables dissolved on load (docs/2026-10-09-snap-tables.md, module
// old-table-removal): no migration - each old table, at any depth, becomes
// what it held, where it last stood. No browser.

const box = (id: string, x: number, y: number, zIndex: number, cell?: Record<string, unknown>): ScreenObject => ({
  id,
  type: "box",
  x,
  y,
  width: 20,
  height: 10,
  zIndex,
  properties: { fillColor: "surface", ...(cell ? { cell } : {}) },
})
const oldTable = (id: string, x: number, y: number, zIndex: number, children: ScreenObject[]): ScreenObject => ({
  id,
  type: "table",
  x,
  y,
  width: 200,
  height: 100,
  zIndex,
  properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 2 },
  children,
})
const snapTable = (id: string, children: ScreenObject[]): ScreenObject => ({
  id,
  type: "table",
  x: 300,
  y: 10,
  width: 50,
  height: 20,
  zIndex: 9,
  properties: { grid: 1, columns: [{}], rows: [{}] },
  children,
})

// Where each object stands on the screen: its own x/y and its parents'.
function placesOf(objects: ScreenObject[], dx = 0, dy = 0, out: Record<string, { x: number; y: number }> = {}) {
  for (const o of objects) {
    out[o.id] = { x: dx + o.x, y: dy + o.y }
    placesOf(o.children ?? [], dx + o.x, dy + o.y, out)
  }
  return out
}
const ids = (objects: ScreenObject[]): string[] => objects.flatMap((o) => [o.id, ...ids(o.children ?? [])])
const types = (objects: ScreenObject[]): string[] => objects.flatMap((o) => [o.type, ...types(o.children ?? [])])

test.describe("old tables dissolved", () => {
  // A screen: a free box, an old table holding a box and an old table in a
  // cell, and a table put together by snapping.
  const screen = () => [
    box("free", 5, 5, 0),
    oldTable("outer", 10, 40, 1, [box("a", 4, 4, 0, { row: 0, column: 0 }), oldTable("inner", 60, 4, 1, [box("b", 2, 3, 0, { row: 0, column: 1 })])]),
    snapTable("snap", [box("s", 0, 0, 0, { row: 0, column: 0 })]),
  ]

  test("nested old tables become what they held, each object where it stood on the screen", () => {
    const before = placesOf(screen())
    const out = dissolveOldTables(screen())
    expect(ids(out).sort()).toEqual(["a", "b", "free", "s", "snap"])
    const after = placesOf(out)
    for (const id of ["free", "a", "b", "s"]) expect(after[id], id).toEqual(before[id])
    // Free now: their old cells gone. A table put together by snapping stays as it is.
    for (const id of ["a", "b"]) expect(out.find((o) => o.id === id)!.properties?.cell).toBeUndefined()
    expect(out.find((o) => o.id === "snap")).toEqual({ ...screen()[2], zIndex: expect.any(Number) })
  })

  test("stacking keeps its order: a table's objects where the table stood, in their own order", () => {
    const out = dissolveOldTables(screen())
    const order = [...out].sort((p, q) => p.zIndex - q.zIndex).map((o) => o.id)
    expect(order).toEqual(["free", "a", "b", "snap"])
  })

  test("in a switcher's panel and a free area too", () => {
    const switcher: ScreenObject = {
      id: "sw",
      type: "switcher",
      x: 100,
      y: 100,
      width: 100,
      height: 60,
      zIndex: 0,
      properties: { topic: "t" },
      children: [{ id: "p", type: "panel", x: 0, y: 0, width: 100, height: 60, zIndex: 0, properties: {}, children: [oldTable("in-panel", 5, 6, 0, [box("c", 1, 2, 0, { row: 0, column: 0 })])] }],
    }
    const free: ScreenObject = { id: "f", type: "free", x: 0, y: 200, width: 100, height: 60, zIndex: 1, properties: {}, children: [oldTable("in-free", 3, 3, 0, [box("d", 1, 1, 0, { row: 0, column: 0 })])] }
    const before = placesOf([switcher, free])
    const out = dissolveOldTables([switcher, free])
    expect(types(out)).not.toContain("table")
    const after = placesOf(out)
    expect(after.c).toEqual(before.c)
    expect(after.d).toEqual(before.d)
  })

  test("a list without an old table comes back as it was, the same list", () => {
    const list = [box("x", 0, 0, 0), snapTable("snap", [box("s", 0, 0, 0, { row: 0, column: 0 })])]
    expect(dissolveOldTables(list)).toBe(list)
  })

  test("a project opened is one without old tables, every object where it was; opened again it changes nothing more", () => {
    const project = () => ({ settings: {}, screens: [{ id: "s1", objects: screen() }] })
    const before = placesOf(project().screens[0].objects)
    const once = migrateProject(project())
    const objects = once.screens[0].objects as ScreenObject[]
    expect(types(objects).filter((t) => t === "table")).toHaveLength(1)
    const after = placesOf(objects)
    for (const id of ["free", "a", "b", "s"]) expect(after[id], id).toEqual(before[id])
    const twice = migrateProject(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })
})
