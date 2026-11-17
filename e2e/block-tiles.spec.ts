import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { readDescription } from "../lib/block-description"
import { buildEntry, buildFromCatalog, catalogLooks } from "../lib/bausteine"
import { fittedBlockCard } from "../lib/block-card"
import { controlPalette } from "../lib/control-palette"
import { layoutObjects } from "../lib/layout"
import { cardSettingsOf } from "../lib/card"
import { textOf } from "../lib/live-value"
import { DEFAULT_SEPARATORS } from "../lib/placeholders"
import { deviceDescriptionToProjectFields, parseDeviceDescriptionFile } from "../lib/device-description"
import { fontFor, inFont, stepKindOf, stepUpdates, styledFont, textScaleOf, type TextStyle } from "../lib/size-scale"
const { createBridgeLogic } = require("../integrations/vanpi/bridge-logic")

// Blocks in the LED look (docs/2026-11-11-led-look.md, decisions 8 and 9):
// a switch is a Toggle Button with its name in the tile and no card round
// it; a block of several parts has no heading of its own, a choice (LED) and
// a slider each in a card of their own, the name on top - a slider's value
// on its right - and a description's quiet button as text.

const SCALE = { pixelsPerMm: 5.56, fonts: [], cards: cardSettingsOf(undefined) }
const SCREEN = 480
const font = { id: "f", size: 18 }

function described(kind: string, answer: string, id: string) {
  const out = createBridgeLogic().things(kind, answer) as Record<string, object>
  const d = readDescription(`schaltli/blocks/${id}/config`, JSON.stringify(out[`schaltli/blocks/${id}/config`]))
  if (!d || !("entry" in d)) throw new Error("not an entry")
  return d.entry
}

