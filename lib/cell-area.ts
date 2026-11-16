/**
 * A table's cell as an area (docs/2026-11-16-areas.md, step 3).
 *
 * A cell holds one object, placed by its Horizontal and Vertical: a slot,
 * and nothing in a project file but that object's `properties.cell`. A cell
 * that holds more than one object, or carries a look, is an area the
 * designer puts into the slot itself and takes away again: a `free` object
 * marked `cellArea`, stretched both ways, holding what the cell holds. It is
 * «Cell» in the object list. Nobody places one: dropping a second object
 * onto an occupied cell makes it (wrapInCell), and a cell left with one
 * object and no look is a slot again (unwrappedCells).
 *
 * The spec's data model makes every cell an object of its own type. This
 * keeps the table as it is - an object in a cell names its cell - and adds
 * the area only where a cell is more than a slot (decision 12 says the same
 * of what the author sees). A device gets neither: tables and areas are
 * dissolved on export.
 *
 * Pure: objects in, objects out.
 */

import type { ScreenObject } from "@/components/project-editor"
import { areaAnchorOf, cellAnchorOf, STRETCHES_HEIGHT, STRETCHES_WIDTH, type Anchor } from "@/lib/anchor"
import { cardLookOf } from "@/lib/card"
import { dockOf, paddingOf } from "@/lib/dock"
import { fit, naturalWidth, type LayoutScale } from "@/lib/layout"
import { freeBackground, objectBounds, translateObject } from "@/lib/object-groups"
import { isSnapTable, ownSizeOf, snapCellOf, snapTableGeometry } from "@/lib/snap-table"

/** Whether `obj` is the area of a table's cell. */
export function isCellArea(obj: ScreenObject | null | undefined): boolean {
  return obj?.type === "free" && obj.properties?.cellArea === true
}

/** The id a cell's area gets from the object it is made around. */
export const cellAreaId = (occupantId: string) => `cell-${occupantId}`

/**
 * What can be made a cell's area around: anything standing in a slot but an
 * area (it holds more as it is), a table (no table in a table) and a
 * switcher (its panels are its areas).
 */
export function canShareCell(occupant: ScreenObject | null | undefined): boolean {
  return !!occupant && !!occupant.properties?.cell && occupant.type !== "free" && occupant.type !== "table" && occupant.type !== "switcher"
}

// An object at the size it asks of its column and row (lib/snap-table.ts
// `natural`): its own where Stretch overwrote it, a control as its labels
// need, a text as its words.
function asked(obj: ScreenObject, scale: LayoutScale): { width: number; height: number } {
  const own = ownSizeOf(obj)
  const drawn = obj.type === "switcher" ? obj : { ...obj, width: own.width ?? obj.width, height: own.height ?? obj.height }
  if (Array.isArray(drawn.properties?.points) && drawn.properties!.points.length > 0) {
    const b = objectBounds(drawn)
    return { width: b.maxX - b.minX, height: b.maxY - b.minY }
  }
  const fitted = fit(drawn, naturalWidth(drawn, scale), scale)
  return { width: fitted.width, height: fitted.height }
}

/**
 * The laid-out `table` with the object `occupantId` wrapped in its cell's
 * area: the area takes the object's cell and fills it, the object stands in
 * it where it stood on the glass - docked Fill where it filled its cell,
 * else kept to the edges its Horizontal and Vertical named. `own` are
 * properties the area starts with (a look). The same table where the object
 * is not in it or cannot share its cell.
 */
export function wrapInCell(table: ScreenObject, occupantId: string, scale: LayoutScale, own: Record<string, unknown> = {}): ScreenObject {
  if (!isSnapTable(table)) return table
  const occupant = (table.children ?? []).find((child) => child.id === occupantId)
  if (!occupant || !canShareCell(occupant)) return table
  const { anchor: _how, ...place } = snapCellOf(occupant)
  const g = snapTableGeometry(table, scale)
  const across = (starts: number[], sizes: number[], from: number, count: number) => {
    const last = Math.min(sizes.length - 1, from + count - 1)
    return { start: starts[from] ?? 0, size: (starts[last] ?? 0) + (sizes[last] ?? 0) - (starts[from] ?? 0) }
  }
  const h = across(g.lefts, g.widths, place.column, place.columnSpan ?? 1)
  const v = across(g.tops, g.heights, place.row, place.rowSpan ?? 1)

  const anchor = cellAnchorOf(occupant)
  // A text spans its cell and aligns its words itself (E9).
  const x = occupant.type === "text" ? "stretch" : anchor.x
  const fills = x === "stretch" && anchor.y === "stretch"
  const { cell: _cell, ownSize: _least, dock: _dock, anchor: _anchor, ...rest } = occupant.properties ?? {}
  const stands: Anchor = { ...(x !== "left" ? { x } : {}), ...(anchor.y !== "top" ? { y: anchor.y } : {}) }
  const properties = fills ? { ...rest, dock: "fill" } : Object.keys(stands).length > 0 ? { ...rest, anchor: stands } : rest
  const inner = translateObject({ ...occupant, properties }, -h.start, -v.start)

  const cell: Record<string, unknown> = { row: place.row, column: place.column, anchor: { x: "stretch", y: "stretch" } }
  if ((place.rowSpan ?? 1) > 1) cell.rowSpan = place.rowSpan
  if ((place.columnSpan ?? 1) > 1) cell.columnSpan = place.columnSpan
  const area: ScreenObject = {
    id: cellAreaId(occupant.id),
    type: "free",
    x: h.start,
    y: v.start,
    width: h.size,
    height: v.size,
    zIndex: occupant.zIndex,
    // What it asks of its column and row is what the object asked.
    properties: { ...own, cellArea: true, cell, ownSize: asked(occupant, scale) },
    children: [inner],
  }
  return { ...table, children: (table.children ?? []).map((child) => (child.id === occupantId ? area : child)) }
}

