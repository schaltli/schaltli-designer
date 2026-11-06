import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"
import { freeMinSize, withCardsFollowing, withCardsGrown } from "../lib/free-min-size"
import { moveOutOf, snapTableGeometry } from "../lib/snap-table"
import { resizeFree } from "../lib/anchor"
import { dockFree } from "../lib/dock"
import { buildEntry } from "../lib/bausteine"
import { blockCard } from "../lib/block-card"
import { layoutObjects, naturalWidth } from "../lib/layout"
import { ROLE_PALETTE } from "../lib/control-palette"
import type { CatalogEntry } from "../lib/ha-discovery"
import type { ScreenObject } from "../components/project-editor"

// A card only so small that everything in it keeps its room (the user,
// 2026-11-06; lib/free-min-size.ts): made smaller, a docked table was left
// out without a word and an object standing free ran past the edge. Dragged
// or typed into Frame, it stops where all it holds still fits.

type Obj = Record<string, any>
const SCALE = { pixelsPerMm: 5 }

// 200 × 120: a value kept to the bottom right edges, a heading across that
// stretches, a box at the top left (as e2e/anchor-dock-canvas.spec.ts).
const area = (): ScreenObject => ({
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
})

// A fan's card as a prebuilt places it: its name docked on top, its parts a
// table docked Fill.
const hall = {
  id: "e2e-hall",
  device: "",
  component: "fan",
  name: "Hall",
  label: "Hall",
  controls: [
    { kind: "switch", read: "hall#state", write: "hall/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" }, part: "Power" },
    { kind: "level", read: "hall#speed", write: "hall/speed/set", min: 0, max: 100, step: 1, part: "Speed" },
  ],
} as unknown as CatalogEntry
function fanCard(): ScreenObject {
  const built = buildEntry({
    entry: hall,
    rect: { x: 0, y: 0, width: 300, height: 160 },
    palette: ROLE_PALETTE,
    font: { id: "f", size: 14 },
    options: { label: "Hall", look: "", icon: null, parts: [{ control: 0, look: "buttons" }, { control: 1, look: "slider" }] },
  })
  let n = 0
  const walk = (o: any): ScreenObject => ({ ...o, id: `o${n++}`, zIndex: o.zIndex ?? 0, ...(o.children ? { children: o.children.map(walk) } : {}) })
  return layoutObjects([{ ...walk(blockCard(built, 300, SCALE)), id: "fan", x: 20, y: 20 }], SCALE)[0]
}

