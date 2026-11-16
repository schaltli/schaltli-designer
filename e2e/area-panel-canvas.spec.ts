import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, getMainCanvas, loadProject, objectTreeRow } from "./helpers"
import { migrateToAreas } from "../lib/area-migration"

// A switcher's panel is an area (docs/2026-11-16-areas.md, step 1), in the
// designer: an object in a panel has «Position» with Dock, the panel has
// Padding and Gap, and the switcher holds what its panels hold (E2).
// The model is in e2e/area-panel.spec.ts.

type Obj = Record<string, any>

const box = (id: string, x: number, y: number, width: number, height: number): Obj => ({
  id,
  type: "box",
  x,
  y,
  width,
  height,
  zIndex: 1,
  properties: { fillColor: "#808080", strokeColor: "#000000", strokeWidth: 1 },
})

// The fixture project with a switcher at 20, 20, 300 × 200, its one panel
// holding `children`.
async function projectJson(children: Obj[]): Promise<{ zip: JSZip; project: Obj }> {
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
      children: [{ id: "p1", type: "panel", x: 0, y: 0, width: 300, height: 200, zIndex: 1, properties: { comparisonOperator: "==", comparisonValue: "a" }, children }],
    },
  ]
  return { zip, project }
}

async function projectWith(children: Obj[]): Promise<string> {
  const { zip, project } = await projectJson(children)
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `area-panel-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page): Promise<{ switcher: Obj; panel: Obj; pixelsPerMm: number }> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  const switcher = project.screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "sw")
  return { switcher, panel: switcher.children[0], pixelsPerMm: project.settings?.pixelsPerMm ?? 4 }
}

// The 400 × 300 screen centred in the canvas at 100 %.
async function screenPoint(page: Page, x: number, y: number) {
  const { box: canvas } = await getMainCanvas(page)
  return { x: canvas.x + (canvas.width - 400) / 2 + x, y: canvas.y + (canvas.height - 300) / 2 + y }
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 3 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 3 })
  await page.mouse.up()
}

test("an object in a panel has Position: docked Top it spans the panel, inside the panel's padding", async ({ page }) => {
  await loadProject(page, await projectWith([box("kasten", 40, 50, 60, 30)]))
  await objectTreeRow(page, "kasten").click()
  await expect(page.locator("#areaDock option")).toHaveText(["None", "Top", "Bottom", "Left", "Right", "Fill"])
  await expect(page.locator("#areaHorizontal")).toHaveValue("left")
  await page.locator("#areaDock").selectOption("top")
  // Along the top edge the panel sets where it stands across.
  await expect(page.locator("#areaHorizontal")).toHaveCount(0)

  let now = await saved(page)
  let kasten = now.panel.children[0]
  expect([kasten.x, kasten.y, kasten.width, kasten.height]).toEqual([0, 0, 300, 30])

  // The panel's own Padding.
  await objectTreeRow(page, "p1").click()
  await page.locator("#padding").fill("2")
  await page.locator("#padding").press("Enter")
  now = await saved(page)
  const pad = Math.round(2 * now.pixelsPerMm)
  kasten = now.panel.children[0]
  expect(now.panel.properties.padding).toBe(2)
  expect([kasten.x, kasten.y, kasten.width, kasten.height]).toEqual([pad, pad, 300 - 2 * pad, 30])
})

test("dragged past the panel's right edge, the switcher grows to hold it", async ({ page }) => {
  await loadProject(page, await projectWith([box("kasten", 10, 10, 60, 30)]))
  await objectTreeRow(page, "kasten").click()
  await drag(page, await screenPoint(page, 20 + 10 + 30, 20 + 10 + 15), { x: 260, y: 0 })
  const { switcher, panel } = await saved(page)
  const kasten = panel.children[0]
  expect(kasten.x + kasten.width).toBeGreaterThan(300)
  expect(switcher.width).toBe(kasten.x + kasten.width)
  expect([switcher.x, switcher.y, switcher.height]).toEqual([20, 20, 200])
  expect([panel.width, panel.height]).toEqual([switcher.width, 200])
})

test("the switcher dragged smaller stops where its panel still holds what is in it", async ({ page }) => {
  await loadProject(page, await projectWith([box("kasten", 10, 10, 60, 30)]))
  await objectTreeRow(page, "sw").click()
  await drag(page, await screenPoint(page, 320, 220), { x: -280, y: -190 })
  const { switcher, panel } = await saved(page)
  expect([switcher.x, switcher.y, switcher.width, switcher.height]).toEqual([20, 20, 70, 40])
  expect([panel.children[0].x, panel.children[0].y]).toEqual([10, 10])
})

// Old projects (lib/area-migration.ts; the model is in
// e2e/areas-migration.spec.ts): a card that filled its panel.
const cardFilling = (look: string | undefined): Obj => ({
  id: "karte",
  type: "free",
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  zIndex: 1,
  properties: look ? { look } : {},
  children: [{ ...box("kopf", 0, 0, 80, 30), properties: { ...box("kopf", 0, 0, 80, 30).properties, dock: "top" } }, box("kasten", 40, 80, 60, 30)],
})

test("an old project's card filling its panel: opened, the panel is the card and shows its Look", async ({ page }) => {
  await loadProject(page, await projectWith([cardFilling("card")]))
  await objectTreeRow(page, "p1").click()
  await expect(page.locator("#freeLook")).toHaveValue("card")
  await expect(objectTreeRow(page, "karte")).toHaveCount(0)
  // What stood in the card stands in the panel, and has its Position there.
  await objectTreeRow(page, "kopf").click()
  await expect(page.locator("#areaDock")).toHaveValue("top")

  const { switcher, panel } = await saved(page)
  expect(panel.properties).toMatchObject({ look: "card", areaBox: { id: "karte-background", zIndex: 1 } })
  expect(panel.children.map((c: Obj) => c.id)).toEqual(["kopf", "kasten"])
  expect([switcher.width, switcher.height]).toEqual([300, 200])
})

test("the panel that took its card over is drawn as the card in the panel was", async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  // Laid out only, its colours as they are: the theme's roles a project's
  // colours become on opening are not resolved by this render.
  const render = async (children: Obj[], migrate: boolean): Promise<string> => {
    const { project } = await projectJson(children)
    if (migrate) migrateToAreas(project)
    return page.evaluate(
      async ({ p, index }) => {
        const w = window as any
        return w.__renderScreenForTest({ project: w.__layoutProjectForTest(p), screenIndex: index, topicOverrides: { m: "a" } })
      },
      { p: project, index: project.screens.findIndex((s: Obj) => s.id === "screen-1") },
    )
  }
  // Left as it is the card stays an area in its panel; migrated, the panel
  // takes it over. Both draw the same pixels.
  // A fill and an edge of its own, round corners that cut the box docked
  // at its top: the theme's roles of a card's look are not resolved here.
  const own = { fillColor: "#204060", strokeColor: "#ffffff", strokeWidth: 3, cornerRadius: 24 }
  const card = () => ({ ...cardFilling(undefined), properties: own })
  const asArea = await render([card()], false)
  const takenOver = await render([card()], true)
  expect(takenOver).toBe(asArea)
  // And the card is in them: without its fill the picture is another.
  expect(await render([cardFilling(undefined)], true)).not.toBe(takenOver)
})
