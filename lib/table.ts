/**
 * The table (docs/2026-10-02-layout-tables.md, module table-model): laid
 * out like a Word table. Each object names its cell - row, column, spans -
 * in `properties.cell`, as WPF's Grid.Row/Grid.Column; x, y and width
 * follow from it, written by the layout pass because the canvas, the
 * renderers and the export read them. The designer's alone: an export
 * dissolves a table into absolute objects, as it did the containers.
 */

import type { ScreenObject } from "@/components/project-editor"
import { fills, fit, measured, minimumWidth, naturalWidth, spacing, type LayoutScale } from "@/lib/layout"
import { stepPx, type SizeStep } from "@/lib/size-scale"
import { deleteObjectById, findObjectById, findParentOf, updateObjectById } from "@/lib/object-tree"

export const TABLE_TYPE = "table"

/** The spacing between cells, fixed (the user, 2026-10-02). */
export const TABLE_GAP_MM = 1.5

/** An `auto` column with nothing it measures. */
export const EMPTY_AUTO_WIDTH = 20

/**
 * A column's width: as wide as its widest content; a share of what is left
 * after the `auto` and fixed columns (shares are taken in proportion); or
 * fixed, in millimetres or as a multiple of a size step's height. No
 * pixels: they would hold on one device only.
 */
export type ColumnWidth = "auto" | { share: number } | { mm: number } | { step: SizeStep; times: number }

/** Where an object stands across its cell; vertically it is centred. */
export type CellAlign = "start" | "centre" | "end" | "stretch"

export interface TableColumn {
  width: ColumnWidth
  align?: CellAlign
}

/** An object's place in its table, 0-based. */
export interface Cell {
  row: number
  column: number
  rowSpan?: number
  columnSpan?: number
  align?: CellAlign
}

/** What a new table is: a name and what goes with it (the spec, open question 2). */
export const DEFAULT_TABLE_COLUMNS: TableColumn[] = [{ width: "auto" }, { width: { share: 100 } }]

export function columnsOf(table: ScreenObject): TableColumn[] {
  const columns = table.properties?.columns
  return Array.isArray(columns) && columns.length > 0 && typeof columns[0] === "object" ? columns : DEFAULT_TABLE_COLUMNS
}

export function cellOf(obj: ScreenObject): Cell | undefined {
  const cell = obj.properties?.cell
  return cell && typeof cell.row === "number" && typeof cell.column === "number" ? cell : undefined
}

const spanOf = (cell: Cell) => ({ rows: Math.max(1, cell.rowSpan ?? 1), columns: Math.max(1, cell.columnSpan ?? 1) })

/**
 * A text whose words are only known on the device - a placeholder, a live
 * value - does not count for an `auto` column's width (the spec): what it
 * shows cannot be measured at design time.
 */
function measuresForAuto(obj: ScreenObject): boolean {
  if (obj.type === "live-text") return false
  if (obj.type === "text" && /\{[^{}]+\}/.test(String(obj.properties?.text ?? ""))) return false
  return true
}

/**
 * Every child with a cell: its own, or for one without (an old file, a
 * paste) the first empty cell in reading order, kept from then on.
 */
function withCells(children: ScreenObject[], columns: number): ScreenObject[] {
  const taken = new Set<string>()
  const mark = (cell: Cell) => {
    const span = spanOf(cell)
    for (let r = cell.row; r < cell.row + span.rows; r++)
      for (let c = cell.column; c < cell.column + span.columns; c++) taken.add(`${r}:${c}`)
  }
  for (const child of children) {
    const cell = cellOf(child)
    if (cell) mark(cell)
  }
  let next = 0
  return children.map((child) => {
    if (cellOf(child)) return child
    while (taken.has(`${Math.floor(next / columns)}:${next % columns}`)) next++
    const cell: Cell = { row: Math.floor(next / columns), column: next % columns }
    mark(cell)
    return { ...child, properties: { ...child.properties, cell } }
  })
}

function fixedWidth(width: ColumnWidth, scale: LayoutScale): number | undefined {
  if (typeof width !== "object") return undefined
  if ("mm" in width) return Math.round(width.mm * scale.pixelsPerMm)
  if ("step" in width) return Math.round(width.times * stepPx("control", width.step, scale.pixelsPerMm))
  return undefined
}

