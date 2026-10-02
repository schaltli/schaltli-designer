/**
 * Groups (2026-09-29): objects kept together in the designer - a Text and the
 * Slider it names, a Text and a Switch - without either of them owning the
 * other. A group is a container like a switcher's panel: its children carry
 * coordinates relative to its own origin, so moving the group is one change
 * to its x/y and nothing else.
 *
 * Designer-only. No device knows the type: every export dissolves a group
 * into its children first (dissolveGroupsInProject), which land in the
 * group's parent at their absolute position and in the group's place in the
 * stacking order. So a box in a group is a top-level box again when the
 * export decides what goes into the baked background.
 *
 * A group has no size of its own either: its box is always its children's
 * bounding box, restored after every edit by normalizeProjectGroups - the
 * editor runs every change through it, so no call site has to remember.
 */

import type { Project, ScreenObject } from "@/components/project-editor"
import { sortChildrenByZIndex } from "@/lib/object-order"
import { isContainerType } from "@/lib/layout"
import { findObjectById, findParentOf } from "@/lib/object-tree"

export const GROUP_TYPE = "group" as const

export function isGroup(obj: { type: string } | null | undefined): boolean {
  return obj?.type === GROUP_TYPE
}

/**
 * Whether an object can live in a group. A panel belongs to its switcher and
 * nowhere else. A switcher stays out too: its tab strip is hit-tested at the
 * screen's top level, so one inside a group could be seen but not switched.
 */
export function canBeGrouped(obj: { type: string }): boolean {
  return obj.type !== "panel" && obj.type !== "switcher"
}

/**
 * The object moved by (dx, dy). A line's points are where it is really drawn
 * (render-line.ts getLinePoints), in the same space as its x/y, so they move
 * with it - moving the box alone would leave the line behind.
 */
export function translateObject<T extends ScreenObject>(obj: T, dx: number, dy: number): T {
  if (dx === 0 && dy === 0) return obj
  const moved: T = { ...obj, x: obj.x + dx, y: obj.y + dy }
  const points = obj.properties?.points
  if (Array.isArray(points)) {
    moved.properties = {
      ...obj.properties,
      points: points.map((p: { x: number; y: number }) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    }
  }
  return moved
}

/** Where an object really covers, in its parent's space. */
export function objectBounds(obj: ScreenObject): { minX: number; minY: number; maxX: number; maxY: number } {
  const points = obj.properties?.points
  if (Array.isArray(points) && points.length > 0) {
    const xs = points.map((p: { x: number }) => p.x)
    const ys = points.map((p: { y: number }) => p.y)
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
  }
  // A line dragged up or left has a negative width.
  return {
    minX: Math.min(obj.x, obj.x + obj.width),
    minY: Math.min(obj.y, obj.y + obj.height),
    maxX: Math.max(obj.x, obj.x + obj.width),
    maxY: Math.max(obj.y, obj.y + obj.height),
  }
}

function boundsOf(objects: ScreenObject[]) {
  const all = objects.map(objectBounds)
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  }
}

/**
 * Every group's box made its children's bounding box again, with the
 * children kept where they are on the screen; an empty group removed. Deep:
 * a group inside a panel or inside another group, innermost first.
 *
 * Returns the very same array when nothing had to change, so it can run on
 * every edit - React and the undo history both compare by reference.
 */
export function normalizeGroups(objects: ScreenObject[]): ScreenObject[] {
  let changed = false
  const out: ScreenObject[] = []
  for (const obj of objects) {
    let next = obj
    if (obj.children && obj.children.length > 0) {
      const children = normalizeGroups(obj.children)
      if (children !== obj.children) next = { ...obj, children }
    }
    if (isGroup(next)) {
      const children = next.children ?? []
      if (children.length === 0) {
        changed = true
        continue
      }
      const b = boundsOf(children)
      const width = b.maxX - b.minX
      const height = b.maxY - b.minY
      if (b.minX !== 0 || b.minY !== 0 || next.width !== width || next.height !== height) {
        next = {
          ...next,
          x: next.x + b.minX,
          y: next.y + b.minY,
          width,
          height,
          children: b.minX !== 0 || b.minY !== 0 ? children.map((c) => translateObject(c, -b.minX, -b.minY)) : children,
        }
      }
    }
    if (next !== obj) changed = true
    out.push(next)
  }
  return changed ? out : objects
}

