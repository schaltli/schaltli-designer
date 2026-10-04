import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { DEFAULT_TABLE_SHAPE, TABLE_SHAPES, shapeColumns } from "../lib/layout-templates"
import { COMBINED_TEST_PROJECT, createScreen, devicePoint, getMainCanvas, loadProject } from "./helpers"

// The table shapes (docs/2026-10-03-free-screens.md): what a screen's
// «Layout» option was is the Table tool's choice now; a screen is free. An
// old project's screen table loads as a table object.

type Obj = Record<string, any>

const text = (id: string, words: string, zIndex: number, x = 0, y = 0): ScreenObject => ({
  id,
  type: "text",
  x,
  y,
  width: 100,
  height: 23,
  zIndex,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
})

test.describe("table shapes, the model", () => {
  test("each shape is its columns; the Table tool draws «Name and control» without a choice", () => {
    expect(TABLE_SHAPES.map((t) => t.id)).toEqual(["one-column", "name-and-control", "two-columns"])
    expect(shapeColumns("one-column")).toEqual([{ width: { share: 100 } }])
    expect(shapeColumns("name-and-control")).toEqual([{ width: "auto" }, { width: { share: 100 } }])
    expect(shapeColumns("two-columns")).toEqual([{ width: { share: 50 } }, { width: { share: 50 } }])
    expect(DEFAULT_TABLE_SHAPE).toBe("name-and-control")
  })
})

test.describe("free screens in the editor", () => {
  async function twoColumns(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const one = project.screens.find((s: Obj) => s.id === "screen-1")
    one.layout = { type: "horizontal-stack", properties: { distribute: "fill" } }
    one.objects = [
      { id: "col-1", type: "vertical-stack", x: 0, y: 0, width: 10, height: 10, zIndex: 0, properties: { layoutSlot: true }, children: [text("left-a", "Licht", 0), text("left-b", "Bad", 1)] },
      { id: "col-2", type: "vertical-stack", x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: { layoutSlot: true }, children: [text("right-a", "Heizung", 0)] },
    ]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `layout-templates-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }

  async function downloaded(page: Page): Promise<Obj> {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  }
  const screenOne = async (page: Page) => (await downloaded(page)).screens.find((s: Obj) => s.id === "screen-1")

  // Screens are always free (docs/2026-10-03-free-screens.md): a screen
  // saved with «Two columns» loads with one table object of those columns,
  // everything in it where it was. Switching a screen's layout went with
  // the Layout field; the shapes are the Table tool's now.
  test("a project saved with «Two columns»' stacks loads as one table object of its columns", async ({ page }) => {
    await loadProject(page, await twoColumns())
    const loaded = await screenOne(page)
    expect(loaded.layout?.type ?? "free").toBe("free")
    expect(loaded.objects).toHaveLength(1)
    const table = loaded.objects[0]
    expect(table.type).toBe("table")
    expect(table.properties.columns).toEqual([{ width: { share: 50 } }, { width: { share: 50 } }])
    expect(table.children.map((o: Obj) => [o.id, o.properties.cell.row, o.properties.cell.column]).sort()).toEqual([
      ["left-a", 0, 0],
      ["left-b", 1, 0],
      ["right-a", 0, 1],
    ])
  })

  test("a new screen is free and empty, and has no Layout field", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "Fresh", false)
    const fresh = (await downloaded(page)).screens.find((s: Obj) => s.name === "Fresh")
    expect(fresh.layout).toBeUndefined()
    expect(fresh.objects).toEqual([])
    await page.locator("[data-screen-root]").click()
    await expect(page.locator("#screenLayout")).toHaveCount(0)
  })

  test("the Table tool offers the three shapes with their pictures; a table is drawn in the one chosen", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "Shapes", false)
    await page.getByTestId("table-tool").click()
    for (const id of ["one-column", "name-and-control", "two-columns"]) await expect(page.getByTestId(`table-shape-${id}`).locator("svg")).toHaveCount(1)
    await page.getByTestId("table-shape-two-columns").click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 40, 40)
    const to = devicePoint(box, 300, 120)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
    const drawn = (await downloaded(page)).screens.find((s: Obj) => s.name === "Shapes").objects.find((o: Obj) => o.type === "table")
    expect(drawn.properties.columns).toEqual([{ width: { share: 50 } }, { width: { share: 50 } }])
  })

  // Asked 2026-10-04: the shapes were not seen as templates, and after
  // choosing one it was not clear a rectangle had to follow. The menu says
  // what it offers, a click alone places the table, a hint says what to do.
  test("the menu is headed «Table template», each shape explained; the group is «Tables», without Free", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(page.getByRole("button", { name: "Free", exact: true })).toHaveCount(0)
    await expect(page.getByText("Tables", { exact: true })).toBeVisible()
    await page.getByTestId("table-tool").click()
    await expect(page.getByRole("menu")).toContainText("Table template")
    await expect(page.getByTestId("table-shape-name-and-control")).toContainText("Names on the left, controls on the right")
  })

  test("a click alone places the table, from there to the screen's right edge", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "Click", false)
    await page.getByTestId("table-tool").click()
    await page.getByTestId("table-shape-one-column").click()
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, 40, 50)
    await page.mouse.click(p.x, p.y)
    const drawn = (await downloaded(page)).screens.find((s: Obj) => s.name === "Click").objects.find((o: Obj) => o.type === "table")
    expect(drawn).toMatchObject({ x: 40, y: 50, width: 400 - 40 })
    expect(drawn.properties.columns).toEqual([{ width: { share: 100 } }])
  })

  test("while a tool waits to be used a hint says what to do; Esc puts the tool down and the hint goes", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(page.getByTestId("tool-hint")).toHaveCount(0)
    await page.getByTestId("table-tool").click()
    await page.getByTestId("table-shape-two-columns").click()
    await expect(page.getByTestId("tool-hint")).toHaveText("Click or drag a rectangle to place the table. Esc cancels.")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("tool-hint")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Select", exact: true }).first()).toHaveClass(/bg-primary/)
  })
})
