import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { templateOf, withTemplate } from "../lib/layout-templates"
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
  test("from two columns to one: the second column's content after the first's", () => {
    const empty = { layout: { type: "free" as const }, objects: [text("a", "Eins", 1, 10, 10), text("b", "Zwei", 2, 10, 50)] }
    const two = withTemplate(empty, "two-columns", 100)
    expect(templateOf(two.screen)).toBe("two-columns")
    expect(two.nextId).toBe(102)
    // Everything into the first column; the second one empty.
    const [first, second] = two.screen.objects
    expect(first.children!.map((c) => c.id)).toEqual(["a", "b"])
    second.children!.push(text("c", "Drei", 0))

    const one = withTemplate(two.screen, "one-column", two.nextId).screen
    expect(templateOf(one)).toBe("one-column")
    expect(one.objects.map((o) => o.id)).toEqual(["a", "b", "c"])
    expect(one.objects.map((o) => o.zIndex)).toEqual([0, 1, 2])
  })

  test("a free screen is read top to bottom, left to right; going back to free keeps every place", () => {
    const free = {
      layout: { type: "free" as const },
      objects: [text("low", "Unten", 1, 10, 200), text("right", "Rechts", 2, 200, 20), text("left", "Links", 3, 10, 20)],
    }
    const grid = withTemplate(free, "name-and-control", 1).screen
    expect(grid.objects.map((o) => o.id)).toEqual(["left", "right", "low"])
    const back = withTemplate(grid, "free", 1).screen
    expect(back.objects.map((o) => [o.id, o.x, o.y])).toEqual([
      ["left", 10, 20],
      ["right", 200, 20],
      ["low", 10, 200],
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

  test("«Two columns» to «One column» keeps everything, the second column after the first; undo brings the columns back", async ({ page }) => {
    await loadProject(page, await twoColumns())
    await page.locator("[data-screen-root]").click()
    await expect(page.locator("#screenLayout")).toHaveValue("two-columns")
    await page.locator("#screenLayout").selectOption("one-column")

    const one = await screenOne(page)
    expect(one.layout.type).toBe("vertical-stack")
    expect(one.objects.map((o: Obj) => o.id)).toEqual(["left-a", "left-b", "right-a"])

    await page.keyboard.press("ControlOrMeta+z")
    const back = await screenOne(page)
    expect(back.layout.type).toBe("horizontal-stack")
    expect(back.objects.map((o: Obj) => [o.id, o.children.map((c: Obj) => c.id)])).toEqual([
      ["col-1", ["left-a", "left-b"]],
      ["col-2", ["right-a"]],
    ])
  })

  test("a new screen starts with «Name and control»; a master has no layout to choose", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "Fresh", false)
    const fresh = (await downloaded(page)).screens.find((s: Obj) => s.name === "Fresh")
    expect(fresh.layout).toEqual({ type: "grid", properties: { columns: ["auto", 1] } })
    await page.locator("[data-screen-root]").click()
    await expect(page.locator("#screenLayout")).toHaveValue("name-and-control")

    await createScreen(page, "A master", true)
    await page.locator("[data-screen-root]").click()
    await expect(page.locator("#screenLayout")).toHaveCount(0)
  })
})
