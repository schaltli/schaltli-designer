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

  // Crisp: every line a whole number of device pixels wide, centred so it
  // covers whole pixels - on a pixel's edge a 1 px line smears over two at
  // half strength (reported at Checkpoint C). The lines are guides in the
  // gaps, not object edges, so moving them by under a pixel costs nothing.
  const t = ctx.getTransform()
  const devicePx = active ? 2 : 1
  const crisp = (v: number, scale: number, offset: number) => {
    const d = v * scale + offset
    const snapped = devicePx % 2 === 1 ? Math.floor(d) + 0.5 : Math.round(d)
    return (snapped - offset) / scale
  }
  const cx = (x: number) => crisp(x, t.a, t.e)
  const cy = (y: number) => crisp(y, t.d, t.f)
  const [l, r, tp, b] = [cx(left), cx(right), cy(top), cy(bottom)]

  ctx.save()
  ctx.strokeStyle = active ? activeColor : QUIET_COLOR
  ctx.globalAlpha = active ? 0.95 : 0.7
  ctx.lineWidth = devicePx / t.a
  ctx.setLineDash([4 / t.a, 3 / t.a])
  ctx.beginPath()
  // The outline, down to the free row's bottom.
  ctx.rect(l, tp, r - l, b - tp)
  // Between columns, in the middle of the gap.
  for (let c = 1; c < widths.length; c++) {
    const x = cx(origin.x + lefts[c] - gap / 2)
    ctx.moveTo(x, tp)
    ctx.lineTo(x, b)
  }
  // Between rows, and above the free row.
  for (let row = 1; row <= heights.length; row++) {
    const y = cy(row < heights.length ? origin.y + tops[row] - gap / 2 : freeTop - gap / 2)
    ctx.moveTo(l, y)
    ctx.lineTo(r, y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/** The handles an active table offers: one per inner column line, «+» for a row and a column. */
export type TableHandle = { kind: "column-line"; index: number } | { kind: "add-row" } | { kind: "add-column" }

const HANDLE_W = 6
const HANDLE_H = 12
const PLUS = 9

function handlePlaces(table: TableLines, zoom: number) {
  const { origin, geometry } = table
  const { lefts, widths, tops, heights, gap, emptyRow, padding } = geometry
  const right = origin.x + (widths.length > 0 ? lefts[widths.length - 1] + widths[widths.length - 1] : padding)
  const left = origin.x + padding
  const top = origin.y + padding
  const rowsBottom = origin.y + (heights.length > 0 ? tops[heights.length - 1] + heights[heights.length - 1] : padding)
  const freeTop = heights.length > 0 ? rowsBottom + gap : top
  const bottom = freeTop + emptyRow
  const lines = widths.slice(1).map((_, i) => ({ index: i + 1, x: origin.x + lefts[i + 1] - gap / 2, y: top }))
  const r = PLUS / zoom
  return {
    lines,
    addRow: { x: (left + right) / 2, y: bottom + r + 3 / zoom },
    addColumn: { x: right + r + 3 / zoom, y: (top + bottom) / 2 },
  }
}

export function drawTableHandles(ctx: CanvasRenderingContext2D, table: TableLines, color: string, zoom: number): void {
  const places = handlePlaces(table, zoom)
  ctx.save()
  ctx.fillStyle = "#ffffff"
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 / zoom
  for (const line of places.lines) {
    const w = HANDLE_W / zoom
    const h = HANDLE_H / zoom
    ctx.beginPath()
    ctx.roundRect(line.x - w / 2, line.y - h / 2, w, h, 2 / zoom)
    ctx.fill()
    ctx.stroke()
  }
  for (const plus of [places.addRow, places.addColumn]) {
    const r = PLUS / zoom
    ctx.beginPath()
    ctx.arc(plus.x, plus.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(plus.x - r / 2, plus.y)
    ctx.lineTo(plus.x + r / 2, plus.y)
    ctx.moveTo(plus.x, plus.y - r / 2)
    ctx.lineTo(plus.x, plus.y + r / 2)
    ctx.stroke()
  }
  ctx.restore()
}

/** What of an active table's handles is at `point`, if any. */
export function tableHandleAt(table: TableLines, point: { x: number; y: number }, zoom: number): TableHandle | null {
  const places = handlePlaces(table, zoom)
  const r = (PLUS + 2) / zoom
  if (Math.hypot(point.x - places.addRow.x, point.y - places.addRow.y) <= r) return { kind: "add-row" }
  if (Math.hypot(point.x - places.addColumn.x, point.y - places.addColumn.y) <= r) return { kind: "add-column" }
  for (const line of places.lines) {
    if (Math.abs(point.x - line.x) <= (HANDLE_W / 2 + 3) / zoom && Math.abs(point.y - line.y) <= (HANDLE_H / 2 + 3) / zoom) {
      return { kind: "column-line", index: line.index }
    }
  }
  return null
}

/** The share labels shown while a column line is dragged, at the line. */
export function drawShareLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, zoom: number): void {
  ctx.save()
  ctx.font = `${12 / zoom}px sans-serif`
  const w = ctx.measureText(text).width + 8 / zoom
  const h = 18 / zoom
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h - 8 / zoom, w, h, 4 / zoom)
  ctx.fill()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, x, y - h / 2 - 8 / zoom)
  ctx.restore()
}

const STRIP_H = 8

function stripPlaces(table: TableLines, zoom: number) {
  const { origin, geometry } = table
  const y = origin.y + geometry.padding - (STRIP_H + 6) / zoom
  return geometry.widths.map((w, c) => ({ index: c, x: origin.x + geometry.lefts[c], y, width: w, height: STRIP_H / zoom }))
}

/** The strip above an active table: one bar per column, the chosen one filled. */
export function drawColumnStrip(ctx: CanvasRenderingContext2D, table: TableLines, chosen: number | null, color: string, zoom: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1 / zoom
  for (const place of stripPlaces(table, zoom)) {
    ctx.globalAlpha = place.index === chosen ? 0.9 : 0.25
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(place.x, place.y, place.width, place.height, 2 / zoom)
    ctx.fill()
  }
  ctx.restore()
}

/** Which column's strip is at `point`, if any. */
export function columnStripAt(table: TableLines, point: { x: number; y: number }, zoom: number): number | null {
  for (const place of stripPlaces(table, zoom)) {
    if (point.x >= place.x && point.x <= place.x + place.width && point.y >= place.y - 2 / zoom && point.y <= place.y + place.height + 2 / zoom) {
      return place.index
    }
  }
  return null
}