// Whether a cell's area is more than a slot: it can be seen, pads, or holds
// more than one object - or one that is docked to an edge of it.
function isMoreThanASlot(area: ScreenObject): boolean {
  const children = area.children ?? []
  if (cardLookOf(area) || freeBackground(area) || paddingOf(area) > 0 || area.properties?.blockTiles) return true
  if (children.length > 1) return true
  const dock = children[0] ? dockOf(children[0]) : undefined
  return dock !== undefined && dock !== "fill"
}

// The one object of a cell's area back in the slot: where it stood, its
// Horizontal and Vertical what it kept to in the area.
function backInSlot(area: ScreenObject, child: ScreenObject): ScreenObject {
  const { anchor: _a, ...place } = area.properties?.cell ?? {}
  const fills = dockOf(child) === "fill"
  const kept = areaAnchorOf(child)
  const canW = STRETCHES_WIDTH.has(child.type)
  const canH = STRETCHES_HEIGHT.has(child.type)
  const anchor: Anchor = fills
    ? { x: canW ? "stretch" : kept.x === "stretch" ? "left" : kept.x, y: canH ? "stretch" : kept.y === "stretch" ? "top" : kept.y }
    : { x: kept.x === "stretch" && !canW && child.type !== "text" ? "left" : kept.x, y: kept.y === "stretch" && !canH ? "top" : kept.y }
  const { dock: _dock, anchor: _anchor, ownSize: _own, dockedOut: _out, ...rest } = child.properties ?? {}
  // A text spans its cell whatever it says: nothing to store for it across.
  const how: Anchor = child.type === "text" ? { y: anchor.y } : anchor
  // Stretched, what it asks of its column and row is what the area asked.
  const asks = ownSizeOf(area)
  const least = { ...(anchor.x === "stretch" && asks.width !== undefined ? { width: asks.width } : {}), ...(anchor.y === "stretch" && asks.height !== undefined ? { height: asks.height } : {}) }
  const properties = { ...rest, cell: { ...place, anchor: how }, ...(Object.keys(least).length > 0 ? { ownSize: least } : {}) }
  return translateObject({ ...child, zIndex: area.zIndex, properties }, area.x, area.y)
}

/**
 * `table` with every cell's area that is no more than a slot taken away
 * again: its one object back in the cell, an empty one gone (decision 12,
 * E3). The same table where none is.
 */
export function unwrappedCells(table: ScreenObject): ScreenObject {
  if (!isSnapTable(table) || !(table.children ?? []).some((child) => isCellArea(child) && !isMoreThanASlot(child))) return table
  const children = (table.children ?? []).flatMap((child) => {
    if (!isCellArea(child) || isMoreThanASlot(child)) return [child]
    const only = child.children?.[0]
    return only ? [backInSlot(child, only)] : []
  })
  return { ...table, children }
}

/**
 * The cell (or span) the object `occupantId` stands in, in the space its
 * laid-out table stands in; null where it stands in no table.
 */
export function cellRectIn(table: ScreenObject, occupantId: string, scale: LayoutScale): { x: number; y: number; width: number; height: number } | null {
  const occupant = (table.children ?? []).find((child) => child.id === occupantId)
  if (!isSnapTable(table) || !occupant) return null
  const place = snapCellOf(occupant)
  const g = snapTableGeometry(table, scale)
  const lastColumn = Math.min(g.widths.length - 1, place.column + (place.columnSpan ?? 1) - 1)
  const lastRow = Math.min(g.heights.length - 1, place.row + (place.rowSpan ?? 1) - 1)
  const x = g.lefts[place.column] ?? 0
  const y = g.tops[place.row] ?? 0
  return { x: table.x + x, y: table.y + y, width: (g.lefts[lastColumn] ?? 0) + (g.widths[lastColumn] ?? 0) - x, height: (g.tops[lastRow] ?? 0) + (g.heights[lastRow] ?? 0) - y }
}

/** The table that holds `id` directly, anywhere in `objects`; null where none does. */
export function tableHolding(objects: ScreenObject[], id: string): ScreenObject | null {
  for (const obj of objects) {
    if (isSnapTable(obj) && (obj.children ?? []).some((child) => child.id === id)) return obj
    const inner = obj.children ? tableHolding(obj.children, id) : null
    if (inner) return inner
  }
  return null
}

/**
 * `objects` with the cell of `occupantId` made an area around it, wherever
 * its table is. The id of that area, or null where the object stands in no
 * cell it can share.
 */
export function withCellArea(
  objects: ScreenObject[],
  occupantId: string,
  scale: LayoutScale,
  own: Record<string, unknown> = {},
): { objects: ScreenObject[]; areaId: string | null } {
  const table = tableHolding(objects, occupantId)
  if (!table) return { objects, areaId: null }
  const wrapped = wrapInCell(table, occupantId, scale, own)
  if (wrapped === table) return { objects, areaId: null }
  const swap = (list: ScreenObject[]): ScreenObject[] => list.map((o) => (o.id === table.id ? wrapped : o.children ? { ...o, children: swap(o.children) } : o))
  return { objects: swap(objects), areaId: cellAreaId(occupantId) }
}
