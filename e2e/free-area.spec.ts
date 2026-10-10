import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow } from "./helpers"
import { dissolveGroups, freeBackground } from "../lib/object-groups"
import type { ScreenObject } from "../components/project-editor"

// A free area with a box's look (asked 2026-10-05): the Free tool back in the
// toolbar, placeable on the screen, in a table's cell and in a switcher's
// panel; what is put into it stays where it is placed; fill, edge and
// corners as a Box has, which a device gets as a box behind its contents.

type Obj = Record<string, any>

async function tableProject(extra: Obj[] = []): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.objects = [
    {
      id: "outer",
      type: "table",
      x: 8,
      y: 8,
      width: 384,
      height: 284,
      zIndex: 1,
      properties: { grid: 1, columns: [{}, {}], rows: [{}, {}] },
      children: [
        {
          id: "links",
          type: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 23,
          zIndex: 1,
          properties: { text: "Links", color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent", cell: { row: 0, column: 0 } },
        },
        ...extra,
      ],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `free-area-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function savedScreen(page: Page): Promise<Obj[]> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1").objects
}
// The table put together by snapping the screen holds (tableProject).
const savedTable = async (page: Page): Promise<Obj> => (await savedScreen(page)).find((o: Obj) => o.id === "outer")

async function clickAt(page: Page, x: number, y: number, dbl = false) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, x, y)
  if (dbl) await page.mouse.dblclick(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
}

async function dragOn(page: Page, from: [number, number], to: [number, number]) {
  const { box } = await getMainCanvas(page)
  const a = devicePoint(box, from[0], from[1])
  const b = devicePoint(box, to[0], to[1])
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
}

test("the Free tool places an area where it is clicked, with a box's look in its properties", async ({ page }) => {
  await loadProject(page, await tableProject())
  await page.getByRole("button", { name: "Free", exact: true }).first().click()
  // Below the table, far from it: free on the screen.
  await clickAt(page, 300, 240)
  const objects = await savedScreen(page)
  const free = objects.find((o) => o.type === "free")!
  expect(free).toBeTruthy()
  expect(free.properties.cell).toBeUndefined()
  // Its properties: the look of a Box.
  await objectTreeRow(page, free.id).click()
  for (const id of ["#strokeWidth", "#cornerRadius"]) await expect(page.locator(id)).toBeVisible()
  await expect(page.getByText("Fill", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Stroke", { exact: true }).first()).toBeVisible()
})

test("what is drawn into a free area in a cell stays where it is put", async ({ page }) => {
  const free: Obj = {
    id: "area",
    type: "free",
    x: 0,
    y: 0,
    width: 150,
    height: 120,
    zIndex: 2,
    properties: { fillColor: "#ffd0d0", strokeWidth: 1, strokeColor: "#000000", cornerRadius: 4, cell: { row: 1, column: 1 } },
    children: [],
  }
  await loadProject(page, await tableProject([free]))
  // Into the area: a click on its row in the tree opens it.
  const where = await savedTable(page)
  const area = (where.children as Obj[]).find((o) => o.id === "area")!
  const ax = where.x + area.x
  const ay = where.y + area.y
  await objectTreeRow(page, "area").click()
  await page.getByRole("button", { name: "Text", exact: true }).first().click()
  await dragOn(page, [ax + 30, ay + 40], [ax + 110, ay + 60])
  const after = await savedTable(page)
  const placed = (after.children as Obj[]).find((o) => o.id === "area")!
  expect(placed.children).toHaveLength(1)
  const text = placed.children[0]
  // Where it was let go, relative to the area - carried at its middle
  // (docs/2026-10-09-snap-tables.md, placing by dragging): the table does not move it.
  expect(Math.abs(text.x + text.width / 2 - 110)).toBeLessThanOrEqual(2)
  expect(text.y).toBeLessThan(60)
  expect(text.y + text.height).toBeGreaterThan(40)
})

test("a double click opens the table, a second the free area in its cell", async ({ page }) => {
  const free: Obj = {
    id: "area",
    type: "free",
    x: 0,
    y: 0,
    width: 150,
    height: 120,
    zIndex: 2,
    properties: { cell: { row: 1, column: 1 } },
    children: [{ id: "inner", type: "text", x: 20, y: 30, width: 80, height: 23, zIndex: 1, properties: { text: "Drin", color: "#000000", textAlign: "left" } }],
  }
  await loadProject(page, await tableProject([free]))
  const where = await savedTable(page)
  const area = (where.children as Obj[]).find((o) => o.id === "area")!
  const x = where.x + area.x + 60
  const y = where.y + area.y + 40
  await clickAt(page, x, y, true)
  await clickAt(page, x, y, true)
  // Inside it: «Drin» is what a click takes now.
  await expect(page.locator("#text")).toHaveText("Drin")
})

test("a free area's look: a box behind its contents on the device; nothing without fill or edge", () => {
  const child: ScreenObject = { id: "t", type: "text", x: 5, y: 6, width: 40, height: 20, zIndex: 1, properties: { text: "x" } }
  const area: ScreenObject = {
    id: "area",
    type: "free",
    x: 100,
    y: 50,
    width: 80,
    height: 60,
    zIndex: 3,
    properties: { fillColor: "#ff0000", strokeWidth: 2, strokeColor: "#000000", cornerRadius: 6 },
    children: [child],
  }
  const flat = dissolveGroups([area])
  expect(flat.map((o) => o.type)).toEqual(["box", "text"])
  expect(flat[0]).toMatchObject({ x: 100, y: 50, width: 80, height: 60, properties: { fillColor: "#ff0000", strokeWidth: 2, strokeColor: "#000000", cornerRadius: 6 } })
  expect(flat[1]).toMatchObject({ x: 105, y: 56 })
  // Below what it holds, whatever their numbers: a switch at 0 under an
  // area at 3 stays on top of the area's box (reported 2026-10-05).
  const low = dissolveGroups([{ ...area, children: [{ ...child, zIndex: 0, type: "switch" }] }])
  expect(low[0].zIndex).toBeLessThan(low[1].zIndex)
  // An edge alone is a frame; neither, nothing.
  expect(freeBackground({ ...area, properties: { strokeWidth: 1 } })?.properties).toMatchObject({ fillColor: "transparent", strokeWidth: 1, strokeColor: "text" })
  expect(freeBackground({ ...area, properties: {} })).toBeUndefined()
  expect(dissolveGroups([{ ...area, properties: {} }]).map((o) => o.type)).toEqual(["text"])
})

test("the Free tool draws an area into a switcher's open panel too", async ({ page }) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = [
    {
      id: "sw",
      type: "switcher",
      x: 20,
      y: 20,
      width: 300,
      height: 200,
      zIndex: 1,
      properties: { topic: "m", comparisonOperator: "==", comparisonValue: "" },
      children: [{ id: "p1", type: "panel", x: 0, y: 0, width: 300, height: 200, zIndex: 1, properties: { comparisonOperator: "==", comparisonValue: "a" }, children: [] }],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `free-panel-${Date.now()}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, file)
  await objectTreeRow(page, "p1").click()
  await page.getByRole("button", { name: "Free", exact: true }).first().click()
  await dragOn(page, [60, 60], [200, 160])
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const saved = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  const panel = saved.screens.find((s: Obj) => s.id === "screen-1").objects[0].children[0]
  expect(panel.children.map((c: Obj) => c.type)).toEqual(["free"])
})

