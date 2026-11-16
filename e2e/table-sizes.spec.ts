import { test, expect } from "@playwright/test"
import type { ScreenObject } from "../components/project-editor"
import { arrangeSnapTable, lineStateOf, nextLineState, setLineSize, setLineState, snapTableGeometry, tableMinSize, withTableSize, SNAP_GAP_MM } from "../lib/snap-table"
import { FORMAT_VERSION, migrateToAreas } from "../lib/area-migration"
import { withFillWhereGivenRoom } from "../lib/table-fill"
import { layoutObjects } from "../lib/layout"

// What sets a size in a table (docs/2026-11-16-table-sizes.md): a column or
// row is auto, fixed or fill, and says so; a table has a size of its own,
// at least what it holds. Before, «Width» and «Equal columns» on the table
// changed what a column did and no column showed it - on the user's screen
// in the van, 2026-11-16, a table with «Equal columns» on and columns of 310
// and 181 px, the first pulled by hand once.
//
// The model. On the canvas: e2e/table-sizes-canvas.spec.ts.

const SCALE = { pixelsPerMm: 5 }
const GAP = Math.round(SNAP_GAP_MM * SCALE.pixelsPerMm)

type Line = { mm?: number; fill?: boolean }
let ids = 0
const box = (width: number, height: number, row: number, column: number, cell: Record<string, unknown> = {}): ScreenObject =>
  ({ id: `b${++ids}`, type: "box", x: 0, y: 0, width, height, zIndex: ids, properties: { cell: { row, column, ...cell } } }) as ScreenObject
const table = (children: ScreenObject[], columns: Line[], rows: Line[], extra: Record<string, any> = {}): ScreenObject =>
  ({ id: `t${++ids}`, type: "table", x: 0, y: 0, width: 1, height: 1, zIndex: ids, properties: { grid: 1, columns, rows, ...extra }, children }) as ScreenObject
const geom = (t: ScreenObject, stretchTo?: number) => snapTableGeometry(arrangeSnapTable(t, SCALE, stretchTo), SCALE)
// One row: 40, 60 and 30 px wide, 20 high.
const three = (columns: Line[], extra: Record<string, any> = {}) => table([box(40, 20, 0, 0), box(60, 20, 0, 1), box(30, 20, 0, 2)], columns, [{}], extra)
const FILL = { fill: true }

