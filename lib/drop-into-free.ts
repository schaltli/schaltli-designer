/**
 * Dragging objects into a free area and out of it again
 * (docs/2026-11-03-drop-into-free.md).
 *
 * Which area a dragged selection goes into is decided by one point, the
 * middle of what is dragged, in screen coordinates. An area takes it when
 * that point is inside it by more than the snap zone - near its edge,
 * snapping to tables keeps deciding, as before. Of nested areas the
 * innermost wins. An object of an area leaves it once the point is outside
 * the area altogether.
 */

import type { ScreenObject } from "@/components/project-editor"
import { childOrigin, translateObject } from "@/lib/object-groups"
import { deleteObjectsById, findObjectById, findParentOf } from "@/lib/object-tree"

export interface Point {
  x: number
  y: number
}

/** Where a drop goes: into the area `into`, or into the screen or panel `into` names when leaving one (null: the screen). */
export interface AreaDrop {
  into: string | null
}

/** The middle of the objects' bounding box, in the space they are given in. */
export function middleOf(objects: Array<{ x: number; y: number; width: number; height: number }>): Point {
  const minX = Math.min(...objects.map((o) => o.x))
  const minY = Math.min(...objects.map((o) => o.y))
  const maxX = Math.max(...objects.map((o) => o.x + o.width))
  const maxY = Math.max(...objects.map((o) => o.y + o.height))
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

/** How far inside an area the point has to be: the snap zone, at most a quarter of the area, so a small card still takes something. */
function depthIn(area: ScreenObject, zone: number): number {
  return Math.max(0, Math.min(zone, area.width / 4, area.height / 4))
}

const inside = (p: Point, x: number, y: number, w: number, h: number, inset = 0) =>
  p.x >= x + inset && p.x <= x + w - inset && p.y >= y + inset && p.y <= y + h - inset

/**
 * The innermost free area under `point`, among `list` (children measured from
 * `origin`) and what they hold - through tables and groups, not into a
 * switcher (its panels are opened to be worked in). The topmost wins where
 * areas overlap. Excluded objects are neither taken nor looked into: a free
 * area never goes into itself or what it holds.
 */
function areaIn(list: ScreenObject[], origin: Point, point: Point, exclude: Set<string>, zone: number): ScreenObject | null {
  const topmostFirst = [...list].sort((a, b) => b.zIndex - a.zIndex)
  for (const obj of topmostFirst) {
    if (exclude.has(obj.id)) continue
    const x = origin.x + obj.x
    const y = origin.y + obj.y
    if (obj.type === "free") {
      if (!inside(point, x, y, obj.width, obj.height, depthIn(obj, zone))) continue
      return areaIn(obj.children ?? [], { x, y }, point, exclude, zone) ?? obj
    }
    if ((obj.type === "table" || obj.type === "group") && inside(point, x, y, obj.width, obj.height)) {
      const found = areaIn(obj.children ?? [], { x, y }, point, exclude, zone)
      if (found) return found
    }
  }
  return null
}

/** The panel `id` stands in, itself if it is one, or null for the screen. */
function panelOf(objects: ScreenObject[], id: string | null): string | null {
  for (let node = id ? findObjectById(objects, id) : null; node; node = findParentOf(objects, node.id)?.parent ?? null) {
    if (node.type === "panel") return node.id
  }
  return null
}

/**
 * Where a selection dragged from `parentId` (null: the screen) goes when let
 * go with its middle at `point`: into the innermost free area there, or -
 * leaving the free area it is in - into the panel or the screen that area
 * stands in. Null: it stays with its parent. Looked for only in the screen or
 * panel the objects are in.
 */
export function areaDropAt(objects: ScreenObject[], ids: string[], parentId: string | null, point: Point, zone: number): AreaDrop | null {
  const root = panelOf(objects, parentId)
  const rootList = root ? (findObjectById(objects, root)?.children ?? []) : objects
  const area = areaIn(rootList, childOrigin(objects, root), point, new Set(ids), zone)
  if (area) return area.id === parentId ? null : { into: area.id }
  const parent = parentId ? findObjectById(objects, parentId) : null
  if (parent?.type !== "free") return null
  // Still over the area it is in, near its edge: it stays.
  const at = childOrigin(objects, findParentOf(objects, parent.id)?.parent?.id ?? null)
  if (inside(point, at.x + parent.x, at.y + parent.y, parent.width, parent.height)) return null
  return { into: root }
}

/**
 * The objects moved into `into` (a free area, a panel, or null for the
 * screen), each where it stood on the glass, above what is there already, in
 * the order they had. In an area an object starts as a new one does: no
 * Position, no Dock.
 */
export function moveIntoArea(objects: ScreenObject[], ids: string[], into: string | null): ScreenObject[] {
  const moving = ids
    .map((id) => {
      const obj = findObjectById(objects, id)
      if (!obj) return null
      const from = childOrigin(objects, findParentOf(objects, id)?.parent?.id ?? null)
      return { obj, from }
    })
    .filter((m): m is { obj: ScreenObject; from: Point } => m !== null)
    .sort((a, b) => a.obj.zIndex - b.obj.zIndex)
  if (moving.length === 0) return objects
  if (into && (ids.includes(into) || ids.some((id) => isWithin(objects, id, into)))) return objects
  const rest = deleteObjectsById(objects, moving.map((m) => m.obj.id))
  const to = childOrigin(rest, into)
  const target = into ? findObjectById(rest, into) : null
  if (into && !target) return objects
  const siblings = target ? (target.children ?? []) : rest
  const base = Math.max(0, ...siblings.map((o) => o.zIndex))
  const placed = moving.map(({ obj, from }, i) => {
    const moved = translateObject(obj, from.x - to.x, from.y - to.y)
    const { anchor: _anchor, dock: _dock, ownSize: _ownSize, dockedOut: _dockedOut, ...properties } = moved.properties ?? {}
    return { ...moved, x: Math.round(moved.x), y: Math.round(moved.y), zIndex: base + i + 1, properties }
  })
  if (!into) return [...rest, ...placed]
  const put = (list: ScreenObject[]): ScreenObject[] =>
    list.map((o) => (o.id === into ? { ...o, children: [...(o.children ?? []), ...placed] } : o.children ? { ...o, children: put(o.children) } : o))
  return put(rest)
}

/** Whether `id` holds `inner`, at any depth. */
function isWithin(objects: ScreenObject[], id: string, inner: string): boolean {
  const obj = findObjectById(objects, id)
  return !!obj?.children && !!findObjectById(obj.children, inner)
}
