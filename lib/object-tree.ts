/**
 * Recursive tree operations over ScreenmanObject[] (screen.objects and, at
 * any depth, their .children). Every screen.objects array in this app used
 * to be treated as flat - findObjectById/updateObjectById/etc. exist so
 * selection, editing, and CRUD keep working once an object can be nested
 * inside a tab-control's panel, without every call site needing its own
 * recursive-walk copy.
 */

import type { ScreenmanObject } from "@/components/screenman-editor"

export function findObjectById(objects: ScreenmanObject[], id: string): ScreenmanObject | null {
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
export function getAbsolutePosition(objects: ScreenmanObject[], id: string): { x: number; y: number } | null {
  const walk = (list: ScreenmanObject[], offsetX: number, offsetY: number): { x: number; y: number } | null => {
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

export function updateObjectById(objects: ScreenmanObject[], id: string, updates: Partial<ScreenmanObject>): ScreenmanObject[] {
  return objects.map((obj) => {
    if (obj.id === id) return { ...obj, ...updates }
    if (obj.children && obj.children.length > 0) {
      return { ...obj, children: updateObjectById(obj.children, id, updates) }
    }
    return obj
  })
}

export function updateObjectsById(objects: ScreenmanObject[], ids: string[], updates: Partial<ScreenmanObject>): ScreenmanObject[] {
  return objects.map((obj) => {
    if (ids.includes(obj.id)) return { ...obj, ...updates }
    if (obj.children && obj.children.length > 0) {
      return { ...obj, children: updateObjectsById(obj.children, ids, updates) }
    }
    return obj
  })
}

export function deleteObjectById(objects: ScreenmanObject[], id: string): ScreenmanObject[] {
  return objects
    .filter((obj) => obj.id !== id)
    .map((obj) => (obj.children && obj.children.length > 0 ? { ...obj, children: deleteObjectById(obj.children, id) } : obj))
}

export function deleteObjectsById(objects: ScreenmanObject[], ids: string[]): ScreenmanObject[] {
  return objects
    .filter((obj) => !ids.includes(obj.id))
    .map((obj) => (obj.children && obj.children.length > 0 ? { ...obj, children: deleteObjectsById(obj.children, ids) } : obj))
}

// Appends newObject into parentId's .children (creating the array if
// absent). Children aren't type-category ordered like top-level
// screen.objects (see lib/object-order.ts's insertObjectInOrder) - they're
// zIndex-sorted at render/interaction time instead (sortChildrenByZIndex),
// so simple append is correct here.
export function insertObjectIntoParent(objects: ScreenmanObject[], parentId: string, newObject: ScreenmanObject): ScreenmanObject[] {
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
