import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openAllTwisties, saveProjectAs } from "./helpers"

// Paste Above, Below, Left, Right (the user, 2026-11-15; lib/paste-beside.ts):
// what is on the clipboard snapped beside the object chosen, from the
// canvas's right-click menu - no aiming. A switcher 160 px tall was to go
// below a button group in a panel 33 px flat, and carried with Alt its
// outline and the pointer never agreed on where.

type Obj = Record<string, any>
const box = (id: string, x: number, y: number, z: number, extra: Obj = {}): Obj => ({ id, type: "box", x, y, width: 100, height: 30, zIndex: z, properties: { fillColor: "#3366cc", ...extra } })

async function project(objects: Obj[], topics: Obj[] = []): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.topics = [...(p.topics ?? []), ...topics]
  p.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `paste-beside-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

const saved = new WeakMap<Page, string>()
async function savedObjects(page: Page): Promise<ScreenObject[]> {
  const name = `paste-beside-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await saveProjectAs(page, name)
  saved.set(page, name)
  return (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project.screens.find((s: Obj) => s.id === "screen-1").objects
}
test.afterEach(async ({ page }) => {
  const name = saved.get(page)
  if (name) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
})

// The right-click menu, opened on an empty spot of the canvas.
async function menu(page: Page) {
  const { box: c } = await getMainCanvas(page)
  const at = devicePoint(c, 380, 290)
  await page.mouse.click(at.x, at.y, { button: "right" })
}

const all = (list: ScreenObject[]): ScreenObject[] => list.flatMap((o) => [o, ...all(o.children ?? [])])
const cellOf = (o: ScreenObject | undefined) => o?.properties?.cell

test("cut, choose one standing by itself, Paste Below: the two are a table, the pasted one in the row below", async ({ page }) => {
  await loadProject(page, await project([box("oben", 40, 40, 1), box("weg", 200, 200, 2)]))
  await openAllTwisties(page)
  await objectTreeRow(page, "weg").click()
  await page.keyboard.press("ControlOrMeta+x")
  await objectTreeRow(page, "oben").click()
  await menu(page)
  await page.getByRole("button", { name: "Paste Below", exact: true }).click()
  const objects = await savedObjects(page)
  expect(all(objects).some((o) => o.id === "weg")).toBe(false)
  const table = objects.find((o) => o.type === "table")!
  expect(table.children).toHaveLength(2)
  expect(cellOf(table.children!.find((c) => c.id === "oben"))).toMatchObject({ row: 0, column: 0 })
  const pasted = table.children!.find((c) => c.id !== "oben")!
  expect(pasted.type).toBe("box")
  expect(cellOf(pasted)).toMatchObject({ row: 1, column: 0 })
})

test("beside one in a table: Paste Above takes a new row above it, Paste Right a new column right of it", async ({ page }) => {
  const table = {
    id: "tabelle",
    type: "table",
    x: 40,
    y: 40,
    width: 1,
    height: 1,
    zIndex: 1,
    properties: { grid: 1, columns: [{}], rows: [{}, {}] },
    children: [box("a", 0, 0, 1, { cell: { row: 0, column: 0 } }), box("b", 0, 40, 2, { cell: { row: 1, column: 0 } })],
  }
  await loadProject(page, await project([table, box("neu", 200, 220, 2)]))
  await openAllTwisties(page)
  await objectTreeRow(page, "neu").click()
  await page.keyboard.press("ControlOrMeta+c")
  await objectTreeRow(page, "b").click()
  await menu(page)
  await page.getByRole("button", { name: "Paste Above", exact: true }).click()
  await objectTreeRow(page, "a").click()
  await menu(page)
  await page.getByRole("button", { name: "Paste Right", exact: true }).click()
  const objects = await savedObjects(page)
  const t = objects.find((o) => o.id === "tabelle")!
  expect(cellOf(t.children!.find((c) => c.id === "a"))).toMatchObject({ row: 0, column: 0 })
  expect(cellOf(t.children!.find((c) => c.id === "b"))).toMatchObject({ row: 2, column: 0 })
  const copies = t.children!.filter((c) => !["a", "b"].includes(c.id)).map(cellOf)
  expect(copies).toHaveLength(2)
  expect(copies).toContainEqual(expect.objectContaining({ row: 1, column: 0 }))
  expect(copies).toContainEqual(expect.objectContaining({ row: 0, column: 1 }))
  // The original stays where it was.
  expect(objects.some((o) => o.id === "neu")).toBe(true)
})

