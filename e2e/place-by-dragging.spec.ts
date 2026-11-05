import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { placedSize } from "../lib/placing"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, placingFreely, saveProjectAs } from "./helpers"

// Placing by dragging (docs/2026-10-09-snap-tables.md, module
// place-by-dragging): a tool makes its object at its default size, held at
// its middle under the pointer and carried like a moved object - snapped by
// its edges, Ctrl for free, Esc to take it away. Lines are still drawn.
// The combined project's first screen holds one free text «Licht» at 100,60
// (60 x 23) and nothing else.

type Obj = Record<string, any>

async function oneTextProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.objects = [
    {
      id: "licht",
      type: "text",
      x: 100,
      y: 60,
      width: 60,
      height: 23,
      zIndex: 1,
      properties: { text: "Licht", color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `place-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function at(page: Page, point: { x: number; y: number }) {
  const { box } = await getMainCanvas(page)
  return devicePoint(box, point.x, point.y)
}

// Pressed at `from` with a tool in hand, carried to `to` in steps.
async function carry(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, before?: () => Promise<void>) {
  const a = await at(page, from)
  const b = await at(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  // Alt held: tables are built (docs/2026-11-03-placing.md).
  await page.keyboard.down("Alt")
  for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10)
  if (before) await before()
  await page.mouse.up()
  await page.keyboard.up("Alt")
}

async function sizeOf(page: Page, tool: string): Promise<{ width: number; height: number }> {
  const { canvas } = await getMainCanvas(page)
  const ppm = Number(await canvas.getAttribute("data-pixels-per-mm"))
  return placedSize(tool, ppm)!
}

const tool = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).first().click()

const savedAs = new WeakMap<Page, string>()
async function savedObjects(page: Page): Promise<ScreenObject[]> {
  let name = savedAs.get(page)
  if (!name) {
    name = `place-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await saveProjectAs(page, name)
    savedAs.set(page, name)
  } else {
    await page.keyboard.press("ControlOrMeta+s")
    // Saved when the title loses its dot - not after a fixed 800 ms, which a
    // save under ten browsers outlasted (2026-10-13).
    await expect(page.getByTestId("project-title")).toHaveText(name, { timeout: 20_000 })
  }
  const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
  return saved.screens.find((s: Obj) => s.id === "screen-1").objects
}
test.afterEach(async ({ page }) => {
  const name = savedAs.get(page)
  if (name) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
})

test.describe("placing by dragging", () => {
  test("a box is carried at its middle and put down where it is let go", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Box")
    await carry(page, { x: 200, y: 150 }, { x: 260, y: 220 })
    const placed = (await savedObjects(page)).find((o) => o.type === "box")!
    expect(placed.properties?.cell).toBeUndefined()
    // Its middle where the pointer was let go.
    expect(Math.abs(placed.x + placed.width / 2 - 260)).toBeLessThanOrEqual(2)
    expect(Math.abs(placed.y + placed.height / 2 - 220)).toBeLessThanOrEqual(2)
  })

  test("a bar, made thinner than it was carried, still has its middle where it was let go", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Bar")
    await carry(page, { x: 200, y: 150 }, { x: 250, y: 220 })
    const bar = (await savedObjects(page)).find((o) => o.type === "bar")!
    expect(Math.abs(bar.x + bar.width / 2 - 250)).toBeLessThanOrEqual(1)
    expect(Math.abs(bar.y + bar.height / 2 - 220)).toBeLessThanOrEqual(1)
  })

  test("a click without moving puts it down where it was pressed", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Box")
    const p = await at(page, { x: 250, y: 200 })
    await page.mouse.click(p.x, p.y)
    const box = (await savedObjects(page)).find((o) => o.type === "box")!
    const size = await sizeOf(page, "box")
    expect([box.width, box.height]).toEqual([size.width, size.height])
    expect(Math.abs(box.x + box.width / 2 - 250)).toBeLessThanOrEqual(1)
  })

  test("let go with its edge against a free text, the two become a table", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Box")
    const size = await sizeOf(page, "box")
    // Its left edge 3 px right of «Licht» (right edge 160), level with it.
    await carry(page, { x: 250, y: 200 }, { x: 163 + size.width / 2, y: 60 + size.height / 2 })
    const table = (await savedObjects(page)).find((o) => o.type === "table")!
    expect(table.properties?.grid).toBe(1)
    expect(table.children!.map((c) => [c.type, c.properties?.cell?.column])).toEqual([
      ["text", 0],
      ["box", 1],
    ])
  })

  test("with Ctrl held it lies free even against the text", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Box")
    const size = await sizeOf(page, "box")
    const a = await at(page, { x: 250, y: 200 })
    const b = await at(page, { x: 163 + size.width / 2, y: 60 + size.height / 2 })
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await placingFreely(page, async () => {
      for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10)
      await page.mouse.up()
    })
    const objects = await savedObjects(page)
    expect(objects.some((o) => o.type === "table")).toBe(false)
    expect(objects.some((o) => o.type === "box")).toBe(true)
  })

  test("Esc before letting go takes it away: no object", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Box")
    await carry(page, { x: 200, y: 150 }, { x: 260, y: 220 }, () => page.keyboard.press("Escape"))
    expect((await savedObjects(page)).map((o) => o.id)).toEqual(["licht"])
  })

  test("one Ctrl+Z takes a placed object away again", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Box")
    await carry(page, { x: 200, y: 150 }, { x: 260, y: 220 })
    await expect(page.locator("[data-object-id]")).toHaveCount(2)
    const { box } = await getMainCanvas(page)
    const empty = devicePoint(box, -20, -20)
    await page.mouse.click(empty.x, empty.y)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.locator("[data-object-id]")).toHaveCount(1)
  })

  test("a line is still drawn from point to point, and lies free even drawn against the text", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await tool(page, "Line")
    // From just right of «Licht», level with it, to the right.
    await carry(page, { x: 163, y: 70 }, { x: 260, y: 70 })
    const objects = await savedObjects(page)
    expect(objects.some((o) => o.type === "table")).toBe(false)
    const line = objects.find((o) => o.type === "line")!
    expect(line.properties!.points.map((p: { x: number }) => p.x)).toEqual([163, 260])
  })
})

