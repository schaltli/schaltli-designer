/**
 * The table put together by snapping (docs/2026-10-09-snap-tables.md,
 * module snap-table-model).
 *
 * A flat grid that forms when two objects snap together: each object stands
 * in the cell it names, a cell holds one object, no table sits in a table.
 * A column is as wide as the widest object that spans it alone, a row as
 * tall as the tallest; a width or height set by hand (in millimetres) can
 * raise that, never lower it, so a column can be kept wide for a name that
 * arrives longer on the device. An object spanning several columns or rows
 * does not count for them; when it does not fit, the last of them grows.
 *
 * It lives beside the old table (lib/table.ts) until module
 * old-table-removal; `properties.grid = 1` tells the two apart. Pure: no
 * React, no project.
 */

import type { ScreenObject } from "@/components/project-editor"
import { fit, naturalWidth, type LayoutScale } from "@/lib/layout"

/** What marks a table as this kind. */
export const SNAP_GRID = 1
/** The gap between columns and between rows - the old table's 1.5 mm. */
export const SNAP_GAP_MM = 1.5
/** How large a column or row is with nothing of its own in it. */
export const SNAP_EMPTY_MM = 4

/**
 * Where an object stands in its table, and how: everything about its place
 * lives in `properties.cell`, so an object's own properties (a text's
 * textAlign, a box's colours) never meet it, and taking `cell` away frees the
 * object of its table entirely.
 */
export interface SnapCell {
  row: number
  column: number
  rowSpan?: number
  columnSpan?: number
  align?: SnapAlign
  alignY?: SnapAlignY
  fill?: SnapFill
  /** The drawn size, kept while Fill overwrites it. */
  drawnWidth?: number
  drawnHeight?: number
}
export type SnapAlign = "left" | "center" | "right"
export type SnapAlignY = "top" | "middle" | "bottom"
export interface SnapFill {
  width?: true
  height?: true
}
/** A column or row; `mm` is a size set by hand. */
export interface SnapLine {
  mm?: number
}
/** What a column holds, from what its objects are. */
export type SnapRole = "icon" | "label" | "control"

export function isSnapTable(obj: ScreenObject | undefined): boolean {
  return obj?.type === "table" && obj.properties?.grid === SNAP_GRID
}

export function roleOf(obj: ScreenObject): SnapRole {
  if (obj.type === "icon" || obj.type === "live-icon") return "icon"
  if (obj.type === "text") return "label"
  return "control"
}

export function snapCellOf(obj: ScreenObject): SnapCell {
  const cell = obj.properties?.cell ?? {}
  return {
    ...cell,
    row: Math.max(0, Number(cell.row) || 0),
    column: Math.max(0, Number(cell.column) || 0),
    rowSpan: Math.max(1, Number(cell.rowSpan) || 1),
    columnSpan: Math.max(1, Number(cell.columnSpan) || 1),
  }
}

export function snapColumnsOf(table: ScreenObject): SnapLine[] {
  return Array.isArray(table.properties?.columns) ? table.properties!.columns : []
}
export function snapRowsOf(table: ScreenObject): SnapLine[] {
  return Array.isArray(table.properties?.rows) ? table.properties!.rows : []
}

/** Which object fills each cell, its span included; null for an empty cell. */
export function occupancy(table: ScreenObject): (string | null)[][] {
  const { rows, columns } = dimensions(table)
  const grid: (string | null)[][] = Array.from({ length: rows }, () => Array<string | null>(columns).fill(null))
  for (const child of table.children ?? []) {
    const cell = snapCellOf(child)
    for (let r = cell.row; r < Math.min(rows, cell.row + cell.rowSpan!); r++)
      for (let c = cell.column; c < Math.min(columns, cell.column + cell.columnSpan!); c++) grid[r][c] = child.id
  }
  return grid
}

/** How many rows and columns: as many as listed, and as many as the objects reach. */
export function dimensions(table: ScreenObject): { rows: number; columns: number } {
  let rows = snapRowsOf(table).length
  let columns = snapColumnsOf(table).length
  for (const child of table.children ?? []) {
    const cell = snapCellOf(child)
    rows = Math.max(rows, cell.row + cell.rowSpan!)
    columns = Math.max(columns, cell.column + cell.columnSpan!)
  }
  return { rows, columns }
}

/** Where a table's columns and rows lie, in its own space. */
export interface SnapGeometry {
  gap: number
  lefts: number[]
  widths: number[]
  tops: number[]
  heights: number[]
  /** Each column's and row's size from its content alone, before a size set by hand. */
  naturalWidths: number[]
  naturalHeights: number[]
}

