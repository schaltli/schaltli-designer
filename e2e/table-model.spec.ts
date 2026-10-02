import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { layoutObjects, layoutProject, layoutScreenObjects, naturalWidth } from "../lib/layout"
import { dissolveGroups } from "../lib/object-groups"
import { TABLE_GAP_MM, EMPTY_AUTO_WIDTH, migrateObjectsToTables, migrateScreenToTables, tableDropAt, insertRowAt, moveIntoTable, dragColumnLine, type TableColumn } from "../lib/table"
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

  // Found on the Knob at Checkpoint A: two buttons in 50% columns, each
  // wider than half, overlapped.
  test("a share column is never narrower than a control in it; the others share what is left", () => {
    const wide = at(stepped("button-group", "m"), 0, 0)
    const other = at(stepped("button-group", "m"), 0, 1)
    const need = nat(wide)
    const width = Math.round(need * 1.5)
    const t = lay(table([{ width: { share: 50 } }, { width: { share: 50 } }], [wide, other], { width } as Partial<ScreenObject>))
    const [a, b] = [wide, other].map((o) => child(t, o.id))
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width + GAP)
    expect(t.properties.overflow).toBe(true)
    // With room for both, an even split as asked.
    const roomy = lay(table([{ width: { share: 50 } }, { width: { share: 50 } }], [wide, other], { width: 4 * need } as Partial<ScreenObject>))
    expect(child(roomy, other.id).x).toBe(Math.floor((4 * need - GAP) / 2) + GAP)
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

  test("a nested table in an auto column: as wide as its content needs, whatever width it was saved with", () => {
    const icon = at(obj("box", { id: "icon", width: 20, height: 20 }), 0, 0)
    const name = at(words("Licht"), 0, 1)
    const nameCell = at(table([{ width: "auto" }, { width: "auto" }], [icon, name], { id: "name-cell", width: 999 }), 0, 0)
    const t = lay(table([{ width: "auto" }, { width: { share: 100 } }], [nameCell, at(obj("bar", { id: "bar" }), 0, 1)]))
    expect(child(t, "bar").x).toBe(20 + GAP + nat(name) + GAP)
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

// Task 2: what layout Tasks 1-12 saved becomes tables on load; a screen's
// root can be a table; a deploy dissolves it.
test.describe("table: migration, the screen's root, deploy", () => {
  const cells = (t: ScreenObject) => t.children!.map((c) => [c.id, c.properties.cell?.row, c.properties.cell?.column])

  test("a vertical stack becomes one column, a spacer an empty row", () => {
    const stack = obj("vertical-stack", {
      id: "s",
      properties: { align: "centre" },
      children: [{ ...words("a"), id: "a", zIndex: 0 }, { ...obj("spacer"), id: "sp", zIndex: 1 }, { ...words("b"), id: "b", zIndex: 2 }],
    })
    const [t] = migrateObjectsToTables([stack])
    expect(t.type).toBe("table")
    expect(t.properties.columns).toEqual([{ width: { share: 100 }, align: "centre" }])
    expect(cells(t)).toEqual([
      ["a", 0, 0],
      ["b", 2, 0],
    ])
    expect(t.properties.rows).toBe(3)
  })

  test("a horizontal stack becomes one row; fill gives equal shares", () => {
    const row = obj("horizontal-stack", { properties: { distribute: "fill" }, children: [{ ...words("a"), id: "a", zIndex: 0 }, { ...words("b"), id: "b", zIndex: 1 }] })
    const [t] = migrateObjectsToTables([row])
    expect(t.properties.columns).toEqual([{ width: { share: 1 } }, { width: { share: 1 } }])
    expect(cells(t)).toEqual([
      ["a", 0, 0],
      ["b", 0, 1],
    ])
  })

  test("a grid keeps its columns; a group in it is unpacked into its pieces' cells, a spacer leaves its cell empty", () => {
    const block = obj("group", { id: "block", zIndex: 1, children: [{ ...words("Licht"), id: "name", zIndex: 0 }, { ...obj("bar"), id: "bar", zIndex: 1 }] })
    const fan = obj("group", {
      id: "fan",
      zIndex: 2,
      children: [{ ...words("Fan"), id: "fan-name", zIndex: 0 }, { ...obj("bar"), id: "p1", zIndex: 1 }, { ...obj("spacer"), id: "gap", zIndex: 2 }, { ...obj("bar"), id: "p2", zIndex: 3 }],
    })
    const grid = obj("grid", { properties: { columns: ["auto", 1] }, children: [{ ...words("Titel"), id: "title", zIndex: 0 }, block, fan] })
    const [t] = migrateObjectsToTables([grid])
    expect(t.properties.columns).toEqual([{ width: "auto" }, { width: { share: 1 } }])
    // The title alone in row 0; a block starts a row of its own when the
    // row has no room left for it, as the grid placed it.
    expect(cells(t)).toEqual([
      ["title", 0, 0],
      ["name", 1, 0],
      ["bar", 1, 1],
      ["fan-name", 2, 0],
      ["p1", 2, 1],
      ["p2", 3, 1],
    ])
  })

  test("a screen's root stack or grid becomes a table root; the two columns of «Two columns» its columns", () => {
    const screen = {
      layout: { type: "horizontal-stack", properties: { distribute: "fill" } },
      objects: [
        obj("vertical-stack", { id: "c1", zIndex: 0, properties: { layoutSlot: true }, children: [{ ...words("a"), id: "a", zIndex: 0 }, { ...words("b"), id: "b", zIndex: 1 }] }),
        obj("vertical-stack", { id: "c2", zIndex: 1, properties: { layoutSlot: true }, children: [{ ...words("c"), id: "c", zIndex: 0 }] }),
      ],
    }
    migrateScreenToTables(screen)
    expect(screen.layout).toEqual({ type: "table", properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 2 } })
    expect(screen.objects.map((o) => [o.id, o.properties.cell.row, o.properties.cell.column])).toEqual([
      ["a", 0, 0],
      ["b", 1, 0],
      ["c", 0, 1],
    ])
    // Twice changes nothing.
    const again = structuredClone(screen)
    migrateScreenToTables(again)
    expect(again).toEqual(screen)
  })

  test("a screen whose root is a table lays out in the content area and deploys every object absolute", () => {
    const project = {
      screenWidth: 400,
      screenHeight: 300,
      settings: { pixelsPerMm: SCALE.pixelsPerMm },
      screens: [
        {
          layout: { type: "table" as const, properties: { columns: [{ width: "auto" }, { width: { share: 100 } }] } },
          objects: [at(words("Licht"), 0, 0), at(obj("bar", { id: "bar" }), 0, 1), at(table([{ width: "auto" }], [at(words("x"), 0, 0)], { id: "nested" }), 1, 1)],
        },
      ],
    }
    const laid = layoutProject(project)
    const objects = laid.screens[0].objects!
    const pad = Math.round(2 * SCALE.pixelsPerMm)
    expect(objects[0]).toMatchObject({ x: pad, y: expect.any(Number) })
    const flat = dissolveGroups(objects)
    expect(flat.some((o) => o.type === "table")).toBe(false)
    expect(flat).toHaveLength(3)
  })
})

// Task 4: where a click puts an object - into an empty cell, the free row,
// or a new row at a row line; an occupied cell takes nothing.
test.describe("table: drop targets", () => {
  const AREA = { x: 0, y: 0, width: 400, height: 300 }
  const ROOT = { type: "table" as const, properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 2 } }
  const objects = () => [at(obj("box", { id: "a", height: 40 }), 0, 0), at(obj("box", { id: "b", height: 40 }), 1, 1)]
  const laidOut = () => layoutObjects(objects(), SCALE) // their sizes; the root lays them out below
  const pad = Math.round(2 * SCALE.pixelsPerMm)

  test("an empty cell is a target; an occupied one takes nothing", () => {
    const list = layoutScreenObjects(laidOut(), ROOT, AREA, SCALE)
    const half = Math.floor((400 - 2 * pad - GAP) / 2)
    // Row 0, column 1: empty.
    const empty = tableDropAt(list, ROOT, AREA, { x: pad + half + GAP + 10, y: pad + 10 }, SCALE)
    expect(empty).toMatchObject({ tableId: null, row: 0, column: 1, insertRow: false })
    // Row 0, column 0: "a".
    expect(tableDropAt(list, ROOT, AREA, { x: pad + 10, y: pad + 10 }, SCALE)).toEqual({ blocked: true })
  })

  test("a row line inserts a row there, in the column under the pointer; the free row below the last takes one too", () => {
    const list = layoutScreenObjects(laidOut(), ROOT, AREA, SCALE)
    const lineY = pad + 40 + Math.round(GAP / 2)
    expect(tableDropAt(list, ROOT, AREA, { x: pad + 10, y: lineY }, SCALE)).toMatchObject({ row: 1, column: 0, insertRow: true })
    const freeY = pad + 40 + GAP + 40 + GAP + 5
    expect(tableDropAt(list, ROOT, AREA, { x: pad + 10, y: freeY }, SCALE)).toMatchObject({ row: 2, column: 0, insertRow: false })
  })

  test("inserting a row moves the rows from there down by one", () => {
    const t = table([{ width: "auto" }], [at(words("a"), 0, 0), at(words("b"), 1, 0)], { properties: { rows: 2 } } as Partial<ScreenObject>)
    const moved = insertRowAt(t.children!, 1)
    expect(moved.map((c) => c.properties.cell.row)).toEqual([0, 2])
  })
})

// Task 5: moving objects to a cell or a new row, several keeping their
// cells relative to each other.
test.describe("table: moving", () => {
  const ROOT = { type: "table" as const, properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 3 } }
  const screenObjects = () => [
    at(words("a"), 0, 0),
    at(words("b"), 0, 1),
    at(words("c"), 1, 0),
    { ...words("loose"), id: "loose" },
  ]
  const cellsById = (list: ScreenObject[]) => Object.fromEntries(list.map((o) => [o.id, o.properties.cell ? [o.properties.cell.row, o.properties.cell.column] : null]))

  test("one object to an empty cell; out of where it was", () => {
    const list = screenObjects()
    const [a] = list
    const moved = moveIntoTable(list, ROOT, [a.id], { tableId: null, row: 2, column: 1, insertRow: false })
    expect(moved).not.toBeNull()
    expect(cellsById(moved!.objects)[a.id]).toEqual([2, 1])
  })

  test("two from a table keep their cells relative to each other; a row line makes room", () => {
    const list = screenObjects()
    const [a, b, c] = list
    const moved = moveIntoTable(list, ROOT, [a.id, b.id], { tableId: null, row: 2, column: 0, insertRow: true })!
    const cells = cellsById(moved.objects)
    expect(cells[a.id]).toEqual([2, 0])
    expect(cells[b.id]).toEqual([2, 1])
    // c moved up a row when a and b left row 0? No - rows are where objects
    // name them; c stays in row 1.
    expect(cells[c.id]).toEqual([1, 0])
  })

  test("objects from outside a table go one under another in the drop's column", () => {
    const list = screenObjects()
    const extra = { ...words("more"), id: "more" }
    const moved = moveIntoTable([...list, extra], ROOT, ["loose", "more"], { tableId: null, row: 2, column: 1, insertRow: false })!
    const cells = cellsById(moved.objects)
    expect(cells.loose).toEqual([2, 1])
    expect(cells.more).toEqual([3, 1])
  })

  test("an occupied cell refuses the move", () => {
    const list = screenObjects()
    const [a, , c] = list
    expect(moveIntoTable(list, ROOT, [a.id], { tableId: null, row: 1, column: 0, insertRow: false })).toBeNull()
    // Unless what is there moves too.
    expect(moveIntoTable(list, ROOT, [c.id], { tableId: null, row: 1, column: 0, insertRow: false })).not.toBeNull()
  })
})

