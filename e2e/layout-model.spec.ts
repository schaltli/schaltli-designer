import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, contentHeight, DEFAULT_PADDING_MM, DEFAULT_GAP_MM } from "../lib/layout"
import { stepUpdates } from "../lib/size-scale"
import { childOrigin } from "../lib/object-groups"
import { getAbsolutePosition, collectObjectTypes } from "../lib/object-tree"

// Layout containers (docs/2026-10-02-layout.md, module layout-model): the
// layout computation on its own, no browser. Positions follow from the
// container; heights from the objects - a control's from its size step, as
// the size scale keeps it in `height`.

const SCALE = { pixelsPerMm: 5 }
const PAD = Math.round(DEFAULT_PADDING_MM * SCALE.pixelsPerMm)
const GAP = Math.round(DEFAULT_GAP_MM * SCALE.pixelsPerMm)

let ids = 0
function obj(type: ScreenObject["type"], fields: Partial<ScreenObject> = {}): ScreenObject {
  return { id: `o${++ids}`, type, x: 0, y: 0, width: 50, height: 20, properties: {}, zIndex: ids, ...fields }
}

/** A control at a size step, as the size scale makes it. */
function stepped(type: ScreenObject["type"], step: "s" | "m" | "l"): ScreenObject {
  const base = obj(type, { width: 60, properties: { states: [{ id: "a", label: "An" }, { id: "b", label: "Aus" }] } })
  return { ...base, ...stepUpdates(base, step, SCALE.pixelsPerMm, []) }
}

test.describe("layout: the vertical stack", () => {
  test("children one under another, each the stack's inner width, heights their own", () => {
    const text = obj("text", { height: 18, width: 30 })
    const toggle = stepped("switch", "m")
    const buttons = stepped("button-group", "m")
    const stack = obj("vertical-stack", { x: 10, y: 20, width: 200, height: 300, children: [text, toggle, buttons] })

    const [laid] = layoutObjects([stack], SCALE)
    const [a, b, c] = laid.children!
    // The stack itself keeps where and how big it is.
    expect([laid.x, laid.y, laid.width, laid.height]).toEqual([10, 20, 200, 300])
    for (const child of [a, b, c]) {
      expect(child.x).toBe(PAD)
      expect(child.width).toBe(200 - 2 * PAD)
    }
    expect(a.y).toBe(PAD)
    expect(b.y).toBe(a.y + a.height + GAP)
    expect(c.y).toBe(b.y + b.height + GAP)
    // Heights are the objects' own: the text's, and the size step's.
    expect([a.height, b.height, c.height]).toEqual([18, toggle.height, buttons.height])
  })

  test("a bigger size step makes it taller, and nothing overlaps", () => {
    const toggle = stepped("switch", "s")
    const below = stepped("button-group", "s")
    const stack = obj("vertical-stack", { width: 200, height: 300, children: [toggle, below] })
    const small = layoutObjects([stack], SCALE)[0].children!

    // S to L, as the property panel does it, then laid out again.
    const larger = { ...toggle, ...stepUpdates(toggle, "l", SCALE.pixelsPerMm, []) }
    const big = layoutObjects([{ ...stack, children: [larger, below] }], SCALE)[0].children!
    expect(big[0].height).toBeGreaterThan(small[0].height)
    expect(big[1].y).toBe(big[0].y + big[0].height + GAP)
    expect(big[1].y).toBeGreaterThan(small[1].y)
  })

  test("aligned instead of stretched: a child keeps its width, placed at start, centre or end", () => {
    const child = obj("text", { width: 40 })
    const inner = 200 - 2 * PAD
    for (const [align, x] of [
      ["start", PAD],
      ["centre", PAD + Math.round((inner - 40) / 2)],
      ["end", PAD + inner - 40],
    ] as const) {
      const [laid] = layoutObjects([obj("vertical-stack", { width: 200, properties: { align }, children: [child] })], SCALE)
      expect(laid.children![0]).toMatchObject({ x, width: 40 })
    }
  })

  test("spacing in millimetres, per stack", () => {
    const child = obj("text")
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, properties: { paddingMm: 0, gapMm: 4 }, children: [child, obj("text")] })], SCALE)
    expect(laid.children![0]).toMatchObject({ x: 0, y: 0, width: 200 })
    expect(laid.children![1].y).toBe(20 + 4 * SCALE.pixelsPerMm)
  })

  test("a stack in a stack is as tall as what it holds", () => {
    const inner = obj("vertical-stack", { height: 999, children: [obj("text", { height: 18 }), obj("text", { height: 22 })] })
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, height: 300, children: [inner, obj("text")] })], SCALE)
    const nested = laid.children![0]
    expect(nested.height).toBe(2 * PAD + 18 + 22 + GAP)
    expect(nested.height).toBe(contentHeight(nested, SCALE))
    // Its own children are laid out at the width it was given.
    expect(nested.children![0].width).toBe(nested.width - 2 * PAD)
    expect(laid.children![1].y).toBe(nested.y + nested.height + GAP)
  })
})

test.describe("layout: what it leaves alone", () => {
  test("a free container's children keep their own geometry", () => {
    const placed = obj("box", { x: 33, y: 44, width: 55, height: 66 })
    const [laid] = layoutObjects([obj("free", { width: 400, height: 300, children: [placed] })], SCALE)
    expect(laid.children![0]).toEqual(placed)
  })

  test("objects outside a container are untouched, and a stack deep inside a group is laid out", () => {
    const loose = obj("text", { x: 7, y: 8 })
    const deep = obj("vertical-stack", { width: 100, children: [obj("text")] })
    const [same, group] = layoutObjects([loose, obj("group", { children: [deep] })], SCALE)
    expect(same).toEqual(loose)
    expect(group.children![0].children![0]).toMatchObject({ x: PAD, y: PAD, width: 100 - 2 * PAD })
  })

  test("no device has to draw a container: they are left out of the types a project uses", () => {
    const screen = [obj("free", { children: [obj("vertical-stack", { children: [obj("switch"), obj("grid", { children: [obj("text")] })] })] })]
    expect([...collectObjectTypes(screen)].sort()).toEqual(["switch", "text"])
  })

  test("a panel fills its switcher at its origin, so every rule finds its children in one place", () => {
    // childOrigin skips a panel's x and y, getAbsolutePosition adds them: once
    // laid out, a panel's x and y are 0 and the two agree.
    const child = obj("text", { x: 12, y: 9 })
    const panel = obj("panel", { x: 5, y: 7, width: 1, height: 1, children: [child] })
    const [switcher] = layoutObjects([obj("switcher", { x: 100, y: 50, width: 160, height: 120, children: [panel] })], SCALE)
    expect(switcher.children![0]).toMatchObject({ x: 0, y: 0, width: 160, height: 120 })
    const origin = childOrigin([switcher], panel.id)
    expect(getAbsolutePosition([switcher], child.id)).toEqual({ x: origin.x + 12, y: origin.y + 9 })
  })
})
