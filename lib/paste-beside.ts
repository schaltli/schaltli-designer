/**
 * Paste Above, Below, Left and Right (the user, 2026-11-15): what is on the
 * clipboard put beside the object chosen, as if it had been carried there
 * with Alt and snapped - without aiming. A switcher 160 px tall was to go
 * below a button group in a panel 33 px flat; carried, its outline and the
 * pointer never agreed on where.
 *
 * Beside an object standing by itself, the two become a table (snapPair);
 * beside one in a table, it takes a new row above or below that object, or
 * a new column left or right of it.
 */

import type { ScreenObject } from "@/components/project-editor"
import type { LayoutScale } from "@/lib/layout"
import { applySnapDrop, canStandInCell, isSnapTable, type SnapDrop, type SnapSide } from "@/lib/snap-table"
import { isGroup, translateObject } from "@/lib/object-groups"
import { findObjectById, findParentOf, updateObjectById } from "@/lib/object-tree"

/**
 * Whether `pasted` may go beside `targetId`: one object that may stand in a
 * cell, beside one that does - not a panel, and not in a group (groups do
 * not snap).
 */
export function canPasteBeside(objects: ScreenObject[], targetId: string | undefined, pasted: readonly ScreenObject[]): boolean {
  if (!targetId || pasted.length !== 1 || !canStandInCell(pasted[0]) || pasted[0].type === "panel") return false
  const target = findObjectById(objects, targetId)
  if (!target || target.type === "panel" || !canStandInCell(target)) return false
  const parent = findParentOf(objects, targetId)?.parent ?? null
  if (isGroup(parent)) return false
  if (isSnapTable(parent)) return !isGroup(findParentOf(objects, parent!.id)?.parent ?? null)
  return true
}

/**
 * `pasted` (with its ids fresh already) beside `targetId` on `side`, and the
 * table it now stands in - `newTableId` where a new one is made. Null where
 * it may not go (canPasteBeside).
 */
export function pasteBeside(
  objects: ScreenObject[],
  targetId: string,
  pasted: ScreenObject,
  side: SnapSide,
  scale: LayoutScale,
  newTableId: string,
): { objects: ScreenObject[]; tableId: string } | null {
  if (!canPasteBeside(objects, targetId, [pasted])) return null
  const target = findObjectById(objects, targetId)!
  const parent = findParentOf(objects, targetId)?.parent ?? null
  const inTable = isSnapTable(parent)
  // The space the snapping happens in: the one the table stands in, or the
  // one the object stands in by itself.
  const spaceId = inTable ? (findParentOf(objects, parent!.id)?.parent?.id ?? null) : (parent?.id ?? null)
  const siblings = spaceId ? (findObjectById(objects, spaceId)?.children ?? []) : objects
  const at = inTable ? { x: parent!.x + target.x, y: parent!.y + target.y } : { x: target.x, y: target.y }
  const { cell: _cell, dock: _dock, anchor: _anchor, ownSize: _own, dockedOut: _out, ...properties } = pasted.properties ?? {}
  const moving: ScreenObject = { ...pasted, x: at.x, y: at.y, zIndex: Math.max(0, ...siblings.map((o) => o.zIndex)) + 1, properties }

  let drop: SnapDrop
  if (inTable) {
    const cell = target.properties?.cell ?? {}
    const row = Number(cell.row) || 0
    const column = Number(cell.column) || 0
    const rows = Number(cell.rowSpan) || 1
    const columns = Number(cell.columnSpan) || 1
    drop = {
      kind: "table",
      tableId: parent!.id,
      target:
        side === "top" ? { kind: "row", at: row, column }
        : side === "bottom" ? { kind: "row", at: row + rows, column }
        : side === "left" ? { kind: "column", at: column, row }
        : { kind: "column", at: column + columns, row },
    }
  } else drop = { kind: "pair", stillId: target.id, side }

  const placed = applySnapDrop([...siblings, moving], moving.id, drop, scale, newTableId)
  if (placed.some((o) => o.id === moving.id)) return null
  const next = spaceId ? updateObjectById(objects, spaceId, { children: placed }) : placed
  return { objects: next, tableId: inTable ? parent!.id : newTableId }
}

/**
 * Paste Replace (the user, 2026-11-15): one object off the clipboard takes
 * the place of the one chosen, which goes - its cell in a table, else its
 * position, Dock and Position in an area, its place in the drawing order.
 * Not a panel, and into a table only what may stand in a cell.
 */
export function canPasteReplacing(objects: ScreenObject[], targetId: string | undefined, pasted: readonly ScreenObject[]): boolean {
  if (!targetId || pasted.length !== 1 || pasted[0].type === "panel") return false
  const target = findObjectById(objects, targetId)
  if (!target || target.type === "panel") return false
  const parent = findParentOf(objects, targetId)?.parent ?? null
  if (isSnapTable(parent)) return canStandInCell(pasted[0])
  // A group holds no switcher (lib/object-groups.ts).
  if (isGroup(parent)) return pasted[0].type !== "switcher"
  return true
}

/** `pasted` (with its ids fresh already) where `targetId` was; null where it may not go. */
export function pasteReplacing(objects: ScreenObject[], targetId: string, pasted: ScreenObject): ScreenObject[] | null {
  if (!canPasteReplacing(objects, targetId, [pasted])) return null
  const target = findObjectById(objects, targetId)!
  const parent = findParentOf(objects, targetId)?.parent ?? null
  const { cell: _cell, dock: _dock, anchor: _anchor, ownSize: _own, dockedOut: _out, ...own } = pasted.properties ?? {}
  const t = target.properties ?? {}
  // In a table its cell, spans too; how the old one stood in it and the
  // size it was drawn at were the old one's.
  const cell = t.cell ? (({ anchor: _a, ...c }) => c)(t.cell) : undefined
  const place = isSnapTable(parent) ? { ...(cell ? { cell } : {}) } : { ...(t.dock ? { dock: t.dock } : {}), ...(t.anchor ? { anchor: t.anchor } : {}) }
  const moved = translateObject(pasted, target.x - pasted.x, target.y - pasted.y)
  const replacement: ScreenObject = { ...moved, x: target.x, y: target.y, zIndex: target.zIndex, properties: { ...own, ...place } }
  const swap = (list: ScreenObject[]): ScreenObject[] => list.map((o) => (o.id === targetId ? replacement : o.children ? { ...o, children: swap(o.children) } : o))
  return swap(objects)
}
