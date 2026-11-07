/**
 * Objects carried to a place from wherever they are - out of a table, a
 * card, a group - the way the object tree carries them onto the canvas or
 * onto a table's row (docs/2026-11-07-tree-carry-and-merge.md).
 *
 * Everything here is in the coordinates of the screen's objects: a space is
 * the screen (null) or a container's children, measured from its origin.
 */

import type { ScreenObject } from "@/components/project-editor"
import type { LayoutScale } from "@/lib/layout"
import { childOrigin, translateObject } from "@/lib/object-groups"
import { findObjectById, findParentOf, updateObjectById } from "@/lib/object-tree"
import { moveIntoArea } from "@/lib/drop-into-free"
import { applySnapDrop, isSnapTable, liftOut, type SnapDrop } from "@/lib/snap-table"

/** The objects of the space `spaceId` (null: the screen) run through `change`. */
export function inSpace(objects: ScreenObject[], spaceId: string | null, change: (list: ScreenObject[]) => ScreenObject[]): ScreenObject[] {
  if (!spaceId) return change(objects)
  const space = findObjectById(objects, spaceId)
  if (!space) return objects
  return updateObjectById(objects, spaceId, { children: change(space.children ?? []) })
}

/** Whether `inner` is `id` or stands in it, at any depth. */
function holds(objects: ScreenObject[], id: string, inner: string | null): boolean {
  if (!inner) return false
  if (id === inner) return true
  const obj = findObjectById(objects, id)
  return !!obj?.children && !!findObjectById(obj.children, inner)
}

/**
 * Where the carried objects go: into the space `into` (null: the screen),
 * shifted on the glass by `shift` (none: where they stand), and - for one
 * object - snapped there as `snap` says: into a table's cell, a new row or
 * column, beside an object, or merged with a table when it is one.
 */
export interface CarryTarget {
  into: string | null
  shift?: { x: number; y: number }
  snap?: SnapDrop | null
}

/**
 * The objects `ids` carried to `target`: each taken out of the table it
 * stands in (the table keeps the rest in place, or dissolves into its last
 * object), moved on the glass by `shift`, put into `into` above what is
 * there, as a new object starts there (no cell, no Position, no Dock), and
 * a single one snapped as `snap` says. The objects as they were when the
 * target is one of the carried objects or stands in one.
 */
export function carryObjects(objects: ScreenObject[], ids: string[], target: CarryTarget, scale: LayoutScale, newTableId?: string): ScreenObject[] {
  if (ids.length === 0 || ids.some((id) => holds(objects, id, target.into))) return objects
  const snapTable = target.snap?.kind === "table" ? target.snap.tableId : null
  if (ids.some((id) => holds(objects, id, snapTable))) return objects
  let list = objects
  for (const id of ids) {
    const parent = findParentOf(list, id)?.parent ?? null
    if (!parent || !isSnapTable(parent)) continue
    const space = findParentOf(list, parent.id)?.parent?.id ?? null
    list = inSpace(list, space, (children) => liftOut(children, parent.id, id, scale).objects)
  }
  const shift = target.shift
  if (shift && (shift.x || shift.y)) {
    for (const id of ids) {
      const obj = findObjectById(list, id)
      if (obj) list = updateObjectById(list, id, translateObject(obj, Math.round(shift.x), Math.round(shift.y)))
    }
  }
  list = moveIntoArea(list, ids, target.into)
  if (target.snap && ids.length === 1) {
    const snap = target.snap
    list = inSpace(list, target.into, (children) => applySnapDrop(children, ids[0], snap, scale, newTableId))
  }
  return list
}

/** Where an object stands on the glass: its top left corner in the screen's coordinates. */
export function onGlass(objects: ScreenObject[], id: string): { x: number; y: number; width: number; height: number } | null {
  const obj = findObjectById(objects, id)
  if (!obj) return null
  const origin = childOrigin(objects, findParentOf(objects, id)?.parent?.id ?? null)
  return { x: origin.x + obj.x, y: origin.y + obj.y, width: obj.width, height: obj.height }
}