/** normalizeGroups over every screen of a project, the same reference if nothing changed. */
export function normalizeProjectGroups(project: Project): Project {
  if (!project?.screens) return project
  let changed = false
  const screens = project.screens.map((screen) => {
    const objects = normalizeGroups(screen.objects ?? [])
    if (objects === screen.objects) return screen
    changed = true
    return { ...screen, objects }
  })
  return changed ? { ...project, screens } : project
}

/**
 * Stacking numbers for a sibling list whose order is decided, back to front:
 * each keeps its own zIndex where that still sorts it right, and is raised
 * just enough where it does not. Renumbering the whole list from 0 would say
 * the same about these siblings - but a master screen's objects are drawn
 * merged with a screen's by the same numbers (lib/object-order.ts), and they
 * would move relative to every one of them.
 */
function restack(ordered: ScreenObject[], wanted: number[]): ScreenObject[] {
  let previous = -Infinity
  return ordered.map((obj, i) => {
    const z = Math.max(wanted[i], previous + 1)
    previous = z
    return obj.zIndex === z ? obj : { ...obj, zIndex: z }
  })
}

// One sibling list with its layout containers (lib/layout.ts) replaced by
// their children, at their position in the list's own space, at any depth of
// containers in containers. Unlike a group's, a container's children keep
// their own stacking numbers: a container is structure, not a layer - an old
// screen wrapped in a `free` root (docs/2026-10-02-layout.md) must export
// exactly as it did before it was wrapped.
function dissolveContainerList(objects: ScreenObject[]): ScreenObject[] {
  if (!objects.some((obj) => isContainerType(obj.type))) return objects
  const out: ScreenObject[] = []
  for (const obj of objects) {
    if (!isContainerType(obj.type)) {
      out.push(obj)
      continue
    }
    out.push(...dissolveContainerList((obj.children ?? []).map((child) => translateObject(child, obj.x, obj.y))))
  }
  return out
}

// One sibling list with its groups replaced by their children, in the
// group's place in the stacking order and at their position in the list's
// own space.
function dissolveList(objects: ScreenObject[]): ScreenObject[] {
  if (!objects.some(isGroup)) return objects
  const ordered: ScreenObject[] = []
  const wanted: number[] = []
  for (const obj of sortChildrenByZIndex(objects)) {
    if (!isGroup(obj)) {
      ordered.push(obj)
      wanted.push(obj.zIndex)
      continue
    }
    for (const child of sortChildrenByZIndex(obj.children ?? [])) {
      ordered.push(translateObject(child, obj.x, obj.y))
      wanted.push(obj.zIndex)
    }
  }
  const restacked = restack(ordered, wanted)
  // A group's child can be a group itself, or a layout container.
  return restacked.some((obj) => isGroup(obj) || isContainerType(obj.type))
    ? dissolveList(dissolveContainerList(restacked))
    : restacked
}

/**
 * Every group dissolved, at every depth: what a device gets instead. The
 * children keep their stacking order, their locations on the screen and
 * their ids - an export keys its baked pictures by object id, and a group
 * never had a picture of its own.
 */
export function dissolveGroups(objects: ScreenObject[]): ScreenObject[] {
  // Layout containers first: they hold groups as often as groups hold them.
  const flat = dissolveList(dissolveContainerList(objects ?? []))
  let changed = flat !== objects
  const out = flat.map((obj) => {
    if (!obj.children || obj.children.length === 0) return obj
    const children = dissolveGroups(obj.children)
    if (children === obj.children) return obj
    changed = true
    return { ...obj, children }
  })
  return changed ? out : objects
}

/** dissolveGroups over every screen, masters included - the first step of every export. */
export function dissolveGroupsInProject<P extends { screens: Array<{ objects: ScreenObject[] }> }>(project: P): P {
  if (!project?.screens) return project
  let changed = false
  const screens = project.screens.map((screen) => {
    const objects = dissolveGroups(screen.objects ?? [])
    if (objects === screen.objects) return screen
    changed = true
    return { ...screen, objects }
  })
  return changed ? { ...project, screens } : project
}

/** Whether any screen of the project holds a group - an export can say so. */
export function projectHasGroups(project: { screens?: Array<{ objects?: ScreenObject[] }> }): boolean {
  const walk = (objects: ScreenObject[] | undefined): boolean =>
    (objects ?? []).some((obj) => isGroup(obj) || walk(obj.children))
  return (project.screens ?? []).some((screen) => walk(screen.objects))
}

