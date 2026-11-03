import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// Placing (docs/2026-11-03-placing.md): without a key into the free area or
// the empty cell under the pointer, else free; with Alt tables are built; a
// hint at the pointer says which, and shows Alt where it would do something
// else.

type Obj = Record<string, any>

const text = (id: string, x: number, y: number, extra: Obj = {}) => ({ id, type: "text", x, y, width: 60, height: 20, zIndex: 1, properties: { text: id, ...extra } })
const card = { id: "card", type: "free", x: 220, y: 160, width: 150, height: 110, zIndex: 1, properties: { look: "card" }, children: [] }
// A table of two columns and two rows, its cell at row 1, column 1 empty.
const table = {
  id: "grid",
  type: "table",
  x: 220,
  y: 20,
  width: 130,
  height: 50,
  zIndex: 1,
  properties: { grid: 1, columns: [{}, {}], rows: [{}, {}] },
  children: [text("a", 0, 0, { cell: { row: 0, column: 0 } }), text("b", 70, 0, { cell: { row: 0, column: 1 } }), text("c", 0, 30, { cell: { row: 1, column: 0 } })],
}

async function project(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `placing-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
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
const parentOf = (list: Obj[], id: string, parent: Obj | null = null): Obj | null | undefined => {
  for (const o of list) {
    if (o.id === id) return parent
    const inner = parentOf(o.children ?? [], id, o)
    if (inner !== undefined) return inner
  }
  return undefined
}

type Hint = { now: string | null; alt: string | null; held: boolean } | null
async function hint(page: Page): Promise<Hint> {
  const { canvas } = await getMainCanvas(page)
  const raw = await canvas.getAttribute("data-place-hint")
  return raw ? JSON.parse(raw) : null
}

// Pressed at `from`, moved to `to`; `alt` held from the start of the move,
// or `altAt: "end"` pressed only at the end without moving, or "released"
// held and let go again before letting go of the mouse. Returns the hint
// shown just before letting go.
async function carry(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { alt?: boolean; altAt?: "end" | "released" } = {}): Promise<Hint> {
  const { box } = await getMainCanvas(page)
  const a = devicePoint(box, from.x, from.y)
  const b = devicePoint(box, to.x, to.y)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 4, a.y + 4)
  if (opts.alt || opts.altAt === "released") await page.keyboard.down("Alt")
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
  if (opts.altAt === "end") await page.keyboard.down("Alt")
  if (opts.altAt === "released") await page.keyboard.up("Alt")
  const shown = await hint(page)
  await page.mouse.up()
  if (opts.alt || opts.altAt === "end") await page.keyboard.up("Alt")
  return shown
}

test("no key: let go beside an object it lies free; the hint offers Alt for a table", async ({ page }) => {
  await loadProject(page, await project([text("still", 20, 200), text("moving", 20, 260)]))
  // «moving» held at its middle (50, 270), let go with its left edge 3 px right of «still» (80).
  const shown = await carry(page, { x: 50, y: 270 }, { x: 113, y: 210 })
  expect(shown).toEqual({ now: "Free", alt: "Table", held: false })
  const objects = await saved(page)
  expect(objects.some((o) => o.type === "table")).toBe(false)
  expect(find(objects, "moving")).toMatchObject({ x: 83, y: 200 })
})

test("Alt: the same drop makes a table of the two", async ({ page }) => {
  await loadProject(page, await project([text("still", 20, 200), text("moving", 20, 260)]))
  const shown = await carry(page, { x: 50, y: 270 }, { x: 113, y: 210 }, { alt: true })
  expect(shown).toEqual({ now: "Table", alt: null, held: true })
  const objects = await saved(page)
  const made = objects.find((o) => o.type === "table")
  expect(made?.children.map((c: Obj) => c.id).sort()).toEqual(["moving", "still"])
})

test("Alt pressed at the end without moving builds the table; held and let go again it lies free", async ({ page }) => {
  await loadProject(page, await project([text("still", 20, 200), text("moving", 20, 260)]))
  expect(await carry(page, { x: 50, y: 270 }, { x: 113, y: 210 }, { altAt: "end" })).toEqual({ now: "Table", alt: null, held: true })
  expect((await saved(page)).some((o) => o.type === "table")).toBe(true)
  await loadProject(page, await project([text("still", 20, 200), text("moving", 20, 260)]))
  expect(await carry(page, { x: 50, y: 270 }, { x: 113, y: 210 }, { altAt: "released" })).toEqual({ now: "Free", alt: "Table", held: false })
  expect((await saved(page)).some((o) => o.type === "table")).toBe(false)
})

test("no key: the pointer over an empty cell puts it there; over an occupied one it lies free", async ({ page }) => {
  await loadProject(page, await project([table, text("moving", 20, 260)]))
  // The table is laid out to its texts: the empty cell, row 1 column 1, is
  // below «b» and beside «c».
  let objects = await saved(page)
  const grid = find(objects, "grid")!
  const empty = { x: grid.x + find(objects, "b")!.x + 5, y: grid.y + find(objects, "c")!.y + 5 }
  expect(await carry(page, { x: 50, y: 270 }, empty)).toMatchObject({ now: "Into cell" })
  objects = await saved(page)
  expect(parentOf(objects, "moving")?.id).toBe("grid")
  expect(find(objects, "moving")!.properties.cell).toMatchObject({ row: 1, column: 1 })
  await loadProject(page, await project([table, text("moving", 20, 260)]))
  // Over «a».
  expect((await carry(page, { x: 50, y: 270 }, { x: grid.x + 5, y: grid.y + 5 }))?.now).not.toBe("Into cell")
  objects = await saved(page)
  expect(parentOf(objects, "moving")).toBeNull()
})

test("no key: over a card it goes into the card, outlined; Alt changes nothing there but offers nothing either", async ({ page }) => {
  await loadProject(page, await project([card, text("moving", 20, 260)]))
  expect(await carry(page, { x: 50, y: 270 }, { x: 290, y: 210 })).toEqual({ now: "Into Card", alt: null, held: false })
  const objects = await saved(page)
  expect(parentOf(objects, "moving")?.id).toBe("card")
})

test("a new object from a tool: over a card it goes into the card", async ({ page }) => {
  await loadProject(page, await project([card, text("still", 20, 200)]))
  const { box } = await getMainCanvas(page)
  // The Text tool, pressed on the card and let go there.
  await page.getByRole("button", { name: "Text", exact: true }).first().click()
  const on = devicePoint(box, 290, 210)
  await page.mouse.move(on.x, on.y)
  await page.mouse.down()
  await page.mouse.move(on.x + 3, on.y + 3)
  await page.mouse.move(on.x, on.y)
  expect((await hint(page))?.now).toBe("Into Card")
  await page.mouse.up()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  let objects = await saved(page)
  const card2 = find(objects, "card")!
  expect(card2.children.length).toBe(1)
  expect(card2.children[0].type).toBe("text")
})
