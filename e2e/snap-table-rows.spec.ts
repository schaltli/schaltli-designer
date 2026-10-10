import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import type { ScreenObject } from "../components/project-editor"
import { applyRowDrop, arrangeSnapTable, columnRoles, insertRowOf, isSnapTable, rowAsTable, rowTargetAt, snapCellOf, snapTableGeometry } from "../lib/snap-table"
import { devicePoint, getMainCanvas, loadProject, placingFreely, saveProjectAs, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// Rows (docs/2026-10-09-snap-tables.md, module snap-table-rows): several
// objects at once - an icon, a label, a control - inserted as one row, each
// part into the column of its role. No browser.

const SCALE = { pixelsPerMm: 5 }

let ids = 0
function part(type: ScreenObject["type"], cell?: Record<string, unknown>, width = 40, height = 20): ScreenObject {
  return { id: `${type}${++ids}`, type, x: 0, y: 0, width, height, zIndex: ids, properties: cell ? { cell } : {} }
}
function table(children: ScreenObject[], columns: number, rows: number): ScreenObject {
  const t: ScreenObject = {
    id: `t${++ids}`,
    type: "table",
    x: 100,
    y: 200,
    width: 1,
    height: 1,
    zIndex: ids,
    properties: { grid: 1, columns: Array.from({ length: columns }, () => ({})), rows: Array.from({ length: rows }, () => ({})) },
    children,
  }
  return arrangeSnapTable(t, SCALE)
}
const cellOf = (t: ScreenObject, id: string) => {
  const { row, column, rowSpan, columnSpan } = snapCellOf(t.children!.find((c) => c.id === id)!)
  return { row, column, rowSpan, columnSpan }
}
const at = (row: number, column: number, rowSpan = 1, columnSpan = 1) => ({ row, column, rowSpan, columnSpan })
const absolute = (t: ScreenObject, id: string) => {
  const c = t.children!.find((o) => o.id === id)!
  return { x: t.x + c.x, y: t.y + c.y }
}

test.describe("snap table rows: by role", () => {
  test("a column's role is that of the first object standing in it alone", () => {
    const t = table([part("icon", { row: 0, column: 0 }), part("text", { row: 0, column: 1 }), part("switch", { row: 1, column: 0, columnSpan: 2 }), part("button", { row: 1, column: 2 })], 3, 2)
    expect(columnRoles(t)).toEqual(["icon", "label", "control"])
  })

  test("«Label · Switch» under «Icon · Label · Switch»: its switch under the switch, the icon cell empty", () => {
    const icon = part("icon", { row: 0, column: 0 })
    const t = table([icon, part("text", { row: 0, column: 1 }), part("switch", { row: 0, column: 2 })], 3, 1)
    const label = part("text")
    const sw = part("switch")
    const out = insertRowOf(t, 1, [label, sw], SCALE)
    expect(snapTableGeometry(out, SCALE).widths).toHaveLength(3)
    expect(cellOf(out, label.id)).toEqual(at(1, 1))
    expect(cellOf(out, sw.id)).toEqual(at(1, 2))
    expect(out.children!.filter((c) => snapCellOf(c).row === 1 && snapCellOf(c).column === 0)).toHaveLength(0)
    // What stood there keeps its place.
    expect(absolute(out, icon.id)).toEqual(absolute(t, icon.id))
  })

  test("«Label · Button» onto a table of buttons only adds a Label column left of them", () => {
    const b1 = part("button", { row: 0, column: 0 })
    const b2 = part("button", { row: 0, column: 1 })
    const t = table([b1, b2], 2, 1)
    const label = part("text")
    const button = part("button")
    const out = insertRowOf(t, 1, [label, button], SCALE)
    expect(columnRoles(out)).toEqual(["label", "control", "control"])
    expect(cellOf(out, label.id)).toEqual(at(1, 0))
    expect(cellOf(out, button.id)).toEqual(at(1, 1))
    expect(cellOf(out, b1.id)).toEqual(at(0, 1))
    expect(cellOf(out, b2.id)).toEqual(at(0, 2))
    expect(absolute(out, b1.id)).toEqual(absolute(t, b1.id))
  })

  test("a missing role gets a column after the last of an earlier role: Icon, Label, Control", () => {
    const t = table([part("icon", { row: 0, column: 0 }), part("switch", { row: 0, column: 1 })], 2, 1)
    const label = part("text")
    const sw = part("switch")
    const out = insertRowOf(t, 0, [label, sw], SCALE)
    expect(columnRoles(out)).toEqual(["icon", "label", "control"])
    expect(cellOf(out, label.id)).toEqual(at(0, 1))
    expect(cellOf(out, sw.id)).toEqual(at(0, 2))
  })

  test("a row inserted across a 3-row span lengthens the span and skips its column", () => {
    const tall = part("icon", { row: 0, column: 0, rowSpan: 3 }, 40, 70)
    const t = table([tall, part("text", { row: 0, column: 1 }), part("switch", { row: 0, column: 2 }), part("text", { row: 2, column: 1 }), part("switch", { row: 2, column: 2 })], 3, 3)
    const icon = part("icon")
    const label = part("text")
    const sw = part("switch")
    const out = insertRowOf(t, 1, [icon, label, sw], SCALE)
    expect(cellOf(out, tall.id)).toEqual(at(0, 0, 4))
    // The icon column is covered: the icon gets a column of its own after it.
    expect(cellOf(out, icon.id)).toEqual(at(1, 1))
    expect(cellOf(out, label.id)).toEqual(at(1, 2))
    expect(cellOf(out, sw.id)).toEqual(at(1, 3))
    expect(absolute(out, tall.id)).toEqual(absolute(t, tall.id))
  })

  test("a second switch of a row goes to the second switch column", () => {
    const t = table([part("text", { row: 0, column: 0 }), part("switch", { row: 0, column: 1 }), part("switch", { row: 0, column: 2 })], 3, 1)
    const a = part("switch")
    const b = part("switch")
    const out = insertRowOf(t, 1, [part("text"), a, b], SCALE)
    expect(cellOf(out, a.id)).toEqual(at(1, 1))
    expect(cellOf(out, b.id)).toEqual(at(1, 2))
  })
})

test.describe("snap table rows: where a row goes", () => {
  const t = table([part("text", { row: 0, column: 0 }), part("switch", { row: 0, column: 1 }), part("text", { row: 1, column: 0 }), part("switch", { row: 1, column: 1 })], 2, 2)
  const g = snapTableGeometry(t, SCALE)
  const row = (y: number, x = t.x + 10) => ({ x, y, width: 80, height: 20 })

  test("across a table: the line between rows nearest the row's middle", () => {
    expect(rowTargetAt([t], row(t.y - 15), 25, SCALE)).toEqual({ tableId: t.id, at: 0 })
    expect(rowTargetAt([t], row(t.y + g.tops[1] - 10), 25, SCALE)).toEqual({ tableId: t.id, at: 1 })
    expect(rowTargetAt([t], row(t.y + t.height - 5), 25, SCALE)).toEqual({ tableId: t.id, at: 2 })
  })

  test("beside the table or far from it: nowhere", () => {
    expect(rowTargetAt([t], row(t.y + 10, t.x + t.width + 5), 25, SCALE)).toBeNull()
    expect(rowTargetAt([t], row(t.y + t.height + 60), 25, SCALE)).toBeNull()
  })

  test("let go nowhere, or clicked: a table of one row, its corner where it was let go", () => {
    const parts = [part("icon"), part("text"), part("switch")]
    const out = applyRowDrop([t], parts, null, { x: 30, y: 40 }, SCALE, "new")
    const made = out.find((o) => o.id === "new")!
    expect(isSnapTable(made)).toBe(true)
    expect([made.x, made.y]).toEqual([30, 40])
    expect(parts.map((p) => cellOf(made, p.id))).toEqual([at(0, 0), at(0, 1), at(0, 2)])
    expect(rowAsTable(parts, { x: 30, y: 40 }, SCALE, "new")).toEqual(made)
  })

  test("let go on a line: into that table", () => {
    const parts = [part("text"), part("switch")]
    const out = applyRowDrop([t], parts, { tableId: t.id, at: 1 }, { x: 0, y: 0 }, SCALE, "new")
    expect(out).toHaveLength(1)
    expect(parts.map((p) => cellOf(out[0], p.id))).toEqual([at(1, 0), at(1, 1)])
  })
})

// In the designer: the Row tool's menu, a row carried and let go. The
// switch test project's screen, emptied - its device (the round fixture,
// 360 x 360) renders switches and buttons; one that does not offers a row
// with them disabled.
type Obj = Record<string, any>
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
const SCREEN = "screen-switch-tests"

test.beforeEach(async ({}, info) => {
  if (!info.titlePath.some((t) => t.includes("in the designer"))) return
  test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
})

async function emptyProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === SCREEN).objects = []
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `rows-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function pick(page: Page, template: string) {
  await page.getByTestId("row-tool").click()
  await page.getByTestId(`row-template-${template}`).click()
}
async function point(page: Page, p: { x: number; y: number }) {
  const { box } = await getMainCanvas(page)
  return devicePoint(box, p.x, p.y, ROUND_FIXTURE_SCREEN)
}
// Pressed at `from` with the Row tool in hand, carried to `to`; `meanwhile`
// runs before letting go, Ctrl held throughout when `freely`.
async function carry(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, meanwhile?: () => Promise<void>, freely = false) {
  const a = await point(page, from)
  const b = await point(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  const moves = async () => {
    for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10)
    if (meanwhile) await meanwhile()
    await page.mouse.up()
  }
  await (freely ? placingFreely(page, moves) : moves())
}
async function canvasAttribute(page: Page, name: string): Promise<string | null> {
  const { canvas } = await getMainCanvas(page)
  return canvas.getAttribute(name)
}

// The first screen's objects as saved: the first time under a name of its
// own, after that with Ctrl+S. The project is removed after the test.
const savedAs = new WeakMap<Page, string>()
async function savedObjects(page: Page): Promise<ScreenObject[]> {
  let name = savedAs.get(page)
  if (!name) {
    name = `rows-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await saveProjectAs(page, name)
    savedAs.set(page, name)
  } else {
    await page.keyboard.press("ControlOrMeta+s")
    await page.waitForTimeout(800)
  }
  const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
  return saved.screens.find((s: Obj) => s.id === SCREEN).objects
}
test.afterEach(async ({ page }) => {
  const name = savedAs.get(page)
  if (name) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
})

