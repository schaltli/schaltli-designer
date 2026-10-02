import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, contentHeight, DEFAULT_PADDING_MM, DEFAULT_GAP_MM } from "../lib/layout"
import { stepUpdates } from "../lib/size-scale"
import { childOrigin, dissolveGroups } from "../lib/object-groups"
import { getAbsolutePosition, collectObjectTypes } from "../lib/object-tree"
import { renderScreenObjects } from "../lib/render-screen"
import { layoutProject } from "../lib/layout"
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

test.describe("layout: groups in a grid share its columns", () => {
  /** A block as the block builder makes it: its name, and a switch beside it. */
  function block(name: string, nameWidth: number): ScreenObject {
    const label = obj("text", { x: 0, y: 0, width: nameWidth, height: 18, properties: { text: name } })
    const control = { ...stepped("switch", "m"), x: nameWidth + 6, y: 0 }
    return obj("group", { x: 0, y: 0, width: nameWidth + 6 + control.width, height: control.height, children: [label, control] })
  }

  test("three blocks: all names in one column as wide as the longest, all controls on one edge", () => {
    const blocks = [block("Licht", 25), block("Frischwasserpumpe", 90), block("Theme", 40)]
    const [laid] = layoutObjects([obj("grid", { width: 300, height: 999, children: blocks })], SCALE)
    const inner = 300 - 2 * PAD
    const nameLefts: number[] = []
    const controlLefts: number[] = []
    for (const group of laid.children!) {
      expect(group.type).toBe("group")
      const [name, control] = group.children!
      nameLefts.push(group.x + name.x)
      controlLefts.push(group.x + control.x)
      // Every name as wide as the longest; every control the rest.
      expect(name.width).toBe(90)
      expect(control.width).toBe(inner - 90 - GAP)
      // The group's box is around its pieces, which sit relative to it.
      expect(group.width).toBe(control.x + control.width)
      expect(name.x).toBe(0)
    }
    expect(new Set(nameLefts)).toEqual(new Set([PAD]))
    expect(new Set(controlLefts)).toEqual(new Set([PAD + 90 + GAP]))
    // One block per row, one under another.
    const tops = laid.children!.map((g) => g.y)
    expect(tops[1]).toBeGreaterThan(tops[0])
    expect(tops[2]).toBeGreaterThan(tops[1])
  })

  test("a group with more pieces than the row has cells left starts a new row", () => {
    const three = obj("group", { children: [obj("text", { x: 0 }), obj("text", { x: 60 }), obj("text", { x: 120 })] })
    const [laid] = layoutObjects([obj("grid", { width: 300, children: [obj("text", { height: 18 }), three] })], SCALE)
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

  test("the device export never reads a screen's layout: it takes the laid-out objects", () => {
    // What makes equal objects an equal device zip: the device JSON picks a
    // screen's fields one by one, and nothing that exports reads `layout`
    // (the editable project.zip keeps it, as it should).
    for (const file of ["lib/project-zip.ts", "lib/android-export.ts", "lib/asset-export.ts"]) {
      const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
      expect(source, file).not.toMatch(/\.layout\b/)
    }
  })

  test("a screen laid out by its root: a grid in the screen, the objects its cells", () => {
    const name = obj("text", { width: 40, height: 18 })
    const control = stepped("switch", "m")
    const project = {
      screenWidth: 400,
      screenHeight: 300,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [{ objects: [name, control], layout: { type: "grid" as const } }],
    }
    const laid = layoutProject(project)
    const [a, b] = laid.screens[0].objects
    expect(a).toMatchObject({ x: PAD, y: PAD, width: 40 })
    expect(b).toMatchObject({ x: PAD + 40 + GAP, y: PAD, width: 400 - 2 * PAD - 40 - GAP })
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
