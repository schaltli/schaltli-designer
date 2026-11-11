import { test, expect } from "@playwright/test"
import { buildFromCatalog, meaningRole } from "../lib/bausteine"
import { fittedBlockCard } from "../lib/block-card"
import { controlPalette } from "../lib/control-palette"
import { cardSettingsOf } from "../lib/card"
import { readCatalog } from "../lib/ha-discovery"
const { createBridgeLogic } = require("../integrations/vanpi/bridge-logic")

// Value cards (docs/2026-11-11-value-cards.md): the name small and muted,
// the value big in the colour of its meaning - by its device class and its
// icon, never its name -, a fill's value on the right of the name's row and
// a thin bar below, the card across both columns.

const palette = controlPalette("24bit")
const font = { id: "f", size: 18 }
const RECT = { x: 0, y: 0, width: 200, height: 60 }
const SCALE = { pixelsPerMm: 5.56, fonts: [], cards: cardSettingsOf(undefined) }

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
