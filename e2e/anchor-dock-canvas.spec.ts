import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// Horizontal and Vertical in a free area, in the designer
// (docs/2026-11-03-anchor-dock.md, Task 2): a free area resized on the
// canvas or in Frame takes its objects along by their Position.

type Obj = Record<string, any>

// A free area at 50,50, 200 × 120, with a fill so a click on it selects it:
// a value at the bottom right that keeps to those edges, a heading across
// that stretches, a box that keeps to the top left.
async function areaProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = [
    {
      id: "karte",
      type: "free",
      x: 50,
      y: 50,
      width: 200,
      height: 120,
      zIndex: 1,
      properties: { fillColor: "panel", strokeWidth: 0, cornerRadius: 0 },
      children: [
        { id: "wert", type: "box", x: 150, y: 90, width: 40, height: 20, zIndex: 1, properties: { fillColor: "accent", strokeWidth: 0, anchor: { x: "right", y: "bottom" } } },
        { id: "kopf", type: "box", x: 10, y: 10, width: 180, height: 20, zIndex: 2, properties: { fillColor: "text", strokeWidth: 0, anchor: { x: "stretch" } } },
        { id: "fest", type: "box", x: 10, y: 40, width: 20, height: 20, zIndex: 3, properties: { fillColor: "text", strokeWidth: 0 } },
      ],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `anchor-area-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function savedArea(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "karte")
}
const geom = (area: Obj, id: string) => {
  const o = area.children.find((c: Obj) => c.id === id)
  return [o.x, o.y, o.width, o.height]
}

// The 400 × 300 screen centred in the canvas at 100 %.
async function screenPoint(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  return { x: box.x + (box.width - 400) / 2 + x, y: box.y + (box.height - 300) / 2 + y }
}

test("dragging a free area's corner takes its objects along by their Position; one Ctrl+Z takes it all back", async ({ page }) => {
  await loadProject(page, await areaProject())
  // A click on an empty part of it selects it; a click on its row in the
  // object list would open it.
  const inside = await screenPoint(page, 100, 150)
  await page.mouse.click(inside.x, inside.y)
  const corner = await screenPoint(page, 250, 170)
  await page.mouse.move(corner.x, corner.y)
  await page.mouse.down()
  await page.mouse.move(corner.x + 25, corner.y + 15, { steps: 3 })
  await page.mouse.move(corner.x + 50, corner.y + 30, { steps: 3 })
  await page.mouse.up()
  const area = await savedArea(page)
  expect([area.width, area.height]).toEqual([250, 150])
  expect(geom(area, "wert")).toEqual([200, 120, 40, 20])
  expect(geom(area, "kopf")).toEqual([10, 10, 230, 20])
  expect(geom(area, "fest")).toEqual([10, 40, 20, 20])
  await page.keyboard.press("ControlOrMeta+z")
  const back = await savedArea(page)
  expect([back.width, back.height]).toEqual([200, 120])
  expect(geom(back, "wert")).toEqual([150, 90, 40, 20])
  expect(geom(back, "kopf")).toEqual([10, 10, 180, 20])
})

test("a width typed into Frame takes them along too", async ({ page }) => {
  await loadProject(page, await areaProject())
  await objectTreeRow(page, "karte").click()
  await openFrameSection(page)
  await page.locator("#width").fill("220")
  await page.locator("#width").blur()
  const area = await savedArea(page)
  expect(geom(area, "wert")).toEqual([170, 90, 40, 20])
  expect(geom(area, "kopf")).toEqual([10, 10, 200, 20])
})

test("Position in the panel: Horizontal and Vertical for an object in a free area, Left/Top not stored", async ({ page }) => {
  await loadProject(page, await areaProject())
  await objectTreeRow(page, "fest").click()
  await expect(page.locator("#areaHorizontal option")).toHaveText(["Left", "Center", "Right", "Stretch"])
  await expect(page.locator("#areaHorizontal")).toHaveValue("left")
  await expect(page.locator("#areaVertical")).toHaveValue("top")
  await page.locator("#areaHorizontal").selectOption("center")
  await page.locator("#areaVertical").selectOption("bottom")
  expect((await savedArea(page)).children.find((c: Obj) => c.id === "fest").properties.anchor).toEqual({ x: "center", y: "bottom" })
  await page.locator("#areaHorizontal").selectOption("left")
  await page.locator("#areaVertical").selectOption("top")
  expect((await savedArea(page)).children.find((c: Obj) => c.id === "fest").properties).not.toHaveProperty("anchor")
  // The area itself, on the screen, has no Position.
  await objectTreeRow(page, "karte").click()
  await expect(page.locator("#areaHorizontal")).toHaveCount(0)
})

// Task 3: Dock and Padding.
test("Dock in Position places it along the area's edge, marks its row and locks what the area sets; Padding moves it in", async ({ page }) => {
  await loadProject(page, await areaProject())
  await objectTreeRow(page, "kopf").click()
  await expect(page.locator("#areaDock option")).toHaveText(["None", "Top", "Bottom", "Left", "Right", "Fill"])
  await page.locator("#areaDock").selectOption("top")
  await expect(objectTreeRow(page, "kopf").getByTestId("dock-mark")).toHaveText("⤒ Top")
  await expect(objectTreeRow(page, "wert").getByTestId("dock-mark")).toHaveCount(0)
  // Along the top, across the whole width: Vertical is the area's now, and
  // so is Horizontal, a box stretching across.
  await expect(page.locator("#areaVertical")).toHaveCount(0)
  await expect(page.locator("#areaHorizontal")).toHaveCount(0)
  await openFrameSection(page)
  await expect(page.locator("#width")).toHaveAttribute("readonly", "")
  await expect(page.locator("#height")).not.toHaveAttribute("readonly", "")
  let area = await savedArea(page)
  expect(geom(area, "kopf")).toEqual([0, 0, 200, 20])
  // The area's padding, 2 mm on this device's scale.
  const inArea = await screenPoint(page, 100, 150)
  await page.mouse.click(inArea.x, inArea.y)
  await page.locator("#padding").fill("2")
  await page.locator("#padding").blur()
  area = await savedArea(page)
  const kopf = area.children.find((c: Obj) => c.id === "kopf")
  expect(kopf.x).toBeGreaterThan(0)
  expect(kopf.x).toBe(kopf.y)
  expect(kopf.width).toBe(200 - 2 * kopf.x)
  // Undocked, it has its own width back.
  await objectTreeRow(page, "kopf").click()
  await page.locator("#areaDock").selectOption("none")
  area = await savedArea(page)
  expect(area.children.find((c: Obj) => c.id === "kopf").width).toBe(180)
})
