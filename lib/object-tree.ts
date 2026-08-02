/**
 * Recursive tree operations over ScreenObject[] (screen.objects and, at
 * any depth, their .children). Every screen.objects array in this app used
 * to be treated as flat - findObjectById/updateObjectById/etc. exist so
 * selection, editing, and CRUD keep working once an object can be nested
 * inside a tab-control's panel, without every call site needing its own
 * recursive-walk copy.
 */

import type { ScreenObject } from "@/components/project-editor"
import { sortChildrenByZIndex } from "@/lib/object-order"

export function findObjectById(objects: ScreenObject[], id: string): ScreenObject | null {
  for (const obj of objects) {
    if (obj.id === id) return obj
    if (obj.children && obj.children.length > 0) {
      const found = findObjectById(obj.children, id)
      if (found) return found
    }
  }
  return null
}

// Sum of every ancestor's own (x, y) up to the root, plus the object's own -
// mirrors ScreenRenderer::findObjectAbsolute() on the firmware side. A
// top-level object's absolute position is just its own x/y (no ancestors).
export function getAbsolutePosition(objects: ScreenObject[], id: string): { x: number; y: number } | null {
  const walk = (list: ScreenObject[], offsetX: number, offsetY: number): { x: number; y: number } | null => {
    for (const obj of list) {
      if (obj.id === id) return { x: obj.x + offsetX, y: obj.y + offsetY }
      if (obj.children && obj.children.length > 0) {
        const found = walk(obj.children, offsetX + obj.x, offsetY + obj.y)
        if (found) return found
      }
    }
    return null
  }
  return walk(objects, 0, 0)
}

export function updateObjectById(objects: ScreenObject[], id: string, updates: Partial<ScreenObject>): ScreenObject[] {
  return objects.map((obj) => {
    if (obj.id === id) return { ...obj, ...updates }
    if (obj.children && obj.children.length > 0) {
      return { ...obj, children: updateObjectById(obj.children, id, updates) }
    }
    return obj
  })
}

export function updateObjectsById(objects: ScreenObject[], ids: string[], updates: Partial<ScreenObject>): ScreenObject[] {
  return objects.map((obj) => {
    if (ids.includes(obj.id)) return { ...obj, ...updates }
    if (obj.children && obj.children.length > 0) {
      return { ...obj, children: updateObjectsById(obj.children, ids, updates) }
    }
    return obj
  })
}

export function deleteObjectById(objects: ScreenObject[], id: string): ScreenObject[] {
  return objects
    .filter((obj) => obj.id !== id)
    .map((obj) => (obj.children && obj.children.length > 0 ? { ...obj, children: deleteObjectById(obj.children, id) } : obj))
}

export function deleteObjectsById(objects: ScreenObject[], ids: string[]): ScreenObject[] {
  return objects
    .filter((obj) => !ids.includes(obj.id))
    .map((obj) => (obj.children && obj.children.length > 0 ? { ...obj, children: deleteObjectsById(obj.children, ids) } : obj))
}

// Appends newObject into parentId's .children (creating the array if
// absent). Children aren't type-category ordered like top-level
// screen.objects (see lib/object-order.ts's insertObjectInOrder) - they're
// zIndex-sorted at render/interaction time instead (sortChildrenByZIndex),
// so simple append is correct here.
export function insertObjectIntoParent(objects: ScreenObject[], parentId: string, newObject: ScreenObject): ScreenObject[] {
  return objects.map((obj) => {
    if (obj.id === parentId) {
      return { ...obj, children: [...(obj.children ?? []), newObject] }
    }
    if (obj.children && obj.children.length > 0) {
      return { ...obj, children: insertObjectIntoParent(obj.children, parentId, newObject) }
    }
    return obj
  })
}

// Returns { parent } where parent is the direct parent object of `id` (null
// if it's a top-level object), or null if `id` isn't found anywhere - the
// wrapper object is what lets "found at top level" (parent: null) be told
// apart from "not found at all" (null itself).
export function findParentOf(objects: ScreenObject[], id: string): { parent: ScreenObject | null } | null {
  const walk = (list: ScreenObject[], parent: ScreenObject | null): { parent: ScreenObject | null } | null => {
    for (const obj of list) {
      if (obj.id === id) return { parent }
      if (obj.children && obj.children.length > 0) {
        const found = walk(obj.children, obj)
        if (found) return found
      }
    }
    return null
  }
  return walk(objects, null)
}

