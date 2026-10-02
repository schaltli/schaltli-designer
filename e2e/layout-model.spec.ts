import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, contentHeight, naturalWidth, insertionAt, isContainerType, DEFAULT_PADDING_MM, DEFAULT_GAP_MM } from "../lib/layout"
import { stepUpdates } from "../lib/size-scale"
import { childOrigin, dissolveGroups } from "../lib/object-groups"
import { getAbsolutePosition, collectObjectTypes, insertObjectAt } from "../lib/object-tree"
import { renderScreenObjects } from "../lib/render-screen"
import { contentAreaOf, defaultContentArea, layoutProject } from "../lib/layout"
import { deviceDescriptionToProjectFields, parseDeviceDescriptionFile } from "../lib/device-description"
import { migrateProject } from "../lib/object-types"
import JSZip from "jszip"
import fs from "node:fs"
import path from "node:path"

// Layout containers (docs/2026-10-02-layout.md, module layout-model): the
// layout computation on its own, no browser. Positions follow from the
// container; heights from the objects - a control's from its size step, as
// the size scale keeps it in `height`.

const SCALE = { pixelsPerMm: 5 }
const PAD = Math.round(DEFAULT_PADDING_MM * SCALE.pixelsPerMm)
const GAP = Math.round(DEFAULT_GAP_MM * SCALE.pixelsPerMm)

let ids = 0
function obj(type: ScreenObject["type"], fields: Partial<ScreenObject> = {}): ScreenObject {
  // A container here is given the screen's padding, so the arrangement
  // tests see it at work; what a container has by default, none, is tested
  // on its own ("layout: the defaults").
  const padded = isContainerType(type) ? { paddingMm: DEFAULT_PADDING_MM } : {}
  return { id: `o${++ids}`, type, x: 0, y: 0, width: 50, height: 20, zIndex: ids, ...fields, properties: { ...padded, ...fields.properties } }
}

/** A text with words, so it has a width of its own. */
function words(text: string, fields: Partial<ScreenObject> = {}): ScreenObject {
  return obj("text", { height: 18, ...fields, properties: { text, ...fields.properties } })
}
/** Children numbered in the order given: a container places them by their stacking numbers (lib/layout.ts layoutOrder). */
const ordered = (children: ScreenObject[]) => children.map((c, i) => ({ ...c, zIndex: i }))
/** How wide an object needs to be (lib/layout.ts naturalWidth). */
const nat = (o: ScreenObject) => naturalWidth(o, SCALE)

/** A control at a size step, as the size scale makes it. */
function stepped(type: ScreenObject["type"], step: "s" | "m" | "l"): ScreenObject {
  const base = obj(type, { width: 60, properties: { states: [{ id: "a", label: "An" }, { id: "b", label: "Aus" }] } })
  return { ...base, ...stepUpdates(base, step, SCALE.pixelsPerMm, []) }
}

