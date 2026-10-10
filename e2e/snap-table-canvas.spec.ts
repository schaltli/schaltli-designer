import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject } from "../lib/layout"
import { placedSize } from "../lib/placing"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, getSelectedHeader, loadProject, objectTreeRow, openAllTwisties, placingFreely, saveProjectAs } from "./helpers"

// Tables put together by snapping, on the canvas (docs/2026-10-09-snap-tables.md,
// module snap-table-canvas). The combined project's first screen, 400 x 300,
// holds one such table «grid» at 100,60: two texts and a button in two rows.
// The project is laid out here with the designer's own layout pass, so the
// test knows where everything stands before the page opens it.

type Obj = Record<string, any>

const text = (id: string, words: string, zIndex: number, cell: Obj): Obj => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 60,
  height: 23,
  zIndex,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent", cell },
})

// `others`: free objects beside the table on the same screen.
async function snapProject(others: Obj[] = []): Promise<{ zip: string; table: ScreenObject }> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.objects = [
    ...others,
    {
      id: "grid",
      type: "table",
      x: 100,
      y: 60,
      width: 1,
      height: 1,
      zIndex: 1,
      properties: { grid: 1, columns: [{}, {}], rows: [{}, {}] },
      children: [text("licht", "Licht", 1, { row: 0, column: 0 }), text("pumpe", "Pumpe", 2, { row: 0, column: 1 }), text("bad", "Bad", 3, { row: 1, column: 0 })],
    },
  ]
  const laid = layoutProject(project)
  zip.file("project.json", JSON.stringify(laid))
  const out = path.join(os.tmpdir(), `snap-table-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return { zip: out, table: laid.screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "grid") }
}

// The middle of an object in the table, in screen pixels.
const middleOf = (table: ScreenObject, id: string) => {
  const child = table.children!.find((c) => c.id === id)!
  return { x: table.x + child.x + child.width / 2, y: table.y + child.y + child.height / 2 }
}

async function at(page: Page, point: { x: number; y: number }) {
  const { box } = await getMainCanvas(page)
  return devicePoint(box, point.x, point.y)
}
async function click(page: Page, point: { x: number; y: number }) {
  const p = await at(page, point)
  await page.mouse.click(p.x, p.y)
}
async function doubleClick(page: Page, point: { x: number; y: number }) {
  const p = await at(page, point)
  await page.mouse.dblclick(p.x, p.y)
}
async function chip(page: Page): Promise<string | null> {
  const { canvas } = await getMainCanvas(page)
  return canvas.getAttribute("data-snap-chip")
}
// The size a tool's object starts at on this device (lib/placing.ts).
async function sizeOf(page: Page, tool: string): Promise<{ width: number; height: number }> {
  const { canvas } = await getMainCanvas(page)
  return placedSize(tool, Number(await canvas.getAttribute("data-pixels-per-mm")))!
}
async function editing(page: Page): Promise<string | null> {
  const { canvas } = await getMainCanvas(page)
  return canvas.getAttribute("data-editing-container")
}

// Three free texts on the first screen, one under the other.
async function freeProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  const free = (id: string, words: string, y: number, z: number) => {
    const { cell: _cell, ...properties } = text(id, words, z, {}).properties
    return { ...text(id, words, z, {}), x: 100, y, properties }
  }
  one.objects = [free("a", "Licht", 60, 1), free("b", "Pumpe", 150, 2), free("c", "Bad", 220, 3)]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `snap-free-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

// The first screen's objects as saved: the first time under a name of its
// own, after that with Ctrl+S, read back once the save has landed. The
// project is removed after the test.
const savedAs = new WeakMap<Page, { name: string; last: string }>()
async function savedObjects(page: Page): Promise<ScreenObject[]> {
  const read = async (name: string) => {
    const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
    return JSON.stringify(saved.screens.find((s: Obj) => s.id === "screen-1").objects)
  }
  let known = savedAs.get(page)
  if (!known) {
    const name = `snap-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await saveProjectAs(page, name)
    known = { name, last: await read(name) }
  } else {
    const before = known.last
    await page.keyboard.press("ControlOrMeta+s")
    const name = known.name
    await expect.poll(() => read(name)).not.toBe(before)
    known = { name, last: await read(name) }
  }
  savedAs.set(page, known)
  return JSON.parse(known.last)
}
test.afterEach(async ({ page }) => {
  const known = savedAs.get(page)
  if (known) await page.request.delete(`/api/projects/${encodeURIComponent(known.name)}`)
})

// A drag from one screen point to another, in steps, as a hand does it;
// `before` runs while the button is still down at the end.
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, before?: () => Promise<void>) {
  const a = await at(page, from)
  const b = await at(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
  if (before) await before()
  await page.mouse.up()
}

test.describe("snap table: snapping", () => {
  test("three free texts dragged one next to the other become one table of one row", async ({ page }) => {
    await loadProject(page, await freeProject())
    // «Pumpe» (held at its middle, 30 px in) let go with its left edge 3 px
    // right of «Licht» (100,60, 60 wide) - the edges decide, not the pointer.
    await drag(page, { x: 130, y: 161 }, { x: 193, y: 71 })
    await expect.poll(() => editing(page)).not.toBeNull()
    const first = await savedObjects(page)
    const pair = first.find((o) => o.type === "table")!
    expect(pair.properties?.grid).toBe(1)
    expect(pair.children!.map((o) => o.id)).toEqual(["a", "b"])

    // «Bad» (held 15 px in from its left) let go with its left edge 4 px right of the table.
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await drag(page, { x: 115, y: 231 }, { x: pair.x + pair.width + 4 + 15, y: pair.y + 11 })
    const row = (await savedObjects(page)).find((o) => o.type === "table")!
    const cells = row.children!.map((o) => [o.id, o.properties?.cell?.column, o.properties?.cell?.row])
    expect(cells).toEqual([
      ["a", 0, 0],
      ["b", 1, 0],
      ["c", 2, 0],
    ])
    // «Licht», which stood first, is where it stood.
    const a = row.children!.find((o) => o.id === "a")!
    expect([row.x + a.x, row.y + a.y]).toEqual([100, 60])
  })

  test("a new text carried just right of a free one makes a table with it", async ({ page }) => {
    await loadProject(page, await freeProject())
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    // Carried at its middle until its left edge is 3 px right of «Licht» (100,60, 60 wide).
    const size = await sizeOf(page, "text")
    await drag(page, { x: 250, y: 200 }, { x: 163 + size.width / 2, y: 60 + size.height / 2 })
    await expect.poll(() => editing(page)).not.toBeNull()
    const objects = await savedObjects(page)
    const table = objects.find((o) => o.type === "table")!
    expect(table.properties?.grid).toBe(1)
    expect(table.children!.map((o) => [o.id === "a" ? "a" : o.type, o.properties?.cell?.column])).toEqual([
      ["a", 0],
      ["text", 1],
    ])
  })

  test("with Ctrl held while dragging, an object lies freely where it is let go", async ({ page }) => {
    await loadProject(page, await freeProject())
    const a = await at(page, { x: 130, y: 161 })
    const b = await at(page, { x: 193, y: 71 })
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await placingFreely(page, async () => {
      for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
      await page.mouse.up()
    })
    const objects = await savedObjects(page)
    expect(objects.some((o) => o.type === "table")).toBe(false)
    // Moved, and free: where exactly is the alignment guides' business
    // (they line it up with «Licht»'s top).
    const moved = objects.find((o) => o.id === "b")!
    expect(moved.properties?.cell).toBeUndefined()
    expect([moved.x, moved.y]).not.toEqual([100, 150])
    expect(moved.y).toBeLessThan(100)
  })

  test("a line dragged into an empty cell lands in that cell, its points with it", async ({ page }) => {
    // A line drawn right to left, as its negative width says; its points say where it is.
    const line = { id: "strich", type: "line", x: 290, y: 220, width: -40, height: 0, zIndex: 9, properties: { points: [{ x: 290, y: 220 }, { x: 250, y: 220 }], strokeColor: "#000000", strokeWidth: 2 } }
    const { zip, table } = await snapProject([line])
    await loadProject(page, zip)
    // Its middle onto the empty cell: row 1 (where «Bad» stands), column 1 (where «Pumpe» stands).
    const bad = table.children!.find((c) => c.id === "bad")!
    const pumpe = table.children!.find((c) => c.id === "pumpe")!
    await click(page, { x: 270, y: 220 })
    await drag(page, { x: 270, y: 220 }, { x: table.x + pumpe.x + 25, y: table.y + bad.y + bad.height / 2 })
    const grid = (await savedObjects(page)).find((o) => o.id === "grid")!
    const placed = grid.children!.find((c) => c.id === "strich")!
    expect(placed.properties?.cell).toMatchObject({ row: 1, column: 1 })
    // In the table's space and inside it, not where it stood on the screen.
    for (const p of placed.properties!.points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(grid.width)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(grid.height)
    }
  })

  test("with a table open, a box placed far from it lies freely on the screen, not in the table", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    // The table open, an object in it chosen.
    await click(page, middleOf(table, "pumpe"))
    await doubleClick(page, middleOf(table, "pumpe"))
    await expect.poll(() => editing(page)).toBe("grid")
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    await drag(page, { x: 250, y: 200 }, { x: 285, y: 230 })
    const objects = await savedObjects(page)
    const box = objects.find((o) => o.type === "box")!
    // Its middle where it was let go.
    expect(Math.abs(box.x + box.width / 2 - 285)).toBeLessThanOrEqual(2)
    expect(Math.abs(box.y + box.height / 2 - 230)).toBeLessThanOrEqual(2)
    expect(box.properties?.cell).toBeUndefined()
    expect(objects.find((o) => o.id === "grid")!.children!.map((c) => c.id).sort()).toEqual(["bad", "licht", "pumpe"])
    expect(await editing(page)).toBeNull()
  })

  test("with a table open, a box carried against its side snaps into it", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "pumpe"))
    await doubleClick(page, middleOf(table, "pumpe"))
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    // Its left edge 3 px right of the table, its top level with the table's.
    const size = await sizeOf(page, "box")
    await drag(page, { x: 250, y: 220 }, { x: table.x + table.width + 3 + size.width / 2, y: table.y + size.height / 2 })
    const grid = (await savedObjects(page)).find((o) => o.id === "grid")!
    const box = grid.children!.find((c) => c.type === "box")!
    expect(box.properties?.cell).toMatchObject({ row: 0, column: 2 })
  })

  test("Esc while dragging puts the object back and makes no table", async ({ page }) => {
    await loadProject(page, await freeProject())
    await drag(page, { x: 130, y: 161 }, { x: 193, y: 71 }, () => page.keyboard.press("Escape"))
    const objects = await savedObjects(page)
    expect(objects.some((o) => o.type === "table")).toBe(false)
    expect(objects.find((o) => o.id === "b")).toMatchObject({ x: 100, y: 150 })
  })

  test("one undo takes a snap back whole", async ({ page }) => {
    await loadProject(page, await freeProject())
    await drag(page, { x: 130, y: 161 }, { x: 193, y: 71 })
    await expect.poll(() => editing(page)).not.toBeNull()
    await page.keyboard.press("ControlOrMeta+z")
    const objects = await savedObjects(page)
    expect(objects.some((o) => o.type === "table")).toBe(false)
    expect(objects.find((o) => o.id === "b")).toMatchObject({ x: 100, y: 150 })
  })
})

test.describe("snap table: moving", () => {
  test("a selected table is moved whole by dragging it", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "pumpe"))
    await drag(page, middleOf(table, "pumpe"), { x: middleOf(table, "pumpe").x + 40, y: middleOf(table, "pumpe").y + 30 })
    const moved = (await savedObjects(page)).find((o) => o.id === "grid")!
    expect([moved.x, moved.y]).toEqual([table.x + 40, table.y + 30])
    expect(moved.children!.map((c) => [c.id, c.x, c.y])).toEqual(table.children!.map((c) => [c.id, c.x, c.y]))
  })

  test("an object dragged out of a table lies free where it was let go; its row, now empty, goes", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "bad"))
    await doubleClick(page, middleOf(table, "bad"))
    await expect.poll(() => getSelectedHeader(page)).toContain("bad")
    const from = middleOf(table, "bad")
    await drag(page, from, { x: 300, y: 240 })
    const objects = await savedObjects(page)
    const bad = objects.find((o) => o.id === "bad")!
    expect(bad.properties?.cell).toBeUndefined()
    const before = table.children!.find((c) => c.id === "bad")!
    expect(bad.x).toBe(Math.round(table.x + before.x + 300 - from.x))
    const grid = objects.find((o) => o.id === "grid")!
    expect(grid.children!.map((c) => c.id).sort()).toEqual(["licht", "pumpe"])
    expect(grid.properties?.rows).toHaveLength(1)
    // What stayed is where it stood.
    const licht = grid.children!.find((c) => c.id === "licht")!
    const lichtBefore = table.children!.find((c) => c.id === "licht")!
    expect([grid.x + licht.x, grid.y + licht.y]).toEqual([table.x + lichtBefore.x, table.y + lichtBefore.y])
  })

  test("one of two dragged out leaves two free objects and no table", async ({ page }) => {
    await loadProject(page, await freeProject())
    // «Pumpe» snapped right of «Licht»: a table of two, open, «Pumpe» chosen.
    await drag(page, { x: 130, y: 161 }, { x: 193, y: 71 })
    await expect.poll(() => editing(page)).not.toBeNull()
    const pair = (await savedObjects(page)).find((o) => o.type === "table")!
    const pumpe = pair.children!.find((c) => c.id === "b")!
    await drag(page, { x: pair.x + pumpe.x + 10, y: pair.y + pumpe.y + 10 }, { x: 250, y: 250 })
    const objects = await savedObjects(page)
    expect(objects.some((o) => o.type === "table")).toBe(false)
    expect(objects.find((o) => o.id === "a")).toMatchObject({ x: 100, y: 60 })
    expect(objects.find((o) => o.id === "b")!.properties?.cell).toBeUndefined()
  })

  test("with Esc while dragging out, the object stays in its cell", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "bad"))
    await doubleClick(page, middleOf(table, "bad"))
    await drag(page, middleOf(table, "bad"), { x: 300, y: 240 }, () => page.keyboard.press("Escape"))
    const grid = (await savedObjects(page)).find((o) => o.id === "grid")!
    expect(grid.children!.find((c) => c.id === "bad")!.properties?.cell).toMatchObject({ row: 1, column: 0 })
  })

  test("an object copied out of a table pastes free, beside the table, not into it", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "pumpe"))
    await doubleClick(page, middleOf(table, "pumpe"))
    await expect.poll(() => getSelectedHeader(page)).toContain("pumpe")
    await page.keyboard.press("ControlOrMeta+c")
    await page.keyboard.press("ControlOrMeta+v")
    const objects = await savedObjects(page)
    const copies = objects.filter((o) => o.type === "text")
    expect(copies).toHaveLength(1)
    expect(copies[0].properties?.cell).toBeUndefined()
    expect(objects.find((o) => o.id === "grid")!.children!.map((c) => c.id).sort()).toEqual(["bad", "licht", "pumpe"])
    expect(await editing(page)).toBeNull()
  })
})

// Where the chosen object's span handles are, as the canvas says.
async function spanHandle(page: Page, side: "left" | "right" | "top" | "bottom"): Promise<{ x: number; y: number }> {
  const { canvas } = await getMainCanvas(page)
  await expect.poll(() => canvas.getAttribute("data-span-handles")).not.toBeNull()
  const handles = JSON.parse((await canvas.getAttribute("data-span-handles"))!) as Array<{ side: string; x: number; y: number }>
  return handles.find((h) => h.side === side)!
}
async function cellOfSaved(page: Page, id: string): Promise<Obj> {
  const grid = (await savedObjects(page)).find((o) => o.id === "grid")!
  return grid.children!.find((c) => c.id === id)!.properties!.cell
}
async function chooseInTable(page: Page, table: ScreenObject, id: string) {
  await click(page, middleOf(table, id))
  await doubleClick(page, middleOf(table, id))
  await expect.poll(() => getSelectedHeader(page)).toContain(id)
}

test.describe("snap table: span", () => {
  test("⇥ grows a span over an empty cell to the right, and back", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await chooseInTable(page, table, "bad")
    const right = await spanHandle(page, "right")
    await drag(page, right, { x: right.x + 40, y: right.y })
    expect(await cellOfSaved(page, "bad")).toMatchObject({ row: 1, column: 0, columnSpan: 2 })
    // Back into the first column: past the line between the two.
    const grown = await spanHandle(page, "right")
    await drag(page, grown, { x: table.x + 20, y: grown.y })
    expect((await cellOfSaved(page, "bad")).columnSpan).toBeUndefined()
  })

  test("a span is refused over an occupied cell: nothing changes", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await chooseInTable(page, table, "licht")
    const right = await spanHandle(page, "right")
    await drag(page, right, { x: right.x + 40, y: right.y })
    const cell = await cellOfSaved(page, "licht")
    expect(cell).toMatchObject({ row: 0, column: 0 })
    expect(cell.columnSpan).toBeUndefined()
  })

  test("⤓ grows down over the empty cell; ⤒ dragged down takes the top edge with it", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await chooseInTable(page, table, "pumpe")
    const bottom = await spanHandle(page, "bottom")
    await drag(page, bottom, { x: bottom.x, y: bottom.y + 25 })
    expect(await cellOfSaved(page, "pumpe")).toMatchObject({ row: 0, column: 1, rowSpan: 2 })
    const top = await spanHandle(page, "top")
    await drag(page, top, { x: top.x, y: top.y + 40 })
    const cell = await cellOfSaved(page, "pumpe")
    expect(cell).toMatchObject({ row: 1, column: 1 })
    expect(cell.rowSpan).toBeUndefined()
  })

  test("one Ctrl+Z takes a span drag back whole", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await chooseInTable(page, table, "bad")
    const right = await spanHandle(page, "right")
    await drag(page, right, { x: right.x + 40, y: right.y })
    await expect.poll(async () => (await cellOfSaved(page, "bad")).columnSpan).toBe(2)
    await page.keyboard.press("ControlOrMeta+z")
    expect((await cellOfSaved(page, "bad")).columnSpan).toBeUndefined()
  })
})

// The selected table's column and row lines, as the canvas says.
async function sizeLine(page: Page, kind: "column" | "row", index: number): Promise<{ x1: number; y1: number; x2: number; y2: number }> {
  const { canvas } = await getMainCanvas(page)
  await expect.poll(() => canvas.getAttribute("data-size-lines")).not.toBeNull()
  const lines = JSON.parse((await canvas.getAttribute("data-size-lines"))!) as Array<{ kind: string; index: number; x1: number; y1: number; x2: number; y2: number }>
  return lines.find((l) => l.kind === kind && l.index === index)!
}
async function ppmOf(page: Page): Promise<number> {
  const { canvas } = await getMainCanvas(page)
  return Number(await canvas.getAttribute("data-pixels-per-mm"))
}

test.describe("snap table: lines", () => {
  test("a column dragged 10 mm wider than its content is set by hand; dragged back below it, automatic again", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "pumpe"))
    const ppm = await ppmOf(page)
    const line = await sizeLine(page, "column", 0)
    const y = (line.y1 + line.y2) / 2
    await drag(page, { x: line.x1, y }, { x: line.x1 + 10 * ppm, y })
    const wider = (await savedObjects(page)).find((o) => o.id === "grid")!
    const mm = wider.properties!.columns[0].mm
    expect(typeof mm).toBe("number")
    expect(wider.width).toBeGreaterThan(table.width + 8 * ppm)
    // Back to the left of its content: automatic.
    const set = await sizeLine(page, "column", 0)
    await drag(page, { x: set.x1, y }, { x: table.x + 5, y })
    const back = (await savedObjects(page)).find((o) => o.id === "grid")!
    expect(back.properties!.columns[0].mm).toBeUndefined()
  })

  test("a row dragged taller is set by hand; one Ctrl+Z takes it back", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "pumpe"))
    const ppm = await ppmOf(page)
    const line = await sizeLine(page, "row", 0)
    // Near its left end, away from where a column line crosses it.
    const x = line.x1 + 10
    await drag(page, { x, y: line.y1 }, { x, y: line.y1 + 8 * ppm })
    await expect.poll(async () => typeof (await savedObjects(page)).find((o) => o.id === "grid")!.properties!.rows[0].mm).toBe("number")
    await page.keyboard.press("ControlOrMeta+z")
    expect((await savedObjects(page)).find((o) => o.id === "grid")!.properties!.rows[0].mm).toBeUndefined()
  })
})

// The first screen holding `objects`, nothing else.
async function projectWith(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `snap-ctx-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}
const freeText = (id: string, words: string, x: number, y: number, z: number): Obj => {
  const { cell: _cell, ...properties } = text(id, words, z, {}).properties
  return { ...text(id, words, z, {}), x, y, properties }
}

test.describe("snap table: in a switcher panel and a free area", () => {
  test("two texts snapped inside an open switcher panel form a table there", async ({ page }) => {
    const switcher: Obj = {
      id: "sw",
      type: "switcher",
      x: 60,
      y: 60,
      width: 280,
      height: 180,
      zIndex: 1,
      properties: { topic: "t/mode" },
      children: [
        { id: "p1", type: "panel", x: 0, y: 0, width: 280, height: 180, zIndex: 0, properties: {}, children: [freeText("a", "Licht", 20, 20, 1), freeText("b", "Pumpe", 20, 100, 2)] },
      ],
    }
    await loadProject(page, await projectWith([switcher]))
    await openAllTwisties(page)
    await objectTreeRow(page, "p1").click()
    await expect.poll(() => editing(page)).toBe("p1")
    // «Pumpe» (80,160 on the screen) carried until its left edge is 3 px right of «Licht» (80..140, 80).
    await drag(page, { x: 110, y: 171 }, { x: 143 + 30, y: 91 })
    const objects = await savedObjects(page)
    const panel = objects.find((o) => o.id === "sw")!.children!.find((p) => p.id === "p1")!
    const table = panel.children!.find((o) => o.type === "table")!
    expect(table.properties?.grid).toBe(1)
    expect(table.children!.map((o) => [o.id, o.properties?.cell?.column])).toEqual([
      ["a", 0],
      ["b", 1],
    ])
    // Nothing left the panel.
    expect(objects.map((o) => o.id)).toEqual(["sw"])
  })

  test("two texts snapped inside an open free area form a table in it", async ({ page }) => {
    const area: Obj = {
      id: "area",
      type: "free",
      x: 40,
      y: 40,
      width: 300,
      height: 200,
      zIndex: 1,
      properties: {},
      children: [freeText("a", "Licht", 20, 20, 1), freeText("b", "Pumpe", 20, 120, 2)],
    }
    await loadProject(page, await projectWith([area]))
    await objectTreeRow(page, "area").click()
    await expect.poll(() => editing(page)).toBe("area")
    // «Pumpe» (60,160 on the screen) carried until its left edge is 3 px right of «Licht» (60..120, 60).
    await drag(page, { x: 90, y: 171 }, { x: 123 + 30, y: 71 })
    const placed = (await savedObjects(page)).find((o) => o.id === "area")!
    const table = placed.children!.find((o) => o.type === "table")!
    expect(table.children!.map((o) => o.id)).toEqual(["a", "b"])
  })

  test("a free area snapped beside a text forms a table; what the area holds stays in it", async ({ page }) => {
    const area: Obj = {
      id: "area",
      type: "free",
      x: 100,
      y: 150,
      width: 80,
      height: 50,
      zIndex: 2,
      properties: {},
      children: [freeText("inside", "Innen", 10, 10, 1)],
    }
    await loadProject(page, await projectWith([freeText("label", "Licht", 100, 60, 1), area]))
    // The area chosen by a click on its edge, away from what it holds.
    await click(page, { x: 175, y: 195 })
    await expect.poll(() => getSelectedHeader(page)).toContain("area")
    // Carried until its left edge is 3 px right of «Licht» (100..160, 60).
    await drag(page, { x: 175, y: 195 }, { x: 175 + (163 - 100), y: 195 - 90 })
    const objects = await savedObjects(page)
    const table = objects.find((o) => o.type === "table")!
    expect(table.children!.map((o) => [o.id, o.properties?.cell?.column])).toEqual([
      ["label", 0],
      ["area", 1],
    ])
    const placed = table.children!.find((o) => o.id === "area")!
    expect(placed.children!.map((o) => o.id)).toEqual(["inside"])
    expect(placed.children![0]).toMatchObject({ x: 10, y: 10 })
  })
})

test.describe("snap table: selection", () => {
  test("a click selects the table, a double click the object in it, a click on another object of it stays inside", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)

    await click(page, middleOf(table, "pumpe"))
    await expect.poll(() => getSelectedHeader(page)).toContain("grid")
    await expect.poll(() => chip(page)).toBe("Table · 2×2")

    await doubleClick(page, middleOf(table, "pumpe"))
    await expect.poll(() => getSelectedHeader(page)).toContain("pumpe")
    expect(await editing(page)).toBe("grid")
    await expect.poll(() => chip(page)).toBe("Text")

    await click(page, middleOf(table, "bad"))
    await expect.poll(() => getSelectedHeader(page)).toContain("bad")
    expect(await editing(page)).toBe("grid")
  })

  test("a selected table offers no resize handle: its size is its content's", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "pumpe"))
    await expect.poll(() => chip(page)).toBe("Table · 2×2")
    // The table's bottom right corner, where a resize handle would sit: its
    // last column's and row's lines meet there (Task 8), but no corner
    // handle resizes the table as a whole.
    const corner = await at(page, { x: table.x + table.width, y: table.y + table.height })
    await page.mouse.move(corner.x, corner.y)
    expect(await (await getMainCanvas(page)).canvas.evaluate((c) => (c as HTMLElement).style.cursor)).not.toMatch(/^(nw|ne|sw|se|nwse|nesw)-resize$/)
  })

  test("Esc goes one level up: object -> table -> nothing; Enter goes into the table", async ({ page }) => {
    const { zip, table } = await snapProject()
    await loadProject(page, zip)
    await click(page, middleOf(table, "licht"))
    await doubleClick(page, middleOf(table, "bad"))
    await expect.poll(() => getSelectedHeader(page)).toContain("bad")

    await page.keyboard.press("Escape")
    await expect.poll(() => getSelectedHeader(page)).toContain("grid")
    expect(await editing(page)).toBeNull()

    await page.keyboard.press("Enter")
    await expect.poll(() => getSelectedHeader(page)).toContain("licht")
    expect(await editing(page)).toBe("grid")

    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect.poll(() => chip(page)).toBeNull()
    expect(await getSelectedHeader(page)).not.toContain("grid")
  })
})