test.describe("a column says what sets its width", () => {
  test("auto, fixed, fill: read from the line; a size set wins", () => {
    expect([{}, { mm: 10 }, FILL, { mm: 10, fill: true }, undefined].map((line) => lineStateOf(line as Line))).toEqual(["auto", "fixed", "fill", "fixed", "auto"])
    expect(["auto", "fixed", "fill"].map((s) => nextLineState(s as "auto"))).toEqual(["fixed", "fill", "auto"])
  })

  test("with no size of its own a table is as its content; fill columns are equal among themselves (E3)", () => {
    expect(geom(three([{}, {}, {}])).widths).toEqual([40, 60, 30])
    expect(geom(three([{}, {}, FILL])).widths).toEqual([40, 60, 30])
    expect(geom(three([FILL, {}, FILL])).widths).toEqual([40, 60, 40])
  })

  test("what is left over goes to the fill columns, equally", () => {
    const one = arrangeSnapTable(three([{}, {}, FILL], { tableSize: { width: 300 } }), SCALE)
    expect(one.width).toBe(300)
    expect(geom(one).widths).toEqual([40, 60, 300 - 100 - 2 * GAP])
    const w = geom(three([FILL, {}, FILL], { tableSize: { width: 300 } })).widths
    expect(w[1]).toBe(60)
    expect(Math.abs(w[0] - w[2])).toBeLessThanOrEqual(1)
    expect(w[0] + w[1] + w[2] + 2 * GAP).toBe(300)
  })

  test("a fixed column beside a fill one keeps its size (E1): the user's table", () => {
    // 45.7 mm on the first column; the second fills.
    const t = table([box(40, 20, 0, 0), box(60, 20, 0, 1)], [{ mm: 45.7 }, FILL], [{}], { tableSize: { width: 500 } })
    const fixed = Math.round(45.7 * SCALE.pixelsPerMm)
    expect(geom(t).widths).toEqual([fixed, 500 - fixed - GAP])
    // Set to fill too, both are equal.
    const both = setLineState(arrangeSnapTable(t, SCALE), "column", 0, "fill", SCALE)
    const w = geom(both).widths
    expect(Math.abs(w[0] - w[1])).toBeLessThanOrEqual(1)
    expect(w[0] + w[1] + GAP).toBe(500)
  })

  test("all fixed or auto: the room stays empty at the right, the table as large as it was made (E2)", () => {
    const t = arrangeSnapTable(three([{ mm: 10 }, {}, { mm: 10 }], { tableSize: { width: 300 } }), SCALE)
    expect(geom(t).widths).toEqual([50, 60, 50])
    expect(t.width).toBe(300)
  })

  test("a share too small for one of them: all fill columns as wide as the widest, the table wider than its size", () => {
    const t = arrangeSnapTable(three([FILL, FILL, FILL], { tableSize: { width: 100 } }), SCALE)
    expect(geom(t).widths).toEqual([60, 60, 60])
    expect(t.width).toBe(180 + 2 * GAP)
  })

  test("stretched from outside - docked across, in a panel - the room is the table's width, not its own", () => {
    const t = three([{}, {}, FILL], { tableSize: { width: 500 } })
    expect(arrangeSnapTable(t, SCALE, 250).width).toBe(250)
    expect(geom(t, 250).widths).toEqual([40, 60, 250 - 100 - 2 * GAP])
    // Docked across, its own width is not asked for either.
    expect(arrangeSnapTable(three([{}, {}, FILL], { tableSize: { width: 500 }, dock: "top" }), SCALE).width).toBe(130 + 2 * GAP)
  })

  test("a span over a fill and an auto column asks its width of the last it covers (E4)", () => {
    const t = table([box(40, 20, 0, 0), box(60, 20, 0, 1), box(200, 20, 1, 0, { columnSpan: 2 })], [FILL, {}], [{}, {}])
    expect(geom(t).widths).toEqual([40, 200 - 40 - GAP])
  })

  test("rows: a height of its own goes to the fill rows", () => {
    const t = table([box(40, 20, 0, 0), box(40, 30, 1, 0)], [{}], [{}, FILL], { tableSize: { height: 200 } })
    const laid = arrangeSnapTable(t, SCALE)
    expect(laid.height).toBe(200)
    expect(snapTableGeometry(laid, SCALE).heights).toEqual([20, 200 - 20 - GAP])
  })

  test("a line pulled is fixed and no longer fill; pulled back, auto", () => {
    const pulled = setLineSize(three([{}, {}, FILL]), "column", 2, 12)
    expect(pulled.properties!.columns[2]).toEqual({ mm: 12 })
    expect(setLineSize(pulled, "column", 2, undefined).properties!.columns[2]).toEqual({})
    // Fixed from its sign: at the size it has.
    const laid = arrangeSnapTable(three([{}, {}, FILL], { tableSize: { width: 300 } }), SCALE)
    const fixed = setLineState(laid, "column", 2, "fixed", SCALE)
    expect(fixed.properties!.columns[2]).toEqual({ mm: (300 - 100 - 2 * GAP) / SCALE.pixelsPerMm })
  })

  test("laying out twice changes nothing", () => {
    const once = arrangeSnapTable(three([FILL, {}, FILL], { tableSize: { width: 301, height: 90 } }), SCALE)
    expect(arrangeSnapTable(once, SCALE)).toEqual(once)
  })
})

