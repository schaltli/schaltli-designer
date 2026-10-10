import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject } from "../lib/layout"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, getSelectedHeader, loadProject } from "./helpers"

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