test("the heater's case: a switcher cut out of a table, pasted below what a panel of another switcher in that table holds", async ({ page }) => {
  const sw = (id: string, panel: string, cv: string, held: Obj[], cell: Obj, z: number): Obj => ({
    id,
    type: "switcher",
    x: 0,
    y: 0,
    width: 200,
    height: held.length ? 40 : 160,
    zIndex: z,
    properties: { topic: "pin/sw", comparisonOperator: "==", comparisonValue: "", cell },
    children: [{ id: panel, type: "panel", x: 0, y: 0, width: 200, height: held.length ? 40 : 160, zIndex: 1, properties: { comparisonOperator: "==", comparisonValue: cv }, children: held }],
  })
  const table = {
    id: "aussen",
    type: "table",
    x: 40,
    y: 20,
    width: 1,
    height: 1,
    zIndex: 1,
    properties: { grid: 1, columns: [{}], rows: [{}, {}] },
    children: [sw("weiche", "an", "on", [box("gruppe", 0, 0, 1)], { row: 0, column: 0 }, 1), sw("ansicht", "zeiger", "on", [], { row: 1, column: 0 }, 2)],
  }
  await loadProject(page, await project([table], [{ id: "t-sw", topic: "pin/sw", type: "text", examples: ["on"] }]))
  await openAllTwisties(page)
  await objectTreeRow(page, "ansicht").click()
  await page.keyboard.press("ControlOrMeta+x")
  await objectTreeRow(page, "gruppe").click()
  await menu(page)
  await page.getByRole("button", { name: "Paste Below", exact: true }).click()
  const objects = await savedObjects(page)
  expect(all(objects).some((o) => o.id === "ansicht")).toBe(false)
  const panel = all(objects).find((o) => o.id === "an")!
  const inner = panel.children!.find((c) => c.type === "table")!
  expect(cellOf(inner.children!.find((c) => c.id === "gruppe"))).toMatchObject({ row: 0, column: 0 })
  const pasted = inner.children!.find((c) => c.id !== "gruppe")!
  expect(pasted.type).toBe("switcher")
  expect(pasted.children!.map((p) => p.properties?.comparisonValue)).toEqual(["on"])
  expect(cellOf(pasted)).toMatchObject({ row: 1, column: 0 })
})

test("nothing chosen, or two on the clipboard: the four are there but greyed", async ({ page }) => {
  await loadProject(page, await project([box("eins", 40, 40, 1), box("zwei", 40, 120, 2)]))
  await openAllTwisties(page)
  await objectTreeRow(page, "eins").click()
  await menu(page)
  // Nothing on the clipboard yet.
  await expect(page.getByRole("button", { name: "Paste Below", exact: true })).toBeDisabled()
  // A click beside the menu closes it.
  await page.mouse.click(600, 900)
  await expect(page.getByRole("button", { name: "Paste Below", exact: true })).toHaveCount(0)
  await objectTreeRow(page, "eins").click()
  await objectTreeRow(page, "zwei").click({ modifiers: ["ControlOrMeta"] })
  await page.keyboard.press("ControlOrMeta+c")
  await objectTreeRow(page, "eins").click()
  await menu(page)
  for (const name of ["Paste Above", "Paste Below", "Paste Left", "Paste Right"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled()
})

// The same in the object list's right-click menu (the user, 2026-11-15).
async function treeMenu(page: Page, id: string, item: string) {
  await objectTreeRow(page, id).click({ button: "right" })
  await page.getByTestId("object-tree-menu").getByRole("button", { name: item, exact: true }).click()
}

test("in the object list: a right-click chooses the row; Cut, then Paste Below on another row", async ({ page }) => {
  await loadProject(page, await project([box("oben", 40, 40, 1), box("weg", 200, 200, 2)]))
  await openAllTwisties(page)
  await treeMenu(page, "weg", "Cut")
  await expect(objectTreeRow(page, "weg")).toHaveCount(0)
  await treeMenu(page, "oben", "Paste Below")
  const objects = await savedObjects(page)
  const table = objects.find((o) => o.type === "table")!
  expect(cellOf(table.children!.find((c) => c.id === "oben"))).toMatchObject({ row: 0, column: 0 })
  expect(cellOf(table.children!.find((c) => c.id !== "oben"))).toMatchObject({ row: 1, column: 0 })
})

test("Paste Replace: in a table the pasted one takes the cell, in a free area the place and Dock; the old one goes", async ({ page }) => {
  const table = {
    id: "tabelle",
    type: "table",
    x: 40,
    y: 40,
    width: 1,
    height: 1,
    zIndex: 1,
    properties: { grid: 1, columns: [{}, {}], rows: [{}] },
    children: [box("links", 0, 0, 1, { cell: { row: 0, column: 0 } }), box("rechts", 110, 0, 2, { cell: { row: 0, column: 1, anchor: { x: "stretch" } } })],
  }
  const free = {
    id: "flaeche",
    type: "free",
    x: 40,
    y: 150,
    width: 200,
    height: 100,
    zIndex: 2,
    properties: {},
    children: [box("oben", 0, 0, 1, { dock: "top" })],
  }
  const text = { id: "neu", type: "text", x: 300, y: 260, width: 60, height: 20, zIndex: 3, properties: { text: "Neu", color: "#000000" } }
  await loadProject(page, await project([table, free, text]))
  await openAllTwisties(page)
  await treeMenu(page, "neu", "Copy")
  await treeMenu(page, "rechts", "Paste Replace")
  await treeMenu(page, "oben", "Paste Replace")
  const objects = await savedObjects(page)
  expect(all(objects).some((o) => o.id === "rechts" || o.id === "oben")).toBe(false)
  const t = objects.find((o) => o.id === "tabelle")!
  const inCell = t.children!.find((c) => c.id !== "links")!
  expect(inCell.type).toBe("text")
  expect(cellOf(inCell)).toEqual({ row: 0, column: 1 })
  const f = objects.find((o) => o.id === "flaeche")!
  expect(f.children).toHaveLength(1)
  expect(f.children![0]).toMatchObject({ type: "text", properties: { dock: "top", text: "Neu" } })
  // The copy's original stays.
  expect(objects.some((o) => o.id === "neu")).toBe(true)
})
