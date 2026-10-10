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
import type { LayoutScale } from "@/lib/layout"
import { objectTypeLabel } from "@/lib/object-types"
import { occupancy, snapCellOf, snapTableGeometry, type SnapDrop, type SnapGeometry, type SnapSide } from "@/lib/snap-table"

/** An empty cell a drop goes into. */
export const SNAP_CELL_COLOR = "#16a34a"

/**
 * Where a dragged object will go when let go (docs/2026-10-09-snap-tables.md):
 * an empty cell lit green; a new column or row as a thick line between two,
 * strong along the row or column the object will stand in and faint over
 * the rest; beside a free object, a line along the edge it joins.
 * `objects` are the space's objects in the canvas's coordinates.
 */
export function drawSnapDrop(ctx: CanvasRenderingContext2D, drop: SnapDrop, objects: ScreenObject[], scale: LayoutScale, color: string, zoom: number): void {
  ctx.save()
  ctx.lineCap = "round"
  if (drop.kind === "pair") {
    const still = objects.find((o) => o.id === drop.stillId)
    if (still) {
      const off = 3 / zoom
      const [x1, y1, x2, y2] =
        drop.side === "left"
          ? [still.x - off, still.y, still.x - off, still.y + still.height]
          : drop.side === "right"
            ? [still.x + still.width + off, still.y, still.x + still.width + off, still.y + still.height]
            : drop.side === "top"
              ? [still.x, still.y - off, still.x + still.width, still.y - off]
              : [still.x, still.y + still.height + off, still.x + still.width, still.y + still.height + off]
      ctx.strokeStyle = color
      ctx.lineWidth = 3 / zoom
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.restore()
    return
  }
  const table = objects.find((o) => o.id === drop.tableId)
  if (!table) {
    ctx.restore()
    return
  }
  const g = snapTableGeometry(table, scale)
  const t = drop.target
  if (t.kind === "cell") {
    const x = table.x + g.lefts[t.column]
    const y = table.y + g.tops[t.row]
    ctx.fillStyle = SNAP_CELL_COLOR
    ctx.globalAlpha = 0.25
    ctx.fillRect(x, y, g.widths[t.column], g.heights[t.row])
    ctx.globalAlpha = 1
    ctx.strokeStyle = SNAP_CELL_COLOR
    ctx.lineWidth = 2 / zoom
    ctx.strokeRect(x, y, g.widths[t.column], g.heights[t.row])
    ctx.restore()
    return
  }
  const line = (x1: number, y1: number, x2: number, y2: number, width: number, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width / zoom
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  if (t.kind === "column") {
    const x = t.at === 0 ? table.x - g.gap / 2 : t.at >= g.widths.length ? table.x + table.width + g.gap / 2 : table.x + g.lefts[t.at] - g.gap / 2
    line(x, table.y, x, table.y + table.height, 2, 0.35)
    const row = Math.min(t.row, g.heights.length - 1)
    line(x, table.y + g.tops[row], x, table.y + g.tops[row] + g.heights[row], 4, 1)
  } else {
    const y = t.at === 0 ? table.y - g.gap / 2 : t.at >= g.heights.length ? table.y + table.height + g.gap / 2 : table.y + g.tops[t.at] - g.gap / 2
    line(table.x, y, table.x + table.width, y, 2, 0.35)
    const column = Math.min(t.column, g.widths.length - 1)
    line(table.x + g.lefts[column], y, table.x + g.lefts[column] + g.widths[column], y, 4, 1)
  }
  ctx.restore()
}

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

const SPAN_ARROWS: Record<SnapSide, string> = { left: "⇤", right: "⇥", top: "⤒", bottom: "⤓" }

/**
 * The span handles of an object in a table: a small square at the middle
 * of each edge of its span, with the arrow of the way it grows.
 */
export function drawSpanHandles(ctx: CanvasRenderingContext2D, handles: Array<{ side: SnapSide; x: number; y: number }>, color: string, zoom: number): void {
  const size = 13 / zoom
  ctx.save()
  ctx.font = `600 ${10 / zoom}px system-ui, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const h of handles) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(h.x - size / 2, h.y - size / 2, size, size, 2.5 / zoom)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.fillText(SPAN_ARROWS[h.side], h.x, h.y + 0.5 / zoom)
  }
  ctx.restore()
}

/**
 * The column and row lines of a selected table: a size set by hand drawn
 * solid, an automatic one faint and dashed - each to be dragged (Task 8).
 */
export function drawSizeLines(ctx: CanvasRenderingContext2D, lines: Array<{ x1: number; y1: number; x2: number; y2: number; byHand: boolean }>, color: string, zoom: number): void {
  ctx.save()
  ctx.strokeStyle = color
  for (const l of lines) {
    ctx.globalAlpha = l.byHand ? 1 : 0.5
    ctx.lineWidth = (l.byHand ? 2 : 1.5) / zoom
    ctx.setLineDash(l.byHand ? [] : [4 / zoom, 3 / zoom])
    ctx.beginPath()
    ctx.moveTo(l.x1, l.y1)
    ctx.lineTo(l.x2, l.y2)
    ctx.stroke()
  }
  ctx.restore()
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