test.describe("layout: the vertical stack", () => {
  test("children one under another, each as wide as it needs at the stack's start, heights their own", () => {
    const text = words("Frischwasser", { width: 300 })
    const toggle = stepped("switch", "m")
    const buttons = stepped("button-group", "m")
    const stack = obj("vertical-stack", { x: 10, y: 20, width: 200, height: 300, children: [text, toggle, buttons] })

    const [laid] = layoutObjects([stack], SCALE)
    const [a, b, c] = laid.children!
    // The stack itself keeps where and how big it is.
    expect([laid.x, laid.y, laid.width, laid.height]).toEqual([10, 20, 200, 300])
    for (const child of [a, b, c]) expect(child.x).toBe(PAD)
    // Not stretched (decided 2026-10-02): the text as wide as its words, a
    // control as wide as its labels need - not as wide as they were drawn.
    expect(a.width).toBe(nat(text))
    expect(a.width).toBeLessThan(300)
    expect(b.width).toBe(nat(toggle))
    expect(c.width).toBe(nat(buttons))
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

  test("placed at start, centre or end; stretch makes everything the stack's width", () => {
    const child = words("Licht")
    const w = nat(child)
    const inner = 200 - 2 * PAD
    for (const [align, x] of [
      ["start", PAD],
      ["centre", PAD + Math.round((inner - w) / 2)],
      ["end", PAD + inner - w],
    ] as const) {
      const [laid] = layoutObjects([obj("vertical-stack", { width: 200, properties: { align }, children: [child] })], SCALE)
      expect(laid.children![0]).toMatchObject({ x, width: w })
    }
    const [stretched] = layoutObjects([obj("vertical-stack", { width: 200, properties: { align: "stretch" }, children: [child] })], SCALE)
    expect(stretched.children![0]).toMatchObject({ x: PAD, width: inner })
  })

  test("a bar or a slider takes the whole width: a length has no size of its own", () => {
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, children: [obj("bar", { width: 20 }), obj("slider", { width: 500 })] })], SCALE)
    for (const level of laid.children!) expect(level.width).toBe(200 - 2 * PAD)
  })

  test("spacing in millimetres, per stack", () => {
    const child = obj("bar")
    const [laid] = layoutObjects([obj("vertical-stack", { width: 200, properties: { paddingMm: 0, gapMm: 4 }, children: [child, obj("bar")] })], SCALE)
    expect(laid.children![0]).toMatchObject({ x: 0, y: 0, width: 200 })
    expect(laid.children![1].y).toBe(20 + 4 * SCALE.pixelsPerMm)
  })

  test("a stack in a stack is as tall as what it holds", () => {
    const inner = obj("vertical-stack", { height: 999, children: [obj("bar", { height: 18 }), obj("bar", { height: 22 })] })
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
    const deep = obj("vertical-stack", { width: 100, children: [obj("bar")] })
    const [same, group] = layoutObjects([loose, obj("group", { children: [deep] })], SCALE)
    expect(same).toEqual(loose)
    expect(group.children![0].children![0]).toMatchObject({ x: PAD, y: PAD, width: 100 - 2 * PAD })
  })

  test("no device has to draw a container: they are left out of the types a project uses", () => {
    const screen = [obj("free", { children: [obj("vertical-stack", { children: [obj("switch"), obj("grid", { children: [obj("text")] })] })] })]
    expect([...collectObjectTypes(screen)].sort()).toEqual(["switch", "text"])
  })

  test("a panel fills a switcher a container places, so every rule finds its children in one place", () => {
    // childOrigin skips a panel's x and y, getAbsolutePosition adds them: once
    // a container has placed the switcher, a panel's x and y are 0 and the two agree.
    const child = obj("text", { x: 12, y: 9 })
    const panel = obj("panel", { x: 5, y: 7, width: 1, height: 1, children: [child] })
    const [stack] = layoutObjects([obj("vertical-stack", { width: 200, children: [obj("switcher", { width: 160, height: 120, children: [panel] })] })], SCALE)
    const switcher = stack.children![0]
    expect(switcher.children![0]).toMatchObject({ x: 0, y: 0, width: switcher.width, height: switcher.height })
    const origin = childOrigin([stack], panel.id)
    expect(getAbsolutePosition([stack], child.id)).toEqual({ x: origin.x + 12, y: origin.y + 9 })
  })

  test("a switcher outside a container is left as it was saved", () => {
    const panel = obj("panel", { x: 5, y: 7, width: 1, height: 1, children: [obj("text")] })
    const switcher = obj("switcher", { x: 100, y: 50, width: 160, height: 120, children: [panel] })
    expect(layoutObjects([switcher], SCALE)[0].children![0]).toMatchObject({ x: 5, y: 7, width: 1, height: 1 })
  })
})