/** The columns' widths in `inner` pixels, the gaps between them taken. */
export function columnWidths(
  columns: TableColumn[],
  children: ScreenObject[],
  inner: number,
  gap: number,
  scale: LayoutScale,
): number[] {
  const widths = columns.map((column, c) => {
    const fixed = fixedWidth(column.width, scale)
    if (fixed !== undefined) return fixed
    if (column.width !== "auto") return 0
    const own = children.filter((child) => {
      const cell = cellOf(child)
      return cell && cell.column === c && spanOf(cell).columns === 1 && measuresForAuto(child)
    })
    return own.length > 0 ? Math.max(...own.map((child) => naturalWidth(child, scale))) : EMPTY_AUTO_WIDTH
  })
  // No column narrower than a control standing in it alone: a control is
  // never narrower than its labels (Checkpoint B), and a column that gave
  // it less would let it run into the next cell (found on the Knob at
  // Checkpoint A). Such a column takes what it needs; the other shares
  // divide what is left - as CSS's minmax(min-content, 1fr) does.
  const least = columns.map((_, c) =>
    Math.max(
      0,
      ...children
        .filter((child) => {
          const cell = cellOf(child)
          return cell && cell.column === c && spanOf(cell).columns === 1
        })
        .map((child) => minimumWidth(child, scale)),
    ),
  )
  const shares = columns.map((column) => (typeof column.width === "object" && "share" in column.width ? Math.max(0, column.width.share) : 0))
  const out = widths.map((w, c) => (shares[c] > 0 ? 0 : Math.max(w, least[c])))
  const open = new Set(shares.map((share, c) => (share > 0 ? c : -1)).filter((c) => c >= 0))
  for (;;) {
    const total = [...open].reduce((sum, c) => sum + shares[c], 0)
    const taken = out.reduce((sum, w, c) => sum + (open.has(c) ? 0 : w), 0)
    const rest = Math.max(0, inner - taken - Math.max(0, columns.length - 1) * gap)
    let raised = false
    for (const c of open) {
      const w = total > 0 ? Math.floor((rest * shares[c]) / total) : 0
      if (w < least[c]) {
        out[c] = least[c]
        open.delete(c)
        raised = true
      } else out[c] = w
    }
    if (!raised) break
  }
  return out
}

/** Where a table's columns and rows lie, in its own space: what the canvas draws its lines by. */
export interface TableGeometry {
  padding: number
  gap: number
  lefts: number[]
  widths: number[]
  tops: number[]
  heights: number[]
  /** How tall an empty row is: a size-S control's height. */
  emptyRow: number
}

function measure(table: ScreenObject, scale: LayoutScale) {
  const { padding } = spacing(table, scale)
  const gap = Math.round(TABLE_GAP_MM * scale.pixelsPerMm)
  const columns = columnsOf(table)
  const inner = Math.max(0, table.width - 2 * padding)
  const children = withCells(table.children ?? [], columns.length)
  const widths = columnWidths(columns, children, inner, gap, scale)
  const lefts = widths.map((_, c) => padding + widths.slice(0, c).reduce((sum, w) => sum + w + gap, 0))
  const cellWidth = (cell: Cell) => {
    const span = spanOf(cell)
    const last = Math.min(widths.length, cell.column + span.columns) - 1
    if (cell.column >= widths.length) return 0
    return lefts[last] + widths[last] - lefts[cell.column]
  }
  const alignOf = (cell: Cell): CellAlign => cell.align ?? columns[cell.column]?.align ?? "start"

  // Each object fitted to its cell's width: a stretcher across it, anything
  // else at its natural width - a control never narrower than its labels.
  const sized = children.map((child) => {
    const cell = cellOf(child)!
    const room = cellWidth(cell)
    const stretch = fills(child) || alignOf(cell) === "stretch"
    const width = Math.max(stretch ? room : Math.min(naturalWidth(child, scale), room), minimumWidth(child, scale))
    return { child: fit(child, width, scale), cell }
  })

  const used = sized.reduce((rows, { cell }) => Math.max(rows, cell.row + spanOf(cell).rows), 0)
  const rowCount = Math.max(typeof table.properties?.rows === "number" ? table.properties.rows : 0, used)
  const emptyRow = stepPx("control", "s", scale.pixelsPerMm)
  const heights = Array.from({ length: rowCount }, (_, r) => {
    const own = sized.filter(({ cell }) => cell.row === r && spanOf(cell).rows === 1)
    return own.length > 0 ? Math.max(...own.map(({ child }) => child.height)) : emptyRow
  })
  for (const { child, cell } of sized) {
    const span = spanOf(cell)
    if (span.rows === 1) continue
    const last = Math.min(rowCount, cell.row + span.rows) - 1
    const covered = heights.slice(cell.row, last + 1).reduce((a, b) => a + b, 0) + (last - cell.row) * gap
    if (child.height > covered) heights[last] += child.height - covered
  }
  const tops = heights.map((_, r) => padding + heights.slice(0, r).reduce((sum, h) => sum + h + gap, 0))
  return { padding, gap, widths, lefts, heights, tops, rowCount, emptyRow, sized, cellWidth, alignOf }
}