test.describe("a table has a size of its own", () => {
  test("the least it can be is what its columns and rows add up to", () => {
    const t = arrangeSnapTable(three([{}, {}, FILL], { tableSize: { width: 300, height: 100 } }), SCALE)
    expect(tableMinSize(t, SCALE)).toEqual({ width: 130 + 2 * GAP, height: 20 })
  })

  test("a width given to it is kept as its own; one no more than its content is none", () => {
    const t = arrangeSnapTable(three([{}, {}, FILL]), SCALE)
    expect(withTableSize(t, { width: 300 }, SCALE).properties!.tableSize).toEqual({ width: 300 })
    expect(withTableSize(t, { width: 300, height: 80 }, SCALE).properties!.tableSize).toEqual({ width: 300, height: 80 })
    // Only the axis that changed.
    expect(withTableSize(t, { width: t.width, height: 80 }, SCALE).properties!.tableSize).toEqual({ height: 80 })
    const wide = arrangeSnapTable({ ...t, properties: { ...t.properties, tableSize: { width: 300 } } }, SCALE)
    expect("tableSize" in withTableSize(wide, { width: 100 }, SCALE).properties!).toBe(false)
    // Nothing of a size in the updates: they are as they came.
    const other = { x: 5 }
    expect(withTableSize(t, other, SCALE)).toBe(other)
  })
})

test.describe("given more room, a table without a fill column gets one (decision 5)", () => {
  const area = (child: ScreenObject): ScreenObject => ({ id: "area", type: "free", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children: [child] }) as ScreenObject
  const columnsOf = (objects: ScreenObject[]) => objects[0].children![0].properties!.columns

  test("docked across: its last auto column is fill", () => {
    const t = three([{}, {}, {}])
    const next = [area({ ...t, properties: { ...t.properties, dock: "top" } })]
    expect(columnsOf(withFillWhereGivenRoom([area(t)], next))).toEqual([{}, {}, FILL])
  })

  test("the last column fixed: the last auto one before it", () => {
    const t = three([{}, {}, { mm: 10 }])
    const next = [area({ ...t, properties: { ...t.properties, dock: "fill" } })]
    expect(columnsOf(withFillWhereGivenRoom([area(t)], next))).toEqual([{}, FILL, { mm: 10 }])
  })

  test("a fill column there already, or none auto: nothing is set", () => {
    for (const columns of [[FILL, {}, {}], [{ mm: 10 }, { mm: 12 }, { mm: 10 }]]) {
      const t = three(columns)
      const next = [area({ ...t, properties: { ...t.properties, dock: "top" } })]
      expect(withFillWhereGivenRoom([area(t)], next)).toBe(next)
    }
  })

  test("docked Left or Right it is given no width", () => {
    const t = three([{}, {}, {}])
    const next = [area({ ...t, properties: { ...t.properties, dock: "left" } })]
    expect(withFillWhereGivenRoom([area(t)], next)).toBe(next)
  })

  test("it had the room before: a column set back to auto stays auto", () => {
    const docked = three([{}, {}, {}], { dock: "top" })
    const prev = [area({ ...docked, properties: { ...docked.properties, columns: [{}, {}, FILL] } })]
    const next = [area(docked)]
    expect(withFillWhereGivenRoom(prev, next)).toBe(next)
  })

  test("pulled wider, pulled taller: a column, a row", () => {
    const t = table([box(40, 20, 0, 0), box(40, 20, 1, 0)], [{}], [{}, {}])
    const wide = [{ ...t, properties: { ...t.properties, tableSize: { width: 200 } } }]
    expect(withFillWhereGivenRoom([t], wide)[0].properties).toMatchObject({ columns: [FILL], rows: [{}, {}] })
    const tall = [{ ...t, properties: { ...t.properties, tableSize: { height: 200 } } }]
    expect(withFillWhereGivenRoom([t], tall)[0].properties).toMatchObject({ columns: [{}], rows: [{}, FILL] })
  })

  test("put into a switcher's panel", () => {
    const t = three([{}, {}, {}])
    const switcher = (children: ScreenObject[]): ScreenObject =>
      ({ id: "sw", type: "switcher", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children: [{ id: "p", type: "panel", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children }] }) as ScreenObject
    const out = withFillWhereGivenRoom([switcher([]), t], [switcher([t])])
    expect(out[0].children![0].children![0].properties!.columns).toEqual([{}, {}, FILL])
  })
})

