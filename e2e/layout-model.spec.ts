import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, naturalWidth, isContainerType, contentAreaOf, defaultContentArea, layoutProject, DEFAULT_PADDING_MM } from "../lib/layout"
import { TABLE_GAP_MM } from "../lib/table"
import { stepUpdates } from "../lib/size-scale"
import { childOrigin, dissolveGroups } from "../lib/object-groups"
import { getAbsolutePosition, collectObjectTypes } from "../lib/object-tree"
import { renderScreenObjects } from "../lib/render-screen"
import { deviceDescriptionToProjectFields, parseDeviceDescriptionFile } from "../lib/device-description"
import { migrateProject } from "../lib/object-types"
import JSZip from "jszip"
import fs from "node:fs"
import path from "node:path"

// The layout pass on its own, no browser (docs/2026-10-02-layout.md, as
// amended by docs/2026-10-02-layout-tables.md): what it leaves alone, what
// takes its height from the width it gets, containers drawn and dissolved,
// old projects, a master's content area. The table's own rules are
// e2e/table-model.spec.ts's.

const SCALE = { pixelsPerMm: 5 }
const PAD = Math.round(DEFAULT_PADDING_MM * SCALE.pixelsPerMm)
const GAP = Math.round(TABLE_GAP_MM * SCALE.pixelsPerMm)

let ids = 0
function obj(type: ScreenObject["type"], fields: Partial<ScreenObject> = {}): ScreenObject {
  // A table here is given the screen's padding, so the tests see it at work.
  const padded = isContainerType(type) ? { paddingMm: DEFAULT_PADDING_MM } : {}
  return { id: `o${++ids}`, type, x: 0, y: 0, width: 50, height: 20, zIndex: ids, ...fields, properties: { ...padded, ...fields.properties } }
}

/** A table of one column, its children one per row - what a stack was. */
function column(fields: Partial<ScreenObject>, children: ScreenObject[]): ScreenObject {
  return obj("table", {
    ...fields,
    properties: { columns: [{ width: { share: 100 } }], ...fields.properties },
    children: children.map((c, row) => ({ ...c, properties: { ...c.properties, cell: { row, column: 0 } } })),
  })
}

/** A text with words, so it has a width of its own. */
function words(text: string, fields: Partial<ScreenObject> = {}): ScreenObject {
  return obj("text", { height: 18, ...fields, properties: { text, ...fields.properties } })
}
/** How wide an object needs to be (lib/layout.ts naturalWidth). */
const nat = (o: ScreenObject) => naturalWidth(o, SCALE)

/** A control at a size step, as the size scale makes it. */
function stepped(type: ScreenObject["type"], step: "s" | "m" | "l"): ScreenObject {
  const base = obj(type, { width: 60, properties: { states: [{ id: "a", label: "An" }, { id: "b", label: "Aus" }] } })
  return { ...base, ...stepUpdates(base, step, SCALE.pixelsPerMm, []) }
}