function placed(entry: ReturnType<typeof described>) {
  const parts = entry.controls.map((control, i) => ({ control: i, look: catalogLooks(control)[0].id }))
  const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 200, height: 40 }, palette: controlPalette("24bit"), font, options: { label: entry.label, look: "", icon: null, parts } })
  const piece = fittedBlockCard(built, SCALE, SCREEN)
  let n = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `o${n++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
  return { built, laid: layoutObjects([withIds({ ...piece, x: 8, y: 52 })], SCALE)[0] }
}

const MAXXFAN = '{"maxxfan":{"fan_power":true,"fan_direction":"out","fan_temp":26,"fan_auto":false,"fan_speed":4,"fan_vent":"open"}}'
const HEATER = JSON.stringify({
  heatertoggle: false, heatstatus: "wait", heattemp: "wait", heatvolt: 0, heatfan: "wait", heatglow: 0, heatwpump: 0, heaterror: "no", targettemp_vanpi: 21, runtime_m: 0, tempsensor: 1,
  heater_name: "Heizung",
  autoterm1: { heatertoggle: true, heatstatus: "heating", heattemp: "18", heaterror: "no", targettemp_vanpi: 21, mode: "temp mode", fanspeed: 3, powerlevel: 5, runtime_m: 0, runtime_remaining_s: 0 },
})

const walk = (o: any): any[] => [o, ...(o.children ?? []).flatMap(walk)]

test("a switch is a Toggle Button in Korry with its name in the tile, no card round it", () => {
  const entry = { id: "relay", label: "Boiler 12V", controls: [{ kind: "switch", read: "r/state", write: "r/set", on: { read: "on", write: "on" }, off: { read: "off", write: "off" } }] } as any
  expect(catalogLooks(entry.controls[0]).map((l) => l.id)).toEqual(["toggle", "buttons"])
  const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 200, height: 40 }, palette: controlPalette("24bit"), font, options: { label: entry.label, look: "", icon: null } })
  expect(built.objects).toHaveLength(1)
  expect(built.objects[0]).toMatchObject({ type: "toggle-button", properties: { text: "Boiler 12V", switchStyle: "korry" } })
  expect(built.objects[0].properties.states.map((s: any) => s.showAsOn ?? false)).toEqual([false, true])
  const piece = fittedBlockCard(built, SCALE, SCREEN)
  expect(piece.type).toBe("toggle-button")
})

test("a dimmer (a number 0-100 %): the slider's value beside the name, «Aus» at 0; the slider without its own number", () => {
  const entry = { id: "dim", label: "Leselicht", controls: [{ kind: "level", read: "d/level", write: "d/set", min: 0, max: 100, step: 1, unit: "%" }] } as any
  const built = buildFromCatalog({ entry, control: entry.controls[0], rect: { x: 0, y: 0, width: 200, height: 60 }, palette: controlPalette("24bit"), font, options: { label: entry.label, look: "slider", icon: null } })
  expect(built.headingPieces).toBe(2)
  const [name, value, slider] = built.objects
  expect(name.properties.text).toBe("Leselicht")
  expect(value.properties.textAlign).toBe("right")
  expect(value.properties.liveValues[0].rules).toEqual([{ op: "==", operand: "0", result: { kind: "text", parts: ["Aus"] } }])
  // The unit inside the live value: «Aus» alone at 0, «60 %» otherwise, nothing before a value
  // (it read «Aus %», and «%» alone, in the starter, 2026-11-12).
  expect(value.properties.text).toBe("{live:lv1}")
  expect(value.properties.liveValues[0].otherwise).toEqual({ kind: "text", parts: [{ value: true }, " %"] })
  const lv = value.properties.liveValues[0]
  expect([textOf(lv, "0", DEFAULT_SEPARATORS), textOf(lv, "60.4", DEFAULT_SEPARATORS)]).toEqual(["Aus", "60 %"])
  expect(textOf(lv, undefined, DEFAULT_SEPARATORS)).not.toContain("%")
  expect(slider).toMatchObject({ type: "slider", properties: { displayValue: "none" } })
})

// 2026-11-12, the starter's dimmers on the 4": with the bulb, the name and
// the value were too wide for half the screen, and the value went - the
// slider showing «0» where «Aus» belongs. The icon goes first.
test("a dimmer on the 4\": where name, value and icon do not fit, the icon goes and the value with «Aus» stays", () => {
  const entry = { id: "dim", label: "Dimmer 1", controls: [{ kind: "level", read: "d/level", write: "d/set", min: 0, max: 100, step: 1, unit: "%" }] } as any
  const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 200, height: 60 }, palette: controlPalette("24bit"), font: { id: "f", size: 18 }, options: { label: entry.label, look: "", icon: { name: "mdi:lightbulb", data: "<svg/>", size: 41 } } })
  // The cards' padding as it was then (2 mm; 1 since 2026-11-14), so the room is the one described below.
  const scale = { pixelsPerMm: 6.78, fonts: [], cards: cardSettingsOf({ cards: { paddingMm: 2 } }) }
  // A screen where the three do not fit, the name and the value do (the
  // test font's widths: 220 holds all three, 180 not even the two).
  const card = fittedBlockCard(built, scale, 200)
  const all = walk(card)
  expect(all.some((o) => o.type === "icon")).toBe(false)
  expect(all.find((o) => o.type === "text" && o.properties.textAlign === "right")?.properties.headingValue).toBe(true)
  expect(all.find((o) => o.type === "slider")?.properties.displayValue).toBe("none")
})

// As the user drew the fan's screen in the van on 2026-11-16, which the
// block now builds: «Lüfter» and beside it a card with Zu | Offen, guarded
// and without a name; while the fan is on, a card with Hand | Auto; and one
// card for the mode - its slider with name and value, the airflow small in
// the middle below. Until then two switches, and a card for each part.
test("the MaxxFan as the user drew it: «Lüfter» beside the guarded cover, Betrieb while it is on, one card for the mode", () => {
  const { built, laid } = placed(described("maxxfan", MAXXFAN, "maxxfan"))
  expect(built.partTiles).toBe(true)
  expect(built.labelCount).toBe(0)
  const all = walk(laid)
  // No card round the block, no heading «MaxxFan»: an area without a look.
  expect(laid).toMatchObject({ type: "free", properties: { blockTiles: true } })
  expect(laid.properties.look).toBeUndefined()
  expect(all.some((o) => o.type === "text" && o.properties.text === "MaxxFan")).toBe(false)
  for (const o of all) for (const marker of ["blockCompact"]) expect(o.properties?.[marker], `${o.type} still carries ${marker}`).toBeUndefined()

  // As tall as its three rows: a tile measured with its control at the
  // bottom of the room to spare was 100000 px tall (found 2026-11-16).
  expect(laid.height).toBeLessThan(320)
  // Row 1: the one switch, and the cover in a card of its own beside it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table: any = laid.children![0]
  const [fan, coverCard, betrieb, mode] = table.children
  expect(fan).toMatchObject({ type: "toggle-button", properties: { text: "Lüfter" } })
  expect(all.filter((o) => o.type === "toggle-button")).toHaveLength(1)
  expect(coverCard).toMatchObject({ type: "free", properties: { look: "card" } })
  // As tall as the switch beside it, the choice at its bottom.
  expect([coverCard.y, coverCard.height]).toEqual([fan.y, fan.height])
  expect(coverCard.children).toHaveLength(1)
  const cover = coverCard.children[0]
  expect(cover).toMatchObject({ type: "button-group", properties: { topic: "schaltli/state/maxxfan/cover", guard: true, blockSizeStep: "xs", switchStyle: "led", dock: "fill" } })
  expect(cover.properties.states.map((s: any) => s.label)).toEqual(["Zu", "Offen"])
  expect(cover.properties.anchor).toEqual({ y: "bottom" })
  expect(cover.y + cover.height).toBeGreaterThan(coverCard.height / 2)
  // Two columns of the same width, the pair as wide as the cards below.
  expect(Math.abs(fan.width - coverCard.width)).toBeLessThanOrEqual(1)
  expect(coverCard.x + coverCard.width).toBe(betrieb.x + betrieb.width)
  expect(fan.x).toBe(betrieb.x)

  // Row 2: Hand | Auto while the fan is on - the panel is the card.
  expect(betrieb).toMatchObject({ type: "switcher", properties: { topic: "schaltli/state/maxxfan/power" } })
  expect(betrieb.children.map((p: any) => [p.properties.comparisonValue, p.properties.look])).toEqual([["on", "card"]])
  const hand = betrieb.children[0].children
  expect(hand).toHaveLength(1)
  expect(hand[0]).toMatchObject({ type: "button-group", properties: { topic: "schaltli/state/maxxfan/hvac_mode", blockSizeStep: "s", dock: "top" } })
  expect(hand[0].properties.guard).toBeUndefined()

  // Row 3: one card for the mode it is in.
  expect(mode).toMatchObject({ type: "switcher", properties: { topic: "schaltli/state/maxxfan/hvac_mode" } })
  expect(mode.children.map((p: any) => [p.properties.comparisonValue, p.properties.look])).toEqual([
    ["auto", "card"],
    ["fan_only", "card"],
  ])
  const expected = { auto: ["Temperatur", "schaltli/state/maxxfan/temperature"], fan_only: ["Drehzahl", "schaltli/state/maxxfan/speed"] } as Record<string, string[]>
  for (const panel of mode.children) {
    expect(panel.children).toHaveLength(1)
    const inner = panel.children[0]
    expect(inner).toMatchObject({ type: "table", properties: { dock: "top" } })
    // Inside the card's padding, not across it (a table in a panel was
    // stretched to the switcher's width, docked or not).
    expect(inner.x).toBeGreaterThan(0)
    expect(inner.x + inner.width).toBe(panel.width - inner.x)
    const [level, airflow] = inner.children
    // The slider's area: no look of its own, its name and value over it.
    expect(level.type).toBe("free")
    expect(level.properties.look).toBeUndefined()
    const within = walk(level)
    expect(within.find((o) => o.type === "text" && o.properties.textAlign !== "right")?.properties.text).toBe(expected[panel.properties.comparisonValue][0])
    expect(within.find((o) => o.type === "slider")?.properties.topic).toBe(expected[panel.properties.comparisonValue][1])
    expect(level.x + level.width).toBe(inner.width)
    // The airflow: no name, as wide as its two words, in the middle.
    expect(airflow).toMatchObject({ type: "button-group", properties: { topic: "schaltli/state/maxxfan/airflow" } })
    expect(airflow.width).toBeLessThan(inner.width / 2)
    expect(Math.abs(airflow.x + airflow.width / 2 - inner.width / 2)).toBeLessThanOrEqual(1)
    expect(airflow.y).toBeGreaterThanOrEqual(level.y + level.height)
  }
  // No name where the words on the buttons say it.
  const texts = all.filter((o) => o.type === "text").map((o) => o.properties.text)
  for (const gone of ["Deckel", "Betrieb", "Luft"]) expect(texts).not.toContain(gone)
})

// The energy block (the user, 2026-11-17): each value a card of its own,
// its icon and name small, the number big in the colour of its meaning -
// the battery's charge a bar - two to a row.
test("the energy block: a value card for each source, its icon and colour, two to a row", () => {
  const vars = { battery_soc: "97", battery_power: "-12", mppt_pv_watts: "250", shore_power: 0, booster_power: 0 }
  const out = createBridgeLogic().things("producers", vars) as Record<string, object>
  const d = readDescription("schaltli/blocks/energy/config", JSON.stringify(out["schaltli/blocks/energy/config"]))
  if (!d || !("entry" in d)) throw new Error("not an entry")
  const entry = d.entry
  const icon = (name: string) => ({ name, data: "<svg/>", size: 24 })
  const stateIcons = Object.fromEntries(["bxs:car-battery", "mdi:white-balance-sunny", "mdi:transmission-tower", "mdi:engine"].map((n) => [n, icon(n)]))
  const parts = entry.controls.map((control, i) => ({ control: i, look: catalogLooks(control)[0].id }))
  const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 200, height: 60 }, palette: controlPalette("24bit"), font, options: { label: entry.label, look: "", icon: null, parts, stateIcons } })
  expect(built.partTiles).toBe(true)
  // Each part's icon brought along.
  expect((built.assets ?? []).map((a: any) => a.name).sort()).toEqual(["bxs:car-battery", "mdi:engine", "mdi:transmission-tower", "mdi:white-balance-sunny"])
  let n = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `e${n++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
  const [laid] = layoutObjects([withIds(fittedBlockCard(built, SCALE, SCREEN))], SCALE)
  const cards = walk(laid).filter((o) => o.type === "free" && o.properties.look === "card")
  expect(cards).toHaveLength(5)
  const card = (name: string) => cards.find((c) => walk(c).some((o) => o.type === "text" && o.properties.text === name))!
  const expected: Record<string, [string, string]> = {
    Batterie: ["good", "{live:lv1} %"],
    Leistung: ["good", "{live:lv1} W"],
    Solar: ["energySun", "{live:lv1} W"],
    "Batterie-Ladegerät": ["energyGrid", "{live:lv1} W"],
    Ladebooster: ["energyEngine", "{live:lv1} W"],
  }
  for (const [name, [colour, text]] of Object.entries(expected)) {
    const c = card(name)
    expect(c, name).toBeTruthy()
    const inside = walk(c)
    const label = inside.find((o) => o.type === "text" && o.properties.text === name)
    expect(label.properties).toMatchObject({ color: "textMuted", blockTextStyle: "standard" })
    expect(inside.find((o) => o.type === "icon")?.properties.iconColor, name).toBe(colour)
    const value = inside.find((o) => o.type === "text" && o.properties.text === text)
    expect(value?.properties.color, name).toBe(colour)
  }
  // The charge a bar across its card, its number on the right of the name.
  const soc = walk(card("Batterie"))
  expect(soc.find((o) => o.type === "bar")?.properties).toMatchObject({ topic: "schaltli/state/battery/soc", fillColor: "good", displayValue: "none" })
  expect(soc.find((o) => o.type === "text" && o.properties.text === "{live:lv1} %")?.properties).toMatchObject({ textAlign: "right", blockTextStyle: "xl" })
  // The watts big.
  expect(walk(card("Solar")).find((o) => o.type === "text" && o.properties.text === "{live:lv1} W")?.properties.blockTextStyle).toBe("xxl")
  // Two to a row: the battery's two side by side, solar beside shore power, the booster below.
  const [b, l, s, g, e] = ["Batterie", "Leistung", "Solar", "Batterie-Ladegerät", "Ladebooster"].map(card)
  expect(b.y).toBe(l.y)
  expect(s.y).toBe(g.y)
  expect(s.y).toBeGreaterThanOrEqual(b.y + b.height)
  expect(e.y).toBeGreaterThanOrEqual(s.y + s.height)
  expect(e.x).toBe(s.x)
  expect(laid.x + laid.width).toBeLessThanOrEqual(SCREEN)
})

