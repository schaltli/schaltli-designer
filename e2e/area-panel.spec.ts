import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, layoutProject, layoutScaleOf } from "../lib/layout"
import { withCardsGrown, switcherMinSize } from "../lib/free-min-size"
import { withUpdates } from "../lib/anchor"
import { arrangeSnapTable } from "../lib/snap-table"

// A switcher's panel is an area (docs/2026-11-16-areas.md, step 1): what
// stands in it docks, keeps its Position and stays inside its padding, as in
// an area standing alone; the panel has its switcher's size, and the
// switcher is as large as its largest panel needs (E2). No browser.

const SCALE = { pixelsPerMm: 4 }
const GAP = 6 // 1.5 mm, an area's gap unless set

let ids = 0
const box = (x: number, y: number, width: number, height: number, properties: Record<string, unknown> = {}): ScreenObject => ({
  id: `b${++ids}`,
  type: "box",
  x,
  y,
  width,
  height,
  zIndex: ids,
  properties,
})
const panel = (children: ScreenObject[], properties: Record<string, unknown> = {}): ScreenObject => ({
  id: `p${++ids}`,
  type: "panel",
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  zIndex: ids,
  properties,
  children,
})
const switcher = (width: number, height: number, panels: ScreenObject[], at = { x: 20, y: 30 }): ScreenObject => ({
  id: `s${++ids}`,
  type: "switcher",
  ...at,
  width,
  height,
  zIndex: ids,
  properties: {},
  children: panels,
})
const rect = (o: ScreenObject) => ({ x: o.x, y: o.y, width: o.width, height: o.height })
const laidOut = (obj: ScreenObject) => layoutObjects([obj], SCALE)[0]
const project = (objects: ScreenObject[]) => ({ name: "p", settings: { pixelsPerMm: 4 }, screens: [{ id: "s1", objects }] })
const opened = (objects: ScreenObject[]) => {
  const laid = layoutProject(project(objects))
  return withCardsGrown(laid, layoutScaleOf(laid), layoutProject).screens[0].objects
}

test.describe("a panel is an area", () => {
  test("a panel fills its switcher, wherever the switcher stands", () => {
    const s = laidOut(switcher(200, 100, [panel([box(10, 10, 40, 20)]), panel([])]))
    expect(s.children!.map(rect)).toEqual([
      { x: 0, y: 0, width: 200, height: 100 },
      { x: 0, y: 0, width: 200, height: 100 },
    ])
    // What stood in it stays where it stood.
    expect(rect(s.children![0].children![0])).toEqual({ x: 10, y: 10, width: 40, height: 20 })
  })

  test("docked Top, Bottom and Fill: placed inside the panel's padding, the gap between", () => {
    const top = box(0, 0, 30, 20, { dock: "top" })
    const bottom = box(0, 0, 30, 10, { dock: "bottom" })
    const fill = box(0, 0, 30, 30, { dock: "fill" })
    const s = laidOut(switcher(200, 100, [panel([top, bottom, fill], { padding: 2 })]))
    const [t, b, f] = s.children![0].children!
    expect(rect(t)).toEqual({ x: 8, y: 8, width: 184, height: 20 })
    expect(rect(b)).toEqual({ x: 8, y: 82, width: 184, height: 10 })
    expect(rect(f)).toEqual({ x: 8, y: 8 + 20 + GAP, width: 184, height: 100 - 16 - 20 - 10 - 2 * GAP })
  })

  test("docked Left and Right: across the panel's height", () => {
    const left = box(0, 0, 30, 20, { dock: "left" })
    const right = box(0, 0, 40, 20, { dock: "right" })
    const s = laidOut(switcher(200, 100, [panel([left, right])]))
    const [l, r] = s.children![0].children!
    expect(rect(l)).toEqual({ x: 0, y: 0, width: 30, height: 100 })
    expect(rect(r)).toEqual({ x: 160, y: 0, width: 40, height: 100 })
  })

  test("the switcher made larger: what stands in a panel follows by its Position", () => {
    const right = box(150, 10, 40, 20, { anchor: { x: "right" } })
    const stretch = box(10, 40, 180, 20, { anchor: { x: "stretch", y: "bottom" } })
    const still = box(10, 10, 40, 20)
    const before = laidOut(switcher(200, 100, [panel([right, stretch, still])]))
    const after = laidOut(withUpdates(before, { width: 260, height: 130 }))
    const [r, s, k] = after.children![0].children!
    expect(rect(r)).toEqual({ x: 210, y: 10, width: 40, height: 20 })
    expect(rect(s)).toEqual({ x: 10, y: 70, width: 240, height: 20 })
    expect(rect(k)).toEqual({ x: 10, y: 10, width: 40, height: 20 })
  })

  test("laid out twice, nothing changes", () => {
    const objects = [switcher(200, 100, [panel([box(0, 0, 30, 20, { dock: "top" }), box(150, 30, 40, 20, { anchor: { x: "right" } })], { padding: 1 })])]
    const once = layoutProject(project(objects))
    expect(layoutProject(once)).toBe(once)
    const grown = withCardsGrown(once, layoutScaleOf(once), layoutProject)
    expect(grown).toBe(once)
  })
})

