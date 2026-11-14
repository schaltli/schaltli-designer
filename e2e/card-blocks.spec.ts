import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import { buildEntry } from "../lib/bausteine"
import { BLOCK_SCREEN_MARGIN, blockCard, blockCardHalf, blockPartsRoom, fittedBlockCard } from "../lib/block-card"
import { layoutObjects, layoutScaleOf } from "../lib/layout"
import { dissolveGroups } from "../lib/object-groups"
import { isSnapTable } from "../lib/snap-table"
import { controlPalette, ROLE_PALETTE } from "../lib/control-palette"
import { readDescription } from "../lib/block-description"
import { fontFor, screenTextScale, styledFont } from "../lib/size-scale"
import { buildCamperUiProject } from "../deploy/demo/camperui-project"
import type { CatalogEntry } from "../lib/ha-discovery"

// A block as a card (docs/2026-11-03-card-blocks.md; of one part too since
// 2026-11-06): its name docked at the top, its parts below in the table
// docked Fill; half the screen wide, wider where its parts need it.

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
        // The buttons look: a card's parts in its table (a Toggle Button is
        // a tile of its own, docs/2026-11-11-led-look.md).
        { control: 0, look: "buttons" },
        { control: 1, look: "slider" },
      ],
    },
  })

const leftOut = (o: ScreenObject): boolean => !!o.properties?.dockedOut || (o.children ?? []).some(leftOut)

// Ids, as the editor gives them when it places the card.
function placed(piece: Omit<ScreenObject, "id" | "zIndex">): ScreenObject {
  let n = 0
  const walk = (o: any): ScreenObject => ({ ...o, id: `o${n++}`, zIndex: o.zIndex ?? 0, ...(o.children ? { children: o.children.map(walk) } : {}) })
  return walk(piece)
}

test.describe("card blocks: the model", () => {
  test("a block of several parts: a card, the name docked at the top, the parts below docked Fill", () => {
    const card = blockCard(build(), 300, SCALE)
    // The parts as wide as the block was built, the card its padding (1 mm, 5 px) wider each side.
    expect(card).toMatchObject({ type: "free", width: 310, properties: { look: "card" } })
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
    expect(card.height - (parts.y + parts.height)).toBe(5)
    expect(card.children!.some((c) => c.properties?.dockedOut)).toBe(false)
    // The parts across the card inside its padding.
    expect(parts.width).toBe(300)
  })

  test("on the device: a box and the block's objects", () => {
    const card = layoutObjects([placed(blockCard(build(), 300, SCALE))], SCALE)[0]
    expect(dissolveGroups([card]).map((o) => o.type)).toEqual(["box", "text", "button-group", "slider"])
  })

  test("a gauge's number in Text: in the middle of the ring, not on its fill", () => {
    const tank = {
      id: "e2e-tank",
      device: "",
      component: "sensor",
      name: "Tank",
      label: "Tank",
      controls: [{ kind: "value", read: "tank/level", unit: "%", level: true }],
    } as unknown as CatalogEntry
    const built = buildEntry({ entry: tank, rect: { x: 0, y: 0, width: 300, height: 80 }, palette: ROLE_PALETTE, options: { label: "Tank", look: "gauge", icon: null } })
    const gauge = built.objects.find((o) => o.type === "gauge")!
    expect(gauge.properties!.textColor).toBe(ROLE_PALETTE.text)
  })

  // Of one part a card too, no longer a row (the user, 2026-11-06) - a switch
  // in the buttons look; its first, a Toggle Button, is its own tile.
  test("a block of one part: a card too, its name docked at the top, its part below", () => {
    const one = buildEntry({ entry: hall, rect: { x: 0, y: 0, width: 300, height: 60 }, palette, options: { label: "Hall", look: "buttons", icon: null } })
    const card = layoutObjects([placed(fittedBlockCard(one, SCALE, 480))], SCALE)[0]
    expect([card.type, card.properties!.look]).toEqual(["free", "card"])
    const [heading, parts] = [...card.children!].sort((a, b) => b.zIndex - a.zIndex)
    expect([heading.type, heading.properties!.text, heading.properties!.dock]).toEqual(["text", "Hall", "top"])
    expect(parts.properties!.dock).toBe("fill")
    expect(parts.children!.map((c) => c.type)).toContain("button-group")
    expect(leftOut(card)).toBe(false)
  })

  // Half the screen, wider where its parts need it (the user, 2026-11-06).
  // Two side by side fit the screen: its margins and the gap between them
  // taken off first - 480 less 2 × 8 and the gap of 8 (1.5 mm at 5 px/mm),
  // halved; and the two with the gap and the margins are the screen.
  test("half as wide as the screen, two side by side fitting it: on a 480 px screen 228, on a 1280 px tablet 628", () => {
    // Built as the editor builds it: its parts at the room the half leaves.
    const at = (screenWidth: number) => {
      const width = blockPartsRoom(screenWidth, SCALE)
      return buildEntry({ entry: hall, rect: { x: 0, y: 0, width, height: 160 }, palette, options: { label: "Hall", look: "", icon: null, parts: [{ control: 0, look: "buttons" }, { control: 1, look: "slider" }] } })
    }
    expect(fittedBlockCard(at(480), SCALE, 480).width).toBe(228)
    expect(fittedBlockCard(at(1280), SCALE, 1280).width).toBe(628)
    expect(2 * 228 + 8 + 2 * BLOCK_SCREEN_MARGIN).toBe(480)
  })
})