/** A table's columns and rows (its objects as they would be laid out). */
export function tableGeometry(table: ScreenObject, scale: LayoutScale): TableGeometry {
  const { padding, gap, lefts, widths, tops, heights, emptyRow } = measure(table, scale)
  return { padding, gap, lefts, widths, tops, heights, emptyRow }
}

/**
 * A table laid out: columns, then rows (each as tall as its tallest object
 * that spans no rows; an empty row a size-S control's height; an object
 * spanning rows makes its last one taller if it needs), each object placed
 * in its cell by alignment and centred vertically. As tall as its content;
 * the outermost keeps its size and says when content does not fit.
 */
export function arrangeTable(table: ScreenObject, scale: LayoutScale): ScreenObject {
  const { padding, gap, widths, lefts, heights, tops, rowCount, sized, cellWidth, alignOf } = measure(table, scale)
  const placed = sized.map(({ child, cell }) => {
    const span = spanOf(cell)
    const room = cellWidth(cell)
    const last = Math.min(rowCount, cell.row + span.rows) - 1
    const rowsHeight = tops[last] + heights[last] - tops[cell.row]
    const align = alignOf(cell)
    const dx = align === "centre" ? Math.round((room - child.width) / 2) : align === "end" ? room - child.width : 0
    return { ...child, x: (lefts[cell.column] ?? padding) + dx, y: tops[cell.row] + Math.round((rowsHeight - child.height) / 2) }
  })

  const contentHeight = rowCount > 0 ? tops[rowCount - 1] + heights[rowCount - 1] + padding : 2 * padding
  const contentWidth = Math.max(
    padding + widths.reduce((sum, w) => sum + w, 0) + Math.max(0, widths.length - 1) * gap + padding,
    ...placed.map((child) => child.x + child.width + padding),
  )
  return measured(table, placed, contentWidth, contentHeight)
}

// ---------------------------------------------------------------------------
// Migration: what layout Tasks 1-12 saved (docs/2026-10-02-layout.md) as
// tables, on load (lib/object-types.ts migrateProject), idempotent. A
// vertical stack is a table of one column, a horizontal stack one of one
// row, a grid one with its columns; a spacer leaves its cell empty; a group
// in a grid gives up its pieces to the grid's cells, as the grid placed
// them. Padding and gap settings go: the gap is fixed now.

const OLD_STACK = "vertical-stack"
const OLD_ROW = "horizontal-stack"
const OLD_GRID = "grid"
const OLD_SPACER = "spacer"
const isOld = (type: string | undefined) => type === OLD_STACK || type === OLD_ROW || type === OLD_GRID

const byStacking = (list: ScreenObject[] | undefined) => [...(list ?? [])].sort((a, b) => a.zIndex - b.zIndex)

const placedAt = (obj: ScreenObject, row: number, column: number): ScreenObject => {
  const { paddingMm: _p, gapMm: _g, ...properties } = obj.properties ?? {}
  return { ...obj, properties: { ...properties, cell: { row, column } } }
}

