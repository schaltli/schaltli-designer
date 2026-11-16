import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, getMainCanvas, loadProject, objectTreeRow } from "./helpers"

// A table's cell takes more than one object (docs/2026-11-16-areas.md, step
// 3, E6), in the designer: what is let go on an occupied cell without Alt
// goes into that cell and stands where it was let go; the cell is «Cell» in
// the object list while it holds more than one object. The model is in
// e2e/area-cell.spec.ts.
//
// The case is the user's «MaxxFan» of 2026-11-16: a label to stand above a
// button group that sits at the bottom of a row as tall as the card beside it.

type Obj = Record<string, any>

const box = (id: string, x: number, y: number, width: number, height: number, properties: Obj = {}): Obj => ({
  id,
  type: "box",
  x,
  y,
  width,
  height,
  zIndex: 1,
  properties: { fillColor: "#808080", strokeColor: "#000000", strokeWidth: 1, ...properties },
})

// A table at 20, 40: a card 150 × 80 and, bottom left in the cell beside it,
// a button 60 × 30. A label lies free below the table.
function objects(): Obj[] {
  return [
    {
      id: "tabelle",
      type: "table",
      x: 20,
      y: 40,
      width: 1,
      height: 1,
      zIndex: 1,
      properties: { grid: 1, columns: [{}, {}], rows: [{}] },
      children: [box("karte", 0, 0, 150, 80, { cell: { row: 0, column: 0 } }), { ...box("knopf", 0, 0, 60, 30, { cell: { row: 0, column: 1, anchor: { x: "left", y: "bottom" } } }), zIndex: 2 }],
    },
    { ...box("label", 60, 200, 50, 16), zIndex: 2 },
  ]
}

async function projectWith(list: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = list
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `area-cell-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page): Promise<Obj[]> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1").objects
}

// The 400 × 300 screen centred in the canvas at 100 %.
async function screenPoint(page: Page, x: number, y: number) {
  const { box: canvas } = await getMainCanvas(page)
  return { x: canvas.x + (canvas.width - 400) / 2 + x, y: canvas.y + (canvas.height - 300) / 2 + y }
}

async function carry(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await screenPoint(page, from.x, from.y)
  const b = await screenPoint(page, to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

const cellOf = (list: Obj[]) => list.find((o) => o.id === "tabelle")?.children.find((c: Obj) => c.id === "cell-knopf")

test("let go on an occupied cell, in its empty part: the object is in that cell, where it was let go", async ({ page }) => {
  await loadProject(page, await projectWith(objects()))
  await objectTreeRow(page, "label").click()
  // The cell beside the card is 176..236 × 40..120 on the screen; the
  // button stands at its bottom. The label's middle goes to 206, 55.
  await carry(page, { x: 85, y: 208 }, { x: 206, y: 55 })

  const now = await saved(page)
  const cell = cellOf(now)
  expect(cell, "the cell is an area").toBeTruthy()
  expect(cell.properties).toMatchObject({ cellArea: true, cell: { row: 0, column: 1, anchor: { x: "stretch", y: "stretch" } } })
  expect(cell.children.map((c: Obj) => c.id)).toEqual(["knopf", "label"])
  expect(now.find((o) => o.id === "label")).toBeUndefined()
  // Where it was let go: its middle at 206, 55 on the screen, the cell at 176, 40.
  const label = cell.children.find((c: Obj) => c.id === "label")
  expect([label.x, label.y]).toEqual([206 - 25 - 176, 55 - 8 - 40])
  // The button has not moved: bottom left in the cell.
  const knopf = cell.children.find((c: Obj) => c.id === "knopf")
  expect([knopf.x, knopf.y]).toEqual([0, 50])
  // And the table is as large as it was.
  const table = now.find((o) => o.id === "tabelle")!
  expect([table.x, table.y, table.height]).toEqual([20, 40, 80])

  // «Cell» in the object list, the two objects under it.
  await expect(objectTreeRow(page, "cell-knopf")).toBeVisible()
  await expect(objectTreeRow(page, "cell-knopf")).toContainText("Cell")
})

test("carried out again, the cell is a slot as before", async ({ page }) => {
  await loadProject(page, await projectWith(objects()))
  await objectTreeRow(page, "label").click()
  await carry(page, { x: 85, y: 208 }, { x: 206, y: 55 })
  expect(cellOf(await saved(page))).toBeTruthy()

  // The label is chosen and its cell open: out onto the screen below the table.
  await carry(page, { x: 206, y: 55 }, { x: 300, y: 220 })
  const now = await saved(page)
  expect(cellOf(now)).toBeUndefined()
  const knopf = now.find((o) => o.id === "tabelle")!.children.find((c: Obj) => c.id === "knopf")
  expect(knopf.properties.cell).toEqual({ row: 0, column: 1, anchor: { x: "left", y: "bottom" } })
  expect(now.find((o) => o.id === "label")).toBeTruthy()
  await expect(objectTreeRow(page, "cell-knopf")).toHaveCount(0)
})

// «Position» in place of «Cell» (decisions 8, 12, 13): the same fields an
// object has wherever it stands, and its cell's look.
test("alone in its cell an object shows Position with Dock Fill; docked Top, its cell is an area and it stands at the top", async ({ page }) => {
  await loadProject(page, await projectWith(objects()))
  await objectTreeRow(page, "knopf").click()
  await expect(page.getByRole("button", { name: /^Position/ })).toBeVisible()
  await expect(page.locator("#cellDock")).toHaveValue("fill")
  await expect(page.locator("#cellDock option")).toHaveText(["Fill", "Top", "Bottom", "Left", "Right"])
  await expect(page.locator("#cellVertical")).toHaveValue("bottom")

  await page.locator("#cellDock").selectOption("top")
  // In the area now: the Position of an area, docked Top.
  await expect(page.locator("#areaDock")).toHaveValue("top")
  const cell = cellOf(await saved(page))
  expect(cell.children.map((c: Obj) => [c.id, c.properties.dock])).toEqual([["knopf", "top"]])
  // At the top of its cell, across it: a box stretches.
  const knopf = cell.children[0]
  expect([knopf.x, knopf.y, knopf.width, knopf.height]).toEqual([0, 0, 60, 30])
  await expect(objectTreeRow(page, "cell-knopf")).toContainText("Cell")
})

test("a look on the cell: the cell is a card around its object, and stays one", async ({ page }) => {
  await loadProject(page, await projectWith(objects()))
  await objectTreeRow(page, "knopf").click()
  await expect(page.locator("#cellLook")).toHaveValue("none")
  await page.locator("#cellLook").selectOption("card")
  const cell = cellOf(await saved(page))
  expect(cell.properties).toMatchObject({ cellArea: true, look: "card" })
  expect(cell.children.map((c: Obj) => c.id)).toEqual(["knopf"])
  // The cell's own properties: «Cell», with its Look.
  await objectTreeRow(page, "cell-knopf").click()
  await expect(page.getByRole("button", { name: /^Cell/ })).toBeVisible()
  await expect(page.locator("#freeLook")).toHaveValue("card")
  // Set back to None, it keeps the fill and edge the look gave it, as an
  await page.locator("#freeLook").selectOption("none")
  const now = await saved(page)
  // area does: still seen, so still an area.
  expect(cellOf(now).properties.look).toBeUndefined()
})