test.describe("layout: the horizontal stack", () => {
  const inner = 300 - 2 * PAD
  const three = () => [words("Licht"), stepped("switch", "m"), words("Bad", { height: 30 })]

  test("side by side, each as wide as it needs and its own height, as tall as the tallest", () => {
    const children = three()
    const [laid] = layoutObjects([obj("horizontal-stack", { width: 300, height: 999, children })], SCALE)
    const [a, b, c] = laid.children!
    expect(a).toMatchObject({ x: PAD, y: PAD, width: nat(children[0]), height: 18 })
    expect(b.width).toBe(nat(children[1]))
    expect(b.x).toBe(a.x + a.width + GAP)
    expect(c.x).toBe(b.x + b.width + GAP)
    // Heights stay the objects' own - a switch keeps its size step.
    expect(b.height).toBe(children[1].height)
    expect(laid.properties.contentHeight).toBe(2 * PAD + Math.max(18, children[1].height, 30))
  })

  test("aligned across: centre and end", () => {
    const tall = obj("box", { width: 20, height: 40 })
    const short = obj("box", { width: 20, height: 10 })
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
    const short = words("Bad", { width: 200 })
    const long = words("Frischwasser", { width: 10 })
    const one = stepped("switch", "s")
    const two = stepped("switch", "l")
    const [laid] = layoutObjects([obj("grid", { width: 300, height: 999, children: ordered([short, one, long, two]) })], SCALE)
    const [a, b, c, d] = laid.children!
    // Column 1 as wide as the longest words, whatever width the texts were drawn at.
    const column = nat(long)
    expect([a.x, c.x]).toEqual([PAD, PAD])
    expect([a.width, c.width]).toEqual([nat(short), column])
    // Column 2 starts after it; each control as wide as it needs, at the start.
    expect(b.x).toBe(PAD + column + GAP)
    expect(d.x).toBe(b.x)
    expect([b.width, d.width]).toEqual([nat(one), nat(two)])
    // Row 2 under row 1's tallest cell; each cell in the middle of its row,
    // so a name stands level with its control.
    const row1 = Math.max(18, one.height)
    const row2 = PAD + row1 + GAP
    expect(b.y).toBe(PAD + Math.round((row1 - one.height) / 2))
    expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(1)
    expect(d.y).toBe(row2 + Math.round((Math.max(18, two.height) - two.height) / 2))
    expect(Math.abs(c.y + c.height / 2 - (d.y + d.height / 2))).toBeLessThanOrEqual(1)
    expect(laid.properties.contentHeight).toBe(row2 + Math.max(18, two.height) + PAD)
  })

  test("weighted columns share in proportion", () => {
    const cells = [obj("bar"), obj("bar"), obj("bar")]
    const [laid] = layoutObjects([obj("grid", { width: 300, properties: { columns: [1, 2] }, children: cells })], SCALE)
    const rest = 300 - 2 * PAD - GAP
    expect(laid.children![0].width).toBe(Math.floor(rest / 3))
    expect(laid.children![1].width).toBe(Math.floor((rest * 2) / 3))
    // The third cell starts the second row, in the first column.
    expect(laid.children![2]).toMatchObject({ x: PAD, width: Math.floor(rest / 3) })
  })
})