// Placing from the ribbon (docs/2026-11-05-quick-blocks.md, decision 7): a
// tool's tile pressed and carried onto the screen brings its object along,
// as one pressed on the screen does; let go off the screen, nothing.
async function dragFromRibbon(page: Page, name: string, to: { x: number; y: number } | { client: { x: number; y: number } }) {
  const tile = page.getByTestId("tools-ribbon").getByRole("button", { name, exact: true }).first()
  const from = (await tile.boundingBox())!
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const b = "client" in to ? to.client : await at(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
  await page.mouse.up()
}

test.describe("placing from the ribbon", () => {
  test("a box dragged from its tile onto the screen lands with its middle where it is let go", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await dragFromRibbon(page, "Box", { x: 260, y: 220 })
    const placed = (await savedObjects(page)).find((o) => o.type === "box")!
    const size = await sizeOf(page, "box")
    expect([placed.width, placed.height]).toEqual([size.width, size.height])
    expect(Math.abs(placed.x + placed.width / 2 - 260)).toBeLessThanOrEqual(2)
    expect(Math.abs(placed.y + placed.height / 2 - 220)).toBeLessThanOrEqual(2)
  })

  test("a bar dragged from its tile comes at its default size, and the tool is Select again", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    await dragFromRibbon(page, "Bar", { x: 240, y: 200 })
    await expect(page.locator("[data-object-id]")).toHaveCount(2)
    // Select again: a click on the screen places nothing more.
    const p = await at(page, { x: 60, y: 200 })
    await page.mouse.click(p.x, p.y)
    const objects = await savedObjects(page)
    expect(objects.filter((o) => o.type === "bar")).toHaveLength(1)
    const size = await sizeOf(page, "bar")
    const bar = objects.find((o) => o.type === "bar")!
    expect([bar.width, bar.height]).toEqual([size.width, size.height])
  })

  test("let go over the ribbon again, nothing is placed and the tool is Select", async ({ page }) => {
    await loadProject(page, await oneTextProject())
    const ribbon = (await page.getByTestId("tools-ribbon").boundingBox())!
    // Onto the screen and back to the ribbon's right end before letting go.
    const tile = page.getByTestId("tools-ribbon").getByRole("button", { name: "Box", exact: true }).first()
    const from = (await tile.boundingBox())!
    const over = await at(page, { x: 240, y: 200 })
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((over.x - from.x) * i) / 8, from.y + ((over.y - from.y) * i) / 8)
    await expect((await getMainCanvas(page)).canvas).toHaveAttribute("data-carrying", "box")
    await page.mouse.move(ribbon.x + ribbon.width - 10, ribbon.y + ribbon.height / 2, { steps: 8 })
    await page.mouse.up()
    const p = await at(page, { x: 60, y: 200 })
    await page.mouse.click(p.x, p.y)
    expect((await savedObjects(page)).map((o) => o.id)).toEqual(["licht"])
  })
})