test.describe("a switcher holds its panels (E2)", () => {
  test("an object past a panel's right and bottom edge: the switcher grows to hold it, its corner stays", () => {
    const [s] = opened([switcher(200, 100, [panel([box(180, 90, 40, 30)]), panel([box(0, 0, 10, 10)])])])
    expect(rect(s)).toEqual({ x: 20, y: 30, width: 220, height: 120 })
    // Every panel has the switcher's size.
    expect(s.children!.map((p) => [p.width, p.height])).toEqual([
      [220, 120],
      [220, 120],
    ])
  })

  test("as large as the largest of its panels needs", () => {
    const [s] = opened([switcher(100, 50, [panel([box(0, 0, 150, 20)]), panel([box(0, 0, 20, 90)])])])
    expect([s.width, s.height]).toEqual([150, 90])
  })

  test("past a panel's left or top edge: the object is moved in", () => {
    const [s] = opened([switcher(200, 100, [panel([box(-15, -5, 40, 20)])])])
    expect(rect(s)).toEqual({ x: 20, y: 30, width: 200, height: 100 })
    expect(rect(s.children![0].children![0])).toEqual({ x: 0, y: 0, width: 40, height: 20 })
  })

  test("padding counts: an object standing in the padding on the right makes the switcher grow by it", () => {
    const [s] = opened([switcher(200, 100, [panel([box(150, 10, 46, 20)], { padding: 2 })])])
    expect(s.width).toBe(150 + 46 + 8)
  })

  test("the smallest size: where every panel still holds what is in it", () => {
    const s = laidOut(switcher(200, 100, [panel([box(10, 10, 40, 20)]), panel([box(30, 5, 100, 60)])]))
    expect(switcherMinSize(s, SCALE)).toEqual({ width: 130, height: 65 })
    expect(switcherMinSize(laidOut(switcher(200, 100, [panel([])])), SCALE)).toBeUndefined()
  })

  test("a switcher with nothing over an edge is left as it is", () => {
    const objects = [switcher(200, 100, [panel([box(10, 10, 40, 20)])])]
    const laid = layoutProject(project(objects))
    expect(withCardsGrown(laid, layoutScaleOf(laid), layoutProject)).toBe(laid)
  })
})

test.describe("a switcher in a table", () => {
  const inTable = (s: ScreenObject): ScreenObject => ({
    id: `t${++ids}`,
    type: "table",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    zIndex: ids,
    properties: { grid: 1, columns: [{}], rows: [{}] },
    children: [{ ...s, properties: { ...s.properties, cell: { row: 0, column: 0 } } }],
  })

  test("as tall as its panel's content, as before", () => {
    const t = arrangeSnapTable(inTable(switcher(200, 100, [panel([box(0, 0, 120, 40)])])), SCALE)
    expect([t.children![0].width, t.children![0].height]).toEqual([120, 40])
  })

  test("with a docked panel: as tall as that needs, and the same on the next pass", () => {
    const s = switcher(200, 100, [panel([box(0, 0, 120, 20, { dock: "top" }), box(0, 0, 120, 30, { dock: "top" })], { padding: 1 })])
    const once = layoutProject(project([inTable(s)]))
    const height = once.screens[0].objects[0].children![0].height
    expect(height).toBe(4 + 20 + GAP + 30 + 4)
    expect(layoutProject(once)).toBe(once)
  })
})
