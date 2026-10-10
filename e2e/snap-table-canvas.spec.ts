import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject } from "../lib/layout"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, getSelectedHeader, loadProject, placingFreely, saveProjectAs } from "./helpers"

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

async function snapProject(): Promise<{ zip: string; table: ScreenObject }> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.objects = [
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
  return { zip: out, table: laid.screens.find((s: Obj) => s.id === "screen-1").objects[0] }
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

  test("a new text drawn just right of a free one makes a table with it", async ({ page }) => {
    await loadProject(page, await freeProject())
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    // Drawn from below up to just right of «Licht» (100,60, 60 wide).
    await drag(page, { x: 200, y: 100 }, { x: 164, y: 70 })
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
    // The table's bottom right corner, where a resize handle would sit.
    const corner = await at(page, { x: table.x + table.width, y: table.y + table.height })
    await page.mouse.move(corner.x, corner.y)
    expect(await (await getMainCanvas(page)).canvas.evaluate((c) => (c as HTMLElement).style.cursor)).not.toContain("resize")
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
