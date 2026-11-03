import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { buildEntry, blockRow } from "../lib/bausteine"
import { blockCard } from "../lib/block-card"
import { layoutObjects } from "../lib/layout"
import { dissolveGroups } from "../lib/object-groups"
import { isSnapTable } from "../lib/snap-table"
import { controlPalette } from "../lib/control-palette"
import type { CatalogEntry } from "../lib/ha-discovery"

// A block of several parts as a card (docs/2026-11-03-card-blocks.md): its
// name docked at the top, its parts below in the table docked Fill.

const SCALE = { pixelsPerMm: 5 }
const palette = controlPalette("24bit")
const hall = {
  id: "e2e-hall",
  device: "",
  component: "light",
  name: "Hall",
  label: "Hall",
  controls: [
    { kind: "switch", read: "hall#state", write: "hall/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" }, part: "Power" },
    { kind: "level", read: "hall#brightness", write: "hall/brightness/set", min: 0, max: 255, step: 1, part: "Brightness" },
  ],
} as unknown as CatalogEntry
const build = (icon = false) =>
  buildEntry({
    entry: hall,
    rect: { x: 0, y: 0, width: 300, height: 160 },
    palette,
    options: {
      label: "Hall",
      look: "",
      icon: icon ? { name: "mdi:lightbulb", data: "<svg/>", size: 24 } : null,
      parts: [
        { control: 0, look: "switch" },
        { control: 1, look: "slider" },
      ],
    },
  })

// Ids, as the editor gives them when it places the card.
function placed(piece: Omit<ScreenObject, "id" | "zIndex">): ScreenObject {
  let n = 0
  const walk = (o: any): ScreenObject => ({ ...o, id: `o${n++}`, zIndex: o.zIndex ?? 0, ...(o.children ? { children: o.children.map(walk) } : {}) })
  return walk(piece)
}

test.describe("card blocks: the model", () => {
  test("a block of several parts: a card, the name docked at the top, the parts below docked Fill", () => {
    const card = blockCard(build(), 300, SCALE)
    // The parts as wide as the block was built, the card its padding (2 mm, 10 px) wider each side.
    expect(card).toMatchObject({ type: "free", width: 320, properties: { look: "card" } })
    const [heading, parts] = card.children!
    expect(heading).toMatchObject({ type: "text", properties: { dock: "top", text: "Hall" } })
    expect(isSnapTable(parts)).toBe(true)
    expect(parts.properties!.dock).toBe("fill")
    // The parts in one column, no name column beside them.
    expect(new Set(parts.children!.map((c) => c.properties!.cell.column))).toEqual(new Set([0]))
    expect(parts.children!.map((c) => c.type)).toEqual(["button-group", "slider"])
    // The heading docks first.
    expect((heading as ScreenObject).zIndex).toBeGreaterThan((parts as ScreenObject).zIndex)
  })

  test("with an icon: icon and name as a heading row docked at the top", () => {
    const [heading] = blockCard(build(true), 300, SCALE).children!
    expect(isSnapTable(heading)).toBe(true)
    expect(heading.properties!.dock).toBe("top")
    expect(heading.children!.map((c) => c.type)).toEqual(["icon", "text"])
  })

  test("as tall as its content: laid out, the parts end the padding above its bottom; nothing left out", () => {
    const card = layoutObjects([placed(blockCard(build(), 300, SCALE))], SCALE)[0]
    const parts = card.children!.find((c) => c.properties?.dock === "fill")!
    expect(card.height - (parts.y + parts.height)).toBe(10)
    expect(card.children!.some((c) => c.properties?.dockedOut)).toBe(false)
    // The parts across the card inside its padding.
    expect(parts.width).toBe(300)
  })

  test("on the device: a box and the block's objects", () => {
    const card = layoutObjects([placed(blockCard(build(), 300, SCALE))], SCALE)[0]
    expect(dissolveGroups([card]).map((o) => o.type)).toEqual(["box", "text", "button-group", "slider"])
  })

  test("a block of one part is still a row", () => {
    const one = buildEntry({ entry: hall, rect: { x: 0, y: 0, width: 300, height: 60 }, palette, options: { label: "Hall", look: "", icon: null } })
    expect(blockRow(one)?.map((p) => p.type)).toEqual(["text", "button-group"])
  })
})