test.describe("layout: what it leaves alone", () => {
  test("a free container's children keep their own geometry", () => {
    const placed = obj("box", { x: 33, y: 44, width: 55, height: 66 })
    const [laid] = layoutObjects([obj("free", { width: 400, height: 300, children: [placed] })], SCALE)
    expect(laid.children![0]).toEqual(placed)
  })

  test("objects outside a container are untouched, and a stack deep inside a group is laid out", () => {
    const loose = obj("text", { x: 7, y: 8 })
    const deep = column({ width: 100 }, [obj("bar")])
    const [same, group] = layoutObjects([loose, obj("group", { children: [deep] })], SCALE)
    expect(same).toEqual(loose)
    expect(group.children![0].children![0]).toMatchObject({ x: PAD, y: PAD, width: 100 - 2 * PAD })
  })

  test("no device has to draw a container: they are left out of the types a project uses", () => {
    const screen = [obj("free", { children: [obj("table", { children: [obj("switch"), obj("table", { children: [obj("text")] })] })] })]
    expect([...collectObjectTypes(screen)].sort()).toEqual(["switch", "text"])
  })

  test("a panel fills a switcher a container places, so every rule finds its children in one place", () => {
    // childOrigin skips a panel's x and y, getAbsolutePosition adds them: once
    // a container has placed the switcher, a panel's x and y are 0 and the two agree.
    const child = obj("text", { x: 12, y: 9 })
    const panel = obj("panel", { x: 5, y: 7, width: 1, height: 1, children: [child] })
    const [stack] = layoutObjects([column({ width: 200 }, [obj("switcher", { width: 160, height: 120, children: [panel] })])], SCALE)
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

test.describe("layout: what takes its height from the width it gets", () => {
  test("a ring keeps its diameter, never more than the room, on its track's grid", () => {
    const room = 200 - 2 * PAD
    const place = (diameter: number) =>
      layoutObjects([column({ width: 200 }, [obj("dial", { width: diameter, height: diameter, properties: { thickness: 12 } })])], SCALE)[0].children![0]
    expect(place(96)).toMatchObject({ width: 96, height: 96 })
    const big = place(500)
    expect(big.width).toBe(big.height)
    expect(big.width % 24).toBe(0)
    expect(big.width).toBeLessThanOrEqual(room)
    expect(big.width).toBeGreaterThan(room - 24)
  })

  test("a switcher as tall as its tallest panel, every panel at its width", () => {
    const short = obj("panel", { children: [column({}, [obj("text", { height: 20 })])] })
    const tall = obj("panel", { children: [column({}, [obj("text", { height: 20 }), obj("text", { height: 50 })])] })
    const switcher = obj("switcher", { height: 5, children: [short, tall] })
    const [laid] = layoutObjects([column({ width: 200 }, [switcher])], SCALE)
    const placed = laid.children![0]
    expect(placed.width).toBe(200 - 2 * PAD)
    expect(placed.height).toBe(2 * PAD + 20 + GAP + 50)
    for (const panel of placed.children!) expect(panel).toMatchObject({ x: 0, y: 0, width: placed.width, height: placed.height })
    expect(placed.children![1].children![0].width).toBe(placed.width)
  })

  test("a free container in a stack: the stack's width, its own height", () => {
    const area = obj("free", { width: 10, height: 120, children: [obj("box", { x: 5, y: 5 })] })
    const [laid] = layoutObjects([column({ width: 200 }, [area])], SCALE)
    expect(laid.children![0]).toMatchObject({ width: 200 - 2 * PAD, height: 120 })
    expect(laid.children![0].children![0]).toMatchObject({ x: 5, y: 5 })
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
      column({ x: 50, y: 40, width: 200, height: 200 }, [box]),
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
        column({ x: 10, y: 20, width: 200, height: 200 }, [toggle, obj("table", { children: [deep] })]),
        obj("switcher", { x: 220, y: 30, width: 150, height: 100, children: [
          obj("panel", { children: [column({ width: 150, height: 100 }, [inPanel])] }),
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
    expect(types(flat).filter((t) => ["table", "free"].includes(t))).toEqual([])
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

  test("a screen laid out by its root: a table in the screen, the objects its cells", () => {
    const name = words("Licht")
    const control = stepped("switch", "m")
    const project = {
      screenWidth: 400,
      screenHeight: 300,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [{ objects: [name, control], layout: { type: "table" as const, properties: { columns: [{ width: "auto" }, { width: { share: 100 } }] } } }],
    }
    const laid = layoutProject(project)
    const [a, b] = laid.screens![0].objects!
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
        { objects: [column({ width: 380, height: 470 }, [obj("table", { children: blocks.slice(0, 30) })])], layout: { type: "free" as const } },
        { objects: blocks.slice(30), layout: { type: "table" as const } },
      ],
    }
    let current = layoutProject(project)
    const runs = 50
    const start = performance.now()
    for (let i = 0; i < runs; i++) current = layoutProject({ ...current, screens: [...current.screens!] })
    expect((performance.now() - start) / runs).toBeLessThan(16)
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
    const stack = { type: "table" as const, properties: { columns: [{ width: { share: 100 } }] } }
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
    const at = (i: number) => ({ x: laid.screens![i].objects![0].x, y: laid.screens![i].objects![0].y })
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