// Task 6: a column line dragged moves width between the two columns beside
// it; both become shares, the others keeping theirs.
test.describe("table: column lines", () => {
  test("dragging a line between auto and a share: both shares, in the widths the drag left", () => {
    const columns: TableColumn[] = [{ width: "auto" }, { width: { share: 100 } }]
    const next = dragColumnLine(columns, [100, 300], 1, 50)
    expect(next).toEqual([{ width: { share: 37.5 } }, { width: { share: 62.5 } }])
  })

  test("other share columns keep their proportion; fixed ones stay; alignment is kept", () => {
    const columns: TableColumn[] = [{ width: { mm: 10 } }, { width: { share: 50 }, align: "centre" }, { width: { share: 50 } }]
    const next = dragColumnLine(columns, [50, 200, 200], 2, -100)
    expect(next[0]).toEqual({ width: { mm: 10 } })
    expect(next[1]).toEqual({ width: { share: 25 }, align: "centre" })
    expect(next[2]).toEqual({ width: { share: 75 } })
  })

  test("a column is not dragged narrower than 10 px", () => {
    const next = dragColumnLine([{ width: { share: 50 } }, { width: { share: 50 } }], [200, 200], 1, -500)
    expect(next[0]).toEqual({ width: { share: 2.5 } })
  })
})
