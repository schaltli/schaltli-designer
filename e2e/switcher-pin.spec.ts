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

// The heater's case (the user, 2026-11-14): the switcher whose panel is held
// stands in a table, and so does what is carried - out of that same table,
// which is no place to drop into, though the panel held in it is. And the
// carried object, 160 px tall and held at its middle, has the pointer far
// below the 80 px panel when its top edge is under the box there: with Alt,
// a held panel takes it where it snaps to something the panel holds.
// Or the panel drawn because its switcher's condition says so, held by
// nobody - in the van a switcher listening and reading nothing yet shows its
// first panel, and only once had the user opened it by its tab, the one time
// it worked (2026-11-15). Here its topic's example says «on».
async function inATable(shownByItself = false): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(await project()))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  if (shownByItself) p.topics = p.topics.map((t: Obj) => (t.id === "t-heater" ? { ...t, examples: ["on"] } : t))
  const screen = p.screens.find((s: Obj) => s.id === "screen-1")
  const [weiche] = screen.objects
  screen.objects = [
    {
      id: "tabelle",
      type: "table",
      x: 40,
      y: 40,
      width: 200,
      height: 250,
      zIndex: 1,
      properties: { grid: 1, columns: [{}], rows: [{}, {}] },
      children: [
        { ...weiche, properties: { ...weiche.properties, cell: { row: 0, column: 0 } } },
        { ...box("hoch", 0, 90, 2), height: 160, properties: { fillColor: "#3366cc", cell: { row: 1, column: 0 } } },
      ],
    },
  ]
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `switcher-pin-table-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

for (const shown of [false, true]) test(`out of a table into a panel ${shown ? "drawn by its condition" : "held"} in it: with Alt it snaps below what the panel holds, the pointer far below the panel`, async ({ page }) => {
  await loadProject(page, await inATable(shown))
  await openAllTwisties(page)
  if (!shown) await objectTreeRow(page, "an").click()
  expect(await pins(page)).toEqual(shown ? {} : { weiche: "an" })
  await objectTreeRow(page, "hoch").click()
  const { canvas, box: c } = await getMainCanvas(page)
  // Where the table put the switcher and the tall box, from what is saved.
  const before = await savedObjects(page)
  const table = before.find((o) => o.id === "tabelle")!
  const sw = table.children!.find((o) => o.id === "weiche")!
  const hoch = table.children!.find((o) => o.id === "hoch")!
  const modusBottom = table.y + sw.y + 30
  const mid = { x: table.x + hoch.x + 75, y: table.y + hoch.y + 80 }
  // Its top edge carried to 3 px under «modus»: the pointer at its middle,
  // 80 px further down - below the panel.
  const toY = modusBottom + 3 + 80
  expect(toY).toBeGreaterThan(table.y + sw.y + sw.height)
  const from = devicePoint(c, mid.x, mid.y)
  const to = devicePoint(c, mid.x, toY)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.keyboard.down("Alt")
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + 1, from.y + ((to.y - from.y) * i) / 10)
  await expect.poll(async () => JSON.parse((await canvas.getAttribute("data-place-hint")) ?? "{}").now).toBe("Table")
  await page.mouse.up()
  await page.keyboard.up("Alt")
  // Saved again under the same name: Ctrl+S asks no more.
  await page.keyboard.press("ControlOrMeta+s")
  const name = saved.get(page)!
  const reread = async () => (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project.screens.find((s: Obj) => s.id === "screen-1").objects as ScreenObject[]
  await expect.poll(async () => JSON.stringify(await reread()).includes('"type":"table","x":0')).toBe(true)
  const after = await reread()
  const weiche = after.flatMap((o) => (o.id === "weiche" ? [o] : (o.children ?? []).filter((c) => c.id === "weiche")))[0]
  const inPanel = weiche.children!.find((p) => p.id === "an")!.children!.find((c) => c.type === "table")!
  const cell = (id: string) => inPanel.children!.find((c) => c.id === id)!.properties!.cell
  expect(cell("modus")).toMatchObject({ row: 0, column: 0 })
  expect(cell("hoch")).toMatchObject({ row: 1, column: 0 })
})
