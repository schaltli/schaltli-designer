import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, naturalWidth } from "../lib/layout"
import { TABLE_GAP_MM, EMPTY_AUTO_WIDTH, type TableColumn } from "../lib/table"
import { stepPx, stepUpdates } from "../lib/size-scale"

// The table (docs/2026-10-02-layout-tables.md, module table-model): laid
// out like a Word table, each object in the cell it names. No browser.

const SCALE = { pixelsPerMm: 5 }
const GAP = Math.round(TABLE_GAP_MM * SCALE.pixelsPerMm)
const S = stepPx("control", "s", SCALE.pixelsPerMm)

let ids = 0
function obj(type: ScreenObject["type"], fields: Partial<ScreenObject> = {}): ScreenObject {
  return { id: `o${++ids}`, type, x: 0, y: 0, width: 50, height: 20, zIndex: ids, properties: {}, ...fields }
}
const at = (o: ScreenObject, row: number, column: number, extra: Record<string, unknown> = {}): ScreenObject => ({
  ...o,
  properties: { ...o.properties, cell: { row, column, ...extra } },
})
const words = (text: string) => obj("text", { height: 18, properties: { text } })
function stepped(type: ScreenObject["type"], step: "s" | "m" | "l"): ScreenObject {
  const base = obj(type, { width: 60, properties: { states: [{ id: "a", label: "An" }, { id: "b", label: "Aus" }] } })
  return { ...base, ...stepUpdates(base, step, SCALE.pixelsPerMm, []) }
}
const nat = (o: ScreenObject) => naturalWidth(o, SCALE)
function table(columns: TableColumn[], children: ScreenObject[], fields: Partial<ScreenObject> = {}): ScreenObject {
  const { properties, ...rest } = fields
  return obj("table", { x: 0, y: 0, width: 400, height: 300, ...rest, properties: { columns, ...properties }, children })
}
const lay = (t: ScreenObject) => layoutObjects([t], SCALE)[0]
const child = (t: ScreenObject, id: string) => t.children!.find((c) => c.id === id)!

test.describe("table: columns", () => {
  test("auto as wide as its widest content, a share taking the rest", () => {
    const short = at(words("Bad"), 0, 0)
    const long = at(words("Frischwasser"), 1, 0)
    const bar = at(obj("bar", { id: "bar" }), 0, 1)
    const t = lay(table([{ width: "auto" }, { width: { share: 100 } }], [short, long, bar]))
    const placedBar = child(t, "bar")
    expect(placedBar.x).toBe(nat(long) + GAP)
    // A bar stretches across its cell.
    expect(placedBar.width).toBe(400 - nat(long) - GAP)
  })

  test("fixed in millimetres and as a size multiple; shares in proportion of the rest", () => {
    const cells = [0, 1, 2, 3].map((c) => at(obj("bar", { id: `c${c}` }), 0, c))
    const t = lay(
      table([{ width: { mm: 20 } }, { width: { step: "s", times: 2 } }, { width: { share: 30 } }, { width: { share: 30 } }], cells),
    )
    const [a, b, c, d] = ["c0", "c1", "c2", "c3"].map((id) => child(t, id))
    expect(a.width).toBe(100)
    expect(b.width).toBe(2 * S)
    const rest = 400 - 100 - 2 * S - 3 * GAP
    expect(c.width).toBe(Math.floor(rest / 2))
    expect(d.x).toBe(c.x + c.width + GAP)
  })

  test("an empty auto column is 20 px; a text with a placeholder does not count", () => {
    const value = at(words("{topic:van/level}"), 0, 0)
    const t = lay(table([{ width: "auto" }, { width: "auto" }, { width: { share: 100 } }], [value, at(obj("bar", { id: "bar" }), 0, 2)]))
    expect(child(t, "bar").x).toBe(EMPTY_AUTO_WIDTH + GAP + EMPTY_AUTO_WIDTH + GAP)
  })
})

test.describe("table: rows and cells", () => {
  test("a row as tall as its tallest object, each object centred in it; an empty row a size-S control's height", () => {
    const name = at(words("Licht"), 0, 0)
    const control = at(stepped("switch", "l"), 0, 1)
    const below = at(words("Bad"), 2, 0)
    const t = lay(table([{ width: "auto" }, { width: { share: 100 } }], [name, control, below], { properties: { rows: 3 } } as Partial<ScreenObject>))
    const [n, c, b] = [name, control, below].map((o) => child(t, o.id))
    expect(c.y).toBe(0)
    expect(n.y).toBe(Math.round((c.height - n.height) / 2))
    expect(b.y).toBe(c.height + GAP + S + GAP)
    expect(t.properties.contentHeight).toBe(b.y + b.height)
  })

  test("a span covers the columns it spans, and does not widen an auto column", () => {
    const title = at(words("Ein ziemlich langer Titel"), 0, 0, { columnSpan: 2 })
    const name = at(words("Bad"), 1, 0)
    const bar = at(obj("bar", { id: "bar" }), 1, 1)
    const t = lay(table([{ width: "auto" }, { width: { share: 100 } }], [title, name, bar]))
    expect(child(t, "bar").x).toBe(nat(name) + GAP)
    // Its cell is the whole width; a text stands at its start.
    expect(child(t, title.id).x).toBe(0)
  })

  test("alignment by column, a cell's own overriding it", () => {
    const a = at(words("A"), 0, 0)
    const b = at(words("B"), 1, 0, { align: "end" })
    const t = lay(table([{ width: { share: 100 }, align: "centre" }], [a, b]))
    expect(child(t, a.id).x).toBe(Math.round((400 - nat(a)) / 2))
    expect(child(t, b.id).x).toBe(400 - nat(b))
  })

  test("a control never narrower than its labels: it sticks out, and the table says it does not fit", () => {
    const group = at(stepped("button-group", "m"), 0, 0)
    const t = lay(table([{ width: { mm: 5 } }], [group], { width: 25 } as Partial<ScreenObject>))
    expect(child(t, group.id).width).toBe(nat(group))
    expect(t.properties.overflow).toBe(true)
  })

  test("objects without a cell take the first empty cells, reading order, and keep them", () => {
    const placed = at(words("fest"), 0, 0)
    const loose = [words("eins"), words("zwei")]
    const t = lay(table([{ width: "auto" }, { width: "auto" }], [placed, ...loose]))
    expect(loose.map((o) => child(t, o.id).properties.cell)).toEqual([
      { row: 0, column: 1 },
      { row: 1, column: 0 },
    ])
  })

  test("a nested table: the cell's width, as tall as its content", () => {
    const inner = at(table([{ width: "auto" }, { width: { share: 100 } }], [at(words("Bad"), 0, 0), at(stepped("switch", "m"), 0, 1)], { id: "inner", height: 5 } as Partial<ScreenObject>), 0, 1)
    const t = lay(table([{ width: { share: 50 } }, { width: { share: 50 } }], [inner]))
    const nested = child(t, "inner")
    expect(nested.width).toBe(Math.floor((400 - GAP) / 2))
    expect(nested.height).toBe(Math.max(...nested.children!.map((c) => c.height)))
    expect(nested.properties.overflow).toBeUndefined()
  })
})
