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
import { translateObject } from "@/lib/object-groups"

export type AnchorX = "left" | "center" | "right" | "stretch"
export type AnchorY = "top" | "middle" | "bottom" | "stretch"
export interface Anchor {
  x?: AnchorX
  y?: AnchorY
}

/** What can take its room's width, or height: a text, an icon, a switch or a ring keeps its own size. */
export const STRETCHES_WIDTH = new Set(["button", "button-group", "toggle-button", "bar", "slider", "box", "free", "text-field", "switcher"])
export const STRETCHES_HEIGHT = new Set(["button", "toggle-button", "box", "free"])

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

// ---------------------------------------------------------------------------
// In a free area (Task 2): which edges of the area an object keeps its
// distance to when the area changes size. Stored in `properties.anchor` of
// an object directly in the area; absent means Left/Top, which is what every
// object did before - nothing in an untouched area moves.

/** What can stretch in a free area: what can in a cell, and a text across. */
export const STRETCHES_WIDTH_IN_AREA = new Set([...STRETCHES_WIDTH, "text"])
export const STRETCHES_HEIGHT_IN_AREA = STRETCHES_HEIGHT

/** An object's anchor in the free area it stands in, Left/Top where unset. */
export function areaAnchorOf(obj: ScreenObject): Required<Anchor> {
  const saved: Anchor = obj.properties?.anchor && typeof obj.properties.anchor === "object" ? obj.properties.anchor : {}
  return {
    x: saved.x && X.has(saved.x) ? saved.x : "left",
    y: saved.y && Y.has(saved.y) ? saved.y : "top",
  }
}

// How far a thing anchored this way moves, and how much it grows, when its
// room grows by `delta`: Center keeps its offset from the centre (Figma).
function follow(anchor: AnchorX | AnchorY, delta: number): { move: number; grow: number } {
  if (anchor === "right" || anchor === "bottom") return { move: delta, grow: 0 }
  if (anchor === "center" || anchor === "middle") return { move: Math.round(delta / 2), grow: 0 }
  if (anchor === "stretch") return { move: 0, grow: delta }
  return { move: 0, grow: 0 }
}

const hasPoints = (obj: ScreenObject) => Array.isArray(obj.properties?.points) && obj.properties!.points.length > 0

/**
 * A free area at a new size, its objects moved and stretched by their
 * anchors from the size it had - a free area among them resized the same
 * way, at any depth. Anything but a free area only takes the size; an area
 * whose size does not change keeps everything where it is.
 */
export function resizeFree(area: ScreenObject, width: number, height: number): ScreenObject {
  if (area.type !== "free" || (width === area.width && height === area.height)) return { ...area, width, height }
  const dw = width - area.width
  const dh = height - area.height
  const children = (area.children ?? []).map((child) => {
    // A docked object is placed by the area itself (lib/dock.ts dockFree).
    if (child.properties?.dock) return child
    const anchor = areaAnchorOf(child)
    const h = follow(anchor.x, dw)
    const v = follow(anchor.y, dh)
    if (h.move === 0 && v.move === 0 && h.grow === 0 && v.grow === 0) return child
    // A line is moved whole, its points with it; it does not stretch.
    if (hasPoints(child)) return translateObject(child, h.move, v.move)
    const moved = { ...child, x: child.x + h.move, y: child.y + v.move }
    const w = Math.max(1, child.width + h.grow)
    const ht = Math.max(1, child.height + v.grow)
    return child.type === "free" ? { ...resizeFree(child, w, ht), x: moved.x, y: moved.y } : { ...moved, width: w, height: ht }
  })
  return { ...area, width, height, children }
}

/**
 * `obj` with `updates` - a free area whose width or height they change taking
 * its objects along by their anchors. The one door every edit of an object
 * goes through (lib/object-tree.ts), so dragging a corner, typing into Frame
 * and Apply size all agree, in one undo step.
 */
export function withUpdates(obj: ScreenObject, updates: Partial<ScreenObject>): ScreenObject {
  if (obj.type !== "free" || "children" in updates) return { ...obj, ...updates }
  const width = typeof updates.width === "number" ? updates.width : obj.width
  const height = typeof updates.height === "number" ? updates.height : obj.height
  if (width === obj.width && height === obj.height) return { ...obj, ...updates }
  return { ...resizeFree(obj, width, height), ...updates }
}
