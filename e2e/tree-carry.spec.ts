import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { layoutProject } from "../lib/layout"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, saveProjectAs } from "./helpers"

// Carrying from the object tree, and tables merged
// (docs/2026-11-07-tree-carry-and-merge.md). The combined project's first
// screen, 400 x 300, holds two cards, each with a table of two texts - as
// «Grauwasser» and «Frischwasser» on a camper's home screen - or the two
// tables on their own.

type Obj = Record<string, any>

const text = (id: string, words: string, column: number): Obj => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 60,
  height: 23,
  zIndex: column + 1,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent", cell: { row: 0, column } },
})
const table = (id: string, x: number, y: number, children: Obj[], more: Obj = {}): Obj => ({
  id,
  type: "table",
  x,
  y,
  width: 1,
  height: 1,
  zIndex: 1,
  properties: { grid: 1, columns: [{}, {}], rows: [{}], ...more },
  children,
})
const card = (id: string, y: number, child: Obj): Obj => ({
  id,
  type: "free",
  x: 20,
  y,
  width: 360,
  height: 60,
  zIndex: y,
  properties: { look: "card", padding: 2 },
  children: [child],
})

async function project(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(layoutProject(p)))
  const out = path.join(os.tmpdir(), `tree-carry-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}
const grau = () => table("grau", 10, 10, [text("g-name", "Grau", 0), text("g-value", "32", 1)], { dock: "fill" })
const frisch = () => table("frisch", 10, 10, [text("f-name", "Frisch", 0), text("f-value", "68", 1)], { dock: "fill" })
const cards = () => project([card("k-grau", 20, grau()), card("k-frisch", 100, frisch())])

// The first screen's objects as saved, under a name of its own; removed after the test.
const savedAs = new WeakMap<Page, string>()
async function saved(page: Page): Promise<ScreenObject[]> {
  const name = `tree-carry-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await saveProjectAs(page, name)
  savedAs.set(page, name)
  const project = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
  return project.screens.find((s: Obj) => s.id === "screen-1").objects
}
test.afterEach(async ({ page }) => {
  const name = savedAs.get(page)
  if (name) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
})
const find = (list: ScreenObject[], id: string): ScreenObject | undefined => {
  for (const o of list) {
    if (o.id === id) return o
    const inner = o.children && find(o.children, id)
    if (inner) return inner
  }
  return undefined
}

