import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openAllTwisties, saveProjectAs } from "./helpers"

// A switcher's panel held open on the canvas (the user, 2026-11-14): the
// heater's «on» panel, its condition not met, vanished as soon as something
// outside it was chosen - nothing could be snapped with Alt below the button
// group it holds. Opened once, a panel stays drawn and a place to drop into
// until another tab of its switcher is opened or Esc is pressed. And while
// an object is dragged on the canvas, held a moment over a panel's row in
// the object list, that panel opens.

type Obj = Record<string, any>
const box = (id: string, x: number, y: number, z: number): Obj => ({ id, type: "box", x, y, width: 150, height: 30, zIndex: z, properties: { fillColor: "#3366cc" } })

async function project(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  // What the switcher reads says «off»: its only panel, «on», does not show by itself.
  p.topics = [...(p.topics ?? []), { id: "t-heater", topic: "pin/heater", type: "text", examples: ["off"] }]
  p.screens.find((s: Obj) => s.id === "screen-1").objects = [
    {
      id: "weiche",
      type: "switcher",
      x: 40,
      y: 40,
      width: 200,
      height: 80,
      zIndex: 1,
      properties: { topic: "pin/heater", comparisonOperator: "==", comparisonValue: "" },
      children: [{ id: "an", type: "panel", x: 0, y: 0, width: 200, height: 80, zIndex: 1, properties: { comparisonOperator: "==", comparisonValue: "on" }, children: [box("modus", 0, 0, 1)] }],
    },
    box("draussen", 40, 220, 2),
  ]
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `switcher-pin-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

const saved = new WeakMap<Page, string>()
async function savedObjects(page: Page): Promise<ScreenObject[]> {
  const name = `switcher-pin-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  await saveProjectAs(page, name)
  saved.set(page, name)
  return (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project.screens.find((s: Obj) => s.id === "screen-1").objects
}
test.afterEach(async ({ page }) => {
  const name = saved.get(page)
  if (name) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
})

const pins = async (page: Page) => {
  const { canvas } = await getMainCanvas(page)
  return JSON.parse((await canvas.getAttribute("data-pinned-panels")) ?? "{}")
}

// «draussen» in a table with «modus», below it, in the panel «an».
function expectSnappedBelow(objects: ScreenObject[]) {
  const panel = objects.find((o) => o.id === "weiche")!.children!.find((p) => p.id === "an")!
  const table = panel.children!.find((c) => c.type === "table")!
  expect(table).toBeTruthy()
  const cell = (id: string) => table.children!.find((c) => c.id === id)!.properties!.cell
  expect(cell("modus")).toMatchObject({ row: 0, column: 0 })
  expect(cell("draussen")).toMatchObject({ row: 1, column: 0 })
  expect(objects.some((o) => o.id === "draussen")).toBe(false)
}

// «draussen» held at its middle and carried with Alt until its top edge is
// 3 px under «modus» (40 + 30) - through `via` on the page first, if given.
async function carryBelow(page: Page, via?: () => Promise<void>) {
  const { box: c } = await getMainCanvas(page)
  const from = devicePoint(c, 115, 235)
  const to = devicePoint(c, 115, 40 + 30 + 3 + 15)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 4; i++) await page.mouse.move(from.x, from.y + ((to.y - from.y) * i) / 12)
  if (via) await via()
  await page.keyboard.down("Alt")
  for (let i = 5; i <= 12; i++) await page.mouse.move(from.x, from.y + ((to.y - from.y) * i) / 12)
  const { canvas } = await getMainCanvas(page)
  await expect.poll(async () => JSON.parse((await canvas.getAttribute("data-place-hint")) ?? "{}").now).toBe("Table")
  await page.mouse.up()
  await page.keyboard.up("Alt")
}

test("a panel opened stays open when something outside is chosen; Alt snaps to what it holds; Esc lets it go", async ({ page }) => {
  await loadProject(page, await project())
  await openAllTwisties(page)
  await objectTreeRow(page, "an").click()
  expect(await pins(page)).toEqual({ weiche: "an" })
  // Chosen outside: the panel stays held.
  await objectTreeRow(page, "draussen").click()
  expect(await pins(page)).toEqual({ weiche: "an" })
  await carryBelow(page)
  expectSnappedBelow(await savedObjects(page))
  // Esc on the canvas: nothing held any more.
  const { box: c } = await getMainCanvas(page)
  const empty = devicePoint(c, 380, 290)
  await page.mouse.click(empty.x, empty.y)
  await page.keyboard.press("Escape")
  expect(await pins(page)).toEqual({})
})

test("dragged on the canvas, held a moment over a panel's row in the object list: that panel opens, and the drag goes on", async ({ page }) => {
  await loadProject(page, await project())
  await openAllTwisties(page)
  expect(await pins(page)).toEqual({})
  await carryBelow(page, async () => {
    const row = await objectTreeRow(page, "an").boundingBox()
    await page.mouse.move(row!.x + 30, row!.y + row!.height / 2, { steps: 4 })
    await page.mouse.move(row!.x + 34, row!.y + row!.height / 2, { steps: 2 })
    await expect.poll(() => pins(page), { timeout: 3000 }).toEqual({ weiche: "an" })
  })
  expectSnappedBelow(await savedObjects(page))
})

test("dragged on the canvas and let go over the object list: nothing moves, as with Esc", async ({ page }) => {
  await loadProject(page, await project())
  const { box: c } = await getMainCanvas(page)
  const from = devicePoint(c, 115, 235)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y - 40, { steps: 5 })
  const row = await objectTreeRow(page, "draussen").boundingBox()
  await page.mouse.move(row!.x + 20, row!.y + row!.height / 2, { steps: 5 })
  await page.mouse.up()
  const objects = await savedObjects(page)
  expect(objects.find((o) => o.id === "draussen")).toMatchObject({ x: 40, y: 220 })
})