test.describe("layout: what takes its height from the width it gets", () => {
  test("a ring keeps its diameter, never more than the room, on its track's grid", () => {
    const room = 200 - 2 * PAD
    const place = (diameter: number) =>
      layoutObjects([obj("vertical-stack", { width: 200, children: [obj("dial", { width: diameter, height: diameter, properties: { thickness: 12 } })] })], SCALE)[0].children![0]
    expect(place(96)).toMatchObject({ width: 96, height: 96 })
    const big = place(500)
    expect(big.width).toBe(big.height)
    expect(big.width % 24).toBe(0)
    expect(big.width).toBeLessThanOrEqual(room)
    expect(big.width).toBeGreaterThan(room - 24)
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

// Decided on the devices at Checkpoint B (2026-10-02, the user).
test.describe("layout: the defaults", () => {
  test("the screen keeps 2 mm from its edge, a container in it none of its own", () => {
    const text = words("Licht")
    const grid = { ...obj("grid", { children: [words("Bad")] }), properties: {} }
    const project = {
      screenWidth: 400,
      screenHeight: 300,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [{ objects: ordered([text, grid]), layout: { type: "vertical-stack" as const } }],
    }
    const [title, inner] = layoutProject(project).screens[0].objects!
    expect(title).toMatchObject({ x: PAD, y: PAD })
    // The grid at the screen's padding, its cell flush with the title.
    expect(inner.x).toBe(PAD)
    expect(inner.children![0]).toMatchObject({ x: 0, y: 0 })
  })

  test("a control keeps the width its labels need; its container says it does not fit", () => {
    const control = stepped("button-group", "m")
    const needs = nat(control)
    const grid = obj("grid", { width: needs, children: ordered([words("Heizung"), control]) })
    const [laid] = layoutObjects([grid], SCALE)
    expect(laid.children![1].width).toBe(needs)
    expect(laid.properties.overflow).toBe(true)
    // In a row shared out evenly, too.
    const row = obj("horizontal-stack", { width: 60, properties: { distribute: "fill" }, children: ordered([stepped("button", "m"), stepped("button", "m")]) })
    const [shared] = layoutObjects([row], SCALE)
    expect(shared.children!.every((c) => c.width >= naturalWidth(c, SCALE))).toBe(true)
    expect(shared.properties.overflow).toBe(true)
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

  test("a container in a container grows to its content and is not marked; only one too wide for it is", () => {
    // Found on hardware at Checkpoint B: the inner grid was measured at its
    // old height first, marked, then grown - and kept the mark.
    const grid = obj("grid", { height: 10, properties: { columns: ["auto", 1] }, children: ordered([words("Licht"), obj("box")]) })
    const [laid] = layoutObjects([obj("vertical-stack", { width: 300, height: 300, children: [grid] })], SCALE)
    expect(laid.properties.overflow).toBeUndefined()
    expect(laid.children![0].properties.overflow).toBeUndefined()
    const row = obj("horizontal-stack", { height: 10, children: ordered([obj("box", { width: 150 }), obj("box", { width: 150 })]) })
    const [narrow] = layoutObjects([obj("vertical-stack", { width: 200, height: 300, children: [row] })], SCALE)
    expect(narrow.children![0].properties.overflow).toBe(true)
  })

  test("a horizontal stack wider than it is, marked", () => {
    const wide = [obj("box", { width: 150 }), obj("box", { width: 150 })]
    const [laid] = layoutObjects([obj("horizontal-stack", { width: 200, height: 100, children: wide })], SCALE)
    expect(laid.properties.overflow).toBe(true)
  })
})

test.describe("layout: groups in a grid share its columns", () => {
  /** A block as the block builder makes it: its name, and a switch beside it. */
  function block(name: string, nameWidth: number): ScreenObject {
    const label = words(name, { x: 0, y: 0, width: nameWidth })
    const control = { ...stepped("switch", "m"), x: nameWidth + 6, y: 0 }
    return obj("group", { x: 0, y: 0, width: nameWidth + 6 + control.width, height: control.height, children: [label, control] })
  }

  test("three blocks: all names in one column as wide as the longest, all controls on one edge", () => {
    const blocks = [block("Licht", 25), block("Frischwasserpumpe", 90), block("Theme", 40)]
    const [laid] = layoutObjects([obj("grid", { width: 400, height: 999, children: blocks })], SCALE)
    const longest = nat(blocks[1].children![0])
    const nameLefts: number[] = []
    const controlLefts: number[] = []
    for (const group of laid.children!) {
      expect(group.type).toBe("group")
      const [name, control] = group.children!
      nameLefts.push(group.x + name.x)
      controlLefts.push(group.x + control.x)
      // Each name as wide as its words, each control as its labels need.
      expect(name.width).toBe(nat(name))
      expect(control.width).toBe(nat(control))
      // The group's box is around its pieces, which sit relative to it.
      expect(group.width).toBe(control.x + control.width)
      expect(name.x).toBe(0)
    }
    expect(new Set(nameLefts)).toEqual(new Set([PAD]))
    // The controls on one edge: after the column of the longest name.
    expect(new Set(controlLefts)).toEqual(new Set([PAD + longest + GAP]))
    // One block per row, one under another.
    const tops = laid.children!.map((g) => g.y)
    expect(tops[1]).toBeGreaterThan(tops[0])
    expect(tops[2]).toBeGreaterThan(tops[1])
  })

  test("a group with more pieces than the row has cells left starts a new row", () => {
    const three = obj("group", { children: [obj("text", { x: 0 }), obj("text", { x: 60 }), obj("text", { x: 120 })] })
    const [laid] = layoutObjects([obj("grid", { width: 300, children: ordered([obj("text", { height: 18 }), three]) })], SCALE)
    const group = laid.children![1]
    const [p1, p2, p3] = group.children!.map((piece) => ({ x: group.x + piece.x, y: group.y + piece.y }))
    // Not beside the text in row 1: from the start of row 2, the third piece wrapping into row 3.
    expect(p1.x).toBe(PAD)
    expect(p1.y).toBeGreaterThan(PAD)
    expect(p2.y).toBe(p1.y)
    expect(p3.x).toBe(PAD)
    expect(p3.y).toBeGreaterThan(p1.y)
  })

  test("a group outside a grid keeps its box and its pieces, in a stack too", () => {
    const group = block("Licht", 25)
    const [stacked] = layoutObjects([obj("vertical-stack", { width: 300, children: [group] })], SCALE)
    const placed = stacked.children![0]
    expect([placed.width, placed.height]).toEqual([group.width, group.height])
    expect(placed.children).toEqual(group.children)
    expect(placed).toMatchObject({ x: PAD, y: PAD })
  })
})

test.describe("layout: drawn and dissolved", () => {
  // Where the shared renderer draws: a context that only follows translate,
  // save and restore, and notes where each rectangle lands on the screen.
  function recordingContext() {
    const rects: { x: number; y: number }[] = []
    let offset = { x: 0, y: 0 }
    const stack: { x: number; y: number }[] = []
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === "save") return () => stack.push({ ...offset })
        if (key === "restore") return () => (offset = stack.pop() ?? { x: 0, y: 0 })
        if (key === "translate") return (x: number, y: number) => (offset = { x: offset.x + x, y: offset.y + y })
        if (key === "fillRect" || key === "strokeRect" || key === "rect" || key === "roundRect")
          return (x: number, y: number) => rects.push({ x: offset.x + x, y: offset.y + y })
        if (key in target) return target[key]
        return () => ({ width: 0 })
      },
      set(target, key, value) {
        target[key] = value
        return true
      },
    })
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
  }

  test("the shared renderer draws a container's children where the layout put them", () => {
    const box = obj("box", { width: 30, height: 20, properties: { fillColor: "#ff0000" } })
    const [root] = layoutObjects([obj("free", { x: 0, y: 0, width: 400, height: 300, children: [
      obj("vertical-stack", { x: 50, y: 40, width: 200, height: 200, children: [box] }),
    ] })], SCALE)
    const { ctx, rects } = recordingContext()
    renderScreenObjects(ctx, [root], { fonts: [], projectAssets: [], topics: [], getPreviewValueFromTopic: () => "" } as never)
    expect(rects.length).toBeGreaterThan(0)
    expect(rects[0]).toEqual({ x: 50 + PAD, y: 40 + PAD })
  })

  test("dissolved for a device: no container left, every object where it was drawn, its stacking number its own", () => {
    const text = obj("text", { x: 3, y: 4, zIndex: 5 })
    const toggle = obj("switch", { zIndex: 3 })
    const deep = obj("text", { zIndex: 7 })
    const inPanel = obj("text", { zIndex: 2 })
    const screen = layoutObjects([
      obj("free", { x: 0, y: 0, width: 400, height: 300, children: [
        text,
        obj("vertical-stack", { x: 10, y: 20, width: 200, height: 200, children: [toggle, obj("grid", { children: [deep] })] }),
        obj("switcher", { x: 220, y: 30, width: 150, height: 100, children: [
          obj("panel", { children: [obj("vertical-stack", { width: 150, height: 100, children: [inPanel] })] }),
        ] }),
      ] }),
    ], SCALE)
    // Where the layout put them, on the screen.
    const root = screen[0]
    const stack = root.children![1]
    const gridIn = stack.children![1]
    const expected = {
      [text.id]: { x: 3, y: 4, zIndex: 5 },
      [toggle.id]: { x: 10 + stack.children![0].x, y: 20 + stack.children![0].y, zIndex: 3 },
      [deep.id]: { x: 10 + gridIn.x + gridIn.children![0].x, y: 20 + gridIn.y + gridIn.children![0].y, zIndex: 7 },
    }

    const flat = dissolveGroups(screen)
    const types = (list: ScreenObject[]): string[] => list.flatMap((o) => [o.type, ...types(o.children ?? [])])
    expect(types(flat).filter((t) => ["vertical-stack", "horizontal-stack", "grid", "free"].includes(t))).toEqual([])
    for (const [id, at] of Object.entries(expected)) expect(flat.find((o) => o.id === id)).toMatchObject(at)
    // The switcher stays, its panel's stack dissolved into the panel, relative to the switcher.
    const switcher = flat.find((o) => o.type === "switcher")!
    expect(switcher).toMatchObject({ x: 220, y: 30 })
    expect(switcher.children![0].children![0]).toMatchObject({ id: inPanel.id, x: PAD, y: PAD, zIndex: 2 })
  })

  test("a screen wrapped in a free root dissolves to exactly what it was; one without containers to the same array", () => {
    const old = [obj("text", { x: 5, y: 6, zIndex: 1 }), obj("text", { x: 9, y: 9, zIndex: 1 }), obj("group", { x: 40, y: 40, width: 50, height: 20, zIndex: 2, children: [obj("box", { width: 50 })] })]
    expect(dissolveGroups([obj("free", { x: 0, y: 0, width: 400, height: 300, children: old })])).toEqual(dissolveGroups(old))
    const plain = [obj("text"), obj("box")]
    expect(dissolveGroups(plain)).toBe(plain)
  })
})

test.describe("layout: old projects as they were, and the pass after every change", () => {
  const projectsDir = path.join(__dirname, "..", "test-projects")
  const zips = [
    path.join(projectsDir, "combined-test-project.zip"),
    path.join(projectsDir, "switch-test-project.zip"),
    ...fs.readdirSync(path.join(projectsDir, "generations")).filter((f) => f.startsWith("project-")).map((f) => path.join(projectsDir, "generations", f)),
  ]
  async function projectJson(zipPath: string) {
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
    return JSON.parse(await zip.file("project.json")!.async("string"))
  }

  for (const zipPath of zips) {
    test(`${path.basename(zipPath)}: loads with a free root, every object exactly as it was, the pass moving nothing`, async () => {
      const before = await projectJson(zipPath)
      const loaded = migrateProject(structuredClone(before))
      const reference = migrateProject(structuredClone(before))
      for (const screen of loaded.screens) expect(screen.layout).toEqual({ type: "free" })
      // The pass after every change: same reference, nothing moved.
      expect(layoutProject(loaded)).toBe(loaded)
      // Loading twice changes nothing.
      expect(migrateProject(structuredClone(loaded))).toEqual(loaded)
      // Every object exactly as a load without containers would have it.
      loaded.screens.forEach((screen: { objects: unknown }, i: number) => expect(screen.objects).toEqual(reference.screens[i].objects))
    })
  }

  test("the device export never reads a screen's layout or a master's content area: it takes the laid-out objects", () => {
    // What makes equal objects an equal device zip: the device JSON picks a
    // screen's fields one by one, and nothing that exports reads `layout`
    // (the editable project.zip keeps it, as it should).
    for (const file of ["lib/project-zip.ts", "lib/android-export.ts", "lib/asset-export.ts"]) {
      const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
      expect(source, file).not.toMatch(/\.(layout|contentArea)\b/)
    }
  })

  test("a screen laid out by its root: a grid in the screen, the objects its cells", () => {
    const name = words("Licht")
    const control = stepped("switch", "m")
    const project = {
      screenWidth: 400,
      screenHeight: 300,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [{ objects: [name, control], layout: { type: "grid" as const } }],
    }
    const laid = layoutProject(project)
    const [a, b] = laid.screens[0].objects
    // The screen keeps its padding (DEFAULT_PADDING_MM) - a container in it would not.
    expect(b).toMatchObject({ x: PAD + nat(name) + GAP, y: PAD, width: nat(control) })
    expect(a).toMatchObject({ x: PAD, y: PAD + Math.round((control.height - name.height) / 2), width: nat(name) })
    // Again: nothing moves, the same reference.
    expect(layoutProject(laid)).toBe(laid)
  })

  test("the pass stays within a frame on a busy screen", () => {
    const blocks = Array.from({ length: 60 }, (_, i) =>
      obj("group", { children: [obj("text", { x: 0, width: 40 + (i % 7) * 5, height: 18 }), { ...stepped("switch", "m"), x: 80 }] }),
    )
    const project = {
      screenWidth: 800,
      screenHeight: 480,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [
        { objects: [obj("vertical-stack", { width: 380, height: 470, children: [obj("grid", { children: blocks.slice(0, 30) })] })], layout: { type: "free" as const } },
        { objects: blocks.slice(30), layout: { type: "grid" as const } },
      ],
    }
    let current = layoutProject(project)
    const runs = 50
    const start = performance.now()
    for (let i = 0; i < runs; i++) current = layoutProject({ ...current, screens: [...current.screens] })
    expect((performance.now() - start) / runs).toBeLessThan(16)
  })
})

test.describe("layout: the insertion line", () => {
  const area = { x: 0, y: 0, width: 400, height: 300 }

  test("in a stack: before the first child whose middle is below the point, the line between them", () => {
    const [stack] = layoutObjects([obj("vertical-stack", { id: "s", x: 20, y: 30, width: 200, height: 200, children: [words("A"), words("B"), words("C")] })], SCALE)
    const [a, b] = stack.children!
    // Just below A's middle: before B.
    const at = insertionAt([stack], { type: "free" }, area, { x: 60, y: 30 + a.y + a.height / 2 + 1 }, SCALE)!
    expect(at).toMatchObject({ parentId: "s", index: 1 })
    expect(at.line.y1).toBe(Math.round(30 + b.y - GAP / 2))
    expect([at.line.x1, at.line.x2]).toEqual([20 + PAD, 20 + 200 - PAD])
    // Below everything: at the end.
    expect(insertionAt([stack], { type: "free" }, area, { x: 60, y: 220 }, SCALE)).toMatchObject({ index: 3 })
  })

  test("in a grid: in reading order, the line before the cell", () => {
    const cells = [words("Licht"), stepped("switch", "m"), words("Bad"), stepped("switch", "m")]
    const [grid] = layoutObjects([obj("grid", { id: "g", x: 0, y: 0, width: 300, height: 200, children: cells })], SCALE)
    const [, second, third] = grid.children!
    // In row 2, left of its first cell's middle: before «Bad», index 2.
    expect(insertionAt([grid], { type: "free" }, area, { x: third.x + 1, y: third.y + 2 }, SCALE)).toMatchObject({ parentId: "g", index: 2 })
    // In row 1, right of the switch's middle: before row 2, index 2 too.
    expect(insertionAt([grid], { type: "free" }, area, { x: second.x + second.width - 1, y: second.y + 2 }, SCALE)).toMatchObject({ index: 2 })
  })

  test("the deepest stack, row or grid wins; a free container or screen has none", () => {
    const inner = obj("vertical-stack", { id: "inner", children: [words("x")] })
    const [outer] = layoutObjects([obj("vertical-stack", { id: "outer", x: 0, y: 0, width: 300, height: 300, children: [inner, words("y")] })], SCALE)
    const placed = outer.children![0]
    expect(insertionAt([outer], { type: "free" }, area, { x: placed.x + 2, y: placed.y + 2 }, SCALE)).toMatchObject({ parentId: "inner" })
    expect(insertionAt([outer], { type: "free" }, area, { x: 290, y: 290 }, SCALE)).toMatchObject({ parentId: "outer" })
    // A free container: draw a rectangle, as on a screen.
    expect(insertionAt([obj("free", { width: 300, height: 300, children: [] })], { type: "free" }, area, { x: 5, y: 5 }, SCALE)).toBeNull()
    // The screen itself, when its root is a stack: parentId null.
    expect(insertionAt([], { type: "vertical-stack" }, area, { x: 5, y: 5 }, SCALE)).toMatchObject({ parentId: null, index: 0 })
  })
})

test.describe("layout: the order a container places in", () => {
  test("by stacking number, whatever the array's order; an insertion renumbers in the new order", () => {
    const a = obj("bar", { id: "a", zIndex: 2 })
    const b = obj("bar", { id: "b", zIndex: 1 })
    const [laid] = layoutObjects([obj("vertical-stack", { width: 100, children: [a, b] })], SCALE)
    expect(laid.children!.map((c) => c.id)).toEqual(["b", "a"])
    expect(laid.children![0].y).toBeLessThan(laid.children![1].y)

    const into = insertObjectAt([obj("vertical-stack", { id: "s", children: [a, b] })], "s", obj("bar", { id: "new", zIndex: 99 }), 1)
    expect(into[0].children!.map((c) => [c.id, c.zIndex])).toEqual([["b", 0], ["new", 1], ["a", 2]])
  })
})

// Task 9: a master's content area, and round screens.
test.describe("a master's content area", () => {
  test("the whole screen by default; on a round screen the largest square in the circle", () => {
    expect(defaultContentArea(400, 300)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    expect(defaultContentArea(400, 300, "rect")).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    // 360 / √2 = 254.6: the square's corners on the circle, not past it.
    const square = defaultContentArea(360, 360, "round")
    expect(square).toEqual({ x: 53, y: 53, width: 254, height: 254 })
    const corner = Math.hypot(square.x - 180, square.y - 180)
    expect(corner).toBeLessThanOrEqual(180)
  })

  test("a master's own area is kept within the screen, which another device can make smaller", () => {
    expect(contentAreaOf({ contentArea: { x: 10, y: 20, width: 100, height: 50 } }, 400, 300)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    expect(contentAreaOf({ contentArea: { x: 300, y: 250, width: 200, height: 200 } }, 360, 360)).toEqual({ x: 300, y: 250, width: 60, height: 110 })
    expect(contentAreaOf(undefined, 360, 360, "round")).toEqual(defaultContentArea(360, 360, "round"))
  })

  test("a screen lays its root out in its master's area; the master, and a screen not showing it, in the whole screen", () => {
    const text = words("Licht")
    const stack = { type: "vertical-stack" as const }
    const project = {
      screenWidth: 400,
      screenHeight: 300,
      settings: { pixelsPerMm: 4 },
      screens: [
        { id: "m", isMaster: true, contentArea: { x: 100, y: 50, width: 200, height: 200 }, layout: stack, objects: [{ ...text, id: "on-master" }] },
        { id: "s", masterScreenId: "m", layout: stack, objects: [{ ...text, id: "on-screen" }] },
        { id: "hidden", masterScreenId: "m", showMaster: false, layout: stack, objects: [{ ...text, id: "not-shown" }] },
      ],
    }
    const laid = layoutProject(project)
    const at = (i: number) => ({ x: laid.screens[i].objects![0].x, y: laid.screens[i].objects![0].y })
    // Padding 2 mm at 4 px/mm.
    expect(at(0)).toEqual({ x: 8, y: 8 })
    expect(at(1)).toEqual({ x: 108, y: 58 })
    expect(at(2)).toEqual({ x: 8, y: 8 })
  })

  test("the device description says whether a screen is round; without shape it is rectangular", async () => {
    const fieldsOf = async (file: string) => {
      const bytes = fs.readFileSync(path.join(__dirname, "..", "public", "ddf", file))
      return deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), bytes.toString("base64"))
    }
    expect((await fieldsOf("waveshare-knob-1v8.ddf.zip")).screenShape).toBe("round")
    expect((await fieldsOf("waveshare-touch-lcd-4v3b.ddf.zip")).screenShape).toBe("rect")
  })
})
