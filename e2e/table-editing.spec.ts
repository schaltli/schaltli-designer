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

// Three levels: the screen's table, «middle» in its row 1, «inner» in
// «middle», «Tief» in «inner».
async function deepProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(await nestedProject()))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  const inner = one.objects.find((o: Obj) => o.id === "inner")
  inner.properties.cell = { row: 0, column: 0 }
  one.objects = [
    one.objects.find((o: Obj) => o.id === "links"),
    { id: "middle", type: "table", x: 0, y: 0, width: 160, height: 50, zIndex: 4, properties: { columns: [{ width: { share: 100 } }], rows: 1, cell: { row: 1, column: 0 } }, children: [inner] },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `table-editing-deep-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function downloadedScreen(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1")
}
const cellsOf = (objects: Obj[]) => Object.fromEntries(objects.map((o) => [o.id, o.properties.cell]))

test.describe("table editing: the ribbon's Table group", () => {
  test("the path reaches each of three levels with one click", async ({ page }) => {
    await loadProject(page, await deepProject())
    const group = page.getByTestId("table-group")
    await expect(group).toHaveCount(0)
    // «Tief», three tables deep.
    await clickAt(page, 12, 8 + 23 + 6 + 8)
    await expect(page.locator("#text")).toHaveValue("Tief")
    const pathBar = page.getByTestId("table-path")
    await expect(pathBar).toHaveText(/Screen.*Table.*Table.*Cell 1, 1/)
    await pathBar.locator('[data-table-level="inner"]').click()
    await expect(pathBar.locator('[data-table-level="inner"]')).toHaveAttribute("aria-current", "true")
    await pathBar.locator('[data-table-level="middle"]').click()
    await expect(pathBar.locator('[data-table-level="middle"]')).toHaveAttribute("aria-current", "true")
    await pathBar.locator('[data-table-level=""]').click()
    await expect(pathBar.locator('[data-table-level=""]')).toHaveAttribute("aria-current", "true")
    await expect(pathBar.locator("[data-table-level]")).toHaveCount(1)
  })

  test("Row above on an empty cell puts a row above it, one undo step", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 300, 14)
    await page.getByTestId("table-group").getByRole("button", { name: "Row above" }).click()
    let screen = await downloadedScreen(page)
    expect(cellsOf(screen.objects)).toEqual({ links: { row: 1, column: 0 }, inner: { row: 2, column: 0 } })
    expect(screen.layout.properties.rows).toBe(3)
    await page.keyboard.press("ControlOrMeta+z")
    screen = await downloadedScreen(page)
    expect(cellsOf(screen.objects)).toEqual({ links: { row: 0, column: 0 }, inner: { row: 1, column: 0 } })
  })

  test("Merge right takes the empty neighbour; Merge down is off over an occupied cell", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 12, 14)
    await expect(page.locator("#text")).toHaveValue("Links")
    const group = page.getByTestId("table-group")
    await expect(group.getByRole("button", { name: "Merge down" })).toBeDisabled()
    await expect(group.getByRole("button", { name: "Split" })).toBeDisabled()
    await group.getByRole("button", { name: "Merge right" }).click()
    expect(cellsOf((await downloadedScreen(page)).objects).links).toEqual({ row: 0, column: 0, columnSpan: 2 })
    await expect(group.getByRole("button", { name: "Split" })).toBeEnabled()
  })
})

test.describe("table editing: right-click", () => {
  test("a right-click on an empty cell offers the table's commands for it; Row above puts a row above it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, 300, 14)
    await page.mouse.click(p.x, p.y, { button: "right" })
    expect(await chosenCell(page)).toEqual({ tableId: null, row: 0, column: 1 })
    const menu = page.getByTestId("table-context-menu")
    await expect(menu.getByRole("button", { name: "Merge right" })).toBeDisabled()
    await menu.getByRole("button", { name: "Row above" }).click()
    await expect(menu).toHaveCount(0)
    expect(cellsOf((await downloadedScreen(page)).objects)).toEqual({ links: { row: 1, column: 0 }, inner: { row: 2, column: 0 } })
  })

  test("outside every table the menu has no table commands", async ({ page }) => {
    await loadProject(page, await nestedProject())
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, 395, 295)
    await page.mouse.click(p.x, p.y, { button: "right" })
    await expect(page.getByRole("button", { name: "Select All" })).toBeVisible()
    await expect(page.getByTestId("table-context-menu")).toHaveCount(0)
  })
})

// The «+» at a line's end (table-overlay.ts handlePlaces): 6 px, 4 px out
// from the table's left edge or above its column strip (8 px, 6 px off).
test.describe("table editing: «+» at a line's end", () => {
  test("left of a row line inserts a row there; above a column line a column", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // Nothing selected: the screen's table is the active one.
    // The line between «Links» (23 px from 8) and row 1, half the 6 px gap down.
    await clickAt(page, 8 - 6 - 4, 8 + 23 + 3)
    let screen = await downloadedScreen(page)
    expect(cellsOf(screen.objects)).toEqual({ links: { row: 0, column: 0 }, inner: { row: 2, column: 0 } })
    expect(screen.layout.properties.rows).toBe(3)
    // The line between the two 50% columns: (400 - 16 - 6) / 2 = 189 from 8, half the gap on.
    await page.locator("[data-screen-root]").click()
    await clickAt(page, 8 + 189 + 3, 8 - 14 - 6 - 4)
    screen = await downloadedScreen(page)
    expect(screen.layout.properties.columns).toHaveLength(3)
    expect(screen.layout.properties.columns[1]).toEqual({ width: "auto" })
  })
})
