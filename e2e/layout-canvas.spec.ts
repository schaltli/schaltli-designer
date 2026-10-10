import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { canDropAsChildOf } from "../lib/object-tree"
import { placedSize } from "../lib/placing"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// Containers on the canvas (docs/2026-10-02-layout.md, as amended by
// docs/2026-10-09-snap-tables.md): an object outside one keeps its frame, a
// new one is put down where it is let go, and which container takes what.
// The old grid in the fixture dissolves on load (lib/table.ts).

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

test.describe("layout containers on the canvas", () => {
  test("an object outside a container keeps its frame editable", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    await objectTreeRow(page, "loose").click()
    await openFrameSection(page)
    // (A text's height comes from its font, locked by the text's own panel, as ever.)
    for (const id of ["x", "y", "width"]) await expect(page.locator(`#${id}`)).not.toHaveAttribute("readonly", "")
  })
})

test.describe("placing", () => {
  // Since placing by dragging (docs/2026-10-09-snap-tables.md) nothing is
  // drawn as a rectangle: the box comes at its default size, carried at its
  // middle to where it is let go.
  test("outside any table a new object is put down at its default size where it is let go", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    const { box, canvas } = await getMainCanvas(page)
    const from = devicePoint(box, 340, 240)
    const to = devicePoint(box, 360, 260)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    // The fixture grid's box lies free since it dissolved: the new one is the other.
    const drawn = (await screenOne(page)).filter((o: Obj) => o.type === "box" && o.id !== "a-box")
    expect(drawn).toHaveLength(1)
    const size = placedSize("box", Number(await canvas.getAttribute("data-pixels-per-mm")))!
    expect(drawn[0]).toMatchObject({ width: size.width, height: size.height })
    expect(Math.abs(drawn[0].x + drawn[0].width / 2 - 360)).toBeLessThanOrEqual(1)
    expect(Math.abs(drawn[0].y + drawn[0].height / 2 - 260)).toBeLessThanOrEqual(1)
  })
})

test.describe("what a container takes", () => {
  test("a free area takes anything a screen takes, a panel not; a table put together by snapping takes nothing here (lib/object-tree.ts)", () => {
    const panel = { id: "p", type: "panel", x: 0, y: 0, width: 1, height: 1, zIndex: 0, properties: {}, children: [] }
    const objects = [
      { id: "sw", type: "switcher", x: 0, y: 0, width: 10, height: 10, zIndex: 0, properties: {}, children: [panel] },
      { id: "fr", type: "free", x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: {}, children: [] },
      { id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 2, properties: {} },
      { id: "snap", type: "table", x: 0, y: 0, width: 10, height: 10, zIndex: 3, properties: { grid: 1, columns: [{}], rows: [{}] }, children: [] },
    ] as never
    expect(canDropAsChildOf(objects, "t", "fr")).toBe(true)
    expect(canDropAsChildOf(objects, "sw", "fr")).toBe(true)
    expect(canDropAsChildOf(objects, "p", "fr")).toBe(false)
    // Into a table only through a cell, on the canvas (docs/2026-10-09-snap-tables.md).
    expect(canDropAsChildOf(objects, "t", "snap")).toBe(false)
  })
})