const typesByCell = (t: ScreenObject) => Object.fromEntries((t.children ?? []).map((c) => [`${snapCellOf(c).row}/${snapCellOf(c).column}`, c.type]))

test.describe("snap table rows: in the designer", () => {
  test("a clicked template lands as a table of one row, open, its middle where it was clicked", async ({ page }) => {
    await loadProject(page, await emptyProject())
    await pick(page, "label-switch")
    const p = await point(page, { x: 180, y: 180 })
    await page.mouse.click(p.x, p.y)
    const objects = await savedObjects(page)
    expect(objects).toHaveLength(1)
    const made = objects[0]
    expect(isSnapTable(made)).toBe(true)
    expect(typesByCell(made)).toEqual({ "0/0": "text", "0/1": "switch" })
    expect(Math.abs(made.x + made.width / 2 - 180)).toBeLessThanOrEqual(2)
    expect(Math.abs(made.y + made.height / 2 - 180)).toBeLessThanOrEqual(2)
    expect(await canvasAttribute(page, "data-editing-container")).toBe(made.id)
  })

  test("carried under a table, a row goes in by role; a column it adds is named before letting go", async ({ page }) => {
    await loadProject(page, await emptyProject())
    await pick(page, "label-switch")
    const p = await point(page, { x: 180, y: 120 })
    await page.mouse.click(p.x, p.y)
    let [t] = await savedObjects(page)

    // A second «Label · Switch» under it: no column to add.
    await pick(page, "label-switch")
    let shown: string | null = null
    await carry(page, { x: 180, y: 290 }, { x: t.x + t.width / 2, y: t.y + t.height + 4 }, async () => {
      shown = await canvasAttribute(page, "data-row-drop")
    })
    expect(JSON.parse(shown!)).toEqual({ tableId: t.id, at: 1, adds: null })
    ;[t] = await savedObjects(page)
    expect(typesByCell(t)).toEqual({ "0/0": "text", "0/1": "switch", "1/0": "text", "1/1": "switch" })

    // «Icon · Switch» at the top: an Icon column, before the labels.
    await pick(page, "icon-switch")
    await carry(page, { x: 180, y: 290 }, { x: t.x + t.width / 2, y: t.y - 4 }, async () => {
      shown = await canvasAttribute(page, "data-row-drop")
    })
    expect(JSON.parse(shown!)).toEqual({ tableId: t.id, at: 0, adds: "+ Icon column" })
    const objects = await savedObjects(page)
    expect(objects).toHaveLength(1)
    expect(typesByCell(objects[0])).toEqual({ "0/0": "icon", "0/2": "switch", "1/1": "text", "1/2": "switch", "2/1": "text", "2/2": "switch" })
  })

  test("Ctrl held: a table of its own; Esc: nothing", async ({ page }) => {
    await loadProject(page, await emptyProject())
    await pick(page, "label-switch")
    const p = await point(page, { x: 180, y: 120 })
    await page.mouse.click(p.x, p.y)
    const [t] = await savedObjects(page)

    await pick(page, "label-button")
    let shown: string | null = "unread"
    await carry(page, { x: 180, y: 290 }, { x: t.x + t.width / 2, y: t.y + t.height + 4 }, async () => {
      shown = await canvasAttribute(page, "data-row-drop")
    }, true)
    expect(shown).toBeNull()
    let objects = await savedObjects(page)
    expect(objects).toHaveLength(2)
    expect(objects.find((o) => o.id === t.id)!.children).toHaveLength(2)

    await pick(page, "label-button")
    await carry(page, { x: 180, y: 290 }, { x: t.x + t.width / 2, y: t.y - 4 }, () => page.keyboard.press("Escape"))
    objects = await savedObjects(page)
    expect(objects).toHaveLength(2)
  })
})
