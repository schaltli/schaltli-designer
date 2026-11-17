import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { FORMAT_VERSION } from "../lib/area-migration"
import { COMBINED_TEST_PROJECT, getMainCanvas, loadProject, objectTreeRow } from "./helpers"

// The screen is an area (docs/2026-11-16-areas.md, step 1), in the designer:
// an object directly on a screen has «Position» with Dock, the screen has
// Padding and Gap under «Area». The model is in e2e/area-screen.spec.ts.

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

async function projectWith(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `area-screen-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page): Promise<{ screen: Obj; project: Obj; pixelsPerMm: number }> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return { screen: project.screens.find((s: Obj) => s.id === "screen-1"), project, pixelsPerMm: project.settings?.pixelsPerMm ?? 4 }
}

test("an object on a screen has Position: docked Top it spans the panel; the screen's Padding moves it in", async ({ page }) => {
  await loadProject(page, await projectWith([box("kasten", 120, 90, 60, 30), box("frei", 300, 200, 40, 20)]))
  await objectTreeRow(page, "kasten").click()
  await expect(page.locator("#areaDock option")).toHaveText(["None", "Top", "Bottom", "Left", "Right", "Fill"])
  await page.locator("#areaDock").selectOption("top")
  await expect(page.locator("#areaHorizontal")).toHaveCount(0)

  let now = await saved(page)
  const { screenWidth } = now.project
  let kasten = now.screen.objects.find((o: Obj) => o.id === "kasten")
  expect([kasten.x, kasten.y, kasten.width, kasten.height]).toEqual([0, 0, screenWidth, 30])
  // A project the designer saved says which form it has.
  expect(now.project.settings.formatVersion).toBe(FORMAT_VERSION)

  // The screen's own Padding, under «Area» in its properties.
  // A click beside the screen selects nothing: the screen's own properties.
  const { box: canvas } = await getMainCanvas(page)
  await page.mouse.click(canvas.x + 5, canvas.y + 5)
  // The section in the properties, not the tool of the same name in the palette.
  await page.locator("button[data-twisty]", { hasText: /^Area/ }).click()
  await page.locator("#screenPadding").fill("2")
  await page.locator("#screenPadding").press("Enter")
  now = await saved(page)
  const pad = Math.round(2 * now.pixelsPerMm)
  kasten = now.screen.objects.find((o: Obj) => o.id === "kasten")
  expect(now.screen.area).toEqual({ padding: 2 })
  expect([kasten.x, kasten.y, kasten.width, kasten.height]).toEqual([pad, pad, screenWidth - 2 * pad, 30])
  // What stands free stays where it was.
  const frei = now.screen.objects.find((o: Obj) => o.id === "frei")
  expect([frei.x, frei.y]).toEqual([300, 200])
})