// Replaces the sibling list `parentId` holds (the screen's own list for null).
function mapSiblings(
  objects: ScreenObject[],
  parentId: string | null,
  fn: (siblings: ScreenObject[]) => ScreenObject[],
): ScreenObject[] {
  if (parentId === null) return fn(objects)
  return objects.map((obj) => {
    if (obj.id === parentId) return { ...obj, children: fn(obj.children ?? []) }
    if (obj.children && obj.children.length > 0) return { ...obj, children: mapSiblings(obj.children, parentId, fn) }
    return obj
  })
}

export type GroupRefusal = "too-few" | "different-parents" | "not-groupable"

/**
 * Why these objects cannot be grouped, or null when they can: at least two,
 * all side by side in one sibling list, none a panel or a switcher, and that
 * list in the screen, a panel or a group.
 */
export function groupRefusal(objects: ScreenObject[], ids: string[]): GroupRefusal | null {
  if (ids.length < 2) return "too-few"
  const parents = new Set<string | null>()
  for (const id of ids) {
    const obj = findObjectById(objects, id)
    const where = findParentOf(objects, id)
    if (!obj || !where) return "too-few"
    if (!canBeGrouped(obj)) return "not-groupable"
    parents.add(where.parent?.id ?? null)
  }
  if (parents.size !== 1) return "different-parents"
  const [parentId] = [...parents]
  if (parentId !== null) {
    const parent = findObjectById(objects, parentId)
    if (parent && parent.type !== "panel" && !isGroup(parent)) return "not-groupable"
  }
  return null
}

/**
 * The objects `ids` moved into a new group with id `groupId`, which takes the
 * place of the frontmost of them - in the stacking order and, at the
 * screen's top level, in the list. The children keep their order among
 * themselves and where they are on the screen. Null when groupRefusal says
 * no.
 */
export function groupObjects(objects: ScreenObject[], ids: string[], groupId: string): ScreenObject[] | null {
  if (groupRefusal(objects, ids) !== null) return null
  const parentId = findParentOf(objects, ids[0])!.parent?.id ?? null
  return mapSiblings(objects, parentId, (siblings) => {
    const members = sortChildrenByZIndex(siblings.filter((o) => ids.includes(o.id)))
    const front = members[members.length - 1]
    const b = boundsOf(members)
    const group: ScreenObject = {
      id: groupId,
      type: GROUP_TYPE,
      x: b.minX,
      y: b.minY,
      width: b.maxX - b.minX,
      height: b.maxY - b.minY,
      zIndex: front.zIndex,
      properties: {},
      children: members.map((m, i) => ({ ...translateObject(m, -b.minX, -b.minY), zIndex: i })),
    }
    const frontIndex = siblings.findIndex((o) => o.id === front.id)
    const out: ScreenObject[] = []
    siblings.forEach((o, i) => {
      if (i === frontIndex) out.push(group)
      else if (!ids.includes(o.id)) out.push(o)
    })
    return out
  })
}

/**
 * The group `groupId` dissolved into its parent: its children take its place
 * in the stacking order and in the list, at their absolute position. Returns
 * the tree and the children's ids, or null when `groupId` is not a group.
 */
export function ungroupObject(objects: ScreenObject[], groupId: string): { objects: ScreenObject[]; childIds: string[] } | null {
  const group = findObjectById(objects, groupId)
  const where = findParentOf(objects, groupId)
  if (!group || !where || !isGroup(group)) return null
  const children = sortChildrenByZIndex(group.children ?? [])
  const childIds = children.map((c) => c.id)
  const parentId = where.parent?.id ?? null
  const next = mapSiblings(objects, parentId, (siblings) => {
    // The list order first (it is what insertObjectInOrder reads at the top
    // level), then the stacking numbers in the order the list is drawn in.
    const inList: ScreenObject[] = []
    for (const o of siblings) {
      if (o.id === groupId) inList.push(...children.map((c) => translateObject(c, group.x, group.y)))
      else inList.push(o)
    }
    const drawn: ScreenObject[] = []
    const wanted: number[] = []
    for (const o of sortChildrenByZIndex(siblings)) {
      if (o.id === groupId) {
        for (const c of children) {
          drawn.push(inList.find((x) => x.id === c.id)!)
          wanted.push(group.zIndex)
        }
      } else {
        drawn.push(o)
        wanted.push(o.zIndex)
      }
    }
    const restacked = new Map(restack(drawn, wanted).map((o) => [o.id, o]))
    return inList.map((o) => restacked.get(o.id) ?? o)
  })
  return { objects: next, childIds }
}

