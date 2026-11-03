/**
 * How an object stands in the space it is in (docs/2026-11-03-anchor-dock.md):
 * per axis Left, Center, Right or Stretch; Top, Middle, Bottom or Stretch.
 * In a table's cell it says where the object stands in its cell; in a free
 * area which edges of the area it keeps its distance to. WinForms' Anchor,
 * Figma's Constraints - the UI says it in words.
 *
 * In a cell it lives in `properties.cell.anchor`, with everything else about
 * the object's place in its table, so taking `cell` away frees the object of
 * it (lib/snap-table.ts).
 */

import type { ScreenObject } from "@/components/project-editor"

export type AnchorX = "left" | "center" | "right" | "stretch"
export type AnchorY = "top" | "middle" | "bottom" | "stretch"
export interface Anchor {
  x?: AnchorX
  y?: AnchorY
}

/** What can take its room's width, or height: a text, an icon, a switch or a ring keeps its own size. */
export const STRETCHES_WIDTH = new Set(["button", "button-group", "bar", "slider", "box", "free", "text-field", "switcher"])
export const STRETCHES_HEIGHT = new Set(["button", "box", "free"])

const X: ReadonlySet<string> = new Set(["left", "center", "right", "stretch"])
const Y: ReadonlySet<string> = new Set(["top", "middle", "bottom", "stretch"])

/**
 * A cell's anchor as Align, Vertical align and Fill said it before
 * 2026-11-03 (`align`, `alignY`, `fill`): Fill wins over Align on its axis.
 * Undefined on an axis neither said anything about.
 */
export function anchorFromAlignAndFill(cell: Record<string, any>): Anchor {
  const anchor: Anchor = {}
  if (cell.fill?.width) anchor.x = "stretch"
  else if (X.has(cell.align)) anchor.x = cell.align
  if (cell.fill?.height) anchor.y = "stretch"
  else if (Y.has(cell.alignY)) anchor.y = cell.alignY
  return anchor
}

/**
 * An object's anchor in its cell, its defaults filled in: a label Left,
 * everything else Center; Middle. Reads a cell saved before 2026-11-03 too,
 * for whatever reaches the layout without passing migrateProject.
 */
export function cellAnchorOf(obj: ScreenObject): Required<Anchor> {
  const cell: Record<string, any> = obj.properties?.cell ?? {}
  const saved: Anchor = cell.anchor && typeof cell.anchor === "object" ? cell.anchor : anchorFromAlignAndFill(cell)
  return {
    x: saved.x && X.has(saved.x) ? saved.x : obj.type === "text" ? "left" : "center",
    y: saved.y && Y.has(saved.y) ? saved.y : "middle",
  }
}

/** The default an axis falls back to in a cell, so a cell stores only what was chosen. */
export function cellDefault(obj: ScreenObject): Required<Anchor> {
  return { x: obj.type === "text" ? "left" : "center", y: "middle" }
}

/** Where a thing `size` long stands in a room `room` long, by its anchor on that axis. */
export function offsetIn(room: number, size: number, anchor: AnchorX | AnchorY): number {
  if (anchor === "left" || anchor === "top" || anchor === "stretch") return 0
  if (anchor === "right" || anchor === "bottom") return room - size
  return Math.round((room - size) / 2)
}

/**
 * A cell's `align`, `alignY` and `fill` (before 2026-11-03) as its anchor,
 * in place; a text's `align` becomes its own textAlign, as the layout did
 * with it. True if anything changed.
 */
export function migrateCellAnchor(obj: { type: string; properties?: Record<string, any> }): boolean {
  const cell = obj.properties?.cell
  if (!cell || typeof cell !== "object") return false
  if (!("align" in cell) && !("alignY" in cell) && !("fill" in cell)) return false
  const { align, alignY: _y, fill: _f, ...rest } = cell
  const anchor = anchorFromAlignAndFill(cell)
  const isText = obj.type === "text"
  if (isText) delete anchor.x
  const next: Record<string, any> = { ...rest }
  if (anchor.x || anchor.y) next.anchor = { ...(cell.anchor ?? {}), ...anchor }
  obj.properties = { ...obj.properties, cell: next }
  if (isText && X.has(align) && align !== "stretch") obj.properties.textAlign = align
  return true
}