test("the heater: the switch «Heizung», «Nullen» as a text button, the modes in a card of their own", () => {
  const { laid } = placed(described("heater", HEATER, "heater"))
  const all = walk(laid)
  expect(all.find((o) => o.type === "toggle-button")?.properties.text).toBe("Heizung")
  expect(all.find((o) => o.type === "button")?.properties).toMatchObject({ text: "Nullen", buttonStyle: "text" })
  const modes = all.find((o) => o.type === "button-group" && o.properties.states.length === 3)
  expect(modes.properties.switchStyle).toBe("led")
  expect(modes.properties.states.map((s: any) => s.label)).toEqual(["Temperatur", "Leistung", "Lüften"])
})

// For the eye: the two blocks drawn as the designer draws them, written to
// test-results (not compared - the pixel checks are the devices').
test("drawn: the MaxxFan and the heater placed on a 4\" screen", async ({ page }: { page: Page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 90000 })
  const running: Record<string, Record<string, string>> = {
    maxxfan: { "schaltli/state/maxxfan/power": "on", "schaltli/state/maxxfan/hvac_mode": "fan_only", "schaltli/state/maxxfan/speed": "40", "schaltli/state/maxxfan/cover": "open", "schaltli/state/maxxfan/airflow": "out" },
    heater: { "schaltli/state/heater/power": "on", "schaltli/state/heater/view": "target", "schaltli/state/heater/target": "21", "schaltli/state/temp/1/value": "18", "schaltli/state/heater/status_line": "Heizt", "schaltli/state/heater/fuel_text": "2.1 l seit 05.12. 18:00", "schaltli/state/heater/timer_on": "off" },
  }
  for (const [name, kind, answer] of [["maxxfan", "maxxfan", MAXXFAN], ["heater", "heater", HEATER]] as const) {
    const { laid } = placed(described(kind, answer, kind))
    const project = {
      name,
      screenWidth: 480,
      screenHeight: 480,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: Object.entries(running[name]).map(([topic, value], i) => ({ id: `t${i}`, topic, type: "text", examples: [value] })),
      screens: [{ id: "s", name, backgroundColor: "#101318", objects: [laid] }],
    }
    const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex: 0, topicOverrides: running[name] })
    const out = path.join("test-results", `block-tiles-${name}.png`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"))
  }
})

