import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow } from "./helpers"

// Tables on the canvas (docs/2026-10-02-layout-tables.md, module
// table-canvas): the Table tool, the lines every table shows in the editor
// and none in the preview.

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

// A table on the first screen of the combined project (a free screen): two
// names in its first column, one of them with a box beside it.
async function withTable(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = [
    {
      id: "the-table",
      type: "table",
      x: 40,
      y: 40,
      width: 300,
      height: 200,
      zIndex: 1,
      properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 3 },
      children: [text("name-1", "Licht", 0, { row: 0, column: 0 }), text("name-2", "Bad", 1, { row: 1, column: 0 })],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `table-canvas-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function downloadedProject(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

test.describe("tables on the canvas: the tool and the lines", () => {
  test("the Layout tools are Table and Free; a drawn table is a name and a control column with one row", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(page.getByRole("button", { name: "Table", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Free", exact: true })).toBeVisible()
    for (const gone of ["Stack", "Row", "Grid", "Spacer"]) await expect(page.getByRole("button", { name: gone, exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "Table", exact: true }).click()
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, 60, 60)
    const b = devicePoint(box, 300, 200)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 5 })
    await page.mouse.up()
    const objects = (await downloadedProject(page)).screens.find((s: Obj) => s.id === "screen-1").objects
    const table = objects.find((o: Obj) => o.type === "table")
    expect(table.properties.columns).toEqual([{ width: "auto" }, { width: { share: 100 } }])
    expect(table.properties.rows).toBe(1)
  })

  test("a table's lines show in the editor, empty cells included, and not in the preview", async ({ page }) => {
    await loadProject(page, await withTable())
    // Nothing selected: the table is not active, its lines thin.
    await page.locator("[data-screen-root]").click()
    const { box } = await getMainCanvas(page)
    // Its lower part: an empty row, nothing in it but lines.
    const corner = devicePoint(box, 38, 100)
    const clip = { x: corner.x, y: corner.y, width: 306, height: 140 }
    const editor = await page.screenshot({ clip })
    await page.getByRole("button", { name: "Preview" }).click()
    await expect(page.getByRole("button", { name: "Exit Preview" })).toBeVisible()
    const preview = await page.screenshot({ clip })
    expect(editor.equals(preview)).toBe(false)
  })

  test("the active table's lines are strong: selected, or holding the selection", async ({ page }) => {
    await loadProject(page, await withTable())
    await page.locator("[data-screen-root]").click()
    const { box } = await getMainCanvas(page)
    const corner = devicePoint(box, 38, 100)
    const clip = { x: corner.x, y: corner.y, width: 306, height: 140 }
    const quiet = await page.screenshot({ clip })
    await objectTreeRow(page, "name-2").click()
    expect((await page.screenshot({ clip })).equals(quiet)).toBe(false)
  })
})
