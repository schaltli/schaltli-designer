import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { readDescription } from "../lib/block-description"
import { buildEntry, buildFromCatalog, catalogLooks } from "../lib/bausteine"
import { fittedBlockCard } from "../lib/block-card"
import { controlPalette } from "../lib/control-palette"
import { layoutObjects } from "../lib/layout"
import { cardSettingsOf } from "../lib/card"
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
  expect(slider).toMatchObject({ type: "slider", properties: { displayValue: "none" } })
})

// 2026-11-12, the starter's dimmers on the 4": with the bulb, the name and
// the value were too wide for half the screen, and the value went - the
// slider showing «0» where «Aus» belongs. The icon goes first.
test("a dimmer on the 4\": where name, value and icon do not fit, the icon goes and the value with «Aus» stays", () => {
  const entry = { id: "dim", label: "Dimmer 1", controls: [{ kind: "level", read: "d/level", write: "d/set", min: 0, max: 100, step: 1, unit: "%" }] } as any
  const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 200, height: 60 }, palette: controlPalette("24bit"), font: { id: "f", size: 18 }, options: { label: entry.label, look: "", icon: { name: "mdi:lightbulb", data: "<svg/>", size: 41 } } })
  const scale = { pixelsPerMm: 6.78, fonts: [], cards: cardSettingsOf(undefined) }
  // A screen where the three do not fit, the name and the value do (the
  // test font's widths: 220 holds all three, 180 not even the two).
  const card = fittedBlockCard(built, scale, 200)
  const all = walk(card)
  expect(all.some((o) => o.type === "icon")).toBe(false)
  expect(all.find((o) => o.type === "text" && o.properties.textAlign === "right")?.properties.headingValue).toBe(true)
  expect(all.find((o) => o.type === "slider")?.properties.displayValue).toBe("none")
})

test("the MaxxFan: «Lüfter» and «Deckel» side by side, then Betrieb, the slider and Luft each in a card - every edge in line", () => {
  const { built, laid } = placed(described("maxxfan", MAXXFAN, "maxxfan"))
  expect(built.partTiles).toBe(true)
  expect(built.labelCount).toBe(0)
  const all = walk(laid)
  const toggles = all.filter((o) => o.type === "toggle-button")
  expect(toggles.map((t) => t.properties.text)).toEqual(["Lüfter", "Deckel"])
  expect(toggles[0].y).toBe(toggles[1].y)
  // No card round the block, no heading «MaxxFan»: an area without a look.
  expect(laid).toMatchObject({ type: "free", properties: { blockTiles: true } })
  expect(laid.properties.look).toBeUndefined()
  expect(all.some((o) => o.type === "text" && o.properties.text === "MaxxFan")).toBe(false)
  // The tiles of the choice, the slider and the airflow: cards with a name.
  const groups = all.filter((o) => o.type === "button-group")
  expect(groups.length).toBeGreaterThan(0)
  for (const g of groups) expect(g.properties.switchStyle).toBe("led")
  const cards = all.filter((o) => o.type === "free" && o.properties.look === "card")
  expect(cards.length).toBeGreaterThanOrEqual(3)
  // Left edges: the first toggle and every card start at the same x; the
  // second toggle ends where the cards do.
  const left = toggles[0].x
  const right = toggles[1].x + toggles[1].width
  for (const c of cards.filter((c) => c.width > toggles[0].width + 10)) {
    expect(c.x, "a card's left edge").toBe(left)
    expect(c.x + c.width, "a card's right edge").toBe(right)
  }
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
