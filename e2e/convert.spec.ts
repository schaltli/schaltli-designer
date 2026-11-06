import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { getMainCanvas, loadProject, objectTreeRow } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { convertInTree, convertObject, convertTargets } from "../lib/convert-object"
import { toggleMinHeight } from "../lib/toggle-button-shape"

// A font for the sizes a conversion works out.
const FONTS = [{ id: "f1", name: "f1", size: 14, ascent: 12, descent: 3, capHeight: 10 }] as any
import { adjustTargetOf } from "../lib/adjust-level"
import { blockTable, buildEntry } from "../lib/bausteine"
import { blockCard } from "../lib/block-card"
import { layoutObjects } from "../lib/layout"
import { ROLE_PALETTE } from "../lib/control-palette"
import type { CatalogEntry } from "../lib/ha-discovery"
import type { ProjectScreen, ScreenObject } from "../components/project-editor"

// «Convert to» (docs/2026-11-05-quick-blocks.md): an object turned into the
// other type of its family - Slider ↔ Dial, Bar ↔ Gauge, Switch ↔ Button
// Group - keeping its id and what it is bound to.

type Obj = Record<string, any>

const CALIBRATION = [
  { value: 16, barSizePercent: 0 },
  { value: 30, barSizePercent: 100 },
]

const slider: ScreenObject = {
  id: "regler",
  type: "slider",
  x: 20,
  y: 30,
  width: 120,
  height: 30,
  zIndex: 1,
  properties: {
    topic: "heater/temp",
    writeTopic: "heater/temp/set",
    setpointTopic: "heater/target",
    writeFormat: { text: "{\"t\":{value}}" },
    step: 0.5,
    calibrationPoints: CALIBRATION,
    direction: "left-to-right",
    displayValue: "value",
    fillColor: "accent",
    textColor: "text",
    thickness: 12,
    fontId: "f1",
  },
}

const states = (n: number) =>
  ["off", "on", "auto"].slice(0, n).map((id) => ({ id, label: id.toUpperCase(), readValue: id.toUpperCase(), writeValue: id.toUpperCase() }))

const group = (n: number): ScreenObject => ({
  id: "knoepfe",
  type: "button-group",
  x: 10,
  y: 100,
  width: 140,
  height: 40,
  zIndex: 2,
  properties: { topic: "pump/state", writeTopic: "pump/set", states: states(n), switchStyle: "filled", switchColor: "accent" },
})

// What a family keeps under the same keys: everything it is bound to.
const BOUND = ["topic", "writeTopic", "setpointTopic", "writeFormat", "step", "calibrationPoints", "displayValue", "fillColor", "textColor", "thickness", "fontId"]

