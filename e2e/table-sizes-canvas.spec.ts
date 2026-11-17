import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// What sets a size in a table, in the designer
// (docs/2026-11-16-table-sizes.md): each column and row carries a sign -
// «auto», its size in mm, «fill» - and a click on it steps to the next; a
// table is pulled at a handle like an area; Frame says in words where a
// width and a height come from. The model is in e2e/table-sizes.spec.ts and
// e2e/size-source.spec.ts.

type Obj = Record<string, any>

const box = (id: string, width: number, height: number, cell: Obj): Obj => ({
  id,
  type: "box",
  x: 0,
  y: 0,
  width,
  height,
  zIndex: 1,
  properties: { fillColor: "#808080", strokeColor: "#000000", strokeWidth: 1, cell: { ...cell, anchor: { x: "stretch", y: "stretch" } } },
})

// A table at 20, 40 of two boxes side by side, each filling its cell.
const tableOf = (columns: Obj[], extra: Obj = {}): Obj => ({
  id: "tabelle",
  type: "table",
  x: 20,
  y: 40,
  width: 1,
  height: 1,
  zIndex: 1,
  properties: { grid: 1, columns, rows: [{}], ...extra },
  children: [box("links", 60, 30, { row: 0, column: 0 }), box("rechts", 40, 30, { row: 0, column: 1 })],
})

async function projectWith(list: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = list
  // As this designer saves: nothing to migrate.
  project.settings = { ...(project.settings ?? {}), formatVersion: 4 }
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `table-sizes-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
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

type Sign = { kind: "column" | "row"; index: number; x: number; y: number; width: number; height: number; text: string; state: string }
async function signs(page: Page): Promise<Sign[]> {
  const { canvas } = await getMainCanvas(page)
  await expect(canvas).toHaveAttribute("data-size-signs", /\[/)
  return JSON.parse((await canvas.getAttribute("data-size-signs"))!)
}
async function clickSign(page: Page, kind: "column" | "row", index: number) {
  const sign = (await signs(page)).find((s) => s.kind === kind && s.index === index)!
  const { box: canvas } = await getMainCanvas(page)
  const at = devicePoint(canvas, sign.x + sign.width / 2, sign.y + sign.height / 2)
  await page.mouse.click(at.x, at.y)
}
const columnTexts = async (page: Page) => (await signs(page)).filter((s) => s.kind === "column").map((s) => s.text)

test("each column says what sets its width; a column pulled by hand is one click from sharing the table's room", async ({ page }) => {
  // The user's table of 2026-11-16: the first column pulled by hand, the
  // second taking what is left of a table wider than both.
  await loadProject(page, await projectWith([tableOf([{ mm: 20 }, { fill: true }], { tableSize: { width: 300 } })]))
  await objectTreeRow(page, "tabelle").click()
  expect(await columnTexts(page)).toEqual(["20.0 mm", "fill"])
  expect((await signs(page)).filter((s) => s.kind === "row").map((s) => s.text)).toEqual(["auto"])
  const before = await savedTable(page)
  const widths = (t: Obj) => ["links", "rechts"].map((id) => t.children.find((c: Obj) => c.id === id).width)
  expect(widths(before)[0]).not.toBe(widths(before)[1])

  await objectTreeRow(page, "tabelle").click()
  await clickSign(page, "column", 0)
  expect(await columnTexts(page)).toEqual(["fill", "fill"])
  const after = await savedTable(page)
  expect(after.properties.columns).toEqual([{ fill: true }, { fill: true }])
  expect(Math.abs(widths(after)[0] - widths(after)[1])).toBeLessThanOrEqual(1)
  expect(after.width).toBe(300)
})

test("the sign steps auto, fixed at the size it has, fill, and auto again", async ({ page }) => {
  await loadProject(page, await projectWith([tableOf([{}, {}])]))
  await objectTreeRow(page, "tabelle").click()
  expect(await columnTexts(page)).toEqual(["auto", "auto"])
  await clickSign(page, "column", 1)
  expect((await columnTexts(page))[1]).toMatch(/^\d+\.\d mm$/)
  expect(typeof (await savedTable(page)).properties.columns[1].mm).toBe("number")
  await objectTreeRow(page, "tabelle").click()
  await clickSign(page, "column", 1)
  expect(await columnTexts(page)).toEqual(["auto", "fill"])
  await clickSign(page, "column", 1)
  expect(await columnTexts(page)).toEqual(["auto", "auto"])
  expect((await savedTable(page)).properties.columns).toEqual([{}, {}])
})

test("Frame says where a width comes from", async ({ page }) => {
  await loadProject(page, await projectWith([tableOf([{ mm: 20 }, { fill: true }], { tableSize: { width: 300 } })]))
  await objectTreeRow(page, "links").click()
  await openFrameSection(page)
  await expect(page.locator("[data-size-source-width]")).toContainText("its column, fixed at 20.0 mm")
  await objectTreeRow(page, "rechts").click()
  await openFrameSection(page)
  await expect(page.locator("[data-size-source-width]")).toContainText("its column, filling the table")
  await objectTreeRow(page, "tabelle").click()
  await openFrameSection(page)
  await expect(page.locator("[data-size-source-width]")).toContainText("W 300 px: pulled to this width")
  await expect(page.locator("[data-size-source-height]")).toContainText("its rows")
})

test("a table pulled wider at its handle has that width, its last column filling it; one Ctrl+Z; pulled below its content it stops there", async ({ page }) => {
  await loadProject(page, await projectWith([tableOf([{}, {}])]))
  const start = await savedTable(page)
  expect(start.properties.tableSize).toBeUndefined()
  await objectTreeRow(page, "tabelle").click()
  const { box: canvas } = await getMainCanvas(page)
  const corner = (t: Obj) => devicePoint(canvas, t.x + t.width, t.y + t.height)
  const pull = async (t: Obj, dx: number) => {
    const from = corner(t)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + dx / 2, from.y, { steps: 4 })
    await page.mouse.move(from.x + dx, from.y, { steps: 4 })
    await page.mouse.up()
  }
  await pull(start, 80)
  const wide = await savedTable(page)
  expect(wide.width).toBe(start.width + 80)
  expect(wide.properties.tableSize).toEqual({ width: start.width + 80 })
  // Given room, its last auto column is fill (decision 5).
  expect(wide.properties.columns).toEqual([{}, { fill: true }])
  expect(wide.children.find((c: Obj) => c.id === "links").width).toBe(start.children.find((c: Obj) => c.id === "links").width)

  // One step back: the width and the fill column both.
  await page.keyboard.press("ControlOrMeta+z")
  const back = await savedTable(page)
  expect(back.properties.tableSize).toBeUndefined()
  expect(back.properties.columns).toEqual([{}, {}])

  // Pulled far to the left: no narrower than what it holds.
  await objectTreeRow(page, "tabelle").click()
  await pull(back, -200)
  const least = await savedTable(page)
  expect(least.width).toBe(start.width)
  expect(least.properties.tableSize).toBeUndefined()
})
