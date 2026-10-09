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

export interface SnapCell {
  row: number
  column: number
  rowSpan?: number
  columnSpan?: number
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
  const props = child.properties ?? {}
  return {
    ...child,
    width: typeof props.drawnWidth === "number" ? props.drawnWidth : child.width,
    height: typeof props.drawnHeight === "number" ? props.drawnHeight : child.height,
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
    const fill: SnapFill = child.properties?.fill ?? {}
    const own = drawn(child)
    const sizedChild = fill.width ? fit(own, room, scale) : size
    const width = fill.width ? room : sizedChild.width
    const height = fill.height ? roomHeight : sizedChild.height
    const align: SnapAlign = child.properties?.align ?? (roleOf(child) === "label" ? "left" : "center")
    const alignY: SnapAlignY = child.properties?.alignY ?? "middle"
    const dx = align === "left" ? 0 : align === "right" ? room - width : Math.round((room - width) / 2)
    const dy = alignY === "top" ? 0 : alignY === "bottom" ? roomHeight - height : Math.round((roomHeight - height) / 2)
    // The drawn size kept while filled, dropped once it is not.
    const { drawnWidth: _w, drawnHeight: _h, ...rest } = sizedChild.properties ?? {}
    const properties: Record<string, any> = { ...rest }
    if (fill.width) properties.drawnWidth = own.width
    if (fill.height) properties.drawnHeight = own.height
    return { ...sizedChild, width, height, properties, x: lefts[cell.column] + dx, y: tops[cell.row] + dy }
  })
  const total = (sizes: number[]) => (sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) + (sizes.length - 1) * gap : 0)
  return { ...table, width: total(widths), height: total(heights), children: placed }
}