const px = (mm: number, scale: LayoutScale) => Math.round(mm * scale.pixelsPerMm)

// An object as drawn: Fill overwrites its width or height with its cell's,
// so the drawn size is kept beside it - read back here, or the next layout
// pass would take the filled size for the natural one and the column would
// grow on every change.
function drawn(child: ScreenObject): ScreenObject {
  const cell = snapCellOf(child)
  return {
    ...child,
    width: typeof cell.drawnWidth === "number" ? cell.drawnWidth : child.width,
    height: typeof cell.drawnHeight === "number" ? cell.drawnHeight : child.height,
  }
}

// Each object at its natural size: a control as wide as its labels, a text
// as its words, anything else as it is drawn; a switcher or a ring with the
// height that width gives it.
function natural(child: ScreenObject, scale: LayoutScale): ScreenObject {
  const own = drawn(child)
  return fit(own, naturalWidth(own, scale), scale)
}

function measure(table: ScreenObject, scale: LayoutScale) {
  const { rows, columns } = dimensions(table)
  const gap = px(SNAP_GAP_MM, scale)
  const empty = px(SNAP_EMPTY_MM, scale)
  const sized = (table.children ?? []).map((child) => ({ child, cell: snapCellOf(child), size: natural(child, scale) }))

  const naturalWidths = Array.from({ length: columns }, (_, c) => {
    const own = sized.filter(({ cell }) => cell.column === c && cell.columnSpan === 1)
    return own.length > 0 ? Math.max(...own.map(({ size }) => size.width)) : empty
  })
  const naturalHeights = Array.from({ length: rows }, (_, r) => {
    const own = sized.filter(({ cell }) => cell.row === r && cell.rowSpan === 1)
    return own.length > 0 ? Math.max(...own.map(({ size }) => size.height)) : empty
  })
  const byHand = (lines: SnapLine[], i: number) => (typeof lines[i]?.mm === "number" ? px(lines[i].mm!, scale) : 0)
  const widths = naturalWidths.map((w, c) => Math.max(w, byHand(snapColumnsOf(table), c)))
  const heights = naturalHeights.map((h, r) => Math.max(h, byHand(snapRowsOf(table), r)))

  // A span that does not fit makes the last line it covers larger.
  const across = (sizes: number[], from: number, count: number) => sizes.slice(from, from + count).reduce((a, b) => a + b, 0) + (count - 1) * gap
  for (const { cell, size } of sized) {
    if (cell.columnSpan! > 1) {
      const have = across(widths, cell.column, cell.columnSpan!)
      if (size.width > have) widths[cell.column + cell.columnSpan! - 1] += size.width - have
    }
    if (cell.rowSpan! > 1) {
      const have = across(heights, cell.row, cell.rowSpan!)
      if (size.height > have) heights[cell.row + cell.rowSpan! - 1] += size.height - have
    }
  }
  const starts = (sizes: number[]) => sizes.map((_, i) => sizes.slice(0, i).reduce((sum, s) => sum + s + gap, 0))
  return { gap, widths, heights, lefts: starts(widths), tops: starts(heights), naturalWidths, naturalHeights, sized, across }
}

export function snapTableGeometry(table: ScreenObject, scale: LayoutScale): SnapGeometry {
  const { gap, lefts, widths, tops, heights, naturalWidths, naturalHeights } = measure(table, scale)
  return { gap, lefts, widths, tops, heights, naturalWidths, naturalHeights }
}

/**
 * A table laid out: each object placed in its cell (or span) by its
 * alignment - a text left, everything else centred, all vertically centred
 * unless set - at its natural size, or across the cell where it fills it.
 * Children's coordinates are relative to the table, as every container's
 * are, so the export dissolves it like any other. The table keeps its
 * place and is as large as its content.
 */
