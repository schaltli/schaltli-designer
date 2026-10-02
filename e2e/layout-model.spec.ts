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

test.describe("layout: the horizontal stack", () => {
  const inner = 300 - 2 * PAD
  const three = () => [obj("text", { width: 40, height: 18 }), stepped("switch", "m"), obj("text", { width: 30, height: 30 })]

  test("side by side, each its own width and height, as tall as the tallest", () => {
    const children = three()
    const [laid] = layoutObjects([obj("horizontal-stack", { width: 300, height: 999, children })], SCALE)
    const [a, b, c] = laid.children!
    expect(a).toMatchObject({ x: PAD, y: PAD, width: 40, height: 18 })
    expect(b.x).toBe(a.x + a.width + GAP)
    expect(c.x).toBe(b.x + b.width + GAP)
    // Heights stay the objects' own - a switch keeps its size step.
    expect(b.height).toBe(children[1].height)
    expect(laid.properties.contentHeight).toBe(2 * PAD + Math.max(18, children[1].height, 30))
  })

  test("aligned across: centre and end", () => {
    const tall = obj("text", { width: 20, height: 40 })
    const short = obj("text", { width: 20, height: 10 })
    for (const [align, y] of [["centre", PAD + 15], ["end", PAD + 30]] as const) {
      const [laid] = layoutObjects([obj("horizontal-stack", { width: 300, properties: { align }, children: [tall, short] })], SCALE)
      expect(laid.children![1].y).toBe(y)
    }
  })

  test("spread along it: end, space-between, fill", () => {
    const end = layoutObjects([obj("horizontal-stack", { width: 300, properties: { distribute: "end" }, children: three() })], SCALE)[0]
    const last = end.children![2]
    expect(last.x + last.width).toBe(PAD + inner)

    const between = layoutObjects([obj("horizontal-stack", { width: 300, properties: { distribute: "space-between" }, children: three() })], SCALE)[0]
    expect(between.children![0].x).toBe(PAD)
    const right = between.children![2]
    expect(right.x + right.width).toBeGreaterThanOrEqual(PAD + inner - 1)

    const fill = layoutObjects([obj("horizontal-stack", { width: 300, properties: { distribute: "fill" }, children: three() })], SCALE)[0]
    const share = Math.floor((inner - 2 * GAP) / 3)
    for (const child of fill.children!) expect(child.width).toBe(share)
  })
})

test.describe("layout: the grid", () => {
  test("an auto column as wide as its widest cell, a weighted one taking the rest; rows as tall as their tallest", () => {
    const short = obj("text", { width: 30, height: 18 })
    const long = obj("text", { width: 55, height: 18 })
    const one = stepped("switch", "s")
    const two = stepped("switch", "l")
    const [laid] = layoutObjects([obj("grid", { width: 300, height: 999, children: [short, one, long, two] })], SCALE)
    const [a, b, c, d] = laid.children!
    const inner = 300 - 2 * PAD
    // Column 1: as wide as «long»; every cell its column's width.
    expect([a.x, a.width, c.x, c.width]).toEqual([PAD, 55, PAD, 55])
    expect(b.x).toBe(PAD + 55 + GAP)
    expect(b.width).toBe(inner - 55 - GAP)
    expect(d.width).toBe(b.width)
    // Row 2 under row 1's tallest cell.
    expect(a.y).toBe(PAD)
    expect(c.y).toBe(PAD + Math.max(18, one.height) + GAP)
    expect(laid.properties.contentHeight).toBe(c.y + Math.max(18, two.height) + PAD)
  })

  test("weighted columns share in proportion", () => {
    const cells = [obj("text"), obj("text"), obj("text")]
    const [laid] = layoutObjects([obj("grid", { width: 300, properties: { columns: [1, 2] }, children: cells })], SCALE)
    const rest = 300 - 2 * PAD - GAP
    expect(laid.children![0].width).toBe(Math.floor(rest / 3))
    expect(laid.children![1].width).toBe(Math.floor((rest * 2) / 3))
    // The third cell starts the second row, in the first column.
    expect(laid.children![2]).toMatchObject({ x: PAD, width: Math.floor(rest / 3) })
  })
})

test.describe("layout: what takes its height from the width it gets", () => {
  test("a ring as large as fits, its diameter on its track's grid", () => {
    const ring = obj("dial", { width: 10, height: 10, properties: { thickness: 12 } })
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, children: [ring] })], SCALE)
    const placed = laid.children![0]
    expect(placed.width).toBe(placed.height)
    expect(placed.width % 24).toBe(0)
    expect(placed.width).toBeLessThanOrEqual(200 - 2 * PAD)
    expect(placed.width).toBeGreaterThan(200 - 2 * PAD - 24)
  })

  test("a switcher as tall as its tallest panel, every panel at its width", () => {
    const short = obj("panel", { children: [obj("vertical-stack", { children: [obj("text", { height: 20 })] })] })
    const tall = obj("panel", { children: [obj("vertical-stack", { children: [obj("text", { height: 20 }), obj("text", { height: 50 })] })] })
    const switcher = obj("switcher", { height: 5, children: [short, tall] })
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, children: [switcher] })], SCALE)
    const placed = laid.children![0]
    expect(placed.width).toBe(200 - 2 * PAD)
    expect(placed.height).toBe(2 * PAD + 20 + GAP + 50)
    for (const panel of placed.children!) expect(panel).toMatchObject({ x: 0, y: 0, width: placed.width, height: placed.height })
    expect(placed.children![1].children![0].width).toBe(placed.width)
  })

  test("a free container in a stack: the stack's width, its own height", () => {
    const area = obj("free", { width: 10, height: 120, children: [obj("box", { x: 5, y: 5 })] })
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, children: [area] })], SCALE)
    expect(laid.children![0]).toMatchObject({ width: 200 - 2 * PAD, height: 120 })
    expect(laid.children![0].children![0]).toMatchObject({ x: 5, y: 5 })
  })
})

test.describe("layout: too little room", () => {
  test("content taller than the outermost container is marked, nothing shrunk", () => {
    const tall = [obj("text", { height: 80 }), obj("text", { height: 80 })]
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, height: 100, children: tall })], SCALE)
    expect(laid.properties.overflow).toBe(true)
    expect(laid.height).toBe(100)
    expect(laid.children!.map((c) => c.height)).toEqual([80, 80])
    // Enough room: no mark.
    const [roomy] = layoutObjects([{ ...laid, height: 400 }], SCALE)
    expect(roomy.properties.overflow).toBeUndefined()
  })

  test("a horizontal stack wider than it is, marked", () => {
    const wide = [obj("text", { width: 150 }), obj("text", { width: 150 })]
    const [laid] = layoutObjects([obj("horizontal-stack", { width: 200, height: 100, children: wide })], SCALE)
    expect(laid.properties.overflow).toBe(true)
  })
})
