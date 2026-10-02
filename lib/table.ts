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
  const shares = columns.map((column) => (typeof column.width === "object" && "share" in column.width ? Math.max(0, column.width.share) : 0))
  const total = shares.reduce((a, b) => a + b, 0)
  const rest = Math.max(0, inner - widths.reduce((a, b) => a + b, 0) - Math.max(0, columns.length - 1) * gap)
  return widths.map((w, c) => (shares[c] > 0 && total > 0 ? Math.floor((rest * shares[c]) / total) : w))
}

/**
 * A table laid out: columns, then rows (each as tall as its tallest object
 * that spans no rows; an empty row a size-S control's height; an object
 * spanning rows makes its last one taller if it needs), each object placed
 * in its cell by alignment and centred vertically. As tall as its content;
 * the outermost keeps its size and says when content does not fit.
 */
export function arrangeTable(table: ScreenObject, scale: LayoutScale): ScreenObject {
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