export function arrangeSnapTable(table: ScreenObject, scale: LayoutScale): ScreenObject {
  const { gap, widths, heights, lefts, tops, sized, across } = measure(table, scale)
  const placed = sized.map(({ child, cell, size }) => {
    const room = across(widths, cell.column, cell.columnSpan!)
    const roomHeight = across(heights, cell.row, cell.rowSpan!)
    const fill: SnapFill = cell.fill ?? {}
    const own = drawn(child)
    const sizedChild = fill.width ? fit(own, room, scale) : size
    const width = fill.width ? room : sizedChild.width
    const height = fill.height ? roomHeight : sizedChild.height
    const align: SnapAlign = cell.align ?? (roleOf(child) === "label" ? "left" : "center")
    const alignY: SnapAlignY = cell.alignY ?? "middle"
    const dx = align === "left" ? 0 : align === "right" ? room - width : Math.round((room - width) / 2)
    const dy = alignY === "top" ? 0 : alignY === "bottom" ? roomHeight - height : Math.round((roomHeight - height) / 2)
    // The drawn size kept while filled, dropped once it is not.
    const { drawnWidth: _w, drawnHeight: _h, ...kept } = child.properties?.cell ?? {}
    const placedCell: Record<string, any> = { ...kept }
    if (fill.width) placedCell.drawnWidth = own.width
    if (fill.height) placedCell.drawnHeight = own.height
    const properties = { ...sizedChild.properties, cell: placedCell }
    return { ...sizedChild, width, height, properties, x: lefts[cell.column] + dx, y: tops[cell.row] + dy }
  })
  const total = (sizes: number[]) => (sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) + (sizes.length - 1) * gap : 0)
  return { ...table, width: total(widths), height: total(heights), children: placed }
}

// ---------------------------------------------------------------------------
// Editing. Every operation returns a new table and leaves its argument as it
// was. Coordinates of a table and of free objects are in the space the
// table stands in (a screen, a panel, a free area); a table's children are
// relative to it, as laid out last.

export type SnapSide = "left" | "right" | "top" | "bottom"

// An object moved to another place in its table; how it stands there
// (align, fill, drawn size) goes with it.
const withCell = (obj: ScreenObject, cell: SnapCell): ScreenObject => {
  const { rowSpan: _r, columnSpan: _c, ...how } = obj.properties?.cell ?? {}
  const clean: Record<string, any> = { ...how, row: cell.row, column: cell.column }
  if ((cell.rowSpan ?? 1) > 1) clean.rowSpan = cell.rowSpan!
  if ((cell.columnSpan ?? 1) > 1) clean.columnSpan = cell.columnSpan!
  return { ...obj, properties: { ...obj.properties, cell: clean } }
}

// The lists of columns and rows as long as the table is, so an index into
// them always means a line.
function padded(table: ScreenObject): ScreenObject {
  const { rows, columns } = dimensions(table)
  const pad = (lines: SnapLine[], n: number) => [...lines.map((line) => ({ ...line })), ...Array.from({ length: Math.max(0, n - lines.length) }, () => ({}))]
  return { ...table, properties: { ...table.properties, grid: SNAP_GRID, columns: pad(snapColumnsOf(table), columns), rows: pad(snapRowsOf(table), rows) } }
}

// A line inserted at `at`: what stands at or after it moves on by one, a
// span across it grows by one.
function insertLine(table: ScreenObject, at: number, kind: "row" | "column"): ScreenObject {
  const t = padded(table)
  const key = kind === "row" ? "rows" : "columns"
  const lines: SnapLine[] = [...t.properties![key]]
  lines.splice(Math.min(at, lines.length), 0, {})
  const children = (t.children ?? []).map((child) => {
    const cell = snapCellOf(child)
    const start = kind === "row" ? cell.row : cell.column
    const span = kind === "row" ? cell.rowSpan! : cell.columnSpan!
    if (start >= at) return withCell(child, kind === "row" ? { ...cell, row: start + 1 } : { ...cell, column: start + 1 })
    if (at < start + span) return withCell(child, kind === "row" ? { ...cell, rowSpan: span + 1 } : { ...cell, columnSpan: span + 1 })
    return child
  })
  return { ...t, children, properties: { ...t.properties, [key]: lines } }
}

export const insertSnapColumn = (table: ScreenObject, at: number) => insertLine(table, at, "column")
export const insertSnapRow = (table: ScreenObject, at: number) => insertLine(table, at, "row")

/** `obj` put into the cell at `row`, `column`, which the caller has found empty. */
export function placeInCell(table: ScreenObject, obj: ScreenObject, row: number, column: number): ScreenObject {
  const t = padded(table)
  return padded({ ...t, children: [...(t.children ?? []), withCell(obj, { row, column })] })
}

/** A column's width or a row's height set by hand, in millimetres; undefined makes it automatic again. */
export function setLineSize(table: ScreenObject, kind: "row" | "column", index: number, mm: number | undefined): ScreenObject {
  const t = padded(table)
  const key = kind === "row" ? "rows" : "columns"
  const lines: SnapLine[] = t.properties![key].map((line: SnapLine, i: number) => {
    if (i !== index) return line
    const { mm: _old, ...rest } = line
    return mm === undefined ? rest : { ...rest, mm }
  })
  return { ...t, properties: { ...t.properties, [key]: lines } }
}

