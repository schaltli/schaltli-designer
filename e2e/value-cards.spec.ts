import { test, expect } from "@playwright/test"
import { buildFromCatalog, meaningRole } from "../lib/bausteine"
import { fittedBlockCard } from "../lib/block-card"
import { controlPalette } from "../lib/control-palette"
import { cardSettingsOf } from "../lib/card"
import { readCatalog } from "../lib/ha-discovery"
import { layoutObjects } from "../lib/layout"
import fs from "node:fs"
import { applyTheme, themeById } from "../lib/themes"
import path from "node:path"
import { deviceDescriptionToProjectFields, parseDeviceDescriptionFile } from "../lib/device-description"
import { fontFor, inFont, styledFont, textScaleOf, type TextStyle } from "../lib/size-scale"
const { createBridgeLogic } = require("../integrations/vanpi/bridge-logic")

// Value cards (docs/2026-11-11-value-cards.md): the name small and muted,
// the value big in the colour of its meaning - by its device class and its
// icon, never its name -, a fill's value on the right of the name's row and
// a thin bar below, the card across both columns.

const palette = controlPalette("24bit")
const font = { id: "f", size: 18 }
const RECT = { x: 0, y: 0, width: 200, height: 60 }
const SCALE = { pixelsPerMm: 5.56, fonts: [], cards: cardSettingsOf(undefined) }

const walk = (o: any): any[] => [o, ...(o.children ?? []).flatMap(walk)]

