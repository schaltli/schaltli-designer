/**
 * What the canvas draws for a table put together by snapping
 * (docs/2026-10-09-snap-tables.md, module snap-table-canvas): its cells
 * while it is worked on, and the chip that names the selection. The old
 * table draws itself in table-overlay.ts until module old-table-removal.
 *
 * Everything is drawn in screen pixels and divided by the zoom for line
 * widths and type, so it keeps its size however far one zooms.
 */

import type { ScreenObject } from "@/components/project-editor"
import { objectTypeLabel } from "@/lib/object-types"
import { occupancy, snapCellOf, type SnapGeometry } from "@/lib/snap-table"

/**
 * The table's cells, dashed and faint: each object's cell or span, and each
 * empty cell - so its columns, rows and gaps show while it is selected or
 * open, and nowhere else (the preview and the device show no lines).
 */
export function drawSnapTableCells(ctx: CanvasRenderingContext2D, origin: { x: number; y: number }, table: ScreenObject, g: SnapGeometry, color: string, zoom: number): void {
  const grid = occupancy(table)
  const rect = (row: number, column: number, rows: number, columns: number) => {
    const right = g.lefts[column + columns - 1] + g.widths[column + columns - 1]
    const bottom = g.tops[row + rows - 1] + g.heights[row + rows - 1]
    return [origin.x + g.lefts[column], origin.y + g.tops[row], right - g.lefts[column], bottom - g.tops[row]] as const
  }
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 1 / zoom
  ctx.setLineDash([3 / zoom, 3 / zoom])
  for (const child of table.children ?? []) {
    const cell = snapCellOf(child)
    if (cell.row >= g.heights.length || cell.column >= g.widths.length) continue
    ctx.strokeRect(...rect(cell.row, cell.column, cell.rowSpan!, cell.columnSpan!))
  }
  grid.forEach((cells, row) =>
    cells.forEach((id, column) => {
      if (id === null && row < g.heights.length && column < g.widths.length) ctx.strokeRect(...rect(row, column, 1, 1))
    }),
  )
  ctx.restore()
}

/**
 * What the chip on a selection says: «Table · 3×4» for a table, the object's
 * kind for an object in one - with its size step and, when it spans more
 * than one cell, «2×1» (columns × rows).
 */
export function snapChipText(obj: ScreenObject, parent: ScreenObject | null, size?: { rows: number; columns: number }): string {
  if (size) return `Table · ${size.columns}×${size.rows}`
  const parts = [objectTypeLabel(obj.type)]
  const step = obj.properties?.sizeStep
  if (typeof step === "string") parts.push(step.toUpperCase())
  if (parent) {
    const cell = snapCellOf(obj)
    if (cell.rowSpan! > 1 || cell.columnSpan! > 1) parts.push(`${cell.columnSpan}×${cell.rowSpan}`)
  }
  return parts.join(" · ")
}

/** The chip above a selection's top left corner. */
export function drawSnapChip(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, text: string, color: string, zoom: number): void {
  const size = 11 / zoom
  const padX = 5 / zoom
  const padY = 2.5 / zoom
  ctx.save()
  ctx.font = `500 ${size}px system-ui, sans-serif`
  const width = ctx.measureText(text).width + 2 * padX
  const height = size + 2 * padY
  const x = at.x
  const y = at.y - height - 3 / zoom
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, 3 / zoom)
  ctx.fill()
  ctx.fillStyle = "#ffffff"
  ctx.textBaseline = "middle"
  ctx.fillText(text, x + padX, y + height / 2)
  ctx.restore()
}
