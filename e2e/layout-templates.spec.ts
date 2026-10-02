import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { newScreenLayout, templateOf, withTemplate } from "../lib/layout-templates"
import { COMBINED_TEST_PROJECT, createScreen, loadProject } from "./helpers"

// A screen's «Layout» option (docs/2026-10-02-layout.md, module
// layout-templates): built-in templates for its root container, copied in;
// changing it keeps everything on the screen, in one undo step; a new
// screen starts with «Name and control».

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

test.describe("layout templates, the model", () => {
  const cellOf = (o: ScreenObject) => [o.properties.cell?.row, o.properties.cell?.column]
  const inCell = (o: ScreenObject, row: number, column: number): ScreenObject => ({ ...o, properties: { ...o.properties, cell: { row, column } } })

  test("each layout is a table shape, «Free» none; a screen's shape tells which it is", () => {
    const shape = (id: Parameters<typeof withTemplate>[1]) => withTemplate({ layout: { type: "free" as const }, objects: [] }, id, 1).screen.layout
    expect(shape("one-column")).toEqual({ type: "table", properties: { columns: [{ width: { share: 100 } }], rows: 1 } })
    expect(shape("name-and-control")).toEqual({ type: "table", properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 1 } })
    expect(shape("two-columns")).toEqual({ type: "table", properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 1 } })
    expect(shape("free")).toEqual({ type: "free" })
    for (const id of ["one-column", "name-and-control", "two-columns", "free"] as const) {
      expect(templateOf({ layout: shape(id), objects: [] })).toBe(id)
    }
    expect(templateOf({ layout: { type: "table", properties: { columns: [{ width: { mm: 10 } }] } }, objects: [] })).toBe("custom")
    expect(newScreenLayout()).toEqual(shape("name-and-control"))
  })

  test("changing keeps everything, in the order it stood in, row by row", () => {
    const two = {
      layout: { type: "table" as const, properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }] } },
      objects: [inCell(text("a", "Eins", 1), 0, 0), inCell(text("b", "Zwei", 2), 1, 0), inCell(text("c", "Drei", 3), 0, 1)],
    }
    const one = withTemplate(two, "one-column", 1).screen
    expect(one.objects.map((o) => [o.id, ...cellOf(o)])).toEqual([
      ["a", 0, 0],
      ["c", 1, 0],
      ["b", 2, 0],
    ])
  })

  test("a free screen is read top to bottom, left to right; going back to free keeps every place", () => {
    const free = {
      layout: { type: "free" as const },
      objects: [text("low", "Unten", 1, 10, 200), text("right", "Rechts", 2, 200, 20), text("left", "Links", 3, 10, 20)],
    }
    const table = withTemplate(free, "name-and-control", 1).screen
    expect(table.objects.map((o) => [o.id, ...cellOf(o)])).toEqual([
      ["left", 0, 0],
      ["right", 0, 1],
      ["low", 1, 0],
    ])
    const back = withTemplate(table, "free", 1).screen
    expect(back.objects.map((o) => [o.id, o.x, o.y, o.properties.cell])).toEqual([
      ["left", 10, 20, undefined],
      ["right", 200, 20, undefined],
      ["low", 10, 200, undefined],
    ])
  })
})

test.describe("the Layout option", () => {
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

  const chosen = (page: Page, id: string) => page.locator(`#screenLayout [data-layout="${id}"]`)

  test("the list shows each layout with a picture; a project saved with «Two columns»' stacks loads as its table", async ({ page }) => {
    await loadProject(page, await twoColumns())
    await page.locator("[data-screen-root]").click()
    for (const id of ["one-column", "name-and-control", "two-columns", "free"]) await expect(chosen(page, id).locator("svg")).toHaveCount(1)
    await expect(chosen(page, "two-columns")).toHaveAttribute("aria-checked", "true")
    const loaded = await screenOne(page)
    expect(loaded.layout).toEqual({ type: "table", properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 2 } })
  })

  test("«Two columns» to «One column» keeps everything, row by row; undo brings the columns back", async ({ page }) => {
    await loadProject(page, await twoColumns())
    await page.locator("[data-screen-root]").click()
    await chosen(page, "one-column").click()

    const one = await screenOne(page)
    expect(one.layout.properties.columns).toEqual([{ width: { share: 100 } }])
    expect(one.objects.map((o: Obj) => [o.id, o.properties.cell.row])).toEqual([
      ["left-a", 0],
      ["right-a", 1],
      ["left-b", 2],
    ])

    await page.keyboard.press("ControlOrMeta+z")
    const back = await screenOne(page)
    expect(back.layout.properties.columns).toHaveLength(2)
    expect(back.objects.map((o: Obj) => [o.id, o.properties.cell.row, o.properties.cell.column])).toEqual([
      ["left-a", 0, 0],
      ["left-b", 1, 0],
      ["right-a", 0, 1],
    ])
  })

  test("a new screen starts with «Name and control», its table at once; a master has no layout to choose", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "Fresh", false)
    const fresh = (await downloaded(page)).screens.find((s: Obj) => s.name === "Fresh")
    expect(fresh.layout).toEqual({ type: "table", properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 1 } })
    await page.locator("[data-screen-root]").click()
    await expect(chosen(page, "name-and-control")).toHaveAttribute("aria-checked", "true")

    await createScreen(page, "A master", true)
    await page.locator("[data-screen-root]").click()
    await expect(page.locator("#screenLayout")).toHaveCount(0)
  })
})
