import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// Dragging an object into a card and out again, on the canvas
// (docs/2026-11-03-drop-into-free.md, by the pointer since
// docs/2026-11-03-placing.md).

type Obj = Record<string, any>

const card = (children: Obj[] = []) => ({ id: "card", type: "free", x: 100, y: 60, width: 200, height: 150, zIndex: 1, properties: { look: "card" }, children })
const label = (x = 20, y = 250) => ({ id: "label", type: "text", x, y, width: 60, height: 20, zIndex: 2, properties: { text: "Wert" } })

async function project(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `drop-into-free-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page): Promise<Obj[]> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const p = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return p.screens.find((s: Obj) => s.id === "screen-1").objects
}

const find = (list: Obj[], id: string): Obj | undefined => {
  for (const o of list) {
    if (o.id === id) return o
    const inner = find(o.children ?? [], id)
    if (inner) return inner
  }
}

// From `from` to `to`, screen pixels; `fresh` lets go of any selection and
// open area first, so the press takes the object on the screen.
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { fresh?: boolean; alt?: boolean } = {}) {
  const { box } = await getMainCanvas(page)
  const a = devicePoint(box, from.x, from.y)
  const b = devicePoint(box, to.x, to.y)
  if (opts.fresh !== false) {
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
  }
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 4, a.y + 4)
  if (opts.alt) await page.keyboard.down("Alt")
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
  await page.mouse.up()
  if (opts.alt) await page.keyboard.up("Alt")
}

test("a text dragged onto a card goes into it where it was let go, and moves with the card", async ({ page }) => {
  await loadProject(page, await project([card(), label()]))
  // The label's middle (50, 260) to (200, 135), well inside the card.
  await drag(page, { x: 50, y: 260 }, { x: 200, y: 135 })
  let objects = await saved(page)
  expect(objects.map((o) => o.id)).toEqual(["card"])
  const inCard = find(objects, "label")!
  expect(find(objects, "card")!.children.map((c: Obj) => c.id)).toEqual(["label"])
  expect([inCard.x, inCard.y]).toEqual([170 - 100, 125 - 60])
  // The card is open, the label chosen in it: a click beside it leaves it.
  // Then the card dragged by an empty spot: the label goes with it.
  const { box } = await getMainCanvas(page)
  const beside = devicePoint(box, 380, 280)
  await page.mouse.click(beside.x, beside.y)
  await drag(page, { x: 120, y: 190 }, { x: 140, y: 200 })
  objects = await saved(page)
  expect(find(objects, "card")).toMatchObject({ x: 120, y: 70 })
  expect(find(objects, "label")).toMatchObject({ x: 70, y: 65 })
})

test("undo takes it out of the card in one step", async ({ page }) => {
  await loadProject(page, await project([card(), label()]))
  await drag(page, { x: 50, y: 260 }, { x: 200, y: 135 })
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page.keyboard.press("ControlOrMeta+z")
  const objects = await saved(page)
  expect(objects.map((o) => o.id).sort()).toEqual(["card", "label"])
  expect(find(objects, "label")).toMatchObject({ x: 20, y: 250 })
})

test("dragged out over the card's edge it is on the screen again, where it was let go", async ({ page }) => {
  await loadProject(page, await project([card([label(70, 65)])]))
  const { box } = await getMainCanvas(page)
  // Open the card on the label: a double click.
  const at = devicePoint(box, 200, 135)
  await page.keyboard.press("Escape")
  await page.mouse.dblclick(at.x, at.y)
  await drag(page, { x: 200, y: 135 }, { x: 200, y: 260 }, { fresh: false })
  const objects = await saved(page)
  expect(find(objects, "card")!.children ?? []).toEqual([])
  expect(objects.find((o) => o.id === "label")).toMatchObject({ x: 170, y: 250 })
})

test("with Alt, near the card's edge from outside it makes a table with the card", async ({ page }) => {
  await loadProject(page, await project([card(), label()]))
  // The label's left edge 3 px right of the card's right edge (300).
  await drag(page, { x: 50, y: 260 }, { x: 333, y: 135 }, { alt: true })
  const objects = await saved(page)
  const table = objects.find((o) => o.type === "table")
  expect(table, JSON.stringify(objects.map((o) => o.id))).toBeTruthy()
  expect(table!.children.map((c: Obj) => c.id).sort()).toEqual(["card", "label"])
})

test("with Alt, a table in the card takes it into a new column", async ({ page }) => {
  const cell = (id: string, column: number, x: number) => ({ id, type: "text", x, y: 0, width: 40, height: 20, zIndex: column + 1, properties: { text: id, cell: { row: 0, column } } })
  const table = { id: "inner-table", type: "table", x: 20, y: 40, width: 85, height: 20, zIndex: 1, properties: { grid: 1, columns: [{}, {}], rows: [{}] }, children: [cell("t1", 0, 0), cell("t2", 1, 45)] }
  await loadProject(page, await project([card([table]), label()]))
  // The table is laid out to its texts: 46 px wide, its right edge at 100 + 20 + 46 = 166.
  // The label's left edge 3 px right of it, its middle well inside the card.
  await drag(page, { x: 50, y: 260 }, { x: 199, y: 110 }, { alt: true })
  const objects = await saved(page)
  const inner = find(objects, "inner-table")!
  expect(inner.children.map((c: Obj) => c.id).sort()).toEqual(["label", "t1", "t2"])
  expect(find(objects, "label")!.properties.cell.column).toBe(2)
})