/** An old container's children as table cells, and the table's columns and rows. */
function asTable(
  type: string,
  properties: Record<string, any>,
  children: ScreenObject[],
): { columns: TableColumn[]; rows: number; children: ScreenObject[] } {
  const ordered = byStacking(children)
  if (type === OLD_STACK) {
    const align = properties.align && properties.align !== "start" ? { align: properties.align as CellAlign } : {}
    const cells = ordered.flatMap((child, i) => (child.type === OLD_SPACER ? [] : [placedAt(child, i, 0)]))
    return { columns: [{ width: { share: 100 }, ...align }], rows: ordered.length, children: cells }
  }
  if (type === OLD_ROW) {
    const fill = properties.distribute === "fill"
    const columns: TableColumn[] = ordered.map(() => ({ width: fill ? { share: 1 } : "auto" }))
    const cells = ordered.flatMap((child, i) => (child.type === OLD_SPACER ? [] : [placedAt(child, 0, i)]))
    return { columns, rows: ordered.length > 0 ? 1 : 0, children: cells }
  }
  // A grid, read as it placed its cells (lib/layout.ts arrangeGrid).
  const specs: Array<"auto" | number> = Array.isArray(properties.columns) && properties.columns.length > 0 ? properties.columns : ["auto", 1]
  const columns: TableColumn[] = specs.map((spec) => ({ width: spec === "auto" ? "auto" : { share: spec } }))
  const n = columns.length
  const cells: ScreenObject[] = []
  let row = 0
  let column = 0
  const advance = () => {
    column++
    if (column === n) {
      row++
      column = 0
    }
  }
  for (const child of ordered) {
    const pieces = child.type === "group" ? byStacking(child.children) : null
    if (pieces && pieces.length > 0) {
      if (column !== 0 && pieces.length > n - column) {
        row++
        column = 0
      }
      for (const piece of pieces) {
        if (piece.type !== OLD_SPACER) cells.push(placedAt(piece, row, column))
        advance()
      }
    } else {
      if (child.type !== OLD_SPACER) cells.push(placedAt(child, row, column))
      advance()
    }
  }
  return { columns, rows: row + (column > 0 ? 1 : 0), children: cells }
}

/** A list of objects with every old container in it - at any depth - a table. */
export function migrateObjectsToTables(objects: ScreenObject[]): ScreenObject[] {
  return objects.map((obj) => {
    const children = obj.children ? migrateObjectsToTables(obj.children) : undefined
    if (!isOld(obj.type)) return children === obj.children ? obj : { ...obj, children }
    const { paddingMm: _p, gapMm: _g, align: _a, distribute: _d, columns: _c, contentHeight: _h, contentWidth: _w, overflow: _o, ...rest } = obj.properties ?? {}
    const converted = asTable(obj.type, obj.properties ?? {}, children ?? [])
    return {
      ...obj,
      type: TABLE_TYPE,
      properties: { ...rest, columns: converted.columns, rows: converted.rows },
      children: converted.children,
    } as ScreenObject
  })
}

/**
 * A screen with its old root - a stack, a row, a grid, or «Two columns»'s
 * row of two stacks - as a table root, and its objects as the table's
 * cells. Changes the screen in place, as migrateProject does.
 */
export function migrateScreenToTables(screen: { layout?: { type: string; properties?: Record<string, any> }; objects?: ScreenObject[] }): void {
  const objects = migrateObjectsToTables(screen.objects ?? [])
  const layout = screen.layout
  if (!layout || !isOld(layout.type)) {
    screen.objects = objects
    return
  }
  // «Two columns» (layout Task 11): its two template stacks are the columns.
  const slots = byStacking(objects)
  if (layout.type === OLD_ROW && slots.length > 0 && slots.every((s) => s.properties?.layoutSlot === true)) {
    const children = slots.flatMap((slot, column) =>
      byStacking(slot.children).map((child, row) => ({
        ...child,
        x: child.x + slot.x,
        y: child.y + slot.y,
        properties: { ...child.properties, cell: { ...child.properties?.cell, row, column } },
      })),
    )
    const rows = Math.max(0, ...slots.map((slot) => (slot.children ?? []).length))
    screen.layout = { type: TABLE_TYPE, properties: { columns: slots.map(() => ({ width: { share: Math.round(100 / slots.length) } })), rows } }
    screen.objects = children
    return
  }
  const converted = asTable(layout.type, layout.properties ?? {}, objects)
  screen.layout = { type: TABLE_TYPE, properties: { columns: converted.columns, rows: converted.rows } }
  screen.objects = converted.children
}

