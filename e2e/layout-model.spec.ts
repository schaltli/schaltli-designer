import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, naturalWidth, isContainerType, layoutProject } from "../lib/layout"
import { SNAP_GAP_MM as TABLE_GAP_MM } from "../lib/snap-table"
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
// amended by docs/2026-10-09-snap-tables.md): what it leaves alone, what
// takes its height from what it holds, containers drawn and dissolved, old
// projects, a master's content area. The table's own rules are
// e2e/snap-table-model.spec.ts's.

const SCALE = { pixelsPerMm: 5 }
// A screen's table kept 2 mm from its edge (lib/free-screens.ts).
const PAD = Math.round(2 * SCALE.pixelsPerMm)
const GAP = Math.round(TABLE_GAP_MM * SCALE.pixelsPerMm)

let ids = 0
function obj(type: ScreenObject["type"], fields: Partial<ScreenObject> = {}): ScreenObject {
  // A table here is given the screen's padding, so the tests see it at work.
  const padded = isContainerType(type) ? { paddingMm: 2 } : {}
  return { id: `o${++ids}`, type, x: 0, y: 0, width: 50, height: 20, zIndex: ids, ...fields, properties: { ...padded, ...fields.properties } }
}

/** A table put together by snapping, of one column, its children one per row. */
function column(fields: Partial<ScreenObject>, children: ScreenObject[]): ScreenObject {
  return {
    ...obj("table", fields),
    properties: { grid: 1, columns: [{}], rows: children.map(() => ({})) },
    children: children.map((c, row) => ({ ...c, properties: { ...c.properties, cell: { row, column: 0 } } })),
  }
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

  test("objects outside a container are untouched, and a table deep inside a group is laid out", () => {
    const loose = obj("text", { x: 7, y: 8 })
    const deep = column({ width: 100 }, [obj("bar", { x: 30, y: 30 })])
    const [same, group] = layoutObjects([loose, obj("group", { children: [deep] })], SCALE)
    expect(same).toEqual(loose)
    expect(group.children![0].children![0]).toMatchObject({ x: 0, y: 0, width: 50 })
    expect(group.children![0].width).toBe(50)
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
  test("a ring keeps its diameter in a table, on its track's grid", () => {
    const place = (diameter: number) =>
      layoutObjects([column({}, [obj("dial", { width: diameter, height: diameter, properties: { thickness: 12 } })])], SCALE)[0].children![0]
    expect(place(96)).toMatchObject({ width: 96, height: 96 })
    const odd = place(100)
    expect(odd.width).toBe(odd.height)
    expect(odd.width).toBe(96)
  })

  test("a switcher as tall as its tallest panel, as wide as its widest, every panel and the table in it at its width", () => {
    const short = obj("panel", { children: [column({}, [obj("box", { width: 40, height: 20 })])] })
    const tall = obj("panel", { children: [column({}, [obj("box", { width: 30, height: 20 }), obj("box", { width: 30, height: 50 })])] })
    const switcher = obj("switcher", { height: 5, children: [short, tall] })
    const [laid] = layoutObjects([column({}, [switcher])], SCALE)
    const placed = laid.children![0]
    expect(placed.width).toBe(40)
    expect(placed.height).toBe(20 + GAP + 50)
    for (const panel of placed.children!) expect(panel).toMatchObject({ x: 0, y: 0, width: placed.width, height: placed.height })
    expect(placed.children![1].children![0].width).toBe(placed.width)
  })

  test("a free area in a table: its own size, what it holds where it was put", () => {
    const area = obj("free", { width: 10, height: 120, children: [obj("box", { x: 5, y: 5 })] })
    const [laid] = layoutObjects([column({}, [area])], SCALE)
    expect(laid.children![0]).toMatchObject({ width: 10, height: 120 })
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
    expect(rects[0]).toEqual({ x: 50, y: 40 })
  })

  test("dissolved for a device: no container left, every object where it was drawn, its stacking number its own", () => {
    const text = obj("text", { x: 3, y: 4, zIndex: 5 })
    const toggle = obj("switch", { zIndex: 3 })
    const deep = obj("text", { zIndex: 7 })
    const inPanel = obj("text", { zIndex: 2 })
    const screen = layoutObjects([
      obj("free", { x: 0, y: 0, width: 400, height: 300, children: [
        text,
        column({ x: 10, y: 20, width: 200, height: 200 }, [toggle, column({}, [deep])]),
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
    // The switcher stays, its panel's table dissolved into the panel, relative to the switcher.
    const panelTable = root.children![2].children![0].children![0]
    const switcher = flat.find((o) => o.type === "switcher")!
    expect(switcher).toMatchObject({ x: 220, y: 30 })
    expect(switcher.children![0].children![0]).toMatchObject({ id: inPanel.id, x: panelTable.x + panelTable.children![0].x, y: panelTable.y + panelTable.children![0].y, zIndex: 2 })
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
    test(`${path.basename(zipPath)}: loads free, every object exactly as it was, the pass moving nothing`, async () => {
      const before = await projectJson(zipPath)
      const loaded = migrateProject(structuredClone(before))
      const reference = migrateProject(structuredClone(before))
      for (const screen of loaded.screens) expect(screen.layout).toBeUndefined()
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

  test("the pass stays within a frame on a busy screen", () => {
    const blocks = Array.from({ length: 60 }, (_, i) =>
      obj("group", { children: [obj("text", { x: 0, width: 40 + (i % 7) * 5, height: 18 }), { ...stepped("switch", "m"), x: 80 }] }),
    )
    const project = {
      screenWidth: 800,
      screenHeight: 480,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [
        { objects: [column({ width: 380, height: 470 }, [obj("table", { children: blocks.slice(0, 30) })])] },
        { objects: [obj("table", { width: 780, height: 470, children: blocks.slice(30) })] },
      ],
    }
    let current = layoutProject(project)
    const runs = 50
    const start = performance.now()
    for (let i = 0; i < runs; i++) current = layoutProject({ ...current, screens: [...current.screens!] })
    expect((performance.now() - start) / runs).toBeLessThan(16)
  })
})

// Round screens (layout Task 9).
test.describe("round screens", () => {
  test("the device description says whether a screen is round; without shape it is rectangular", async () => {
    const fieldsOf = async (file: string) => {
      const bytes = fs.readFileSync(path.join(__dirname, "..", "public", "ddf", file))
      return deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), bytes.toString("base64"))
    }
    expect((await fieldsOf("waveshare-knob-1v8.ddf.zip")).screenShape).toBe("round")
    expect((await fieldsOf("waveshare-touch-lcd-4v3b.ddf.zip")).screenShape).toBe("rect")
  })
})

// Screens are always free (docs/2026-10-03-free-screens.md, Task 1): a
// screen's root table becomes one table object where the root laid its
// objects out - in the master's content area, 2 mm in - and nothing moves.
test.describe("free screens: the migration", () => {
  const absolute = (objects: ScreenObject[]) => {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
    const walk = (list: ScreenObject[], ox: number, oy: number) => {
      for (const o of list) {
        if (o.type !== "table") out[o.id] = { x: ox + o.x, y: oy + o.y, w: o.width, h: o.height }
        if (o.children) walk(o.children, ox + o.x, oy + o.y)
      }
    }
    walk(objects, 0, 0)
    return out
  }
  const project = () => ({
    screenWidth: 400,
    screenHeight: 300,
    settings: { pixelsPerMm: SCALE.pixelsPerMm },
    fonts: [],
    screens: [
      { id: "m", isMaster: true, objects: [], contentArea: { x: 40, y: 30, width: 300, height: 220 }, layout: { type: "free" } },
      {
        id: "s",
        masterScreenId: "m",
        layout: { type: "table", properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 2 } },
        objects: [
          { ...words("Licht", { id: "name" }), properties: { text: "Licht", cell: { row: 0, column: 0 } } },
          { ...obj("box", { id: "ctl", height: 30 }), properties: { cell: { row: 0, column: 1 } } },
          { ...words("Bad", { id: "name2" }), properties: { text: "Bad", cell: { row: 1, column: 0 } } },
        ],
      },
    ],
  })

  // The root table it becomes is an old table, and old tables dissolve on
  // load (docs/2026-10-09-snap-tables.md, module old-table-removal): what it
  // held lies free, where the root put it - its corner in the master's
  // content area, 2 mm in.
  test("a screen's old root: its objects free, each where the root put it, no table left", () => {
    const old = project().screens[1]
    const migrated = migrateProject(project() as any) as any
    const screen = migrated.screens[1]
    expect(screen.layout?.type ?? "free").toBe("free")
    expect(screen.objects.map((o: ScreenObject) => o.type)).not.toContain("table")
    for (const o of old.objects) {
      const now = screen.objects.find((m: ScreenObject) => m.id === o.id)
      expect({ x: now.x, y: now.y }, o.id).toEqual({ x: 40 + PAD + o.x, y: 30 + PAD + o.y })
      expect(now.properties.cell).toBeUndefined()
    }
  })

  test("on a round screen without an area of its own: in the square inside the circle, 2 mm in", () => {
    const text = { ...words("Licht", { id: "t" }), properties: { text: "Licht", cell: { row: 0, column: 0 } } }
    const round = {
      screenWidth: 360,
      screenHeight: 360,
      settings: { pixelsPerMm: SCALE.pixelsPerMm, screenShape: "round" as const },
      fonts: [],
      screens: [
        { id: "m", isMaster: true, objects: [] },
        { id: "s", masterScreenId: "m", layout: { type: "table", properties: { columns: [{ width: { share: 100 } }] } }, objects: [text] },
      ],
    }
    const migrated = migrateProject(round as any) as any
    // 360 / √2 = 254.6: the square from 53 to 307.
    expect(migrated.screens[1].objects[0]).toMatchObject({ id: "t", x: 53 + PAD + text.x, y: 53 + PAD + text.y })
  })

  test("a master's content area is gone after loading", () => {
    const migrated = migrateProject(project() as any) as any
    expect(migrated.screens[0].contentArea).toBeUndefined()
  })
})
