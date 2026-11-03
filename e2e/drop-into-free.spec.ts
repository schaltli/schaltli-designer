import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { areaDropAt, middleOf, moveIntoArea } from "../lib/drop-into-free"
import { findObjectById, findParentOf, getAbsolutePosition } from "../lib/object-tree"

// Dragging into a free area and out of it - the pure part: which area is
// under the pointer, and the move (docs/2026-11-03-placing.md, which took in
// docs/2026-11-03-drop-into-free.md).

const o = (id: string, type: string, x: number, y: number, width: number, height: number, extra: Partial<ScreenObject> = {}): ScreenObject =>
  ({ id, type, x, y, width, height, zIndex: 1, properties: {}, ...extra }) as ScreenObject

function screen(): ScreenObject[] {
  return [
    o("card", "free", 100, 100, 300, 200, {
      zIndex: 1,
      properties: { look: "card" },
      children: [
        o("inner", "free", 150, 50, 120, 120, { zIndex: 2, children: [o("deep", "text", 10, 10, 50, 20)] }),
        o("head", "text", 10, 10, 100, 20, { zIndex: 3, properties: { dock: "top", anchor: { x: "stretch" }, ownSize: { width: 80 } } }),
      ],
    }),
    o("grid", "table", 500, 100, 200, 100, { zIndex: 2, properties: { grid: 1, columns: [{}], rows: [{}] }, children: [o("cell-card", "free", 0, 0, 200, 100, { properties: { cell: { row: 0, column: 0 } } })] }),
    o("label", "text", 20, 400, 60, 20, { zIndex: 3 }),
    o("switcher", "tab-control", 500, 300, 200, 150, { zIndex: 4, children: [o("panel", "panel", 0, 0, 200, 150, { children: [o("panel-card", "free", 20, 20, 160, 110)] })] }),
  ]
}

test("the middle of what is dragged", () => {
  expect(middleOf([o("a", "text", 0, 0, 10, 10), o("b", "text", 30, 20, 10, 10)])).toEqual({ x: 20, y: 15 })
})

test("into: the innermost area under the pointer, right up to its edge", () => {
  const objects = screen()
  expect(areaDropAt(objects, ["label"], null, { x: 150, y: 150 })).toEqual({ into: "card" })
  expect(areaDropAt(objects, ["label"], null, { x: 320, y: 200 })).toEqual({ into: "inner" })
  expect(areaDropAt(objects, ["label"], null, { x: 101, y: 200 })).toEqual({ into: "card" })
  expect(areaDropAt(objects, ["label"], null, { x: 99, y: 200 })).toBeNull()
  // A card in a table's cell takes it too.
  expect(areaDropAt(objects, ["label"], null, { x: 600, y: 150 })).toEqual({ into: "cell-card" })
  // Not into a switcher's panel from the screen: that is opened to be worked in.
  expect(areaDropAt(objects, ["label"], null, { x: 600, y: 380 })).toBeNull()
})

test("a free area never goes into itself or what it holds", () => {
  const objects = screen()
  expect(areaDropAt(objects, ["card"], null, { x: 320, y: 200 })).toBeNull()
  expect(areaDropAt(objects, ["inner"], "card", { x: 320, y: 200 })).toBeNull()
  expect(moveIntoArea(objects, ["card"], "inner")).toBe(objects)
})

test("out: with the pointer past the area's edge it leaves for the screen, or for another area there", () => {
  const objects = screen()
  expect(areaDropAt(objects, ["head"], "card", { x: 50, y: 50 })).toEqual({ into: null })
  expect(areaDropAt(objects, ["head"], "card", { x: 600, y: 150 })).toEqual({ into: "cell-card" })
  expect(areaDropAt(objects, ["head"], "card", { x: 101, y: 200 })).toBeNull()
  expect(areaDropAt(objects, ["head"], "card", { x: 150, y: 150 })).toBeNull()
  // In a panel's area, out into the panel.
  expect(areaDropAt(objects, [], "panel-card", { x: 505, y: 305 })).toEqual({ into: "panel" })
})

test("moved in and out where it stood on the glass, above the others, without Position or Dock", () => {
  let objects = moveIntoArea(screen(), ["label"], "inner")
  const label = findObjectById(objects, "label")!
  expect(findParentOf(objects, "label")?.parent?.id).toBe("inner")
  expect(getAbsolutePosition(objects, "label")).toEqual({ x: 20, y: 400 })
  expect(label).toMatchObject({ x: 20 - 250, y: 400 - 150, zIndex: 2 })
  objects = moveIntoArea(objects, ["head"], null)
  const head = findObjectById(objects, "head")!
  expect(findParentOf(objects, "head")?.parent).toBeNull()
  expect(head).toMatchObject({ x: 110, y: 110, zIndex: 5 })
  expect(head.properties).toEqual({})
  expect(findObjectById(objects, "card")!.children!.map((c) => c.id)).toEqual(["inner"])
})

test("several at once keep their order", () => {
  const objects = moveIntoArea(
    [o("card", "free", 0, 0, 300, 300, { children: [] }), o("b", "text", 50, 50, 10, 10, { zIndex: 5 }), o("a", "text", 60, 60, 10, 10, { zIndex: 3 })],
    ["b", "a"],
    "card",
  )
  expect(findObjectById(objects, "card")!.children!.map((c) => [c.id, c.zIndex])).toEqual([
    ["a", 1],
    ["b", 2],
  ])
})