/**
 * How wide a table needs to be: each column as wide as its widest content
 * (fixed columns their width, an empty `auto` column 20 px, an empty share
 * nothing), the gaps between. What an `auto` column measures when a table
 * stands in it - a block's icon and name, say.
 */
export function tableNaturalWidth(table: ScreenObject, scale: LayoutScale): number {
  const { padding } = spacing(table, scale)
  const gap = Math.round(TABLE_GAP_MM * scale.pixelsPerMm)
  const columns = columnsOf(table)
  const children = withCells(table.children ?? [], columns.length)
  const widths = columns.map((column, c) => {
    const fixed = fixedWidth(column.width, scale)
    if (fixed !== undefined) return fixed
    const own = children.filter((child) => {
      const cell = cellOf(child)
      return cell && cell.column === c && spanOf(cell).columns === 1 && measuresForAuto(child)
    })
    if (own.length > 0) return Math.max(...own.map((child) => naturalWidth(child, scale)))
    return column.width === "auto" ? EMPTY_AUTO_WIDTH : 0
  })
  return 2 * padding + widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * gap
}

// ---------------------------------------------------------------------------
// Drop targets (Task 4): where a click or a drag puts an object in a table.

/** A place in a table: a cell, or a new row at a row line. */
export interface TableDrop {
  /** The table's id; null for the screen's root. */
  tableId: string | null
  row: number
  column: number
  /** A new row is inserted at `row`, the rows from there moving down. */
  insertRow: boolean
  /** On the screen: the cell that lights up, or the line drawn thick. */
  rect?: { x: number; y: number; width: number; height: number }
  line?: { x1: number; y1: number; x2: number; y2: number }
}

interface Located {
  id: string | null
  origin: { x: number; y: number }
  table: ScreenObject
}

/** Every table on a screen with its top left corner, outer ones first. */
function tablesOn(
  objects: ScreenObject[],
  layout: { type: string; properties?: Record<string, any> } | undefined,
  area: { x: number; y: number; width: number; height: number },
): Located[] {
  const out: Located[] = []
  if (layout?.type === TABLE_TYPE) {
    out.push({
      id: null,
      origin: { x: area.x, y: area.y },
      table: {
        id: "screen-root",
        type: TABLE_TYPE,
        x: 0,
        y: 0,
        width: area.width,
        height: area.height,
        zIndex: 0,
        properties: { paddingMm: ROOT_PADDING_MM, ...layout.properties },
        children: objects,
      } as ScreenObject,
    })
  }
  const walk = (list: ScreenObject[], ox: number, oy: number) => {
    for (const obj of list) {
      const x = obj.type === "panel" ? ox : ox + obj.x
      const y = obj.type === "panel" ? oy : oy + obj.y
      if (obj.type === TABLE_TYPE) out.push({ id: obj.id, origin: { x, y }, table: obj })
      if (obj.children) walk(obj.children, x, y)
    }
  }
  walk(objects, 0, 0)
  return out
}

// The screen's root keeps its distance from the content area's edge
// (lib/layout.ts DEFAULT_PADDING_MM); spelt out here, as lib/layout.ts
// imports this module.
const ROOT_PADDING_MM = 2

/**
 * What a point means for a table under it, the innermost one: an empty
 * cell, the free row below the last, or a row line - within `tolerance`
 * pixels of it - for a new row there. An occupied cell takes nothing
 * (`{ blocked: true }`); outside every table, undefined.
 */