/**
 * A copy of `obj` in which it and every descendant have a new id, drawn from
 * `nextId` upwards. Returns the copy and the next free number. A paste used
 * to renumber only the object itself, so a pasted switcher's panels - and
 * now a group's children - shared their ids with the originals, and
 * selecting one selected the other.
 */
export function withFreshIds(obj: ScreenObject, nextId: number): { object: ScreenObject; nextId: number } {
  let n = nextId
  const walk = (o: ScreenObject): ScreenObject => {
    const copy: ScreenObject = { ...o, id: `obj-${n++}` }
    if (o.children) copy.children = o.children.map(walk)
    return copy
  }
  const object = walk(obj)
  return { object, nextId: n }
}

/**
 * Where a container's children are measured from, on the screen: the sum of
 * the x/y of the container and every ancestor, except a panel's, which only
 * ever fills its switcher (both renderers translate by the switcher alone -
 * see lib/render-screen.ts and asset-export.ts's flatten). The screen itself
 * (null) is the origin.
 */
export function childOrigin(objects: ScreenObject[], containerId: string | null): { x: number; y: number } {
  if (containerId === null) return { x: 0, y: 0 }
  const walk = (list: ScreenObject[], ox: number, oy: number): { x: number; y: number } | null => {
    for (const obj of list) {
      const x = obj.type === "panel" ? ox : ox + obj.x
      const y = obj.type === "panel" ? oy : oy + obj.y
      if (obj.id === containerId) return { x, y }
      if (obj.children && obj.children.length > 0) {
        const found = walk(obj.children, x, y)
        if (found) return found
      }
    }
    return null
  }
  return walk(objects, 0, 0) ?? { x: 0, y: 0 }
}

/** Whether a container's children can be worked on in the canvas: a panel's or a group's. */
export function isEditableContainer(obj: { type: string } | null | undefined): boolean {
  // A layout container (lib/layout.ts) is entered as a group is.
  return obj?.type === "panel" || isGroup(obj) || isContainerType(obj?.type)
}

/**
 * The container the editor should be "inside" once `id` is selected, given
 * the one it is inside now: the innermost of the current one and its
 * ancestors that holds `id` - or that is `id`, for a panel, which is
 * selected by opening it. Selecting a group itself leaves it. Null when none
 * holds it: back at the screen's top level.
 */
export function editingContainerAfterSelecting(
  objects: ScreenObject[],
  current: string | null,
  id: string | null,
): string | null {
  if (current === null || id === null) return null
  let candidate: ScreenObject | null = findObjectById(objects, current)
  while (candidate) {
    if (isEditableContainer(candidate)) {
      if (candidate.id === id && candidate.type === "panel") return candidate.id
      if (candidate.id !== id && findObjectById(candidate.children ?? [], id)) return candidate.id
    }
    candidate = findParentOf(objects, candidate.id)?.parent ?? null
  }
  return null
}

/** The editable container directly holding `id`, if it has one. */
export function containerOf(objects: ScreenObject[], id: string): string | null {
  const parent = findParentOf(objects, id)?.parent ?? null
  return parent && isEditableContainer(parent) ? parent.id : null
}

/**
 * Pieces not yet placed - no ids, no stacking numbers, absolute positions -
 * made one group, the way a building block arrives (lib/bausteine.ts). The
 * children get placeholder ids; whoever places the group gives it and them
 * real ones (withFreshIds). Their order is their stacking order.
 */
export function groupOfPieces(pieces: Omit<ScreenObject, "id" | "zIndex">[]): Omit<ScreenObject, "id" | "zIndex"> {
  const placed = pieces.map((p, i) => ({ ...p, id: "", zIndex: i }) as ScreenObject)
  const b = boundsOf(placed)
  return {
    type: GROUP_TYPE,
    x: b.minX,
    y: b.minY,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
    properties: {},
    children: placed.map((c) => translateObject(c, -b.minX, -b.minY)),
  }
}