// Rows and columns that hold nothing, not even part of a span, taken out.
function tidied(table: ScreenObject): ScreenObject {
  let t = padded(table)
  for (const kind of ["row", "column"] as const) {
    const grid = occupancy(t)
    const count = kind === "row" ? grid.length : (grid[0]?.length ?? 0)
    const used = Array.from({ length: count }, (_, i) => (kind === "row" ? grid[i].some(Boolean) : grid.some((row) => row[i] !== null)))
    const shift = (i: number) => used.slice(0, i).filter((u) => !u).length
    const key = kind === "row" ? "rows" : "columns"
    t = {
      ...t,
      properties: { ...t.properties, [key]: (t.properties![key] as SnapLine[]).filter((_, i) => used[i]) },
      children: (t.children ?? []).map((child) => {
        const cell = snapCellOf(child)
        return withCell(child, kind === "row" ? { ...cell, row: cell.row - shift(cell.row) } : { ...cell, column: cell.column - shift(cell.column) })
      }),
    }
  }
  return t
}

// An object out of its table: where it stood on the screen, as drawn, with
// nothing left of its place in the table.
function freed(table: ScreenObject, child: ScreenObject): ScreenObject {
  const { cell: _cell, ...properties } = child.properties ?? {}
  const own = drawn(child)
  return { ...child, x: table.x + child.x, y: table.y + child.y, width: own.width, height: own.height, properties }
}

/**
 * An object taken out of a laid-out table: its cell left empty, rows and
 * columns that hold nothing any more removed. `table` is null when nothing is
 * left; a table left with one object dissolves into it (`left`).
 */
export function takeOutOf(table: ScreenObject, id: string): { table: ScreenObject | null; taken: ScreenObject; left?: ScreenObject } {
  const taken = (table.children ?? []).find((child) => child.id === id)
  if (!taken) throw new Error(`no object ${id} in table ${table.id}`)
  const rest = (table.children ?? []).filter((child) => child.id !== id)
  if (rest.length === 0) return { table: null, taken: freed(table, taken) }
  if (rest.length === 1) return { table: null, taken: freed(table, taken), left: freed(table, rest[0]) }
  return { table: tidied({ ...table, children: rest }), taken: freed(table, taken) }
}

/**
 * An object's span moved at one edge to the line `index` (a column for left
 * and right, a row for top and bottom), at least one cell, never past the
 * table's edge. Null when a cell it would take is occupied.
 */
export function resizeSpan(table: ScreenObject, id: string, side: SnapSide, index: number): ScreenObject | null {
  const t = padded(table)
  const target = (t.children ?? []).find((child) => child.id === id)
  if (!target) return null
  const { rows, columns } = dimensions(t)
  let { row, column, rowSpan, columnSpan } = snapCellOf(target)
  const lastColumn = column + columnSpan! - 1
  const lastRow = row + rowSpan! - 1
  if (side === "right") columnSpan = Math.max(column, Math.min(columns - 1, index)) - column + 1
  if (side === "bottom") rowSpan = Math.max(row, Math.min(rows - 1, index)) - row + 1
  if (side === "left") {
    column = Math.min(lastColumn, Math.max(0, index))
    columnSpan = lastColumn - column + 1
  }
  if (side === "top") {
    row = Math.min(lastRow, Math.max(0, index))
    rowSpan = lastRow - row + 1
  }
  const grid = occupancy(t)
  for (let r = row; r < row + rowSpan!; r++) for (let c = column; c < column + columnSpan!; c++) if (grid[r][c] !== null && grid[r][c] !== id) return null
  // Not tidied: a column a shrinking span leaves empty stays while the
  // pointer is still on it; only taking an object out removes lines.
  return { ...t, children: (t.children ?? []).map((child) => (child.id === id ? withCell(child, { row, column, rowSpan, columnSpan }) : child)) }
}

// A laid-out table moved so that the object `id` stands at `x`, `y` in the
// table's space.
function anchored(table: ScreenObject, id: string, x: number, y: number): ScreenObject {
  const child = (table.children ?? []).find((c) => c.id === id)
  if (!child) return table
  return { ...table, x: x - child.x, y: y - child.y }
}

/**
 * `after` laid out and moved so that the first object it shares with the
 * laid-out `before` stays where it stood: a table grows to the left or up
 * around what was already there, never shifting it.
 */
export function keepInPlace(before: ScreenObject, after: ScreenObject, scale: LayoutScale): ScreenObject {
  const laid = arrangeSnapTable(after, scale)
  const ids = new Set((laid.children ?? []).map((c) => c.id))
  const anchor = (before.children ?? []).find((c) => ids.has(c.id))
  return anchor ? anchored(laid, anchor.id, before.x + anchor.x, before.y + anchor.y) : laid
}