test.describe("convert: the model", () => {
  test("each family's other type is the one target; a type without a family has none", () => {
    expect(convertTargets(slider)).toEqual([{ type: "dial" }])
    expect(convertTargets({ ...slider, type: "dial" })).toEqual([{ type: "slider" }])
    expect(convertTargets({ ...slider, type: "bar" })).toEqual([{ type: "gauge" }])
    expect(convertTargets({ ...slider, type: "gauge" })).toEqual([{ type: "bar" }])
    expect(convertTargets(group(2))).toEqual([{ type: "switch" }, { type: "toggle-button" }])
    expect(convertTargets({ ...group(2), type: "switch" })).toEqual([{ type: "button-group" }, { type: "toggle-button" }])
    expect(convertTargets({ ...group(2), type: "toggle-button" })).toEqual([{ type: "switch" }, { type: "button-group" }])
    expect(convertTargets({ ...slider, type: "text" })).toEqual([])
    expect(convertTargets({ ...slider, type: "button" })).toEqual([])
  })

  test("a type the device does not draw is greyed with the reason", () => {
    expect(convertTargets(slider, ["slider", "text"])).toEqual([{ type: "dial", disabled: "Not rendered by the loaded device's firmware" }])
  })

  test("a button group of three states does not become a switch; a switch always becomes a group", () => {
    expect(convertTargets(group(3))).toEqual([{ type: "switch", disabled: "Only two states become a switch; this has 3" }, { type: "toggle-button" }])
    expect(convertObject(group(3), "switch")).toBeUndefined()
    const sw = convertObject(group(2), "switch")!
    expect(convertObject(sw, "button-group")!.type).toBe("button-group")
  })

  test("Slider → Dial → Slider: the id and everything it is bound to kept; the ring's shape, square as wide as the slider", () => {
    const dial = convertObject(slider, "dial")!
    expect(dial).toMatchObject({ id: "regler", type: "dial", x: 20, y: 30, zIndex: 1 })
    for (const key of BOUND) expect(dial.properties[key], key).toEqual(slider.properties[key])
    expect(dial.properties).toMatchObject({ minAngle: 225, maxAngle: 135, direction: "cw" })
    expect(dial.width).toBe(dial.height)
    // On the grid of its track (lib/size-scale.ts snapDiameter): a multiple of 24 near 120.
    expect(dial.width).toBe(120)
    const back = convertObject(dial, "slider")!
    expect(back).toMatchObject({ id: "regler", type: "slider", x: 20, y: 30, width: 120 })
    for (const key of BOUND) expect(back.properties[key], key).toEqual(slider.properties[key])
    expect(back.properties.direction).toBe("left-to-right")
    expect(back.properties).not.toHaveProperty("minAngle")
    expect(back.properties).not.toHaveProperty("maxAngle")
    // As deep as its handle: 12 * 11 / 4.
    expect(back.height).toBe(33)
  })

  test("Bar ↔ Gauge the same way", () => {
    const { writeTopic: _w, setpointTopic: _s, step: _st, writeFormat: _f, ...read } = slider.properties
    const bar: ScreenObject = { ...slider, id: "fuellstand", type: "bar", properties: read }
    const gauge = convertObject(bar, "gauge")!
    expect(gauge).toMatchObject({ id: "fuellstand", type: "gauge", width: 120, height: 120 })
    expect(gauge.properties).toMatchObject({ ...read, minAngle: 225, maxAngle: 135, direction: "cw" })
    const back = convertObject(gauge, "bar")!
    expect(back.type).toBe("bar")
    expect(back.properties).toEqual({ ...read })
    // No handle: the track and its glow, or the number's line beside it.
    expect(back.height).toBeGreaterThanOrEqual(12)
    expect(back.height).toBeLessThan(33)
  })

  test("Button Group → Switch: the states kept, the on one the one that says on; at least as wide as before", () => {
    const sw = convertObject(group(2), "switch")!
    expect(sw).toMatchObject({ id: "knoepfe", type: "switch", x: 10, y: 100, height: 40 })
    expect(sw.width).toBeGreaterThanOrEqual(140)
    expect(sw.properties).toMatchObject({ topic: "pump/state", writeTopic: "pump/set", switchStyle: "filled", switchColor: "accent" })
    expect(sw.properties.states.map((s: Obj) => [s.readValue, s.writeValue, s.showAsOn])).toEqual([
      ["OFF", "OFF", false],
      ["ON", "ON", true],
    ])
    const back = convertObject(sw, "button-group")!
    expect(back.properties.states.map((s: Obj) => s.readValue)).toEqual(["OFF", "ON"])
    // Back again, the on state is the one it was.
    expect(convertObject(back, "switch")!.properties.states.map((s: Obj) => s.showAsOn)).toEqual([false, true])
  })

  test("Button Group → Toggle Button → Switch: the states kept, the on one marked; no name until one is given; never lower than its line", () => {
    const tile = convertObject(group(3), "toggle-button", FONTS)!
    expect(tile).toMatchObject({ id: "knoepfe", type: "toggle-button", x: 10, y: 100 })
    expect(tile.properties).toMatchObject({ topic: "pump/state", writeTopic: "pump/set", switchStyle: "filled", switchColor: "accent", text: "" })
    expect(tile.properties.states.map((s: Obj) => [s.readValue, s.showAsOn])).toEqual([
      ["OFF", false],
      ["ON", true],
      ["AUTO", false],
    ])
    expect(tile.height).toBeGreaterThanOrEqual(toggleMinHeight(tile, FONTS))
    // Three states do not become a switch from a tile either.
    expect(convertObject(tile, "switch")).toBeUndefined()
    const two = convertObject(group(2), "toggle-button", FONTS)!
    const named = { ...two, properties: { ...two.properties, text: "Pumpe", secondFontId: "f1" } }
    const sw = convertObject(named, "switch", FONTS)!
    expect(sw.type).toBe("switch")
    // The name is the tile's alone.
    expect(sw.properties).not.toHaveProperty("text")
    expect(sw.properties).not.toHaveProperty("secondFontId")
    expect(convertObject(named, "button-group", FONTS)!.properties).not.toHaveProperty("text")
  })

  test("a Knob's binding on the dial still finds it after Dial → Slider", () => {
    const dial = convertObject(slider, "dial")!
    const action = { type: "adjust-level", targetObjectId: "regler", direction: "up" } as any
    const screen = (objects: ScreenObject[]) => ({ id: "s", name: "s", objects }) as unknown as ProjectScreen
    expect(adjustTargetOf(action, screen([dial]), undefined)?.type).toBe("dial")
    expect(adjustTargetOf(action, screen([convertObject(dial, "slider")!]), undefined)?.type).toBe("slider")
  })

  test("not its family's other type: nothing", () => {
    expect(convertObject(slider, "gauge")).toBeUndefined()
    expect(convertObject(slider, "switch")).toBeUndefined()
  })
})

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