// True if `descendantId` is somewhere inside `ancestorId`'s own subtree -
// used to block dropping a container onto one of its own descendants
// (would otherwise create a cycle: findObjectById on a self-referential
// tree would recurse forever).
export function isDescendantOf(objects: ScreenObject[], ancestorId: string, descendantId: string): boolean {
  const ancestor = findObjectById(objects, ancestorId)
  if (!ancestor?.children || ancestor.children.length === 0) return false
  return !!findObjectById(ancestor.children, descendantId)
}

// The object-tree drag-and-drop's structural rules, kept in one place so
// the UI (drop-target highlighting) and the actual move can't disagree:
//   - a "panel" never reparents - it only ever reorders among the existing
//     panel siblings of its own tab-control (dragging it elsewhere would
//     either strand it outside any tab-control, where it renders nothing
//     per the read-only paths' "stray panel" handling, or duplicate what a
//     tab-control's own "+" button is for)
//   - everything else can live at the screen's top level or inside a
//     "panel" (which fills its own tab-control's box and positions its
//     children relative to it - see ScreenObject.children's doc comment)
//     but never directly inside a "tab-control" (whose own children must
//     stay exactly the panels that define its modes) or inside a leaf
//     object (which has no children slot at all)
//   - no dropping an object onto itself or into its own subtree
export function canDropAsChildOf(objects: ScreenObject[], draggedId: string, newParentId: string | null): boolean {
  const dragged = findObjectById(objects, draggedId)
  if (!dragged) return false
  if (newParentId === draggedId) return false
  if (newParentId !== null && isDescendantOf(objects, draggedId, newParentId)) return false

  if (dragged.type === "panel") {
    const currentParent = findParentOf(objects, draggedId)?.parent ?? null
    return newParentId !== null && newParentId === currentParent?.id
  }

  if (newParentId === null) return true
  const parent = findObjectById(objects, newParentId)
  return parent?.type === "panel"
}

// Where a moved object lands among its new siblings, expressed relative to
// another sibling's id rather than a raw numeric index. A plain index would
// be ambiguous about whether it's a pre- or post-removal position: removing
// the dragged object first shifts every later sibling's index down by one,
// so a "before/after row X" position computed before the removal can be off
// by one once it's actually spliced into the post-removal list. Anchoring
// to X's id sidesteps that entirely - moveObjectToParent looks up X's
// position AFTER the removal, so there's nothing to get off-by-one on.
export type MoveAnchor =
  | { type: "start" }
  | { type: "end" }
  | { type: "before"; siblingId: string }
  | { type: "after"; siblingId: string }

// Removes `objectId` from wherever it currently lives in the tree and
// inserts it into `newParentId`'s children (top-level if null) at the given
// anchor, renumbering zIndex sequentially (0..n-1, ascending = back-to-
// front) across the resulting sibling list. Renumbering the whole list
// rather than trying to slot a fractional value in between neighbors keeps
// zIndex a small, gap-free range indefinitely and matches how
// addObject/addPanelToTabControl already assign it (next integer after the
// current siblings' max) - the object tree's drag-and-drop is just another
// way of rewriting that same sequence. Caller is expected to have already
// checked canDropAsChildOf.
export function moveObjectToParent(
  objects: ScreenObject[],
  objectId: string,
  newParentId: string | null,
  anchor: MoveAnchor,
): ScreenObject[] {
  const moved = findObjectById(objects, objectId)
  if (!moved) return objects

  const withoutMoved = deleteObjectById(objects, objectId)

  // `siblings` here is already the POST-removal list (see call sites below)
  // - ascending = back-to-front, matching sortChildrenByZIndex's convention.
  const insertAndRenumber = (siblings: ScreenObject[]): ScreenObject[] => {
    const ascending = sortChildrenByZIndex(siblings)
    let insertIndex: number
    if (anchor.type === "start") {
      insertIndex = 0
    } else if (anchor.type === "end") {
      insertIndex = ascending.length
    } else {
      const siblingIndex = ascending.findIndex((obj) => obj.id === anchor.siblingId)
      insertIndex = siblingIndex === -1 ? ascending.length : anchor.type === "before" ? siblingIndex : siblingIndex + 1
    }
    const next = [...ascending]
    next.splice(insertIndex, 0, moved)
    return next.map((obj, i) => (obj.zIndex === i ? obj : { ...obj, zIndex: i }))
  }

  if (newParentId === null) {
    return insertAndRenumber(withoutMoved)
  }

  const updateParent = (list: ScreenObject[]): ScreenObject[] =>
    list.map((obj) => {
      if (obj.id === newParentId) {
        return { ...obj, children: insertAndRenumber(obj.children ?? []) }
      }
      if (obj.children && obj.children.length > 0) {
        return { ...obj, children: updateParent(obj.children) }
      }
      return obj
    })

  return updateParent(withoutMoved)
}