// The VanPi heater (its description as the van's bridge sent it, 2026-11-04):
// placed on the 4" and on the 4.3B its card came empty - its four modes side
// by side in the label size were wider than the card, and the parts' table,
// docked Fill, was left out (the user, 2026-11-04). Built as the editor
// builds a block that is carried (project-editor.tsx armedBlockCarry).
const DDF_4 = path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4.ddf.zip")
const DDF_43B = path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")
const HEATER = path.join(__dirname, "fixtures", "block-descriptions", "vanpi-heater.json")

async function heaterOn(ddf: string) {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(ddf)))
  const screen = project.screens.find((s: any) => !s.isMaster)
  const textScale = screenTextScale(project, screen)!
  const label = fontFor("xl", false, textScale.typography, project.fonts, textScale.pixelsPerMm)!
  const d = readDescription("schaltli/blocks/heater/config", fs.readFileSync(HEATER, "utf8"))
  if (!d || !("entry" in d)) throw new Error("the heater is not a block")
  const entry = d.entry
  const width = blockPartsRoom(project.screenWidth, layoutScaleOf(project))
  const built = buildEntry({
    entry,
    rect: { x: 0, y: 0, width, height: 40 },
    palette: ROLE_PALETTE,
    font: { id: label.id, size: label.size, internalName: label.internalName, name: label.name, format: label.format },
    options: { label: entry.label, look: "", icon: null, parts: entry.controls.map((_, control) => ({ control, look: "" })) },
  })
  const scale = layoutScaleOf(project)
  const smaller = (style: "large" | "standard") => styledFont(style, false, textScale, project.fonts)
  return { project, built, width, scale, smaller, label }
}

// Since 2026-11-11 (docs/2026-11-11-led-look.md, decision 9) a
// description's block is its parts' tiles, no card round them, across the
// screen less its margins; the modes one size under the label.
const within = (o: ScreenObject): ScreenObject[] => [o, ...(o.children ?? []).flatMap(within)]
test.describe("card blocks: the heater fits", () => {
  for (const [name, ddf] of [["the 4\"", DDF_4], ["the 4.3B", DDF_43B]] as const) {
    test(`on ${name}: its tiles across the screen less its margins, the modes one size smaller, nothing left out`, async () => {
      const { project, built, scale, smaller, label } = await heaterOn(ddf)
      const area = layoutObjects([placed(fittedBlockCard(built, scale, project.screenWidth, smaller))], scale)[0]
      expect(area.properties!.blockTiles).toBe(true)
      expect(leftOut(area)).toBe(false)
      expect(area.width).toBe(project.screenWidth - 2 * BLOCK_SCREEN_MARGIN)
      const modes = within(area).find((c) => c.type === "button-group" && c.properties!.switchStyle === "led")!
      expect(modes.properties!.fontId).not.toBe(label.id)
      // A tile holds it: its card is as wide as the area.
      const tile = within(area).find((c) => c.type === "free" && c.properties?.look === "card" && within(c).includes(modes))!
      expect(tile.width).toBe(area.width)
    })
  }

  // The narrowest screen a heater lands on, the knob's 360 px: the tiles
  // across it, none of them left out. Known limit, as with the card before
  // 2026-11-11: its two dials side by side (7 lines each) do not fit the
  // halves of 360 px and are left out there - the dials only.
  test("on a narrow screen all the same: the tiles fit it, only the two columns' dials left out", async () => {
    const { built, scale, smaller } = await heaterOn(DDF_4)
    const area = layoutObjects([placed(fittedBlockCard(built, scale, 360, smaller))], scale)[0]
    expect(area.width).toBe(360 - 2 * BLOCK_SCREEN_MARGIN)
    expect([...new Set(within(area).filter((o) => o.properties?.dockedOut).map((o) => o.type))]).toEqual(["dial"])
  })
})
