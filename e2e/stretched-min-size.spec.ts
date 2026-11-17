import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// An object stretched in a table's cell fills the cell, and the size it has
// of its own is the least it asks of its column and row
// (cell.drawnWidth/drawnHeight, lib/snap-table.ts). Frame shows and takes
// that as «Min W» and «Min H»: a card stretched across its cell kept 266 px
// nobody could see or change, and its table stood 62 px over the edge of the
// screen (the user, 2026-11-16).

type Obj = Record<string, any>

const box = (id: string, y: number, width: number, height: number, cell: Obj): Obj => ({
  id,
  type: "box",
  x: 0,
  y,
  width,
  height,
  zIndex: 1,
  properties: { fillColor: "panel", strokeColor: "outline", strokeWidth: 1, cell },
})

// One column, two rows: «breit» stretched both ways and asking for 150 × 40,
// «schmal» 60 × 20 as it is.
const table = (): Obj => ({
  id: "tabelle",
  type: "table",
  x: 20,
  y: 20,
  width: 150,
  height: 66,
  zIndex: 3,
  properties: { grid: 1, columns: [{}], rows: [{}, {}] },
  children: [
    box("breit", 0, 150, 40, { row: 0, column: 0, anchor: { x: "stretch", y: "stretch" }, drawnWidth: 150, drawnHeight: 40 }),
    box("schmal", 46, 60, 20, { row: 1, column: 0 }),
  ],
})

async function projectWith(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `stretched-min-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function savedTable(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "tabelle")
}

test("stretched in its cell, Frame names its sizes «Min W» and «Min H» and shows what it asks for", async ({ page }) => {
  await loadProject(page, await projectWith([table()]))
  await objectTreeRow(page, "breit").click()
  await openFrameSection(page)
  await expect(page.locator('label[for="width"]')).toHaveText("Min W")
  await expect(page.locator('label[for="height"]')).toHaveText("Min H")
  await expect(page.locator("#width")).toHaveValue("150")
  await expect(page.locator("#height")).toHaveValue("40")

  // Not stretched: a width and a height, as ever.
  await objectTreeRow(page, "schmal").click()
  await openFrameSection(page)
  await expect(page.locator('label[for="width"]')).toHaveText("W")
  await expect(page.locator('label[for="height"]')).toHaveText("H")
})

test("a smaller «Min W» typed: the column, the table and the object are that narrow", async ({ page }) => {
  await loadProject(page, await projectWith([table()]))
  await objectTreeRow(page, "breit").click()
  await openFrameSection(page)
  await page.locator("#width").fill("80")
  await page.locator("#width").blur()
  await expect(page.locator("#width")).toHaveValue("80")
  const saved = await savedTable(page)
  const breit = saved.children.find((c: Obj) => c.id === "breit")
  expect(saved.width).toBe(80)
  expect(breit.width).toBe(80)
  expect(breit.properties.ownSize.width).toBe(80)
})

test("«Min W» below what the column holds: the object still fills the column, and asks for less", async ({ page }) => {
  await loadProject(page, await projectWith([table()]))
  await objectTreeRow(page, "breit").click()
  await openFrameSection(page)
  await page.locator("#width").fill("30")
  await page.locator("#width").blur()
  await expect(page.locator("#width")).toHaveValue("30")
  const saved = await savedTable(page)
  const breit = saved.children.find((c: Obj) => c.id === "breit")
  // «schmal» holds the column at 60.
  expect(saved.width).toBe(60)
  expect(breit.width).toBe(60)
  expect(breit.properties.ownSize.width).toBe(30)
})

test("a «Min H» typed is the row's height", async ({ page }) => {
  await loadProject(page, await projectWith([table()]))
  await objectTreeRow(page, "breit").click()
  await openFrameSection(page)
  await page.locator("#height").fill("28")
  await page.locator("#height").blur()
  await expect(page.locator("#height")).toHaveValue("28")
  const saved = await savedTable(page)
  const breit = saved.children.find((c: Obj) => c.id === "breit")
  expect(breit.height).toBe(28)
  expect(breit.properties.ownSize.height).toBe(28)
})