export function tableDropAt(
  objects: ScreenObject[],
  layout: { type: string; properties?: Record<string, any> } | undefined,
  area: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  scale: LayoutScale,
  tolerance = 4,
): TableDrop | { blocked: true } | undefined {
  let hit: { located: Located; g: TableGeometry; bottom: number } | undefined
  for (const located of tablesOn(objects, layout, area)) {
    const g = tableGeometry(located.table, scale)
    const { x, y } = located.origin
    const right = x + (g.widths.length > 0 ? g.lefts[g.widths.length - 1] + g.widths[g.widths.length - 1] : g.padding)
    const rowsBottom = y + (g.heights.length > 0 ? g.tops[g.heights.length - 1] + g.heights[g.heights.length - 1] : g.padding)
    const freeTop = g.heights.length > 0 ? rowsBottom + g.gap : y + g.padding
    const bottom = freeTop + g.emptyRow
    if (point.x >= x + g.padding && point.x <= right && point.y >= y + g.padding - tolerance && point.y <= bottom) {
      hit = { located, g, bottom }
    }
  }
  if (!hit) return undefined
  const { located, g } = hit
  const { x: ox, y: oy } = located.origin
  const half = g.gap / 2
  let column = g.widths.findIndex((w, c) => point.x <= ox + g.lefts[c] + w + half)
  if (column < 0) column = g.widths.length - 1
  const left = ox + g.padding
  const right = ox + g.lefts[g.widths.length - 1] + g.widths[g.widths.length - 1]
  const rows = g.heights.length
  const freeTop = rows > 0 ? oy + g.tops[rows - 1] + g.heights[rows - 1] + g.gap : oy + g.padding
  const boundary = (r: number) => (r === 0 ? oy + g.padding : r < rows ? oy + g.tops[r] - half : freeTop - half)
  const cellRect = (r: number) =>
    r < rows
      ? { x: ox + g.lefts[column], y: oy + g.tops[r], width: g.widths[column], height: g.heights[r] }
      : { x: ox + g.lefts[column], y: freeTop, width: g.widths[column], height: g.emptyRow }

  // A row line, but the one above the free row: that is the free row itself.
  for (let r = 0; r < rows; r++) {
    const y = boundary(r)
    if (Math.abs(point.y - y) <= tolerance + (r === 0 ? 0 : half)) {
      return { tableId: located.id, row: r, column, insertRow: true, line: { x1: left, y1: y, x2: right, y2: y } }
    }
  }
  if (point.y >= freeTop - half) return { tableId: located.id, row: rows, column, insertRow: false, rect: cellRect(rows) }
  const row = Math.max(0, g.tops.findIndex((top, r) => point.y <= oy + top + g.heights[r] + half))
  const children = withCells(located.table.children ?? [], columnsOf(located.table).length)
  const taken = children.some((child) => {
    const cell = cellOf(child)!
    const span = spanOf(cell)
    return row >= cell.row && row < cell.row + span.rows && column >= cell.column && column < cell.column + span.columns
  })
  if (taken) return { blocked: true }
  return { tableId: located.id, row, column, insertRow: false, rect: cellRect(row) }
}

/** A table's children with a new row at `row`: every one from there down moves down by one. */
export function insertRowAt(children: ScreenObject[], row: number): ScreenObject[] {
  return children.map((child) => {
    const cell = cellOf(child)
    if (!cell) return child
    if (cell.row >= row) return { ...child, properties: { ...child.properties, cell: { ...cell, row: cell.row + 1 } } }
    if (cell.row + spanOf(cell).rows > row) {
      return { ...child, properties: { ...child.properties, cell: { ...cell, rowSpan: spanOf(cell).rows + 1 } } }
    }
    return child
  })
}

// ---------------------------------------------------------------------------
// Moving (Task 5): objects to a cell or a new row.

const covers = (cell: Cell, row: number, column: number) => {
  const span = spanOf(cell)
  return row >= cell.row && row < cell.row + span.rows && column >= cell.column && column < cell.column + span.columns
}

/**
 * The screen's objects with `ids` moved to the table cell `drop` names, or
 * null when a cell they would take is someone else's. Several from one
 * table keep their cells relative to each other; from anywhere else they go
 * one under another in the drop's column. A row line makes as many rows as
 * they need. The screen's root table's `rows` comes back in `layout`.
 */
