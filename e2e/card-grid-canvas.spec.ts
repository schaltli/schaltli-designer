import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// A grid of cards in the designer (docs/2026-11-03-card-grid.md): four cards
// dragged together into a 2 × 2 table, each filling its cell; then Gap in
// the Table section and both columns set to fill at their signs, which is
// what «Equal columns» was until 2026-11-16 (docs/2026-11-16-table-sizes.md).

type Obj = Record<string, any>

// Four cards, 80 × 40, free on the 400 × 300 screen, far from each other.
const card = (id: string, x: number, y: number, width = 80) => ({
  id,
  type: "free",
  x,
  y,
  width,
  height: 40,
  zIndex: 1,
  properties: { look: "card" },
  children: [],
})

async function project(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.screens.find((s: Obj) => s.id === "screen-1").objects = [card("a", 20, 20), card("b", 250, 20, 60), card("c", 20, 220), card("d", 250, 220)]
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `card-grid-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
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

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const { box } = await getMainCanvas(page)
  const a = devicePoint(box, from.x, from.y)
  const b = devicePoint(box, to.x, to.y)
  // Nothing selected and nothing open first, so the press takes the card.
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  // Alt held: tables are built (docs/2026-11-03-placing.md).
  await page.keyboard.down("Alt")
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
  await page.mouse.up()
  await page.keyboard.up("Alt")
}

test("four cards dragged together make a 2 × 2 grid, each filling its cell; Gap in the Table section, both columns fill", async ({ page }) => {
  await loadProject(page, await project())
  // «b» (held at its middle) let go with its left edge 3 px right of «a»'s.
  await drag(page, { x: 280, y: 40 }, { x: 133, y: 40 })
  // «c» let go with its top edge 3 px below the table.
  await drag(page, { x: 60, y: 240 }, { x: 60, y: 83 })
  let objects = await saved(page)
  const grid = objects.find((o) => o.type === "table")!
  expect(grid).toBeTruthy()
  // «d» into the empty cell, row 1, column 1.
  const b = grid.children.find((o: Obj) => o.id === "b")
  const c = grid.children.find((o: Obj) => o.id === "c")
  await drag(page, { x: 290, y: 240 }, { x: grid.x + b.x + b.width / 2, y: grid.y + c.y + c.height / 2 })
  objects = await saved(page)
  const t = objects.find((o) => o.type === "table")!
  expect(t.children.map((o: Obj) => o.id).sort()).toEqual(["a", "b", "c", "d"])
  for (const o of t.children) expect(o.properties.cell.anchor, o.id).toEqual({ x: "stretch", y: "stretch" })
  // Each card fills its cell: the cards of a column as wide as each other.
  const byId = (id: string) => t.children.find((o: Obj) => o.id === id)
  expect(byId("a").width).toBe(byId("c").width)
  expect(byId("b").width).toBe(byId("d").width)

  // The table: a click on the gap between its cards selects it.
  const { box } = await getMainCanvas(page)
  const between = devicePoint(box, t.x + byId("a").x + byId("a").width + 2, t.y + 10)
  await page.mouse.click(between.x, between.y)
  await expect(page.locator("#tableGap")).toBeVisible()
  await page.locator("#tableGap").fill("4")
  await page.locator("#tableGap").blur()
  // «Width» and «Equal columns» are gone: a column says itself what sets its width.
  await expect(page.locator("#tableWidth")).toHaveCount(0)
  await expect(page.getByText("Equal columns", { exact: true })).toHaveCount(0)
  // Each column's sign clicked twice: auto, fixed, fill.
  const { canvas } = await getMainCanvas(page)
  for (const index of [0, 1]) {
    for (let click = 0; click < 2; click++) {
      const signs = JSON.parse((await canvas.getAttribute("data-size-signs"))!) as Array<Obj>
      const sign = signs.find((s) => s.kind === "column" && s.index === index)!
      const at = devicePoint(box, sign.x + sign.width / 2, sign.y + sign.height / 2)
      await page.mouse.click(at.x, at.y)
    }
  }
  objects = await saved(page)
  const g = objects.find((o) => o.type === "table")!
  expect(g.properties).toMatchObject({ gapMm: 4, columns: [{ fill: true }, { fill: true }] })
  const w = (id: string) => g.children.find((o: Obj) => o.id === id).width
  expect(w("a")).toBe(w("b"))
  expect(w("a")).toBe(w("c"))
})
