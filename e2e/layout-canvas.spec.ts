import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// Layout containers on the canvas (docs/2026-10-02-layout.md, module
// layout-canvas): the Layout tools, a container's properties, and the frame
// of an object a container places, shown locked.

type Obj = Record<string, any>

const text = (id: string, words: string, zIndex: number): Obj => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 300,
  height: 23,
  zIndex,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
})

// A grid on the first screen of the combined project, holding two names and
// a box; and a text beside it, outside any container.
const FIXTURE: Obj[] = [
  {
    id: "the-grid",
    type: "grid",
    x: 20,
    y: 20,
    width: 300,
    height: 200,
    zIndex: 1,
    properties: { columns: ["auto", 1] },
    children: [text("name-1", "Licht", 2), { id: "a-box", type: "box", x: 0, y: 0, width: 40, height: 20, zIndex: 3, properties: { fillColor: "#000000", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 0 } }, text("name-2", "Frischwasserpumpe", 4)],
  },
  { ...text("loose", "Frei", 5), x: 30, y: 250, width: 80 },
]

async function fixtureProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = FIXTURE
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `layout-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

// The project as the editor holds it, through the real download.
async function downloadedProject(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}
async function screenOne(page: Page): Promise<Obj[]> {
  return (await downloadedProject(page)).screens.find((s: Obj) => s.id === "screen-1").objects
}

async function clickAt(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, x, y)
  await page.mouse.move(p.x, p.y)
  await page.mouse.move(p.x + 1, p.y + 1)
  await page.mouse.click(p.x + 1, p.y + 1)
}

async function frame(page: Page): Promise<Record<"x" | "y" | "width" | "height", number>> {
  await openFrameSection(page)
  const value = async (id: string) => Number(await page.locator(`#${id}`).inputValue())
  return { x: await value("x"), y: await value("y"), width: await value("width"), height: await value("height") }
}

test.describe("layout containers on the canvas", () => {
  test("the Layout tools: a grid drawn on the screen, its columns set in its properties", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    for (const name of ["Stack", "Row", "Grid", "Free"]) {
      await expect(page.getByRole("button", { name, exact: true }).first()).toBeVisible()
    }
    await page.getByRole("button", { name: "Grid", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 200, 230)
    const to = devicePoint(box, 380, 290)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()

    // The new grid is selected, its own properties shown.
    await expect(page.locator("h3").first()).toContainText("Grid")
    const columns = page.locator("#container-columns")
    await expect(columns).toHaveValue("auto, 1")
    await columns.fill("auto, 2, 1")
    await columns.blur()
    await expect(columns).toHaveValue("auto, 2, 1")
    // Half a list is put back, not taken.
    await columns.fill("auto, x")
    await columns.blur()
    await expect(columns).toHaveValue("auto, 2, 1")
  })

  test("an object in a grid: placed by it, its frame locked; the grid's columns move it", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    // The box, in the grid's second column, after the longer name's column.
    await objectTreeRow(page, "a-box").click()
    const before = await frame(page)
    for (const id of ["x", "y", "width"]) await expect(page.locator(`#${id}`)).toHaveAttribute("readonly", "")
    // The height stays the object's own.
    await expect(page.locator("#height")).not.toHaveAttribute("readonly", "")

    // Equal columns: the box moves to the middle of the grid.
    await objectTreeRow(page, "the-grid").click()
    await page.locator("#container-columns").fill("1, 1")
    await page.locator("#container-columns").blur()
    await objectTreeRow(page, "a-box").click()
    const after = await frame(page)
    expect(after.x).not.toBe(before.x)
    expect(after.y).toBe(before.y)
  })

  test("an object outside a container keeps its frame editable", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    await objectTreeRow(page, "loose").click()
    await openFrameSection(page)
    // (A text's height comes from its font, locked by the text's own panel, as ever.)
    for (const id of ["x", "y", "width"]) await expect(page.locator(`#${id}`)).not.toHaveAttribute("readonly", "")
  })
})

test.describe("placing into a container at the insertion line", () => {
  // A stack holding two names, under the grid of the fixture's screen.
  async function withStack(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: Obj) => s.id === "screen-1").objects = [
      ...FIXTURE,
      { id: "the-stack", type: "vertical-stack", x: 200, y: 20, width: 180, height: 200, zIndex: 9, properties: {}, children: [text("top", "Oben", 10), text("bottom", "Unten", 11)] },
    ]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `layout-stack-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }

  // (This device offers nothing to operate, so a text it is.)
  test("a text clicked in between two names of a stack lands between them, at the stack's start, as wide as its words", async ({ page }) => {
    await loadProject(page, await withStack())
    const before = (await screenOne(page)).find((o) => o.id === "the-stack")!
    const [top, bottom] = before.children
    // Between the two names, in the stack.
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    await clickAt(page, 200 + 40, 20 + Math.round((top.y + top.height + bottom.y) / 2))

    const stack = (await screenOne(page)).find((o: Obj) => o.id === "the-stack")!
    expect(stack.children.map((c: Obj) => c.id)).toEqual(["top", expect.any(String), "bottom"])
    expect(stack.children[1].type).toBe("text")
    const placed = stack.children[1]
    expect(placed.x).toBe(stack.children[0].x)
    expect(placed.y).toBeGreaterThan(stack.children[0].y + stack.children[0].height - 1)
    expect(stack.children[2].y).toBeGreaterThan(placed.y + placed.height - 1)
    // Sized by what it is: narrower than the stack.
    expect(placed.width).toBeLessThan(180 - 1)
  })

  test("a box clicked into a grid lands in reading order", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    const grid = (await screenOne(page)).find((o: Obj) => o.id === "the-grid")!
    const last = grid.children[2] // «Frischwasserpumpe», row 2, column 1
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    // Right of it, in row 2: after it, at the end.
    await clickAt(page, 20 + last.x + last.width + 10, 20 + last.y + 5)
    const after = (await screenOne(page)).find((o: Obj) => o.id === "the-grid")!
    expect(after.children.map((c: Obj) => c.id).slice(0, 3)).toEqual(["name-1", "a-box", "name-2"])
    expect(after.children[3].type).toBe("box")
  })

  test("outside any stack, row or grid a rectangle is drawn, as before", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 340, 240)
    const to = devicePoint(box, 390, 290)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    const drawn = (await screenOne(page)).filter((o: Obj) => o.type === "box")
    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toMatchObject({ x: 340, y: 240, width: 50, height: 50 })
  })
})
