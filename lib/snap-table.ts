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
import { objectBounds, translateObject } from "@/lib/object-groups"
import { cellAnchorOf, offsetIn, resizeFree, type Anchor } from "@/lib/anchor"
import { textNoTallerThanItsFont } from "@/lib/font-utils"

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
  /** How it stands in its cell (lib/anchor.ts); absent axes take the defaults. */
  anchor?: Anchor
  /** The drawn size, kept while Stretch overwrites it. */
  drawnWidth?: number
  drawnHeight?: number
}
/** A column or row; `mm` is a size set by hand. */
export interface SnapLine {
  mm?: number
  // Only while an object is dragged out (heldOut): the line held at the
  // size it had, `mm` being that size and `was` what it was set to before.
  was?: number | null
}
/** What a column holds, from what its objects are. */
export type SnapRole = "icon" | "label" | "control"

export function isSnapTable(obj: ScreenObject | null | undefined): boolean {
  return obj?.type === "table" && obj.properties?.grid === SNAP_GRID
}

export function roleOf(obj: ScreenObject): SnapRole {
  if (obj.type === "icon") return "icon"
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

/** A table's objects row by row, left to right: the order Enter, the object list and a reader take. */
export function inReadingOrder(children: ScreenObject[]): ScreenObject[] {
  return [...children].sort((a, b) => {
    const ca = snapCellOf(a)
    const cb = snapCellOf(b)
    return ca.row - cb.row || ca.column - cb.column
  })
}
export const firstInReadingOrder = (children: ScreenObject[]): ScreenObject | undefined => inReadingOrder(children)[0]

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

// An object as drawn: Stretch overwrites its width or height with its cell's,
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

// A line keeps its points beside its x and y (properties.points, in the
// same space): it is moved, never placed by x and y alone, and its size is
// what its points cover - drawn right to left, its width is negative.
const hasPoints = (obj: ScreenObject) => Array.isArray(obj.properties?.points) && obj.properties!.points.length > 0

// Each object at its natural size: a control as wide as its labels, a text
// as its words, a line as its points, anything else as it is drawn; a
// switcher or a ring with the height that width gives it.
function natural(child: ScreenObject, scale: LayoutScale): ScreenObject {
  const own = drawn(child)
  if (hasPoints(own)) {
    const b = objectBounds(own)
    return { ...own, width: b.maxX - b.minX, height: b.maxY - b.minY }
  }
  return fit(own, naturalWidth(own, scale), scale)
}

function measure(table: ScreenObject, scale: LayoutScale) {
  const { rows, columns } = dimensions(table)
  const gap = px(gapMmOf(table), scale)
  const empty = px(SNAP_EMPTY_MM, scale)
  // A text of one line as tall as its font's line (the user, 2026-11-14: a
  // card's name and its value 34 px tall in a row their 18 and 26 px fill).
  const sized = (table.children ?? []).map((given) => {
    const child = textNoTallerThanItsFont(given, scale.fonts)
    return { child, cell: snapCellOf(child), size: natural(child, scale) }
  })

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
  shareWidth(table, widths, gap, scale)

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

/** The gap between a table's columns and rows, in mm (docs/2026-11-03-card-grid.md): 1.5 unless set. */
export function gapMmOf(table: ScreenObject): number {
  const g = table.properties?.gapMm
  return typeof g === "number" && Number.isFinite(g) && g >= 0 ? g : SNAP_GAP_MM
}

/** A table's width set in mm, or undefined: as wide as its content. */
export function widthMmOf(table: ScreenObject): number | undefined {
  const w = table.properties?.widthMm
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : undefined
}

// Equal columns and a width (docs/2026-11-03-card-grid.md), in place: the
// columns not sized by hand made equal - as wide as the widest of them, or
// sharing the width the table is given - and without Equal columns the last
// column taking what the width leaves. Never narrower than what a column
// holds: a column that needs more makes the table wider than its width.
function shareWidth(table: ScreenObject, widths: number[], gap: number, scale: LayoutScale) {
  if (widths.length === 0) return
  const lines = snapColumnsOf(table)
  const free = widths.map((_, c) => typeof lines[c]?.mm !== "number")
  const widthMm = widthMmOf(table)
  const target = widthMm !== undefined ? px(widthMm, scale) : undefined
  const total = () => widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * gap
  if (table.properties?.equalColumns === true) {
    const freeIdx = widths.map((_, c) => c).filter((c) => free[c])
    if (freeIdx.length === 0) return
    const handSum = widths.reduce((sum, w, c) => (free[c] ? sum : sum + w), 0)
    const widest = Math.max(...freeIdx.map((c) => widths[c]))
    // Equal even where a share is too small for one of them: then all are as
    // wide as the widest, and the table wider than its width.
    const share = target !== undefined ? Math.max(widest, Math.floor((target - (widths.length - 1) * gap - handSum) / freeIdx.length)) : widest
    for (const c of freeIdx) widths[c] = Math.max(widths[c], share)
    // What rounding left goes to the last of them, so the table is its width.
    if (target !== undefined && total() < target) widths[freeIdx[freeIdx.length - 1]] += target - total()
    return
  }
  if (target !== undefined && total() < target) widths[widths.length - 1] += target - total()
}

export function snapTableGeometry(table: ScreenObject, scale: LayoutScale): SnapGeometry {
  const { gap, lefts, widths, tops, heights, naturalWidths, naturalHeights } = measure(table, scale)
  // Stretched wider than its columns - docked Fill or Top in a card, in a
  // switcher's panel - its last column took the rest when it was laid out
  // (arrangeSnapTable): so here too, or its cells were drawn, and dropped
  // into, short of what stands in them (the user, 2026-11-06).
  const natural = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * gap
  if (widths.length > 0 && table.width > natural) widths[widths.length - 1] += table.width - natural
  return { gap, lefts, widths, tops, heights, naturalWidths, naturalHeights }
}

/**
 * A table laid out: each object placed in its cell (or span) by its
 * anchor (lib/anchor.ts) - a text across it, everything else centred, all
 * vertically centred unless set - at its natural size, or across the cell
 * where it stretches.
 * Children's coordinates are relative to the table, as every container's
 * are, so the export dissolves it like any other. The table keeps its
 * place and is as large as its content.
 */
export function arrangeSnapTable(table: ScreenObject, scale: LayoutScale, stretchTo?: number): ScreenObject {
  const { gap, widths, heights, lefts, tops, sized, across } = measure(table, scale)
  // Stretched to a width it is given (a switcher's panel, lib/layout.ts
  // fitSwitcher): its last column takes what is left over.
  const natural = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * gap
  if (stretchTo !== undefined && widths.length > 0 && natural < stretchTo) widths[widths.length - 1] += stretchTo - natural
  const placed = sized.map(({ child, cell, size }) => {
    const room = across(widths, cell.column, cell.columnSpan!)
    const roomHeight = across(heights, cell.row, cell.rowSpan!)
    const anchor = cellAnchorOf(child)
    const own = drawn(child)
    // A text spans its cell and is aligned in it by its own textAlign: as wide
    // as its words, it was clipped where a live value read longer, and a
    // column dragged wider gave it no room (the demo, 2026-10-11).
    const isText = child.type === "text"
    const stretchWidth = anchor.x === "stretch" || isText
    const sizedChild = stretchWidth ? fit(own, room, scale) : size
    const width = stretchWidth ? room : sizedChild.width
    const height = anchor.y === "stretch" ? roomHeight : sizedChild.height
    const dx = isText ? 0 : offsetIn(room, width, anchor.x)
    const dy = offsetIn(roomHeight, height, anchor.y)
    // The drawn size kept while stretched, dropped once it is not.
    const { drawnWidth: _w, drawnHeight: _h, ...kept } = child.properties?.cell ?? {}
    const placedCell: Record<string, any> = { ...kept }
    if (anchor.x === "stretch") placedCell.drawnWidth = own.width
    if (anchor.y === "stretch") placedCell.drawnHeight = own.height
    const properties = { ...sizedChild.properties, cell: placedCell }
    const left = lefts[cell.column] + dx
    const top = tops[cell.row] + dy
    // A line moved there whole, its points with it (translateObject).
    if (hasPoints(child)) {
      const b = objectBounds(child)
      return translateObject({ ...child, properties: { ...child.properties, cell: placedCell } }, left - b.minX, top - b.minY)
    }
    // A free area at a new size takes its objects along by their anchors,
    // from the size it was laid out at last (lib/anchor.ts).
    const children = child.type === "free" ? resizeFree(child, width, height).children : sizedChild.children
    return { ...sizedChild, width, height, properties, x: left, y: top, ...(children ? { children } : {}) }
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
// (anchor, drawn size) goes with it.
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
  return padded({ ...t, children: [...(t.children ?? []), landed(withCell(obj, { row, column }))] })
}

/**
 * An object just put into a cell: a card (a free area with a Look,
 * docs/2026-11-03-card.md) fills it, Stretch both ways, unless how it stands
 * there is set already (docs/2026-11-03-card-grid.md). So does a block's
 * tile since 2026-11-11 - a Toggle Button, or a block of several parts' tiles
 * (docs/2026-11-11-led-look.md) - so a column of blocks lines up. Anything
 * else as it is.
 */
export function landed(obj: ScreenObject): ScreenObject {
  const tile = obj.type === "toggle-button" || (obj.type === "free" && !!obj.properties?.blockTiles)
  if (!tile && (obj.type !== "free" || !obj.properties?.look)) return obj
  const cell = obj.properties.cell ?? {}
  if (cell.anchor) return obj
  return { ...obj, properties: { ...obj.properties, cell: { ...cell, anchor: { x: "stretch", y: "stretch" } } } }
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
/**
 * What says where an object stands in what holds it, rather than what it is:
 * its Dock and Position in a free area, its cell in a table, its place in the
 * object list. It goes with the place (the user, 2026-11-14): a table that
 * dissolves gives it to the object left, a table made by snapping takes it
 * from the object that stood there - a docked value no longer came loose
 * when its neighbour was deleted.
 */
const PLACE_KEYS = ["dock", "anchor", "cell"] as const

function withoutPlace(obj: ScreenObject): ScreenObject {
  const properties = { ...(obj.properties ?? {}) }
  for (const key of PLACE_KEYS) delete properties[key]
  return { ...obj, properties }
}

/** `obj` standing where `from` stood: its place-keys and its place in the list. */
function inPlaceOf(from: ScreenObject, obj: ScreenObject): ScreenObject {
  const place = Object.fromEntries(PLACE_KEYS.filter((key) => from.properties?.[key] !== undefined).map((key) => [key, from.properties[key]]))
  const bare = withoutPlace(obj)
  return { ...bare, zIndex: from.zIndex, properties: { ...bare.properties, ...place } }
}

function freed(table: ScreenObject, child: ScreenObject): ScreenObject {
  const { cell: _cell, ...properties } = child.properties ?? {}
  const own = drawn(child)
  // Back at its drawn size, a free area taking its objects along.
  const sized = child.type === "free" ? { ...resizeFree(child, own.width, own.height), properties } : { ...child, width: own.width, height: own.height, properties }
  // Moved into the table's space with its points, if it has any.
  return translateObject(sized, table.x, table.y)
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
  if (rest.length === 1) return { table: null, taken: freed(table, taken), left: inPlaceOf(table, freed(table, rest[0])) }
  return { table: tidied({ ...table, children: rest }), taken: freed(table, taken) }
}

/**
 * An object taken out of a laid-out table of three or more while it is
 * dragged: its cell left empty and every column and row held at the size it
 * has, so the table is the one drawn and a place in it is where it looks
 * (reported 2026-10-10: a tall button dragged out left its row as tall on
 * the canvas, but its targets were worked out with the row shrunk).
 * `released` undoes the holding once it is let go.
 */
function heldOut(table: ScreenObject, id: string, scale: LayoutScale): { table: ScreenObject; taken: ScreenObject; left?: ScreenObject } {
  const taken = (table.children ?? []).find((child) => child.id === id)!
  const g = snapTableGeometry(table, scale)
  const hold = (lines: SnapLine[], sizes: number[]): SnapLine[] =>
    sizes.map((size, i) => ({ mm: size / scale.pixelsPerMm, was: typeof lines[i]?.mm === "number" ? lines[i].mm! : null }))
  const properties = { ...table.properties, columns: hold(snapColumnsOf(table), g.widths), rows: hold(snapRowsOf(table), g.heights) }
  return { table: { ...table, properties, children: (table.children ?? []).filter((child) => child.id !== id) }, taken: freed(table, taken) }
}

const holds = (table: ScreenObject) => [...snapColumnsOf(table), ...snapRowsOf(table)].some((line) => "was" in line)

/** A table held by heldOut as it is again: its lines as set before, emptied lines gone, what is in it where it stood. */
export function released(table: ScreenObject, scale: LayoutScale): ScreenObject {
  if (!isSnapTable(table) || !holds(table)) return table
  const back = (lines: SnapLine[]): SnapLine[] => lines.map((line) => ("was" in line ? (typeof line.was === "number" ? { mm: line.was } : {}) : line))
  const t = { ...table, properties: { ...table.properties, columns: back(snapColumnsOf(table)), rows: back(snapRowsOf(table)) } }
  return keepInPlace(arrangeSnapTable(table, scale), tidied(t), scale)
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
export function snapPair(still: ScreenObject, moving: ScreenObject, side: SnapSide, scale: LayoutScale, id = `table-${still.id}`): ScreenObject {
  const along = side === "left" || side === "right"
  const first = side === "left" || side === "top" ? moving : still
  const second = first === moving ? still : moving
  // Where they stood: the layout moves each into its cell, a line with its points.
  // In a cell, Dock and Position mean nothing: the table takes the place of what stood there.
  const at = (obj: ScreenObject, i: number) => landed(withCell(withoutPlace(obj), along ? { row: 0, column: i } : { row: i, column: 0 }))
  const table: ScreenObject = inPlaceOf(still, {
    id,
    type: "table",
    x: still.x,
    y: still.y,
    width: 1,
    height: 1,
    zIndex: still.zIndex,
    properties: { grid: SNAP_GRID, columns: along ? [{}, {}] : [{}], rows: along ? [{}] : [{}, {}] },
    children: [at(first, 0), at(second, 1)],
  })
  return anchored(arrangeSnapTable(table, scale), still.id, still.x, still.y)
}

/**
 * Where a drop at a point would go in a table. A new column goes into
 * `row`, a new row into `column`; a table carried there (merged,
 * docs/2026-11-07-tree-carry-and-merge.md) takes `span` rows or columns from
 * there on.
 */
export type SnapTarget =
  | { kind: "cell"; row: number; column: number }
  | { kind: "column"; at: number; row: number; span?: number }
  | { kind: "row"; at: number; column: number; span?: number }

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

/** Where a dragged object snaps: beside a free object, or into a table. */
export type SnapDrop =
  | { kind: "pair"; stillId: string; side: SnapSide }
  // `merge`: what is carried is a table, and its cells join this one.
  | { kind: "table"; tableId: string; target: SnapTarget; merge?: true }

/** What may stand in a cell: anything but a group, a table and the navigator. */
export function canStandInCell(obj: ScreenObject): boolean {
  return obj.type !== "group" && obj.type !== "table" && obj.type !== "navigator"
}

export interface SnapRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The side of `target` an object at `rect` lies against, by their edges:
 * an edge of the object within `zone` of the facing edge of the target -
 * apart or overlapping by up to `zone` - while the two overlap across it
 * (side by side at the same height, or one above the other in line). The
 * nearest such pair of edges; null when none is that near.
 */
export function sideByEdges(target: SnapRect, rect: SnapRect, zone: number): { side: SnapSide; gap: number } | null {
  const acrossY = Math.min(target.y + target.height, rect.y + rect.height) - Math.max(target.y, rect.y) > 0
  const acrossX = Math.min(target.x + target.width, rect.x + rect.width) - Math.max(target.x, rect.x) > 0
  const candidates: Array<[SnapSide, number, boolean]> = [
    ["right", rect.x - (target.x + target.width), acrossY],
    ["left", target.x - (rect.x + rect.width), acrossY],
    ["bottom", rect.y - (target.y + target.height), acrossX],
    ["top", target.y - (rect.y + rect.height), acrossX],
  ]
  let best: { side: SnapSide; gap: number } | null = null
  for (const [side, gap, across] of candidates) {
    if (!across || gap < -zone || gap > zone) continue
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { side, gap }
  }
  return best
}

/**
 * Where the object `movingId`, standing at `rect`, snaps when let go, among
 * the objects of one space (a screen's, a panel's, a free area's - all in
 * the same coordinates). What it goes into, the pointer says; what it lines
 * up with, its outline (decided 2026-11-07): with the pointer over a table
 * it goes into the cell there, or at the nearest edge of the object
 * standing there; beside a table or a free object, by its edges (asked
 * 2026-10-10), at the side its edge lies against (sideByEdges), a new
 * column or row in the row or column of its middle. The nearest wins. Null
 * when nothing is that near, or when the object may not stand in a cell.
 * Without `pointer` (an object carried at its middle) its middle stands in.
 */
export function snapDropAt(
  objects: ScreenObject[],
  movingId: string,
  rect: SnapRect,
  zone: number,
  scale: LayoutScale,
  pointer?: { x: number; y: number },
): SnapDrop | null {
  const moving = objects.find((o) => o.id === movingId)
  if (!moving) return null
  const merging = isSnapTable(moving)
  if (!merging && !canStandInCell(moving)) return null
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const at = pointer ?? middle
  // A table carried: where its first column (row) lands, by that column's
  // middle - each of its columns goes where it is drawn - and how many it
  // takes, kept inside the table where it fits.
  const carried = merging ? snapTableGeometry(moving, scale) : null
  const startOf = (starts: number[], sizes: number[], gap: number, firstMiddle: number, count: number) => {
    const n = sizes.length
    if (count >= n) return 0
    return Math.min(lineAt(starts, gap, firstMiddle), n - count)
  }
  const merged = (obj: ScreenObject, target: SnapTarget): SnapTarget | null => {
    if (!carried) return target
    if (target.kind === "cell") return null
    const g = snapTableGeometry(obj, scale)
    if (target.kind === "row") {
      const span = carried.widths.length
      return { ...target, column: startOf(g.lefts, g.widths, g.gap, rect.x + carried.widths[0] / 2 - obj.x, span), span }
    }
    const span = carried.heights.length
    return { ...target, row: startOf(g.tops, g.heights, g.gap, rect.y + carried.heights[0] / 2 - obj.y, span), span }
  }
  const tableDrop = (tableId: string, target: SnapTarget): SnapDrop => (merging ? { kind: "table", tableId, target, merge: true } : { kind: "table", tableId, target })
  let best: { drop: SnapDrop; gap: number } | null = null
  const consider = (drop: SnapDrop, gap: number) => {
    if (!best || gap < best.gap) best = { drop, gap }
  }
  for (const obj of [...objects].sort((a, b) => b.zIndex - a.zIndex)) {
    if (obj.id === movingId || obj.locked) continue
    if (isSnapTable(obj)) {
      const inside = at.x >= obj.x && at.x < obj.x + obj.width && at.y >= obj.y && at.y < obj.y + obj.height
      if (inside) {
        const found = snapTargetAt(obj, at, 0, scale)
        const target = found && merged(obj, found)
        if (target) consider(tableDrop(obj.id, target), -1)
        continue
      }
      const edge = sideByEdges(obj, rect, zone)
      if (!edge) continue
      const g = snapTableGeometry(obj, scale)
      const row = lineAt(g.tops, g.gap, middle.y - obj.y)
      const column = lineAt(g.lefts, g.gap, middle.x - obj.x)
      const target: SnapTarget =
        edge.side === "left" ? { kind: "column", at: 0, row }
        : edge.side === "right" ? { kind: "column", at: g.widths.length, row }
        : edge.side === "top" ? { kind: "row", at: 0, column }
        : { kind: "row", at: g.heights.length, column }
      consider(tableDrop(obj.id, merged(obj, target)!), Math.abs(edge.gap))
    } else if (!merging && canStandInCell(obj)) {
      const edge = sideByEdges(obj, rect, zone)
      if (edge) consider({ kind: "pair", stillId: obj.id, side: edge.side }, Math.abs(edge.gap))
    }
  }
  return (best as { drop: SnapDrop } | null)?.drop ?? null
}

/**
 * The table `carried` merged into `table` (docs/2026-11-07-tree-carry-and-
 * merge.md): its rows inserted at row `at` (kind "row"), its first column
 * standing in column `start` - or its columns at column `at`, its first row
 * in row `start`. Lined up by position, not by what the cells hold: where
 * `carried` is narrower, the cells beside it stay empty; where it is wider,
 * `table` gets the columns (rows) it lacks. Spans, how each object stands
 * in its cell and sizes set by hand come along; `carried` itself is gone.
 */
export function mergeTables(table: ScreenObject, carried: ScreenObject, kind: "row" | "column", at: number, start: number): ScreenObject {
  const other = kind === "row" ? "column" : "row"
  const lineKey = kind === "row" ? "rows" : "columns"
  const otherKey = kind === "row" ? "columns" : "rows"
  const c = padded(carried)
  const size = dimensions(c)
  const count = kind === "row" ? size.rows : size.columns
  const across = kind === "row" ? size.columns : size.rows
  let t = padded(table)
  for (let i = 0; i < count; i++) t = insertLine(t, at, kind)
  const lines: SnapLine[] = [...t.properties![lineKey]]
  c.properties![lineKey].forEach((line: SnapLine, i: number) => (lines[at + i] = { ...line }))
  t = { ...t, properties: { ...t.properties, [lineKey]: lines } }
  const have = kind === "row" ? dimensions(t).columns : dimensions(t).rows
  for (let i = have; i < start + across; i++) {
    t = insertLine(t, i, other)
    const others: SnapLine[] = [...t.properties![otherKey]]
    others[i] = { ...(c.properties![otherKey][i - start] ?? {}) }
    t = { ...t, properties: { ...t.properties, [otherKey]: others } }
  }
  const joined = (c.children ?? []).map((child) => {
    const cell = snapCellOf(child)
    return withCell(child, kind === "row" ? { ...cell, row: cell.row + at, column: cell.column + start } : { ...cell, row: cell.row + start, column: cell.column + at })
  })
  return padded({ ...t, children: [...(t.children ?? []), ...joined] })
}

/**
 * A drop applied to the objects of one space: the moving object leaves the
 * list and stands in the table, or forms one with the object it was dropped
 * beside. What was there keeps its place on the screen. The list as it was
 * when the drop is not possible any more (the cell taken meanwhile).
 */
export function applySnapDrop(objects: ScreenObject[], movingId: string, drop: SnapDrop, scale: LayoutScale, newTableId?: string): ScreenObject[] {
  const moving = objects.find((o) => o.id === movingId)
  if (!moving) return objects
  const rest = objects.filter((o) => o.id !== movingId)
  if (drop.kind === "pair") {
    const still = rest.find((o) => o.id === drop.stillId)
    if (!still) return objects
    const table = snapPair(still, moving, drop.side, scale, newTableId)
    return rest.map((o) => (o.id === still.id ? table : o))
  }
  const table = rest.find((o) => o.id === drop.tableId)
  if (!table) return objects
  const laid = arrangeSnapTable(table, scale)
  const t = drop.target
  let next: ScreenObject
  if (isSnapTable(moving)) {
    if (t.kind === "cell") return objects
    next = mergeTables(laid, arrangeSnapTable(moving, scale), t.kind, t.at, t.kind === "row" ? t.column : t.row)
  } else if (t.kind === "cell") {
    if (occupancy(laid)[t.row]?.[t.column] !== null) return objects
    next = placeInCell(laid, moving, t.row, t.column)
  } else if (t.kind === "column") next = placeInCell(insertSnapColumn(laid, t.at), moving, t.row, t.at)
  else next = placeInCell(insertSnapRow(laid, t.at), moving, t.at, t.column)
  const kept = keepInPlace(laid, next, scale)
  return rest.map((o) => (o.id === table.id ? kept : o))
}

/**
 * An object taken out of a table among the objects of one space: the table
 * keeps what stood there in its place (keepInPlace), or dissolves into its
 * last object; the object comes out at the end of the list, where it stood
 * on the screen, as drawn and without its cell. The list as it was when
 * there is no such table or object.
 */
export function liftOut(objects: ScreenObject[], tableId: string, objectId: string, scale: LayoutScale, hold = false): { objects: ScreenObject[]; taken: ScreenObject | null } {
  const table = objects.find((o) => o.id === tableId)
  if (!table || !isSnapTable(table) || !(table.children ?? []).some((c) => c.id === objectId)) return { objects, taken: null }
  const laid = arrangeSnapTable(table, scale)
  const out = hold && (laid.children ?? []).length > 2 ? heldOut(laid, objectId, scale) : takeOutOf(laid, objectId)
  const replaced = out.table ? keepInPlace(laid, out.table, scale) : out.left
  const rest = objects.flatMap((o) => (o.id !== tableId ? [o] : replaced ? [replaced] : []))
  return { objects: [...rest, out.taken], taken: out.taken }
}

/**
 * Objects deleted, wherever they stand (2026-11-13): one in a table goes as
 * one dragged out of it does (liftOut) - the column or row it leaves empty
 * goes too, and a table left with one object dissolves into it - rather than
 * leaving an empty column behind (reported: the icons of a column
 * deleted, their column stayed).
 */
export function deleteObjects(objects: ScreenObject[], ids: readonly string[], scale: LayoutScale): ScreenObject[] {
  let list = objects
  for (const table of objects.filter(isSnapTable)) {
    for (const child of table.children ?? []) {
      if (!ids.includes(child.id)) continue
      const current = list.find((o) => o.id === table.id) ?? list.find((o) => (o.children ?? []).some((c) => c.id === child.id))
      if (!current || !isSnapTable(current)) continue
      const out = liftOut(list, current.id, child.id, scale)
      if (out.taken) list = out.objects.filter((o) => o !== out.taken)
    }
  }
  return list
    .filter((o) => !ids.includes(o.id))
    .map((o) => (o.children?.length ? { ...o, children: deleteObjects(o.children, ids, scale) } : o))
}

/**
 * An object dragged out of a table and let go: out of it (liftOut), moved
 * so its top left corner is at `to`, then snapped where `drop` says - into
 * a table or beside an object - or left lying free. In one space, in its
 * coordinates.
 */
export function moveOutOf(
  objects: ScreenObject[],
  tableId: string,
  objectId: string,
  to: { x: number; y: number },
  drop: SnapDrop | null,
  scale: LayoutScale,
  newTableId?: string,
): ScreenObject[] {
  // Held as drawn while it was dragged (heldOut), so `drop` names a place in
  // the table as it was shown; released once it is in.
  const lifted = liftOut(objects, tableId, objectId, scale, true)
  if (!lifted.taken) return objects
  const moved = translateObject(lifted.taken, Math.round(to.x - lifted.taken.x), Math.round(to.y - lifted.taken.y))
  const list = lifted.objects.map((o) => (o.id === objectId ? moved : o))
  return (drop ? applySnapDrop(list, objectId, drop, scale, newTableId) : list).map((o) => released(o, scale))
}

/**
 * The column (for a left or right span handle) or row (top, bottom) under a
 * point, for a laid-out table whose x and y are in the point's space - where
 * a span handle dragged there takes the span's edge (resizeSpan).
 */
export function spanIndexAt(table: ScreenObject, side: SnapSide, point: { x: number; y: number }, scale: LayoutScale): number {
  const g = snapTableGeometry(table, scale)
  return side === "left" || side === "right" ? lineAt(g.lefts, g.gap, point.x - table.x) : lineAt(g.tops, g.gap, point.y - table.y)
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