/** A built block as its card, laid out on a 4" screen at (8, 8). */
function placed(built: any) {
  // The topics as the project declares them, so a number is measured at what it can show.
  const scale = { ...SCALE, topics: built.topics }
  const piece = fittedBlockCard({ ...built, labelCount: built.labelCount ?? built.headingPieces ?? 1 }, scale, 480)
  let n = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `o${n++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
  return layoutObjects([withIds({ ...piece, x: 8, y: 8 })], scale)[0]
}

/** The VanPi bridge's announcements for its recorded answers, as catalog entries by label. */
function bridgeEntries() {
  const logic = createBridgeLogic()
  const messages: Record<string, string> = {}
  const answers: Record<string, string> = {
    batt: '{"AMPS":"-0.75","SoC":"88","Voltage":"13.2"}',
    level: '{"level1":{"state":60,"name":"Frischwasser"},"level2":{"state":20,"name":"Abwasser"}}',
    temp: '{"temp1":{"state":"15.1","name":"Innen","type":"ds18b20"}}',
  }
  for (const [kind, answer] of Object.entries(answers)) {
    for (const [topic, config] of Object.entries(logic.things(kind, answer) as Record<string, object>)) messages[topic] = JSON.stringify(config)
  }
  return Object.fromEntries(readCatalog(messages).entries.map((e) => [e.label, e]))
}

test("the colour of a value's meaning, from its device class and icon", () => {
  const e = bridgeEntries()
  expect(meaningRole(e["Batterie"], e["Batterie"].controls[0])).toBe("good")
  expect(meaningRole(e["Frischwasser"], e["Frischwasser"].controls[0])).toBe("accent")
  // The bridge gives grey water the murky icon.
  expect(e["Abwasser"].icon).toBe("mdi:water-opacity")
  expect(meaningRole(e["Abwasser"], e["Abwasser"].controls[0])).toBe("accent3")
  expect(meaningRole(e["Innen"], e["Innen"].controls[0])).toBe("text")
  const sun = { id: "s", component: "sensor", name: "PV", label: "PV", icon: "mdi:solar-power", controls: [] } as any
  expect(meaningRole(sun, { kind: "value", read: "x", level: false } as any)).toBe("energySun")
})

test("a number: its name small and muted above, the value big in its colour", () => {
  const entry = bridgeEntries()["Innen"]
  const built = buildFromCatalog({ entry, control: entry.controls[0], rect: RECT, palette, font, options: { look: "number" } })
  const [name, value] = built.objects
  expect(name.properties).toMatchObject({ text: "Innen", color: "textMuted", blockTextStyle: "standard" })
  expect(value.properties).toMatchObject({ color: "text", blockTextStyle: "xxl" })
  expect(value.y).toBeGreaterThanOrEqual(name.y + name.height)
})

test("a fill: name and value on one row, a thin bar below in the same colour, no percentage of its own, across both columns", () => {
  const entry = bridgeEntries()["Frischwasser"]
  const built = buildFromCatalog({ entry, control: entry.controls[0], rect: RECT, palette, font, options: { look: "bar" } })
  expect(built.wide).toBe(true)
  expect(built.headingPieces).toBe(2)
  const [name, value, bar] = built.objects
  expect(name.properties).toMatchObject({ text: "Frischwasser", color: "textMuted" })
  expect(value.properties).toMatchObject({ color: "accent", textAlign: "right", headingValue: true })
  expect(bar).toMatchObject({ type: "bar", properties: { fillColor: "accent", displayValue: "none", blockSizeStep: "xs" } })
  // Placed: as wide as the room the screen has, both columns.
  const card = fittedBlockCard({ ...built, labelCount: 2 }, SCALE, 480)
  expect(card.width).toBe(480 - 2 * 8)
})

test("where the device draws charts: the last three hours as a sparkline beside the number, in its colour", () => {
  const entry = bridgeEntries()["Innen"]
  const built = buildFromCatalog({ entry, control: entry.controls[0], rect: RECT, palette, font, options: { look: "number" }, charts: true })
  const [, value, line] = built.objects
  expect(line).toMatchObject({ type: "chart", properties: { compact: true, legend: "none", mode: "time" } })
  expect(line.properties.series).toEqual([expect.objectContaining({ source: { kind: "topic", topic: (entry.controls[0] as any).read }, color: "text", draw: "area", valueKind: "level" })])
  expect(built.partColumns).toEqual([1, 2])
  // Placed: the line on the number's row, right of it, inside the card.
  const all = walk(placed(built))
  const number = all.find((o) => o.type === "text" && o.properties.blockTextStyle === "xxl")
  const chart = all.find((o) => o.type === "chart")
  expect(chart.x).toBeGreaterThanOrEqual(number.x + number.width)
  // On its row: the line's middle within the number's height.
  const mid = chart.y + chart.height / 2
  expect(mid).toBeGreaterThan(number.y)
  expect(mid).toBeLessThan(number.y + number.height)
  // Narrow of its own: it fills its cell, and its old 100 px beside a 28 px
  // number made two cards side by side overflow the 4" (2026-11-12).
  expect(line.width).toBeLessThanOrEqual(font.size * 2.5)
  // Without charts, none.
  const plain = buildFromCatalog({ entry, control: entry.controls[0], rect: RECT, palette, font, options: { look: "number" } })
  expect(plain.objects.some((o) => o.type === "chart")).toBe(false)
  void value
})

// For the eye: a number with its sparkline and a tank, drawn as the designer
// draws them, written to test-results (not compared).
test("drawn: a value card with its sparkline, and a tank", async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 90000 })
  const e = bridgeEntries()
  const inner = placed(buildFromCatalog({ entry: e["Innen"], control: e["Innen"].controls[0], rect: RECT, palette, font, options: { look: "number" }, charts: true }))
  const tankBuilt = buildFromCatalog({ entry: e["Frischwasser"], control: e["Frischwasser"].controls[0], rect: RECT, palette, font, options: { look: "bar" } })
  const tank = placed(tankBuilt)
  const values: Record<string, string> = { [(e["Innen"].controls[0] as any).read as string]: "15.1", [(e["Frischwasser"].controls[0] as any).read as string]: "60" }
  const project = {
    name: "value-cards",
    screenWidth: 480,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: Object.entries(values).map(([topic, value], i) => ({ id: `t${i}`, topic, type: "numeric", examples: [value] })),
    // The objects as the editor draws them: their roles in the theme's dark colours.
    screens: [{ id: "s", name: "s", backgroundColor: "#101318", objects: applyTheme([inner, { ...tank, y: tank.y + inner.height + 16 }] as any, themeById("schaltli")!, "dark", "24bit") }],
  }
  const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex: 0, topicOverrides: values })
  const out = path.join("test-results", "value-cards.png")
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"))
})

// «Unser Bus», 2026-11-14: the name of the card «Innen» stood 34 px tall in
// its 18 px font - made as a label, restyled small, its height kept - and
// left 16 px of nothing above the value. Placed as the editor places it
// (components/project-editor.tsx, inFont), in the 4"'s fonts.
test("on the 4\": the card's name as tall as its font's line, the value right below it", async () => {
  const bytes = fs.readFileSync(path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4.ddf.zip"))
  const fields = deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), "")
  const ppm = fields.pixelsPerMm!
  const fonts = fields.fonts as any[]
  const textScale = textScaleOf({ pixelsPerMm: ppm, typographies: fields.typographies }, "Geometric")!
  const xl = fontFor("xl", false, textScale.typography, fonts, ppm)!
  const e = bridgeEntries()
  const built = buildFromCatalog({ entry: e["Innen"], control: e["Innen"].controls[0], rect: RECT, palette, font: { id: xl.id, size: xl.size }, options: { look: "number" }, charts: true })
  const objects = built.objects.map((object: any) => {
    const { blockTextStyle, ...properties } = object.properties ?? {}
    const styled = typeof blockTextStyle === "string" ? styledFont(blockTextStyle as TextStyle, false, textScale, fonts) : undefined
    return styled ? inFont({ ...object, properties }, styled, fonts) : { ...object, properties }
  })
  const name = objects.find((o: any) => o.properties?.text === "Innen")
  const nameFont = fonts.find((f) => f.id === name.properties.fontId)
  expect(name.height).toBe(nameFont.ascent + nameFont.descent)
  // Laid out in its card: the value's table starts one gap below the name.
  const scale = { pixelsPerMm: ppm, fonts, topics: built.topics, cards: cardSettingsOf(undefined) } as any
  const piece = fittedBlockCard({ ...built, objects, labelCount: 1 }, scale, 480)
  let n = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `o${n++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
  const laid = layoutObjects([withIds({ ...piece, x: 8, y: 8 })], scale)[0]
  const laidName = walk(laid).find((o) => o.properties?.text === "Innen")
  expect(laidName.height).toBe(nameFont.ascent + nameFont.descent)
  const below = laid.children!.filter((o: any) => o !== laidName && o.y > laidName.y)
  expect(below.length).toBeGreaterThan(0)
  expect(Math.min(...below.map((o: any) => o.y))).toBe(laidName.y + laidName.height + Math.round(1.5 * ppm))
})