/** Two free objects as a table: `moving` at `side` of `still`, which keeps its place. */
export function snapPair(still: ScreenObject, moving: ScreenObject, side: SnapSide, scale: LayoutScale): ScreenObject {
  const along = side === "left" || side === "right"
  const first = side === "left" || side === "top" ? moving : still
  const second = first === moving ? still : moving
  const at = (obj: ScreenObject, i: number) => withCell({ ...obj, x: 0, y: 0 }, along ? { row: 0, column: i } : { row: i, column: 0 })
  const table: ScreenObject = {
    id: `table-${still.id}`,
    type: "table",
    x: still.x,
    y: still.y,
    width: 1,
    height: 1,
    zIndex: still.zIndex,
    properties: { grid: SNAP_GRID, columns: along ? [{}, {}] : [{}], rows: along ? [{}] : [{}, {}] },
    children: [at(first, 0), at(second, 1)],
  }
  return anchored(arrangeSnapTable(table, scale), still.id, still.x, still.y)
}

/** Where a drop at a point would go in a table. */
export type SnapTarget =
  | { kind: "cell"; row: number; column: number }
  | { kind: "column"; at: number; row: number }
  | { kind: "row"; at: number; column: number }

// Which line a coordinate falls on, the gap split between its neighbours.
function lineAt(starts: number[], gap: number, v: number): number {
  let i = 0
  while (i < starts.length - 1 && v >= starts[i + 1] - gap / 2) i++
  return i
}

/**
 * The drop target in a laid-out table for a point in the table's space,
 * within `zone` pixels of it: an empty cell; else the nearest edge of the
 * occupied cell (or span) under it, as a new column or row; outside the
 * table, a new first or last column or row. `skip` is an object being
 * dragged out, its cells counting as empty. Null when the point is too far.
 */
export function snapTargetAt(table: ScreenObject, point: { x: number; y: number }, zone: number, scale: LayoutScale, skip?: string): SnapTarget | null {
  const lx = point.x - table.x
  const ly = point.y - table.y
  if (lx < -zone || ly < -zone || lx > table.width + zone || ly > table.height + zone) return null
  const g = snapTableGeometry(table, scale)
  const inX = lx >= 0 && lx < table.width
  const inY = ly >= 0 && ly < table.height
  const column = lineAt(g.lefts, g.gap, lx)
  const row = lineAt(g.tops, g.gap, ly)
  if (!inX && inY) return { kind: "column", at: lx < 0 ? 0 : g.widths.length, row }
  if (inX && !inY) return { kind: "row", at: ly < 0 ? 0 : g.heights.length, column }
  if (!inX && !inY) return null
  const grid = occupancy(table)
  const id = grid[row]?.[column]
  if (id === null || id === undefined || id === skip) return { kind: "cell", row, column }
  const cell = snapCellOf((table.children ?? []).find((c) => c.id === id)!)
  const left = g.lefts[cell.column]
  const top = g.tops[cell.row]
  const right = g.lefts[cell.column + cell.columnSpan! - 1] + g.widths[cell.column + cell.columnSpan! - 1]
  const bottom = g.tops[cell.row + cell.rowSpan! - 1] + g.heights[cell.row + cell.rowSpan! - 1]
  const fx = Math.min(1, Math.max(0, (lx - left) / Math.max(1, right - left)))
  const fy = Math.min(1, Math.max(0, (ly - top) / Math.max(1, bottom - top)))
  const nearest = Math.min(fx, 1 - fx, fy, 1 - fy)
  if (nearest === fx) return { kind: "column", at: cell.column, row }
  if (nearest === 1 - fx) return { kind: "column", at: cell.column + cell.columnSpan!, row }
  if (nearest === fy) return { kind: "row", at: cell.row, column }
  return { kind: "row", at: cell.row + cell.rowSpan!, column }
}

/** The side of a free object a drop at a point goes to; null when the point is not within `zone` of it. */
export function freeSideAt(obj: ScreenObject, point: { x: number; y: number }, zone: number): SnapSide | null {
  if (point.x < obj.x - zone || point.y < obj.y - zone || point.x > obj.x + obj.width + zone || point.y > obj.y + obj.height + zone) return null
  const fx = (point.x - obj.x) / Math.max(1, obj.width)
  const fy = (point.y - obj.y) / Math.max(1, obj.height)
  const distances: Array<[SnapSide, number]> = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ]
  return distances.reduce((best, next) => (next[1] < best[1] ? next : best))[0]
}