async function project(objects: Obj[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.screens[0].objects = objects
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `convert-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function saved(page: Page): Promise<Obj[]> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const p = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return p.screens[0].objects
}

async function convert(page: Page, id: string, to: string) {
  await objectTreeRow(page, id).click()
  await page.getByTestId("convert-to").click()
  await page.getByTestId(`convert-to-${to}`).click()
}

test.describe("convert: the Properties panel", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("Slider → Dial beside the type; the panel is the dial's; one Ctrl+Z takes it back", async ({ page }) => {
    await loadProject(page, await project([slider]))
    await convert(page, "regler", "dial")
    await expect(page.getByTestId("object-type")).toHaveText("Dial")
    const [dial] = await saved(page)
    expect(dial).toMatchObject({ id: "regler", type: "dial", x: 20, y: 30 })
    expect(dial.properties).toMatchObject({ writeTopic: "heater/temp/set", setpointTopic: "heater/target", step: 0.5, calibrationPoints: CALIBRATION })
    await page.keyboard.press("ControlOrMeta+z")
    const [undone] = await saved(page)
    expect(undone).toMatchObject({ id: "regler", type: "slider", width: 120, height: 30 })
  })

  test("a button group of three states: Switch greyed with the reason; of two it becomes one", async ({ page }) => {
    await loadProject(page, await project([group(3), { ...group(2), id: "zwei", y: 160 }]))
    await objectTreeRow(page, "knoepfe").click()
    await page.getByTestId("convert-to").click()
    const item = page.getByTestId("convert-to-switch")
    await expect(item).toHaveAttribute("data-disabled", "")
    await expect(item).toContainText("Only two states become a switch; this has 3")
    await page.keyboard.press("Escape")
    await convert(page, "zwei", "switch")
    await expect(page.getByTestId("object-type")).toHaveText("Switch")
    const objects = await saved(page)
    expect(objects.find((o) => o.id === "knoepfe")!.type).toBe("button-group")
    expect(objects.find((o) => o.id === "zwei")!.type).toBe("switch")
  })

  test("a Text has no Convert to", async ({ page }) => {
    await loadProject(page, await project([{ id: "wort", type: "text", x: 10, y: 10, width: 60, height: 20, zIndex: 1, properties: { text: "Hallo" } }]))
    await objectTreeRow(page, "wort").click()
    await expect(page.getByTestId("object-type")).toHaveText("Text")
    await expect(page.getByTestId("convert-to")).toHaveCount(0)
  })
})

// In a table's cell and in a card (T9): the converted object sized as a
// block builds that look for a cell; the row, and a card that ended with its
// content, follow.
test.describe("convert: in a cell and a card", () => {
  const SCALE = { pixelsPerMm: 5 }
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
  const build = (look: "dial" | "slider") =>
    buildEntry({
      entry: hall,
      rect: { x: 0, y: 0, width: 300, height: 160 },
      palette: ROLE_PALETTE,
      font: { id: "f", size: 14 },
      options: { label: "Hall", look: "", icon: null, parts: [{ control: 0, look: "buttons" }, { control: 1, look }] },
    })
  function placed(piece: Omit<ScreenObject, "id" | "zIndex">): ScreenObject {
    let n = 0
    const walk = (o: any): ScreenObject => ({ ...o, id: `o${n++}`, zIndex: o.zIndex ?? 0, ...(o.children ? { children: o.children.map(walk) } : {}) })
    return walk(piece)
  }
  const find = (o: ScreenObject, type: string): ScreenObject | undefined =>
    o.type === type ? o : (o.children ?? []).map((c) => find(c, type)).find(Boolean)
  const partsOf = (card: ScreenObject) => card.children!.find((c) => c.properties?.dock === "fill")!
  // In each column of a table every object below the one above it, and all inside the table.
  function nothingOverlaps(table: ScreenObject) {
    const columns = new Map<number, ScreenObject[]>()
    for (const c of table.children!) columns.set(c.properties.cell.column, [...(columns.get(c.properties.cell.column) ?? []), c])
    for (const column of columns.values()) {
      const rows = column.sort((a, b) => a.y - b.y)
      for (let i = 1; i < rows.length; i++) expect(rows[i].y, rows[i].type).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].height)
    }
    for (const c of table.children!) expect(c.y + c.height, c.type).toBeLessThanOrEqual(table.height)
  }

  test("the fan's dial → slider in its card: the card shorter, nothing overlapping; back to a dial, taller again", () => {
    const card = layoutObjects([placed(blockCard(build("dial"), 300, SCALE))], SCALE)[0]
    const dial = find(card, "dial")!
    const [after] = layoutObjects(convertInTree([card], dial.id, "slider", SCALE)!, SCALE)
    const slider = find(after, "slider")!
    expect(slider.id).toBe(dial.id)
    expect(after.height).toBeLessThan(card.height)
    // Still ending with its content: the parts the padding (2 mm) above its bottom.
    const parts = partsOf(after)
    expect(after.height - (parts.y + parts.height)).toBe(10)
    nothingOverlaps(parts)
    const [again] = layoutObjects(convertInTree([after], dial.id, "dial", SCALE)!, SCALE)
    expect(again.height).toBeGreaterThan(after.height)
    // A ring in a cell: six lines of its font across, on the grid of its track.
    const ring = find(again, "dial")!
    expect(ring.width).toBe(ring.height)
    expect(Math.abs(ring.width - 6 * 14)).toBeLessThanOrEqual(2 * (ring.properties.thickness ?? 0))
    expect(again.height - (partsOf(again).y + partsOf(again).height)).toBe(10)
    nothingOverlaps(partsOf(again))
  })

  test("a card given a height of its own keeps it", () => {
    const [built] = layoutObjects([placed(blockCard(build("dial"), 300, SCALE))], SCALE)
    const tall = { ...built, height: built.height + 50 }
    const [after] = layoutObjects(convertInTree([tall], find(tall, "dial")!.id, "slider", SCALE)!, SCALE)
    expect(after.height).toBe(tall.height)
  })

  test("in a plain table the row follows", () => {
    const [table] = layoutObjects([placed(blockTable(build("dial")))], SCALE)
    const dial = find(table, "dial")!
    const [after] = layoutObjects(convertInTree([table], dial.id, "slider", SCALE)!, SCALE)
    expect(after.height).toBeLessThan(table.height)
    nothingOverlaps(after)
  })

  test("a free object converted on its own leaves everything else as it was", () => {
    const other = { ...slider, id: "anderer", y: 200 }
    const tree = convertInTree([slider, other], "regler", "dial", SCALE)!
    expect(tree[1]).toBe(other)
    expect(tree[0]).toEqual(convertObject(slider, "dial"))
  })
})

// The canvas's right-click menu (T10): «Convert to» as a submenu for one
// object of a family, beside Group / Ungroup.
test.describe("convert: the right-click menu", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })
  const rightClick = async (page: Page) => {
    const { box } = await getMainCanvas(page)
    await page.mouse.click(box.x + 4, box.y + 4, { button: "right" })
  }

  test("shown for one slider: hovering opens Dial, a click converts it", async ({ page }) => {
    await loadProject(page, await project([slider]))
    await objectTreeRow(page, "regler").click()
    await rightClick(page)
    await page.getByTestId("context-convert-to").hover()
    await page.getByTestId("context-convert-to-dial").click()
    await expect(page.getByTestId("object-type")).toHaveText("Dial")
    const [dial] = await saved(page)
    expect(dial).toMatchObject({ id: "regler", type: "dial" })
  })

  test("absent for two objects and for a Text", async ({ page }) => {
    const text = { id: "wort", type: "text", x: 10, y: 150, width: 60, height: 20, zIndex: 3, properties: { text: "Hallo" } }
    await loadProject(page, await project([slider, text]))
    await objectTreeRow(page, "wort").click()
    await rightClick(page)
    await expect(page.getByRole("button", { name: "Select All" })).toBeVisible()
    await expect(page.getByTestId("context-convert-to")).toHaveCount(0)
    await page.getByRole("button", { name: "Select All" }).click()
    await rightClick(page)
    await expect(page.getByRole("button", { name: "Select All" })).toBeVisible()
    await expect(page.getByTestId("context-convert-to")).toHaveCount(0)
  })

  test("a group of three: Switch greyed in the submenu, with the reason", async ({ page }) => {
    await loadProject(page, await project([group(3)]))
    await objectTreeRow(page, "knoepfe").click()
    await rightClick(page)
    await page.getByTestId("context-convert-to").hover()
    const item = page.getByTestId("context-convert-to-switch")
    await expect(item).toBeDisabled()
    await expect(item).toContainText("Only two states become a switch; this has 3")
  })
})
