import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// Table editing like Word (docs/2026-10-03-table-editing.md): a cell is
// something to point at, the ribbon's Table group with the path, the
// context menu, «+» at a line's end. The combined project's first screen,
// 400 x 300, made a table: «Links» top left, a nested table below it
// holding «Tief».

type Obj = Record<string, any>

const text = (id: string, words: string, zIndex: number, cell?: Obj): Obj => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 100,
  height: 23,
  zIndex,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent", ...(cell ? { cell } : {}) },
})

export async function nestedProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.layout = { type: "table", properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 2 } }
  one.objects = [
    text("links", "Links", 1, { row: 0, column: 0 }),
    {
      id: "inner",
      type: "table",
      x: 0,
      y: 0,
      width: 150,
      height: 40,
      zIndex: 2,
      properties: { columns: [{ width: { share: 100 } }], rows: 1, cell: { row: 1, column: 0 } },
      children: [text("tief", "Tief", 3, { row: 0, column: 0 })],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `table-editing-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function clickAt(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, x, y)
  await page.mouse.click(p.x, p.y)
}

async function chosenCell(page: Page): Promise<Obj | null> {
  const { canvas } = await getMainCanvas(page)
  const value = await canvas.getAttribute("data-table-cell")
  return value ? JSON.parse(value) : null
}

test.describe("table editing: the cell in context", () => {
  test("a click into an empty cell picks it; Esc leaves it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // Row 0, column 1 of the screen's table: empty (2 mm padding = 8 px).
    await clickAt(page, 300, 14)
    expect(await chosenCell(page)).toEqual({ tableId: null, row: 0, column: 1 })
    await page.keyboard.press("Escape")
    expect(await chosenCell(page)).toBeNull()
  })

  test("one click on an object in a nested table selects it, not the table around it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // «Tief» stands in the nested table, in row 1 of the screen's: below «Links».
    const { box } = await getMainCanvas(page)
    const links = devicePoint(box, 12, 14)
    await page.mouse.click(links.x, links.y)
    await expect(page.locator("#text")).toHaveValue("Links")
    // Row 1 starts below «Links» (23 px) and the 1.5 mm gap (6 px).
    await clickAt(page, 12, 8 + 23 + 6 + 8)
    await expect(page.locator("#text")).toHaveValue("Tief")
    expect(await chosenCell(page)).toBeNull()
  })
})