/** A row of the tree picked up and carried, in steps, to a point on the page; `before` runs before it is let go. */
async function carryRow(page: Page, id: string, to: { x: number; y: number }, before?: () => Promise<void>) {
  const row = (await objectTreeRow(page, id).boundingBox())!
  await page.mouse.move(row.x + 40, row.y + row.height / 2)
  await page.mouse.down()
  await page.mouse.move(row.x + 40, row.y + row.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.move(to.x + 1, to.y, { steps: 2 })
  if (before) await before()
  await page.mouse.up()
}

test("a table's row dropped onto another table's row in the tree merges the two", async ({ page }) => {
  await loadProject(page, await cards())
  const target = (await objectTreeRow(page, "frisch").boundingBox())!
  await carryRow(page, "grau", { x: target.x + 60, y: target.y + target.height / 2 })
  const objects = await saved(page)
  expect(find(objects, "grau")).toBeUndefined()
  const merged = find(objects, "frisch")!
  expect(merged.children!.map((c) => [c.id, c.properties?.cell?.row, c.properties?.cell?.column])).toEqual([
    ["f-name", 0, 0],
    ["f-value", 0, 1],
    ["g-name", 1, 0],
    ["g-value", 1, 1],
  ])
  // Its card is left empty; the other card holds the table.
  expect(find(objects, "k-grau")!.children ?? []).toEqual([])
})

test("an object in a table, carried from the tree onto the canvas, lies free where it was let go, held at its middle", async ({ page }) => {
  await loadProject(page, await cards())
  const { canvas, box } = await getMainCanvas(page)
  const at = devicePoint(box, 300, 250)
  await carryRow(page, "g-name", at, async () => {
    // Over the canvas it is carried, onto the screen itself.
    await expect.poll(() => canvas.getAttribute("data-tree-carry")).toBe("screen")
  })
  const objects = await saved(page)
  const moved = objects.find((o) => o.id === "g-name")!
  expect(moved).toBeDefined()
  expect(moved.properties?.cell).toBeUndefined()
  expect(Math.abs(moved.x + moved.width / 2 - 300)).toBeLessThanOrEqual(3)
  expect(Math.abs(moved.y + moved.height / 2 - 250)).toBeLessThanOrEqual(3)
  // The table left with one text dissolves into it, in its card.
  expect(find(objects, "grau")).toBeUndefined()
  expect(find(objects, "k-grau")!.children!.map((c) => c.id)).toEqual(["g-value"])
})

test("a table carried from the tree over a card goes into the card", async ({ page }) => {
  await loadProject(page, await cards())
  const { canvas, box } = await getMainCanvas(page)
  await carryRow(page, "grau", devicePoint(box, 300, 130), async () => {
    await expect.poll(() => canvas.getAttribute("data-place-area")).toBe("k-frisch")
  })
  const objects = await saved(page)
  expect(find(objects, "k-frisch")!.children!.map((c) => c.id).sort()).toEqual(["frisch", "grau"])
})

test("a selected table dragged with Alt just under another merges into it, one undo takes it back", async ({ page }) => {
  await loadProject(page, await project([table("frisch", 100, 60, [text("f-name", "Frisch", 0), text("f-value", "68", 1)]), table("grau", 100, 200, [text("g-name", "Grau", 0), text("g-value", "32", 1)])]))
  const { canvas, box } = await getMainCanvas(page)
  // «grau» chosen by a click, then held 5 px below its top and carried
  // until its top edge is 3 px under «frisch» (60 + 23 high).
  const from = devicePoint(box, 110, 205)
  const to = devicePoint(box, 110, 60 + 23 + 3 + 5)
  await page.mouse.click(from.x, from.y)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.keyboard.down("Alt")
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12)
  await expect.poll(async () => JSON.parse((await canvas.getAttribute("data-place-hint")) ?? "{}").now).toBe("Merge")
  await page.mouse.up()
  await page.keyboard.up("Alt")
  const objects = await saved(page)
  expect(objects.map((o) => o.id)).toEqual(["frisch"])
  expect(objects[0].children!.map((c) => [c.id, c.properties?.cell?.row, c.properties?.cell?.column])).toEqual([
    ["f-name", 0, 0],
    ["f-value", 0, 1],
    ["g-name", 1, 0],
    ["g-value", 1, 1],
  ])
  await page.keyboard.press("ControlOrMeta+z")
  await page.keyboard.press("ControlOrMeta+s")
  await expect
    .poll(async () => {
      const p = (await (await page.request.get(`/api/projects/${encodeURIComponent(savedAs.get(page)!)}`)).json()).project
      return p.screens.find((s: Obj) => s.id === "screen-1").objects.map((o: Obj) => o.id).sort()
    })
    .toEqual(["frisch", "grau"])
})

test("a docked table dragged on the canvas shows its outline following the pointer; Esc puts nothing out of place", async ({ page }) => {
  await loadProject(page, await cards())
  const { canvas, box } = await getMainCanvas(page)
  // Chosen in the tree, where it is one click away however deep it stands.
  await objectTreeRow(page, "grau").click()
  // Pressed in its first cell, away from its column line.
  const from = devicePoint(box, 45, 45)
  const to = devicePoint(box, 45, 225)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x, from.y + ((to.y - from.y) * i) / 10)
  const outline = JSON.parse((await canvas.getAttribute("data-dock-drag")) ?? "null")
  expect(outline).not.toBeNull()
  // Its outline moved with the pointer, 180 px down.
  expect(Math.round(outline.y)).toBeGreaterThan(20 + 2 + 150)
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await expect.poll(() => canvas.getAttribute("data-dock-drag")).toBeNull()
  const objects = await saved(page)
  expect(find(objects, "k-grau")!.children!.map((c) => c.id)).toEqual(["grau"])
})
