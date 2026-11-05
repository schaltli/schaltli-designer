import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import { buildEntry, blockRow } from "../lib/bausteine"
import { BLOCK_SCREEN_MARGIN, blockCard, fittedBlockCard } from "../lib/block-card"
import { layoutObjects, layoutScaleOf } from "../lib/layout"
import { dissolveGroups } from "../lib/object-groups"
import { isSnapTable } from "../lib/snap-table"
import { controlPalette, ROLE_PALETTE } from "../lib/control-palette"
import { readDescription } from "../lib/block-description"
import { fontFor, screenTextScale, styledFont } from "../lib/size-scale"
import { buildCamperUiProject } from "../deploy/demo/camperui-project"
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

  test("a block of one part is still a row", () => {
    const one = buildEntry({ entry: hall, rect: { x: 0, y: 0, width: 300, height: 60 }, palette, options: { label: "Hall", look: "", icon: null } })
    expect(blockRow(one)?.map((p) => p.type)).toEqual(["text", "button-group"])
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
  const width = Math.round(Math.min(project.screenWidth, project.screenHeight * 2) * 0.6)
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

const leftOut = (o: ScreenObject): boolean => !!o.properties?.dockedOut || (o.children ?? []).some(leftOut)

test.describe("card blocks: the heater fits", () => {
  test("on the 4\": its modes set smaller until they fit, the card within the screen, nothing left out", async () => {
    const { project, built, width, scale, smaller, label } = await heaterOn(DDF_4)
    const card = layoutObjects([placed(fittedBlockCard(built, width, scale, project.screenWidth, smaller))], scale)[0]
    expect(leftOut(card)).toBe(false)
    expect(card.width).toBeLessThanOrEqual(project.screenWidth - 2 * BLOCK_SCREEN_MARGIN)
    const parts = card.children!.find((c) => c.properties?.dock === "fill")!
    expect(parts.x + parts.width).toBeLessThanOrEqual(card.width)
    const modes = parts.children!.find((c) => c.type === "button-group")!
    expect(modes.properties!.fontId).not.toBe(label.id)
  })

  test("on the 4.3B: the card as wide as its parts need, the modes in the label size, nothing left out", async () => {
    const { project, built, width, scale, smaller, label } = await heaterOn(DDF_43B)
    const card = layoutObjects([placed(fittedBlockCard(built, width, scale, project.screenWidth, smaller))], scale)[0]
    expect(leftOut(card)).toBe(false)
    expect(card.width).toBeGreaterThan(width)
    const modes = card.children!.find((c) => c.properties?.dock === "fill")!.children!.find((c) => c.type === "button-group")!
    expect(modes.properties!.fontId).toBe(label.id)
  })

  test("too wide for its card all the same: the parts stand in it, cut by its clip, not left out", async () => {
    const { built, width, scale } = await heaterOn(DDF_4)
    // The card as it came before: its parts the width the block was built at.
    const card = layoutObjects([placed(blockCard(built, width, scale, width))], scale)[0]
    expect(leftOut(card)).toBe(false)
    const parts = card.children!.find((c) => c.properties?.dock === "fill")!
    expect(parts.width).toBeGreaterThan(card.width)
  })
})
