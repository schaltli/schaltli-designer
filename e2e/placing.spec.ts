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
// The hint's words as last shown by carry().
let lastText: string | null = null
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
  lastText = await (await getMainCanvas(page)).canvas.getAttribute("data-place-hint-text")
  await page.mouse.up()
  if (opts.alt || opts.altAt === "end") await page.keyboard.up("Alt")
  return shown
}

test("no key: let go beside an object it lies free; the hint offers Alt for a table", async ({ page }) => {
  await loadProject(page, await project([text("still", 20, 200), text("moving", 20, 260)]))
  // «moving» held at its middle (50, 270), let go with its left edge 3 px right of «still» (80).
  const shown = await carry(page, { x: 50, y: 270 }, { x: 113, y: 210 })
  expect(shown).toEqual({ now: "Free", alt: "Table", held: false })
  // In words, as a tooltip: what releasing does, and below it the key.
  expect(lastText).toBe("Release mouse button to drop into label-tests-white-background / Press [Alt] to make a table")
  const objects = await saved(page)
  expect(objects.some((o) => o.type === "table")).toBe(false)
  expect(find(objects, "moving")).toMatchObject({ x: 83, y: 200 })
})

test("Alt: the same drop makes a table of the two", async ({ page }) => {
  await loadProject(page, await project([text("still", 20, 200), text("moving", 20, 260)]))
  const shown = await carry(page, { x: 50, y: 270 }, { x: 113, y: 210 }, { alt: true })
  expect(shown).toEqual({ now: "Table", alt: null, held: true })
  expect(lastText).toBe("Release mouse button to make a table / Release [Alt] to drop into label-tests-white-background")
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
  expect(lastText).toBe("Release mouse button to drop into Card")
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

// From the ribbon (docs/2026-11-05-quick-blocks.md, decision 7): a tile
// carried onto the screen lands by the same rule as one pressed there.
test("a tool's tile dragged from the ribbon onto a card goes into the card", async ({ page }) => {
  await loadProject(page, await project([card, text("still", 20, 200)]))
  const { box } = await getMainCanvas(page)
  const tile = (await page.getByTestId("tools-ribbon").getByRole("button", { name: "Text", exact: true }).first().boundingBox())!
  const on = devicePoint(box, 290, 210)
  await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2)
  await page.mouse.down()
  await page.mouse.move(on.x, on.y, { steps: 12 })
  await page.mouse.move(on.x + 2, on.y + 2)
  expect((await hint(page))?.now).toBe("Into Card")
  await page.mouse.up()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  const card2 = find(await saved(page), "card")!
  expect(card2.children.map((c: Obj) => c.type)).toEqual(["text"])
})

test("a tool's tile dragged from the ribbon into an empty cell goes into the cell", async ({ page }) => {
  await loadProject(page, await project([table]))
  // The empty cell, row 1 column 1: below «b» and beside «c», as laid out.
  const laid = await saved(page)
  const grid0 = find(laid, "grid")!
  const { box } = await getMainCanvas(page)
  const tile = (await page.getByTestId("tools-ribbon").getByRole("button", { name: "Text", exact: true }).first().boundingBox())!
  const on = devicePoint(box, grid0.x + find(laid, "b")!.x + 5, grid0.y + find(laid, "c")!.y + 5)
  await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2)
  await page.mouse.down()
  await page.mouse.move(on.x, on.y, { steps: 12 })
  await page.mouse.move(on.x + 1, on.y + 1)
  expect((await hint(page))?.now).toBe("Into cell")
  await page.mouse.up()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  const grid = find(await saved(page), "grid")!
  const added = grid.children.find((c: Obj) => !["a", "b", "c"].includes(c.id))
  expect(added?.properties?.cell).toMatchObject({ row: 1, column: 1 })
})

// A tile clicked (docs/2026-11-05-quick-blocks.md, decision 7): its object
// hangs at the pointer at once, no button held, and a click sets it down;
// Esc, the same tile again or a click off the screen give it up.
const ribbonTile = (page: Page, name: string) => page.getByTestId("tools-ribbon").getByRole("button", { name, exact: true }).first()

test("a clicked tile: the object hangs at the pointer without a button, the hint says Click, a click sets it down", async ({ page }) => {
  await loadProject(page, await project([card, text("still", 20, 200)]))
  const { box, canvas } = await getMainCanvas(page)
  await ribbonTile(page, "Text").click()
  const on = devicePoint(box, 290, 210)
  await page.mouse.move(on.x, on.y, { steps: 10 })
  await expect(canvas).toHaveAttribute("data-carrying", "text")
  expect((await hint(page))?.now).toBe("Into Card")
  expect(await canvas.getAttribute("data-place-hint-text")).toBe("Click to drop into Card")
  await page.mouse.click(on.x, on.y)
  await expect(canvas).not.toHaveAttribute("data-carrying", /.+/)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  const card2 = find(await saved(page), "card")!
  expect(card2.children.map((c: Obj) => c.type)).toEqual(["text"])
})

for (const way of ["Esc", "the same tile again", "a click off the screen"] as const) {
  test(`a hanging object is given up by ${way}, and the tool is Select`, async ({ page }) => {
    await loadProject(page, await project([text("still", 20, 200)]))
    const { box, canvas } = await getMainCanvas(page)
    await ribbonTile(page, "Box").click()
    const on = devicePoint(box, 250, 150)
    await page.mouse.move(on.x, on.y, { steps: 10 })
    await expect(canvas).toHaveAttribute("data-carrying", "box")
    if (way === "Esc") await page.keyboard.press("Escape")
    else if (way === "the same tile again") await ribbonTile(page, "Box").click()
    else {
      const ribbon = (await page.getByTestId("tools-ribbon").boundingBox())!
      await page.mouse.click(ribbon.x + ribbon.width - 10, ribbon.y + ribbon.height / 2)
    }
    await expect(canvas).not.toHaveAttribute("data-carrying", /.+/)
    // Select: moving over the screen and clicking makes nothing.
    await page.mouse.move(on.x, on.y, { steps: 5 })
    await expect(canvas).not.toHaveAttribute("data-carrying", /.+/)
    await page.mouse.click(on.x, on.y)
    expect((await saved(page)).map((o: Obj) => o.id)).toEqual(["still"])
  })
}

test("a hanging object, another tile clicked: that one hangs instead", async ({ page }) => {
  await loadProject(page, await project([text("still", 20, 200)]))
  const { box, canvas } = await getMainCanvas(page)
  await ribbonTile(page, "Box").click()
  const on = devicePoint(box, 250, 150)
  await page.mouse.move(on.x, on.y, { steps: 10 })
  await expect(canvas).toHaveAttribute("data-carrying", "box")
  await ribbonTile(page, "Text").click()
  await page.mouse.move(on.x, on.y, { steps: 10 })
  await expect(canvas).toHaveAttribute("data-carrying", "text")
  await page.mouse.click(on.x, on.y)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  expect((await saved(page)).map((o: Obj) => o.type).sort()).toEqual(["text", "text"])
})
