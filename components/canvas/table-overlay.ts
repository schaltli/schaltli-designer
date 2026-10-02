/**
 * A table's lines on the canvas (docs/2026-10-02-layout-tables.md): every
 * table shows its columns and rows in the editor, thin, grey and dashed,
 * empty cells included - as Word shows a table without borders - and the
 * one being worked on strong. Below its last row a free row is drawn, the
 * place the next object goes. The preview and the device show none.
 */

import type { TableGeometry } from "@/lib/table"

const QUIET_COLOR = "#9ca3af"

export interface TableLines {
  /** The table's top left corner on the screen. */
  origin: { x: number; y: number }
  /** Its box: the object's size, or the content area for a screen's root. */
  width: number
  height: number
  geometry: TableGeometry
}

export function drawTableLines(ctx: CanvasRenderingContext2D, table: TableLines, active: boolean, activeColor: string, zoom: number): void {
  const { origin, geometry } = table
  const { lefts, widths, tops, heights, gap, emptyRow, padding } = geometry
  const left = origin.x + padding
  const right = origin.x + (widths.length > 0 ? lefts[widths.length - 1] + widths[widths.length - 1] : padding)
  const top = origin.y + padding
  const rowsBottom = origin.y + (heights.length > 0 ? tops[heights.length - 1] + heights[heights.length - 1] : padding)
  // The free row below the last one, where the next object goes.
  const freeTop = heights.length > 0 ? rowsBottom + gap : top
  const bottom = freeTop + emptyRow

  ctx.save()
  ctx.strokeStyle = active ? activeColor : QUIET_COLOR
  ctx.globalAlpha = active ? 0.95 : 0.7
  ctx.lineWidth = (active ? 1.5 : 1) / zoom
  ctx.setLineDash([4 / zoom, 3 / zoom])
  ctx.beginPath()
  // The outline, down to the free row's bottom.
  ctx.rect(left, top, right - left, bottom - top)
  // Between columns, in the middle of the gap.
  for (let c = 1; c < widths.length; c++) {
    const x = origin.x + lefts[c] - gap / 2
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
  }
  // Between rows, and above the free row.
  for (let r = 1; r <= heights.length; r++) {
    const y = r < heights.length ? origin.y + tops[r] - gap / 2 : freeTop - gap / 2
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}