test.describe("an older project: what «Equal columns», «Width» and being stretched did is written on the columns", () => {
  const opened = (objects: ScreenObject[], settings: Record<string, any> = {}) => {
    const project = { screens: [{ id: "s", objects }], settings: { pixelsPerMm: 5, formatVersion: 3, ...settings } }
    migrateToAreas(project)
    return project
  }
  const first = (project: { screens: Array<{ objects: ScreenObject[] }> }) => project.screens[0].objects[0]

  test("the format is 4", () => {
    expect(FORMAT_VERSION).toBe(4)
    expect(opened([]).settings.formatVersion).toBe(4)
  })

  test("«Equal columns»: every column not fixed is fill", () => {
    const t = first(opened([three([{ mm: 10 }, {}, {}], { equalColumns: true })]))
    expect(t.properties).toMatchObject({ columns: [{ mm: 10 }, FILL, FILL] })
    expect("equalColumns" in t.properties!).toBe(false)
  })

  test("«Width»: the table's own size in pixels, its last column fill", () => {
    const t = first(opened([three([{}, {}, {}], { widthMm: 60 })]))
    expect(t.properties).toMatchObject({ columns: [{}, {}, FILL], tableSize: { width: 300 } })
    expect("widthMm" in t.properties!).toBe(false)
  })

  test("docked across, or standing in a panel: its last column fill, a size set on it gone", () => {
    const area = (child: ScreenObject): ScreenObject => ({ id: "area", type: "free", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children: [child] }) as ScreenObject
    for (const dock of ["top", "bottom", "fill"]) {
      expect(first(opened([area(three([{}, {}, { mm: 12 }], { dock }))])).children![0].properties!.columns, dock).toEqual([{}, {}, FILL])
    }
    expect(first(opened([area(three([{}, {}, {}], { dock: "left" }))])).children![0].properties!.columns).toEqual([{}, {}, {}])
    const switcher = { id: "sw", type: "switcher", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children: [{ id: "p", type: "panel", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children: [three([{}, {}, {}])] }] } as ScreenObject
    expect(first(opened([switcher])).children![0].children![0].properties!.columns).toEqual([{}, {}, FILL])
  })

  test("neither, and not stretched: as it was", () => {
    const t = three([{ mm: 10 }, {}, {}])
    expect(first(opened([t]))).toBe(t)
  })

  test("the layout comes to what it came to: «Width» with and without «Equal columns»", () => {
    // Before: 300 px wide, the last column taking the rest; or all sharing it.
    const last = arrangeSnapTable(first(opened([three([{}, {}, {}], { widthMm: 60 })])), SCALE)
    expect(geom(last).widths).toEqual([40, 60, 300 - 100 - 2 * GAP])
    const equal = geom(first(opened([three([{}, {}, {}], { widthMm: 60, equalColumns: true })]))).widths
    expect(equal.reduce((a, b) => a + b, 0) + 2 * GAP).toBe(300)
    // What rounding left went to the last of them, as it does.
    expect(equal).toEqual([94, 94, 96])
  })

  test("«Equal columns» on a table stretched across without a «Width» stays as it was drawn: as wide as the widest, the last taking the rest", () => {
    const area = (child: ScreenObject): ScreenObject => ({ id: "area", type: "free", x: 0, y: 0, width: 300, height: 100, zIndex: 1, properties: {}, children: [child] }) as ScreenObject
    const t = first(opened([area(three([{}, {}, {}], { equalColumns: true, dock: "fill" }))])).children![0]
    expect(t.properties).toMatchObject({ levelColumns: true, columns: [{}, {}, FILL] })
    const [laid] = layoutObjects([{ ...area(t) }], SCALE)
    expect(snapTableGeometry(laid.children![0], SCALE).widths).toEqual([60, 60, 300 - 120 - 2 * GAP])
  })
})
