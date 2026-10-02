import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow } from "./helpers"
import { stepPx } from "../lib/size-scale"

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

// Task 4: with a tool over a table, an empty cell lights up and a click
// puts the object there; a row line inserts a row; an occupied cell takes
// nothing. The table (withTable) stands at 40,40, its rows 23 px high, the
// gap 6 px (no scale on this device: 4 px/mm).
test.describe("placing into a table", () => {
  async function clickWithText(page: Page, x: number, y: number) {
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, x, y)
    await page.mouse.move(p.x, p.y)
    await page.mouse.move(p.x + 1, p.y + 1)
    await page.mouse.click(p.x + 1, p.y + 1)
  }
  const tableChildren = async (page: Page) =>
    (await downloadedProject(page)).screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "the-table").children as Obj[]

  test("a click into an empty cell puts the object in that cell", async ({ page }) => {
    await loadProject(page, await withTable())
    await clickWithText(page, 250, 50)
    const placed = (await tableChildren(page)).filter((c) => !["name-1", "name-2"].includes(c.id))
    expect(placed).toHaveLength(1)
    expect(placed[0].properties.cell).toEqual({ row: 0, column: 1 })
  })

  test("a click on a row line inserts a row there, the rows below moving down", async ({ page }) => {
    await loadProject(page, await withTable())
    await clickWithText(page, 250, 66)
    const children = await tableChildren(page)
    const placed = children.find((c) => !["name-1", "name-2"].includes(c.id))!
    expect(placed.properties.cell).toEqual({ row: 1, column: 1 })
    expect(children.find((c) => c.id === "name-2")!.properties.cell).toEqual({ row: 2, column: 0 })
  })

  test("an occupied cell takes nothing", async ({ page }) => {
    await loadProject(page, await withTable())
    await clickWithText(page, 45, 50)
    expect((await tableChildren(page)).map((c) => c.id).sort()).toEqual(["name-1", "name-2"])
  })
})

// Task 5: moving into and within a table, on the canvas and in the object
// list; the list shows a table row by row.
test.describe("moving in tables", () => {
  async function withTableAndLoose(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(await withTable()))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const screen = project.screens.find((s: Obj) => s.id === "screen-1")
    screen.objects.push({ ...text("loose", "Frei", 5), x: 60, y: 260, width: 80 })
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `table-move-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }
  async function drag(page: Page, from: [number, number], to: [number, number]) {
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, from[0], from[1])
    const b = devicePoint(box, to[0], to[1])
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 10 })
    await page.mouse.up()
  }
  const cells = async (page: Page) => {
    const objects = (await downloadedProject(page)).screens.find((s: Obj) => s.id === "screen-1").objects as Obj[]
    const t = objects.find((o) => o.id === "the-table")!
    return { loose: objects.map((o) => o.id), inTable: Object.fromEntries(t.children.map((c: Obj) => [c.id, [c.properties.cell.row, c.properties.cell.column]])) }
  }

  test("an object on the screen dragged onto an empty cell lands in it", async ({ page }) => {
    await loadProject(page, await withTableAndLoose())
    await drag(page, [65, 265], [250, 50])
    const { loose, inTable } = await cells(page)
    expect(loose).not.toContain("loose")
    expect(inTable.loose).toEqual([0, 1])
  })

  test("an object in the table dragged to another cell; two selected keep their cells relative", async ({ page }) => {
    await loadProject(page, await withTable())
    await objectTreeRow(page, "name-2").click()
    // «Bad» from row 1 to the empty cell beside «Licht».
    await drag(page, [45, 80], [250, 50])
    expect((await cells(page)).inTable["name-2"]).toEqual([0, 1])

    // Both names, dragged by «Licht» to the free row: one under the other.
    await objectTreeRow(page, "name-1").click()
    await objectTreeRow(page, "name-2").click({ modifiers: ["Control"] })
    await drag(page, [45, 50], [45, 125])
    const after = (await cells(page)).inTable
    expect(after["name-2"][0] - after["name-1"][0]).toBe(0)
    expect(after["name-2"][1] - after["name-1"][1]).toBe(1)
  })

  test("the object list shows a table row by row, and a row dropped into a table goes to its free row", async ({ page }) => {
    await loadProject(page, await withTableAndLoose())
    const ids = await page.locator("[data-object-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-object-id")))
    expect(ids.indexOf("name-1")).toBeLessThan(ids.indexOf("name-2"))
    const target = objectTreeRow(page, "the-table")
    const height = (await target.boundingBox())!.height
    await objectTreeRow(page, "loose").dragTo(target, { targetPosition: { x: 40, y: height / 2 } })
    expect((await cells(page)).inTable.loose).toEqual([2, 0])
  })
})

// Task 6: on the active table, a handle on each inner column line moves
// width between the two columns; «+» below adds a row, at the right a
// column. withTable's table at 40,40, 300 wide; «Licht» makes its auto
// column 49 px (no font: 0.7 x 14 px a letter), the gap 6 px.
test.describe("column lines and «+»", () => {
  const AUTO = 49
  const GAP = 6
  const RIGHT = 40 + 300
  const S = stepPx("control", "s", 4)
  const bottom = 40 + 23 + GAP + 23 + GAP + S + GAP + S
  const table = async (page: Page) =>
    (await downloadedProject(page)).screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "the-table")
  async function clickAt(page: Page, x: number, y: number) {
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, x, y)
    await page.mouse.click(p.x, p.y)
  }

  test("dragging a column line makes both columns shares in the widths it leaves", async ({ page }) => {
    await loadProject(page, await withTable())
    await objectTreeRow(page, "the-table").click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 40 + AUTO + GAP / 2, 40)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 50, from.y, { steps: 10 })
    await page.mouse.up()
    const [left, right] = (await table(page)).properties.columns
    const total = 300 - GAP
    expect(left.width.share).toBeCloseTo((100 * (AUTO + 50)) / total, 0)
    expect(right.width.share).toBeCloseTo((100 * (total - AUTO - 50)) / total, 0)
  })

  test("«+» below adds a row, «+» at the right a column; each one undo step", async ({ page }) => {
    await loadProject(page, await withTable())
    await objectTreeRow(page, "the-table").click()
    await clickAt(page, (40 + RIGHT) / 2, bottom + 12)
    expect((await table(page)).properties.rows).toBe(4)
    await clickAt(page, RIGHT + 12, (40 + bottom + S + GAP) / 2)
    expect((await table(page)).properties.columns).toHaveLength(3)
    await page.keyboard.press("ControlOrMeta+z")
    expect((await table(page)).properties.columns).toHaveLength(2)
    await page.keyboard.press("ControlOrMeta+z")
    expect((await table(page)).properties.rows).toBe(3)
  })
})
