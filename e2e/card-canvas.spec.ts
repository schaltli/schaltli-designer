import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow } from "./helpers"

// Cards in the designer (docs/2026-11-03-card.md): the Card tool, Look on a
// free area, and Settings › Cards.

type Obj = Record<string, any>

async function project(objects: Obj[] = []): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `card-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page): Promise<{ objects: Obj[]; settings: Obj }> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const p = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return { objects: p.screens.find((s: Obj) => s.id === "screen-1").objects, settings: p.settings }
}

async function clickAt(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, x, y)
  await page.mouse.click(p.x, p.y)
}

const plainArea = { id: "flaeche", type: "free", x: 40, y: 40, width: 150, height: 100, zIndex: 1, properties: { fillColor: "surface", strokeWidth: 0, cornerRadius: 0 }, children: [] }

test("the Card tool beside Free places a card: Panel, an Outline edge, the radius and padding of Settings › Cards", async ({ page }) => {
  await loadProject(page, await project())
  const tables = page.getByRole("button", { name: "Card", exact: true })
  await expect(page.getByRole("button", { name: "Free", exact: true }).first()).toBeVisible()
  await tables.first().click()
  await clickAt(page, 200, 150)
  const { objects, settings } = await saved(page)
  const card = objects.find((o) => o.type === "free")!
  const ppm = settings.pixelsPerMm ?? 4
  expect(card.properties).toMatchObject({
    look: "card",
    fillColor: "panel",
    strokeColor: "outline",
    strokeWidth: 1,
    cornerRadius: Math.round(2 * ppm),
    padding: 1,
  })
  expect([card.width, card.height]).toEqual([Math.round(40 * ppm), Math.round(30 * ppm)])
})

test("Look on a free area: Card hides its own shape and colours behind a note; None gives them back with the card's values", async ({ page }) => {
  await loadProject(page, await project([plainArea]))
  await objectTreeRow(page, "flaeche").click()
  await expect(page.locator("#cornerRadius")).toBeVisible()
  await page.locator("#freeLook").selectOption("card-accent")
  await expect(page.locator("#cornerRadius")).toHaveCount(0)
  await expect(page.locator("#padding")).toHaveCount(0)
  await expect(page.getByText("Panel with an Accent edge", { exact: false })).toBeVisible()
  let area = (await saved(page)).objects.find((o) => o.id === "flaeche")!
  expect(area.properties).toMatchObject({ look: "card-accent", strokeColor: "accent", strokeWidth: 2, fillColor: "panel" })
  await page.locator("#freeLook").selectOption("none")
  await expect(page.locator("#cornerRadius")).toBeVisible()
  area = (await saved(page)).objects.find((o) => o.id === "flaeche")!
  expect(area.properties).not.toHaveProperty("look")
  expect(area.properties).toMatchObject({ strokeColor: "accent", strokeWidth: 2, fillColor: "panel" })
})

test("Settings › Cards changes every card at once; one Ctrl+Z takes it back", async ({ page }) => {
  const second = { ...plainArea, id: "zwei", x: 200, y: 160, width: 100, height: 60, properties: { look: "card" } }
  await loadProject(page, await project([{ ...plainArea, properties: { look: "card" } }, second]))
  const before = await saved(page)
  const ppm = before.settings.pixelsPerMm ?? 4
  expect(before.objects.map((o) => o.properties.cornerRadius)).toEqual([Math.round(2 * ppm), Math.round(2 * ppm)])
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByText("Cards", { exact: true }).click()
  await expect(page.getByTestId("card-preview")).toBeVisible()
  await expect(page.getByTestId("card-preview-accent")).toBeVisible()
  await page.locator("#cardRadius").fill("4")
  await page.getByRole("button", { name: "Close" }).click()
  const after = await saved(page)
  expect(after.settings.cards).toMatchObject({ radiusMm: 4 })
  expect(after.objects.map((o) => o.properties.cornerRadius)).toEqual([Math.round(4 * ppm), Math.round(4 * ppm)])
  await page.keyboard.press("ControlOrMeta+z")
  const undone = await saved(page)
  expect(undone.objects.map((o) => o.properties.cornerRadius)).toEqual([Math.round(2 * ppm), Math.round(2 * ppm)])
})

// Module button-radius (docs/2026-11-04-native-buttons.md): Button radius
// beside the cards' settings; every button gets it, empty brings the pill back.
test("Settings › Cards › Button radius rounds every button's corners; empty is a pill again", async ({ page }) => {
  const knopf = { id: "knopf", type: "button", x: 40, y: 200, width: 160, height: 60, zIndex: 2, properties: { text: "Licht", buttonStyle: "filled", buttonColor: "accent", action: { type: "next-screen" } } }
  await loadProject(page, await project([knopf]))
  const before = await saved(page)
  const ppm = before.settings.pixelsPerMm ?? 4
  expect(before.objects[0].properties).not.toHaveProperty("buttonRadius")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByText("Cards", { exact: true }).click()
  await expect(page.getByTestId("button-preview")).toBeVisible()
  await page.locator("#buttonRadius").fill("1.5")
  await page.getByRole("button", { name: "Close" }).click()
  const after = await saved(page)
  expect(after.settings.cards).toMatchObject({ buttonRadiusMm: 1.5 })
  expect(after.objects[0].properties.buttonRadius).toBe(Math.round(1.5 * ppm))
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByText("Cards", { exact: true }).click()
  await page.locator("#buttonRadius").fill("")
  await page.getByRole("button", { name: "Close" }).click()
  const cleared = await saved(page)
  expect(cleared.settings.cards ?? {}).not.toHaveProperty("buttonRadiusMm")
  expect(cleared.objects[0].properties).not.toHaveProperty("buttonRadius")
})