export function moveIntoTable<L extends { type: string; properties?: Record<string, any> } | undefined>(
  objects: ScreenObject[],
  layout: L,
  ids: readonly string[],
  drop: TableDrop,
): { objects: ScreenObject[]; layout: L } | null {
  const moving = ids.map((id) => findObjectById(objects, id)).filter((o): o is ScreenObject => !!o)
  if (moving.length === 0) return null
  const parents = new Set(moving.map((o) => findParentOf(objects, o.id)?.parent?.id ?? null))
  const fromOneTable = parents.size === 1 && moving.every((o) => cellOf(o))
  const ordered = fromOneTable
    ? [...moving].sort((a, b) => cellOf(a)!.row - cellOf(b)!.row || cellOf(a)!.column - cellOf(b)!.column)
    : [...moving].sort((a, b) => a.y - b.y || a.x - b.x)
  const anchor = fromOneTable ? cellOf(ordered[0])! : undefined
  const targets = ordered.map((o, i): Cell => {
    if (!anchor) return { row: drop.row + i, column: drop.column }
    const own = cellOf(o)!
    const { align: _align, ...rest } = own
    return { ...rest, ...(own.align ? { align: own.align } : {}), row: drop.row + own.row - anchor.row, column: drop.column + own.column - anchor.column }
  })
  if (targets.some((t) => t.row < 0 || t.column < 0)) return null
  const extraRows = drop.insertRow ? Math.max(...targets.map((t) => t.row + spanOf(t).rows)) - drop.row : 0

  let rest = objects
  for (const o of ordered) rest = deleteObjectById(rest, o.id)

  const into = (children: ScreenObject[]): ScreenObject[] | null => {
    let room = children
    for (let i = 0; i < extraRows; i++) room = insertRowAt(room, drop.row)
    for (const target of targets) {
      const span = spanOf(target)
      for (let r = target.row; r < target.row + span.rows; r++)
        for (let c = target.column; c < target.column + span.columns; c++)
          if (room.some((child) => cellOf(child) && covers(cellOf(child)!, r, c))) return null
    }
    let z = Math.max(0, ...room.map((o) => o.zIndex))
    return [...room, ...ordered.map((o, i) => ({ ...o, zIndex: ++z, properties: { ...o.properties, cell: targets[i] } }))]
  }
  const grow = (properties: Record<string, any> | undefined) =>
    extraRows > 0 && typeof properties?.rows === "number" ? { ...properties, rows: properties.rows + extraRows } : properties

  if (drop.tableId === null) {
    const next = into(rest)
    if (!next) return null
    return { objects: next, layout: (layout ? { ...layout, properties: grow(layout.properties) } : layout) as L }
  }
  const table = findObjectById(rest, drop.tableId)
  if (!table) return null
  const children = into(table.children ?? [])
  if (!children) return null
  return { objects: updateObjectById(rest, drop.tableId, { children, properties: grow(table.properties) }), layout }
}

// ---------------------------------------------------------------------------
// Column lines (Task 6).

const MIN_DRAGGED_COLUMN = 10

/**
 * The columns after the line before column `index` was dragged by `delta`
 * pixels, from `widths` as they were laid out: the two columns beside it
 * become shares in the widths the drag leaves, every other share keeps its
 * width, all shares in percent of their total; fixed and `auto` columns
 * further away stay as they are.
 */
export function dragColumnLine(columns: TableColumn[], widths: number[], index: number, delta: number): TableColumn[] {
  const left = index - 1
  if (left < 0 || index >= columns.length) return columns
  const pair = widths[left] + widths[index]
  const leftWidth = Math.min(pair - MIN_DRAGGED_COLUMN, Math.max(MIN_DRAGGED_COLUMN, widths[left] + delta))
  const next = widths.map((w, c) => (c === left ? leftWidth : c === index ? pair - leftWidth : w))
  const isShare = (c: number) => c === left || c === index || (typeof columns[c].width === "object" && "share" in (columns[c].width as object))
  const total = next.reduce((sum, w, c) => sum + (isShare(c) ? w : 0), 0)
  return columns.map((column, c) =>
    isShare(c) ? { ...column, width: { share: Math.round((1000 * next[c]) / total) / 10 } } : column,
  )
}