// Fix (3) of the starter (2026-11-12): on the van the heater block came out
// 558 px wide on the 4" - the fuel's line «0.000 l seit 06.11.2026 23:31h» in
// XL took 274 px, and the table gives both columns its widest. The line is
// small, as the status line is, so the block fits the screen less its margins.
test("the heater on the 4\" with the van's texts, in the editor's fonts: no wider than the screen less its margins", async () => {
  const bytes = fs.readFileSync(path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4.ddf.zip"))
  const fields = deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), "")
  const ppm = fields.pixelsPerMm!
  const fonts = fields.fonts as any[]
  const textScale = textScaleOf({ pixelsPerMm: ppm, typographies: fields.typographies }, "Geometric")!
  const xl = fontFor("xl", false, textScale.typography, fonts, ppm)!
  const entry = described("heater", HEATER, "heater")
  const parts = entry.controls.map((control, i) => ({ control: i, look: catalogLooks(control)[0].id }))
  const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 200, height: 40 }, palette: controlPalette("24bit"), font: { id: xl.id, size: xl.size }, options: { label: entry.label, look: "", icon: null, parts } })
  // As the editor writes it (components/project-editor.tsx buildArmed).
  const stepped = built.objects.map((object) => {
    const { blockTextStyle, blockSizeStep, ...properties } = object.properties ?? {}
    const style = blockTextStyle === "caption" ? "standard" : typeof blockTextStyle === "string" ? blockTextStyle : properties.fontId === xl.id ? "xl" : undefined
    const font = style ? styledFont(style as TextStyle, false, textScale, fonts) : undefined
    const own = font ? inFont({ ...object, properties }, font, fonts) : { ...object, properties }
    return stepKindOf(own.type) ? { ...own, ...stepUpdates(own as any, blockSizeStep ?? "m", ppm, fonts) } : own
  })
  const topics = [
    { topic: "schaltli/state/heater/fuel_text", type: "text", examples: ["0.000 l seit 06.11.2026 23:31h"] },
    { topic: "schaltli/state/heater/status_line", type: "text", examples: ["Bereit"] },
  ]
  const scale = { pixelsPerMm: ppm, fonts, topics, cards: cardSettingsOf(undefined) } as any
  const smaller = (style: "large" | "standard") => styledFont(style, false, textScale, fonts)
  const piece = fittedBlockCard({ ...built, objects: stepped }, scale, 480, smaller)
  let n = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `o${n++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
  const laid = layoutObjects([withIds({ ...piece, x: 8, y: 52 })], scale)[0]
  expect(laid.width).toBeLessThanOrEqual(480 - 16)
  // And what it holds within it: its table, the modes' card across both columns.
  const table = laid.children!.find((o: any) => o.type === "table")!
  expect(table.x + table.width).toBeLessThanOrEqual(laid.width)
  // The fuel's line small, as the status line is.
  const fuel = walk(laid).find((o) => o.properties?.liveValues?.[0]?.source.path === "schaltli/state/heater/fuel_text")
  expect(fuel.properties.textStyle).toBe("standard")
})