test("in the preview a tap on a switch in a free area with an edge reaches the switch", async ({ page }) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const topic = `e2e-free/${Date.now()}`
  project.topics = [
    ...(project.topics ?? []),
    { id: "t-free-state", topic: `${topic}/state`, type: "text", examples: ["off"] },
    { id: "t-free-set", topic: `${topic}/set`, type: "text", examples: ["on"] },
  ]
  project.screens.find((s: Obj) => s.id === "screen-1").objects = [
    {
      id: "area",
      type: "free",
      x: 40,
      y: 40,
      width: 260,
      height: 120,
      zIndex: 1,
      properties: { fillColor: "transparent", strokeWidth: 2, strokeColor: "text", cornerRadius: 10 },
      children: [
        {
          id: "sw",
          type: "switch",
          x: 10,
          y: 10,
          width: 200,
          height: 52,
          zIndex: 0,
          properties: {
            topic: `${topic}/state`,
            writeTopic: `${topic}/set`,
            states: [
              { id: "off", label: "Aus", readValue: "off", writeValue: "off", showAsOn: false },
              { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true },
            ],
            switchStyle: "filled",
          },
        },
      ],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `free-tap-${Date.now()}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, file)
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  const simulation = page.getByRole("button", { name: "Simulation", exact: true })
  if (await simulation.count()) await simulation.click()
  const valueField = page.locator("label", { hasText: `${topic}/state` }).first().locator("xpath=../..").locator("input, textarea").first()
  await expect(valueField).toHaveValue("off")
  // A tap on the switch's «An» half: the mock engine answers its write, so
  // the state turns «on» - the tap reached the switch, not the area's box.
  await clickAt(page, 40 + 10 + 160, 40 + 10 + 26)
  await expect(valueField).toHaveValue("on")
})