// The dimmer «Küche» as the user saved it (CamperUI, screen Dimmer,
// 2026-11-06): a card, its row of name, slider and value a table docked
// Fill, the card narrower than the table - which a card cuts at its edge.
const KUECHE = {"id": "kueche", "type": "free", "x": 20, "y": 150, "width": 341, "height": 78, "zIndex": 58, "properties": {"look": "card", "clipContents": true, "fillColor": "panel", "strokeColor": "outline", "strokeWidth": 1, "cornerRadius": 10, "padding": 1.475}, "children": [{"id": "obj-table-56", "type": "table", "x": 10, "y": 10, "width": 420, "height": 58, "zIndex": 57, "properties": {"grid": 1, "gapMm": 1.18, "columns": [{"mm": 22.124}, {"mm": 29.204}, {"mm": 8.26}], "rows": [{"mm": 8.555}], "dock": "fill"}, "children": [{"id": "obj-text-51", "type": "text", "x": 0, "y": 14, "width": 150, "height": 30, "zIndex": 52, "properties": {"text": "{live:dn2}", "liveValues": [{"id": "dn2", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/2/name"}, "rules": [], "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "text", "textAlign": "left", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 0, "anchor": {"y": "center"}}}}, {"id": "obj-slider-53", "type": "slider", "x": 158, "y": 12, "width": 198, "height": 34, "zIndex": 53, "properties": {"topic": "schaltli/state/dimmer/2/level", "barDirection": "left-to-right", "calibrationPoints": [{"value": 0, "barSizePercent": 0}, {"value": 100, "barSizePercent": 100}], "displayValue": "none", "thickness": 34, "fillColor": "textMuted", "trackColor": "track", "writeTopic": "schaltli/cmnd/dimmer/2", "step": 5, "cell": {"row": 0, "column": 1, "anchor": {"x": "stretch", "y": "center"}, "drawnWidth": 100}}}, {"id": "obj-text-55", "type": "text", "x": 364, "y": 14, "width": 56, "height": 30, "zIndex": 56, "properties": {"text": "{live:dl2}", "liveValues": [{"id": "dl2", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/2/level"}, "format": {"kind": "number", "decimals": 0, "grouped": false}, "rules": [{"op": "==", "operand": "0", "result": {"kind": "text", "parts": ["Aus"]}}], "otherwise": {"kind": "text", "parts": [{"value": true}, "%"]}, "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "textMuted", "textAlign": "right", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 2, "anchor": {"y": "center"}}}}]}]}
// Narrower still than saved, so the table is too wide for it at any panel's
// pixels per mm.
const kueche = (): ScreenObject => ({ ...JSON.parse(JSON.stringify(KUECHE)), width: 200 })

const leftOut = (o: ScreenObject): boolean => !!o.properties?.dockedOut || (o.children ?? []).some(leftOut)
const at = (o: ScreenObject, w: number, h: number) => dockFree(resizeFree(o, w, h), SCALE)

test.describe("how small a card can be: the model", () => {
  test("objects standing free: each keeps inside, a stretched one no thinner than it is high", () => {
    // The value moves with the right and bottom edges: at 50 wide it reaches
    // the left one; the box at the top left needs 60 down.
    expect(freeMinSize(area(), SCALE)).toEqual({ width: 50, height: 60 })
  })

  test("a docked heading and table: all of it whole at the smallest size, something left out one pixel below", () => {
    const card = fanCard()
    const min = freeMinSize(card, SCALE)!
    // Built as narrow and as low as its parts allow: that is the bound.
    expect(min.width).toBeLessThanOrEqual(card.width)
    expect(min.height).toBeLessThanOrEqual(card.height)
    expect(leftOut(at(card, min.width, min.height))).toBe(false)
    expect(leftOut(at(card, min.width, min.height - 1))).toBe(true)
    // One pixel narrower the parts' table no longer has its columns: the bound
    // is still what they need.
    expect(freeMinSize(resizeFree(card, min.width - 1, card.height), SCALE)!.width).toBe(min.width)
  })

  test("an area already too small: the bound is what its content needs, more than it has", () => {
    // Made that small before there was a bound: its objects moved along by their anchors.
    expect(freeMinSize(resizeFree(area(), 40, 30), SCALE)).toEqual({ width: 50, height: 60 })
  })

  test("a card saved narrower than its table («Küche», the user 2026-11-06): the table's width and the padding", () => {
    const card = kueche()
    const table = card.children![0]
    const min = freeMinSize(card, SCALE)!
    expect(min.width).toBe(naturalWidth(table, SCALE) + 2 * Math.round(card.properties.padding * SCALE.pixelsPerMm))
    expect(min.width).toBeGreaterThan(card.width)
  })

  test("an object kept to the left, standing past the left edge: only its right edge counts", () => {
    const off = { ...area(), children: [{ ...area().children![2], x: -5 }] }
    expect(freeMinSize(off, SCALE)).toEqual({ width: 15, height: 60 })
  })

  test("with a padding, objects standing free keep it from the edge too (the user, 2026-11-06)", () => {
    // 2 mm, 10 px here: the value kept to the bottom right stops 10 px in,
    // the box at the top left needs its 60 down and 10 more.
    expect(freeMinSize({ ...area(), properties: { ...area().properties, padding: 2 } }, SCALE)).toEqual({ width: 60, height: 70 })
  })

  test("an empty area and anything not a free area have no bound", () => {
    expect(freeMinSize({ ...area(), children: [] }, SCALE)).toBeUndefined()
    expect(freeMinSize({ ...area(), type: "box" }, SCALE)).toBeUndefined()
  })
})

async function projectWith(objects: ScreenObject[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = objects
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `card-min-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page, id: string): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === id)
}

async function savedPixelsPerMm(page: Page): Promise<number> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  // The panel's own, else what the layout falls back to (lib/layout.ts FALLBACK_SCALE).
  return project.settings?.pixelsPerMm ?? 4
}

// The 400 × 300 screen centred in the canvas at 100 %.
async function screenPoint(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  return { x: box.x + (box.width - 400) / 2 + x, y: box.y + (box.height - 300) / 2 + y }
}

async function dragCorner(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 3 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 3 })
  await page.mouse.up()
}

test.describe("how small a card can be: in the designer", () => {
  test("dragged far in, the corner stops where everything still fits; the value is still inside", async ({ page }) => {
    await loadProject(page, await projectWith([area()]))
    const inside = await screenPoint(page, 100, 150)
    await page.mouse.click(inside.x, inside.y)
    await dragCorner(page, await screenPoint(page, 250, 170), { x: -190, y: -110 })
    const card = await saved(page, "karte")
    expect([card.x, card.y, card.width, card.height]).toEqual([50, 50, 50, 60])
    const wert = card.children.find((c: Obj) => c.id === "wert")
    expect(wert.x).toBeGreaterThanOrEqual(0)
    expect(wert.y).toBeGreaterThanOrEqual(0)
  })

  test("dragged by its top left corner, the bottom right one stays put", async ({ page }) => {
    await loadProject(page, await projectWith([area()]))
    const inside = await screenPoint(page, 100, 150)
    await page.mouse.click(inside.x, inside.y)
    await dragCorner(page, await screenPoint(page, 50, 50), { x: 190, y: 110 })
    const card = await saved(page, "karte")
    expect([card.x + card.width, card.y + card.height]).toEqual([250, 170])
    expect([card.width, card.height]).toEqual([50, 60])
  })

  test("typed into Frame: a width too small becomes the smallest that fits", async ({ page }) => {
    await loadProject(page, await projectWith([area()]))
    await objectTreeRow(page, "karte").click()
    await openFrameSection(page)
    await page.locator("#width").fill("10")
    await page.locator("#width").blur()
    await page.locator("#height").fill("10")
    await page.locator("#height").blur()
    const card = await saved(page, "karte")
    expect([card.width, card.height]).toEqual([50, 60])
  })

  test("a card saved too narrow for its table: opened, it has the table's width", async ({ page }) => {
    await loadProject(page, await projectWith([kueche()]))
    const card = await saved(page, "kueche")
    const table = card.children[0]
    expect(card.width).toBeGreaterThan(kueche().width)
    expect([card.x, card.y]).toEqual([kueche().x, kueche().y])
    expect(table.x + table.width).toBeLessThanOrEqual(card.width - table.x)
  })

  test("a prebuilt's card dragged small keeps its heading and its parts", async ({ page }) => {
    await loadProject(page, await projectWith([fanCard()]))
    const before = await saved(page, "fan")
    const edge = await screenPoint(page, before.x + 3, before.y + before.height / 2)
    await page.mouse.click(edge.x, edge.y)
    await dragCorner(page, await screenPoint(page, before.x + before.width, before.y + before.height), { x: -before.width + 20, y: -before.height + 20 })
    const card = await saved(page, "fan")
    expect(card.width).toBeLessThanOrEqual(before.width)
    expect(leftOut(card as ScreenObject)).toBe(false)
    for (const c of card.children as Obj[]) {
      expect(c.y + c.height).toBeLessThanOrEqual(card.height)
      expect(c.x + c.width).toBeLessThanOrEqual(card.width)
    }
  })
})

// A card grows when what it holds does not fit (the user, 2026-11-06): the
// name in «Küche» docked with Alt above the slider made the table a row
// taller - and the table, too tall for the card, was left out, standing
// where it had been pushed up to. On opening a project as well: «the new
// rule holds».
// The Dimmer screen's table of three cards as the user had it (CamperUI,
// 2026-11-06): each card stretched in its cell both ways, «Deckenlampe»'s
// name, slider and value a table docked Fill in the first.
const DIMMER = {"id": "obj-table-72", "type": "table", "x": 20, "y": 48, "width": 440, "height": 254, "zIndex": 73, "properties": {"grid": 1, "gapMm": 1.475, "widthMm": 64.897, "equalColumns": true, "columns": [{}], "rows": [{}, {}, {}]}, "children": [{"id": "obj-card-50", "type": "free", "x": 0, "y": 0, "width": 440, "height": 78, "zIndex": 51, "properties": {"look": "card", "clipContents": true, "cell": {"row": 0, "column": 0, "anchor": {"x": "stretch", "y": "stretch"}, "drawnWidth": 40, "drawnHeight": 78}, "fillColor": "panel", "strokeColor": "outline", "strokeWidth": 1, "cornerRadius": 10, "padding": 1.475}, "children": [{"id": "obj-table-49", "type": "table", "x": 10, "y": 10, "width": 420, "height": 58, "zIndex": 50, "properties": {"grid": 1, "gapMm": 1.18, "columns": [{"mm": 22.124}, {"mm": 29.204}, {"mm": 8.26}], "rows": [{"mm": 8.555}], "dock": "fill"}, "children": [{"id": "obj-text-44", "type": "text", "x": 0, "y": 14, "width": 150, "height": 30, "zIndex": 45, "properties": {"text": "{live:dn1}", "liveValues": [{"id": "dn1", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/1/name"}, "rules": [], "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "text", "textAlign": "left", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 0, "anchor": {"y": "center"}}}}, {"id": "obj-slider-46", "type": "slider", "x": 158, "y": 12, "width": 198, "height": 34, "zIndex": 46, "properties": {"topic": "schaltli/state/dimmer/1/level", "barDirection": "left-to-right", "calibrationPoints": [{"value": 0, "barSizePercent": 0}, {"value": 100, "barSizePercent": 100}], "displayValue": "none", "thickness": 34, "fillColor": "accentAlt", "trackColor": "track", "writeTopic": "schaltli/cmnd/dimmer/1", "step": 5, "cell": {"row": 0, "column": 1, "anchor": {"x": "stretch", "y": "center"}, "drawnWidth": 100}}}, {"id": "obj-text-48", "type": "text", "x": 364, "y": 14, "width": 56, "height": 30, "zIndex": 49, "properties": {"text": "{live:dl1}", "liveValues": [{"id": "dl1", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/1/level"}, "format": {"kind": "number", "decimals": 0, "grouped": false}, "rules": [{"op": "==", "operand": "0", "result": {"kind": "text", "parts": ["Aus"]}}], "otherwise": {"kind": "text", "parts": [{"value": true}, "%"]}, "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "accentAlt", "textAlign": "right", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 2, "anchor": {"y": "center"}}}}]}]}, {"id": "obj-card-64", "type": "free", "x": 0, "y": 88, "width": 440, "height": 78, "zIndex": 65, "properties": {"look": "card", "clipContents": true, "cell": {"row": 1, "column": 0, "anchor": {"x": "stretch", "y": "stretch"}, "drawnWidth": 40, "drawnHeight": 78}, "fillColor": "panel", "strokeColor": "outline", "strokeWidth": 1, "cornerRadius": 10, "padding": 1.475}, "children": [{"id": "obj-table-63", "type": "table", "x": 10, "y": 10, "width": 420, "height": 58, "zIndex": 64, "properties": {"grid": 1, "gapMm": 1.18, "columns": [{"mm": 22.124}, {"mm": 29.204}, {"mm": 8.26}], "rows": [{"mm": 8.555}], "dock": "fill"}, "children": [{"id": "obj-text-58", "type": "text", "x": 0, "y": 14, "width": 150, "height": 30, "zIndex": 59, "properties": {"text": "{live:dn3}", "liveValues": [{"id": "dn3", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/3/name"}, "rules": [], "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "text", "textAlign": "left", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 0, "anchor": {"y": "center"}}}}, {"id": "obj-slider-60", "type": "slider", "x": 158, "y": 12, "width": 198, "height": 34, "zIndex": 60, "properties": {"topic": "schaltli/state/dimmer/3/level", "barDirection": "left-to-right", "calibrationPoints": [{"value": 0, "barSizePercent": 0}, {"value": 100, "barSizePercent": 100}], "displayValue": "none", "thickness": 34, "fillColor": "textMuted", "trackColor": "track", "writeTopic": "schaltli/cmnd/dimmer/3", "step": 5, "cell": {"row": 0, "column": 1, "anchor": {"x": "stretch", "y": "center"}, "drawnWidth": 100}}}, {"id": "obj-text-62", "type": "text", "x": 364, "y": 14, "width": 56, "height": 30, "zIndex": 63, "properties": {"text": "{live:dl3}", "liveValues": [{"id": "dl3", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/3/level"}, "format": {"kind": "number", "decimals": 0, "grouped": false}, "rules": [{"op": "==", "operand": "0", "result": {"kind": "text", "parts": ["Aus"]}}], "otherwise": {"kind": "text", "parts": [{"value": true}, "%"]}, "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "textMuted", "textAlign": "right", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 2, "anchor": {"y": "center"}}}}]}]}, {"id": "obj-card-71", "type": "free", "x": 0, "y": 176, "width": 440, "height": 78, "zIndex": 72, "properties": {"look": "card", "clipContents": true, "cell": {"row": 2, "column": 0, "anchor": {"x": "stretch", "y": "stretch"}, "drawnWidth": 40, "drawnHeight": 78}, "fillColor": "panel", "strokeColor": "outline", "strokeWidth": 1, "cornerRadius": 10, "padding": 1.475}, "children": [{"id": "obj-table-70", "type": "table", "x": 10, "y": 10, "width": 420, "height": 58, "zIndex": 71, "properties": {"grid": 1, "gapMm": 1.18, "columns": [{"mm": 22.124}, {"mm": 29.204}, {"mm": 8.26}], "rows": [{"mm": 8.555}], "dock": "fill"}, "children": [{"id": "obj-text-65", "type": "text", "x": 0, "y": 14, "width": 150, "height": 30, "zIndex": 66, "properties": {"text": "{live:dn4}", "liveValues": [{"id": "dn4", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/4/name"}, "rules": [], "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "text", "textAlign": "left", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 0, "anchor": {"y": "center"}}}}, {"id": "obj-slider-67", "type": "slider", "x": 158, "y": 12, "width": 198, "height": 34, "zIndex": 67, "properties": {"topic": "schaltli/state/dimmer/4/level", "barDirection": "left-to-right", "calibrationPoints": [{"value": 0, "barSizePercent": 0}, {"value": 100, "barSizePercent": 100}], "displayValue": "none", "thickness": 34, "fillColor": "textMuted", "trackColor": "track", "writeTopic": "schaltli/cmnd/dimmer/4", "step": 5, "cell": {"row": 0, "column": 1, "anchor": {"x": "stretch", "y": "center"}, "drawnWidth": 100}}}, {"id": "obj-text-69", "type": "text", "x": 364, "y": 14, "width": 56, "height": 30, "zIndex": 70, "properties": {"text": "{live:dl4}", "liveValues": [{"id": "dl4", "source": {"namespace": "topic", "path": "schaltli/state/dimmer/4/level"}, "format": {"kind": "number", "decimals": 0, "grouped": false}, "rules": [{"op": "==", "operand": "0", "result": {"kind": "text", "parts": ["Aus"]}}], "otherwise": {"kind": "text", "parts": [{"value": true}, "%"]}, "noValueYet": {"kind": "text", "parts": ["–"]}}], "textStyle": "xl", "textBold": false, "fontId": "font-montserrat-c14", "fontSize": 26, "color": "textMuted", "textAlign": "right", "backgroundColor": "transparent", "borderColor": "transparent", "cell": {"row": 0, "column": 2, "anchor": {"y": "center"}}}}]}]}]}

test.describe("a card grows with its content", () => {
  // The user's panel and Settings › Cards (CamperUI, 2026-11-06).
  const USER_SCALE = {
    pixelsPerMm: 6.779972650279817,
    cards: { radiusMm: 1.475, edgePx: 1, accentEdgePx: 2, paddingMm: 1.475, buttonRadiusMm: 1.475 },
  }
  type P = { name: string; screens: Array<{ id: string; objects: ScreenObject[] }> }
  const relayout = (p: P): P => ({ ...p, screens: p.screens.map((sc) => ({ ...sc, objects: layoutObjects(sc.objects, USER_SCALE) })) })
  const projectOf = (...objects: ScreenObject[]): P => relayout({ name: "CamperUI", screens: [{ id: "screen-dimmer", objects }] })
  const grown = (p: P) => withCardsGrown(p, USER_SCALE, relayout)
  // A card's name taken out of its cell and docked with Alt above its slider: a new row 0 in that column.
  function nameAboveSlider(card: ScreenObject, nameId: string): ScreenObject {
    const table = card.children![0]
    const slider = table.children!.find((c) => c.type === "slider")!
    const children = moveOutOf(card.children!, table.id, nameId, { x: table.x + slider.x, y: table.y - 40 }, { kind: "table", tableId: table.id, target: { kind: "row", at: 0, column: 1 } }, USER_SCALE)
    return { ...card, children }
  }

  test("«Küche»: the name docked above the slider - the table a row taller, in its place, the card around it", () => {
    const prev = grown(projectOf(JSON.parse(JSON.stringify(KUECHE))))
    const before = prev.screens[0].objects[0]
    const edited = relayout({ ...prev, screens: [{ ...prev.screens[0], objects: [nameAboveSlider(before, "obj-text-51")] }] })
    // What happened until now: the table too tall for the card, left out.
    expect(leftOut(edited.screens[0].objects[0])).toBe(true)
    const card = grown(edited).screens[0].objects[0]
    const table = card.children![0]
    const pad = Math.round(card.properties.padding * USER_SCALE.pixelsPerMm)
    expect(leftOut(card)).toBe(false)
    expect(table.children).toHaveLength(3)
    expect(table.height).toBeGreaterThan(before.children![0].height)
    // Placed again at the padding, and the card ending the padding below it.
    expect([table.x, table.y]).toEqual([pad, pad])
    expect(card.height).toBe(table.y + table.height + pad)
    expect(card.width).toBeGreaterThanOrEqual(table.width + 2 * pad)
    expect([card.x, card.y]).toEqual([before.x, before.y])
  })

  test("«Deckenlampe», a card stretched in a cell of the screen's table: it grows and stays grown, the rows below move down", () => {
    const prev = grown(projectOf(JSON.parse(JSON.stringify(DIMMER))))
    const outer = prev.screens[0].objects[0]
    const lamp = outer.children![0]
    const edited = relayout({ ...prev, screens: [{ ...prev.screens[0], objects: [{ ...outer, children: [nameAboveSlider(lamp, "obj-text-44"), ...outer.children!.slice(1)] }] }] })
    const after = grown(edited).screens[0].objects[0]
    const card = after.children![0]
    expect(leftOut(after)).toBe(false)
    expect(card.height).toBeGreaterThan(lamp.height)
    // Its row as high as it now is - not stretched back to what it was.
    expect(card.properties.cell.drawnHeight).toBe(card.height)
    expect(after.children![1].y).toBeGreaterThanOrEqual(card.y + card.height)
    // Laid out once more, it stays as it is.
    expect(grown(relayout(grown(edited)))).toEqual(grown(edited))
    // Each object inside the cell drawn for it - the value too, in the last
    // column the card's width stretched (the dashed cells, the user's
    // screenshot 2026-11-06: «75%» drawn right of its cell).
    const table = card.children![0]
    const g = snapTableGeometry(table, USER_SCALE)
    expect(g.lefts[g.lefts.length - 1] + g.widths[g.widths.length - 1]).toBe(table.width)
    for (const c of table.children!) {
      const { row, column } = c.properties.cell
      expect(c.x, c.id).toBeGreaterThanOrEqual(g.lefts[column])
      expect(c.x + c.width, c.id).toBeLessThanOrEqual(g.lefts[column] + g.widths[column])
      expect(c.y, c.id).toBeGreaterThanOrEqual(g.tops[row])
      expect(c.y + c.height, c.id).toBeLessThanOrEqual(g.tops[row] + g.heights[row])
    }
  })

  test("«Deckenlampe» docked above its slider and back beside it: the card grows, and is as low again as its content", () => {
    // An edit as the designer makes it: laid out, then the cards that ended
    // with their content following it, then the ones too small grown.
    const edit = (prev: P, objects: ScreenObject[]): P => grown(withCardsFollowing(prev, relayout({ ...prev, screens: [{ ...prev.screens[0], objects }] }), USER_SCALE, relayout))
    const start = grown(projectOf(JSON.parse(JSON.stringify(DIMMER))))
    const outer0 = start.screens[0].objects[0]
    const lamp = outer0.children![0]
    const up = edit(start, [{ ...outer0, children: [nameAboveSlider(lamp, "obj-text-44"), ...outer0.children!.slice(1)] }])
    const outer1 = up.screens[0].objects[0]
    const tall = outer1.children![0]
    expect(tall.height).toBeGreaterThan(lamp.height)
    // Back to the left of the slider, in its row: the name's row goes.
    const table = tall.children![0]
    const slider = table.children!.find((c) => c.type === "slider")!
    const sliderRow = slider.properties.cell.row
    const children = moveOutOf(tall.children!, table.id, "obj-text-44", { x: table.x - 60, y: table.y + slider.y }, { kind: "table", tableId: table.id, target: { kind: "column", at: 0, row: sliderRow } }, USER_SCALE)
    const down = edit(up, [{ ...outer1, children: [{ ...tall, children }, ...outer1.children!.slice(1)] }])
    const outer2 = down.screens[0].objects[0]
    const card = outer2.children![0]
    const inner = card.children![0]
    const pad = Math.round(card.properties.padding * USER_SCALE.pixelsPerMm)
    expect(leftOut(outer2)).toBe(false)
    expect(inner.children!.map((c) => c.properties.cell.row)).toEqual([0, 0, 0])
    expect(card.height).toBeLessThan(tall.height)
    expect(card.height).toBe(inner.y + inner.height + pad)
    expect(card.properties.cell.drawnHeight).toBe(card.height)
    expect(outer2.children![1].y).toBeLessThan(outer1.children![1].y)
  })

  test("a card given more room than its content keeps it when the content shrinks", () => {
    const edit = (prev: P, objects: ScreenObject[]): P => grown(withCardsFollowing(prev, relayout({ ...prev, screens: [{ ...prev.screens[0], objects }] }), USER_SCALE, relayout))
    const roomy = grown(projectOf({ ...area(), height: 200 }))
    const card = roomy.screens[0].objects[0]
    // The box at the top left moved up: the content needs less, the card keeps its 200.
    const after = edit(roomy, [{ ...card, children: card.children!.map((c) => (c.id === "fest" ? { ...c, y: 10 } : c)) }])
    expect(after.screens[0].objects[0].height).toBe(200)
  })

  test("a card grown for a value standing free at its bottom edge: the padding below it too", () => {
    const padded: ScreenObject = {
      ...area(),
      properties: { ...area().properties, padding: 2 },
      children: [{ id: "unten", type: "box", x: 20, y: 100, width: 40, height: 20, zIndex: 1, properties: { fillColor: "accent", strokeWidth: 0 } }],
    } as ScreenObject
    const card = grown(projectOf(padded)).screens[0].objects[0]
    const pad = Math.round(2 * USER_SCALE.pixelsPerMm)
    expect(card.height).toBe(100 + 20 + pad)
    expect(card.width).toBe(200)
  })

  // obj-209 (CamperUI, Home, 2026-11-06): a card holding a label the user
  // moved into its top left corner, into the padding - the card collapsed
  // to 1 px: no size moves a label kept to the top left, and «no bound»
  // was taken for «as small as its content».
  const corner = (y: number, height: number): ScreenObject =>
    ({
      id: "obj-209",
      type: "free",
      x: 20,
      y: 20,
      width: 432,
      height,
      zIndex: 45,
      properties: { look: "card", fillColor: "panel", strokeColor: "outline", strokeWidth: 1, cornerRadius: 10, padding: 1.475 },
      children: [{ id: "obj-210", type: "text", x: y, y, width: 136, height: 23, zIndex: 1, properties: { text: "Label" } }],
    }) as unknown as ScreenObject

  test("obj-209: a label in the card's top left corner, in its padding - opened, it is moved in onto the padding, the card as tall as it then needs", () => {
    const pad = Math.round(1.475 * USER_SCALE.pixelsPerMm)
    // The bound alone: a label kept to the top left is not moved by a size, only its far edges count.
    expect(freeMinSize(corner(5, 1), USER_SCALE)).toEqual({ width: 5 + 136 + pad, height: 5 + 23 + pad })
    const opened = grown(projectOf(corner(5, 1))).screens[0].objects[0]
    const label = opened.children![0]
    expect([label.x, label.y]).toEqual([pad, pad])
    expect([opened.width, opened.height]).toEqual([432, pad + 23 + pad])
  })

  test("obj-209: the label moved into the corner of a card that ended with it - moved in onto the padding, the card as it was", () => {
    const pad = Math.round(1.475 * USER_SCALE.pixelsPerMm)
    const edit = (prev: P, objects: ScreenObject[]): P => grown(withCardsFollowing(prev, relayout({ ...prev, screens: [{ ...prev.screens[0], objects }] }), USER_SCALE, relayout))
    // The label on the padding; the card ending the padding below it.
    const start = grown(projectOf(corner(pad, pad + 23 + pad)))
    expect(start.screens[0].objects[0].height).toBe(pad + 23 + pad)
    const card = edit(start, [corner(3, pad + 23 + pad)]).screens[0].objects[0]
    expect([card.children![0].x, card.children![0].y]).toEqual([pad, pad])
    expect(card.height).toBe(pad + 23 + pad)
  })

  test("the padding on every side: kept to the bottom right, moved in there; kept to the top left but past the right, the card grows; stretched, narrower", () => {
    const pad = Math.round(2 * USER_SCALE.pixelsPerMm)
    const card = {
      ...area(),
      properties: { ...area().properties, padding: 2 },
      children: [
        // Kept to the bottom right, 5 px from both edges.
        { ...area().children![0], x: 155, y: 95 },
        // Kept to the top left, past the right edge's padding: the card grows.
        { ...area().children![2], x: 180, y: 40 },
        // Stretched, 3 px from either edge: in onto the padding, narrower.
        { ...area().children![1], x: 3, width: 194 },
      ],
    } as ScreenObject
    const out = grown(projectOf(card)).screens[0].objects[0]
    const [wert, fest, kopf] = ["wert", "fest", "kopf"].map((id) => out.children!.find((c) => c.id === id)!)
    expect(out.width).toBe(180 + 20 + pad)
    expect(out.height).toBe(120)
    expect([out.width - (wert.x + wert.width), out.height - (wert.y + wert.height)]).toEqual([pad, pad])
    expect([fest.x, fest.y]).toEqual([180, 40])
    expect(kopf.x).toBe(pad)
    expect(out.width - (kopf.x + kopf.width)).toBeGreaterThanOrEqual(pad)
  })

  test("on opening: a card saved too small is grown; one that fits is left as it is", () => {
    const opened = grown(projectOf(JSON.parse(JSON.stringify(KUECHE))))
    const card = opened.screens[0].objects[0]
    expect(card.width).toBeGreaterThan(KUECHE.width)
    expect(card.children![0].x + card.children![0].width).toBeLessThanOrEqual(card.width - card.children![0].x)
    expect(grown(opened)).toBe(opened)
  })
})

test("in the designer: a heading docked Top in «Küche» - the card grows by it, nothing left out", async ({ page }) => {
  // «Küche» with a heading standing free in it, the card no taller than its
  // table and padding at this device's scale (34 + 2 × 8): no room to spare.
  const base = JSON.parse(JSON.stringify(KUECHE))
  const card = {
    ...base,
    height: 50,
    children: [...base.children, { id: "titel", type: "text", x: 10, y: 0, width: 80, height: 20, zIndex: 5, properties: { text: "Licht" } }],
  } as ScreenObject
  await loadProject(page, await projectWith([card]))
  const before = await saved(page, "kueche")
  await objectTreeRow(page, "titel").click()
  await page.locator("#areaDock").selectOption("top")
  const after = await saved(page, "kueche")
  expect(leftOut(after as ScreenObject)).toBe(false)
  const titel = after.children.find((c: Obj) => c.id === "titel")
  const table = after.children.find((c: Obj) => c.type === "table")
  // The heading on top, the table below it, the card around both.
  expect(table.y).toBeGreaterThanOrEqual(titel.y + titel.height)
  expect(after.height).toBeGreaterThan(before.height)
  expect(table.y + table.height).toBeLessThanOrEqual(after.height)
  expect(table.x + table.width).toBeLessThanOrEqual(after.width)
  // One Ctrl+Z: the heading free again, the card as it was.
  await page.keyboard.press("ControlOrMeta+z")
  const back = await saved(page, "kueche")
  expect(back.height).toBe(before.height)
})

test("in the designer: a box dragged to a padded card's bottom edge - let go, the card grows, the padding below it; one Ctrl+Z", async ({ page }) => {
  const padded = { ...area(), properties: { ...area().properties, padding: 2 } } as ScreenObject
  await loadProject(page, await projectWith([padded]))
  const before = await saved(page, "karte")
  const fest0 = before.children.find((c: Obj) => c.id === "fest")
  // Open the card on the box (a double click), then drag the box down to
  // just above the card's bottom edge (50 + 120 = 170 on the screen).
  const at = await screenPoint(page, 50 + fest0.x + 10, 50 + fest0.y + 10)
  await page.mouse.dblclick(at.x, at.y)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x, at.y + 30, { steps: 3 })
  await page.mouse.move(at.x, at.y + 62, { steps: 3 })
  await page.mouse.up()
  const after = await saved(page, "karte")
  const fest = after.children.find((c: Obj) => c.id === "fest")
  expect(fest.y).toBeGreaterThan(fest0.y + 40)
  // Still in the card, the card grown so the padding is below it.
  const gap = after.height - (fest.y + fest.height)
  expect(after.height).toBeGreaterThan(before.height)
  expect(gap).toBeGreaterThanOrEqual(5)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await page.keyboard.press("ControlOrMeta+z")
  const back = await saved(page, "karte")
  expect(back.height).toBe(before.height)
  expect(back.children.find((c: Obj) => c.id === "fest").y).toBe(fest0.y)
})

test("in the designer: a box dragged into a padded card's top left corner - let go, it moves in onto the padding", async ({ page }) => {
  const padded = { ...area(), properties: { ...area().properties, padding: 2 } } as ScreenObject
  await loadProject(page, await projectWith([padded]))
  const before = await saved(page, "karte")
  const fest0 = before.children.find((c: Obj) => c.id === "fest")
  // 2 mm on this project's panel.
  const pad = Math.round(2 * (await savedPixelsPerMm(page)))
  expect(pad).toBeGreaterThan(5)
  const at = await screenPoint(page, 50 + fest0.x + 10, 50 + fest0.y + 10)
  await page.mouse.dblclick(at.x, at.y)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x - fest0.x / 2, at.y - 10, { steps: 3 })
  // Its top left corner 2 px inside the card's: in the padding.
  await page.mouse.move(at.x - fest0.x + 2, at.y - fest0.y + 2, { steps: 3 })
  await page.mouse.up()
  const after = await saved(page, "karte")
  const fest = after.children.find((c: Obj) => c.id === "fest")
  expect([fest.x, fest.y]).toEqual([pad, pad])
})
