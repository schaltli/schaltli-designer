/**
 * How small a free area - a card - can be made (the user, 2026-11-06): only
 * so small that everything in it still has its room. Made smaller, a docked
 * object that no longer fitted was left out (lib/dock.ts, `dockedOut`) and
 * one standing free ran past the edge, drawn over a neighbour on a device
 * or cut by Clip - both a surprise at the end of a drag.
 *
 * The bound is what the area's own machinery does at a size: the area
 * resized there (lib/anchor.ts resizeFree, each object by its anchor) and
 * docked (dockFree), then asked whether
 * - nothing docked was left out,
 * - nothing standing free reaches past the area's edge,
 * - nothing stretched with it (a docked slider, an object anchored Stretch)
 *   is narrower than it needs to be - a text its words, a switch its labels -
 *   or a text lower than its line,
 * and the same inside each free area it holds. The smallest such size is
 * found by halving, as fitting only gets easier with room.
 */

import type { ScreenObject } from "@/components/project-editor"
import { areaAnchorOf, resizeFree } from "@/lib/anchor"
import { dockFree, dockOf, paddingOf } from "@/lib/dock"
import { naturalWidth, type LayoutScale } from "@/lib/layout"
import { objectBounds, translateObject } from "@/lib/object-groups"
import { isSnapTable } from "@/lib/snap-table"
import { lineHeight } from "@/lib/size-scale"

// Room to search in for one side while the other is tried: as good as endless.
const ENDLESS = 100000

// The narrowest a stretched object may become: a text, switch, button group
// or button as its words and labels need; a table as its columns; a slider,
// bar or anything else stretched not below its own height - a track still
// longer than it is thick.
function minWidthOf(obj: ScreenObject, scale: LayoutScale): number {
  if (isSnapTable(obj) || ["text", "switch", "button-group", "toggle-button", "button"].includes(obj.type)) return naturalWidth(obj, scale)
  return Math.max(1, Math.abs(obj.height))
}

function minHeightOf(obj: ScreenObject, scale: LayoutScale): number {
  if (obj.type !== "text") return 1
  const font = (scale.fonts ?? []).find((f) => f.id === obj.properties?.fontId)
  return font ? lineHeight(font) : 1
}

type Axis = "x" | "y" | "both"

// Whether everything the laid-out area holds has its room in it - across
// (x), down (y), or both.
function holds(area: ScreenObject, scale: LayoutScale, axis: Axis = "both"): boolean {
  const x = axis !== "y"
  const y = axis !== "x"
  const pad = Math.round(paddingOf(area) * scale.pixelsPerMm)
  for (const child of area.children ?? []) {
    if (child.properties?.dockedOut) return false
    const docked = dockOf(child)
    // Inside its padding, docked or not: a table docked Fill too wide for a
    // card is not left out but cut at its edge (lib/dock.ts), which is just
    // as much not having its room; and an object standing free that the card
    // grew for did not stick to its edge (the user, 2026-11-06).
    // An edge only where the area's size moves it: the one an object keeps
    // its distance to stays where it was put - no size changes that, and
    // asking for it made a card holding a label moved into its top left
    // corner collapse (obj-209, the user 2026-11-06). Out of the padding
    // there it is moved by keptInPadding, below, not by a size.
    const anchor = areaAnchorOf(child)
    const b = objectBounds(child)
    const keptLeft = !docked && (anchor.x === "left" || anchor.x === "stretch")
    const keptTop = !docked && (anchor.y === "top" || anchor.y === "stretch")
    const keptRight = !docked && (anchor.x === "right" || anchor.x === "stretch")
    const keptBottom = !docked && (anchor.y === "bottom" || anchor.y === "stretch")
    if (x && ((!keptLeft && b.minX < pad) || (!keptRight && b.maxX > area.width - pad))) return false
    if (y && ((!keptTop && b.minY < pad) || (!keptBottom && b.maxY > area.height - pad))) return false
    const stretchedW = docked === "top" || docked === "bottom" || docked === "fill" || (!docked && anchor.x === "stretch")
    const stretchedH = docked === "left" || docked === "right" || docked === "fill" || (!docked && anchor.y === "stretch")
    if (x && stretchedW && !Array.isArray(child.properties?.points) && child.width < minWidthOf(child, scale)) return false
    if (y && stretchedH && child.height < minHeightOf(child, scale)) return false
    if (child.type === "free" && !holds(child, scale, axis)) return false
  }
  return true
}

function fitsAt(area: ScreenObject, width: number, height: number, scale: LayoutScale, axis: Axis = "both"): boolean {
  return holds(dockFree(resizeFree(area, width, height), scale), scale, axis)
}

// The smallest value in [1, upTo] for which `fits` holds, given it holds at upTo:
// fitting only gets easier with room.
function smallest(upTo: number, fits: (v: number) => boolean): number {
  let lo = 1
  let hi = Math.max(1, Math.round(upTo))
  if (fits(lo)) return lo
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/**
 * The smallest width and height `area` can be resized to with everything in
 * it still whole and inside its padding. More than it has where it is
 * already too small (a card saved narrower than its table, the user
 * 2026-11-06). 1 - no bound - where no size would make the content fit (an
 * object kept to the right edge standing left of the padding). Undefined for
 * anything but a free area holding something.
 */
export function freeMinSize(area: ScreenObject, scale: LayoutScale): { width: number; height: number } | undefined {
  if (area.type !== "free" || !(area.children?.length)) return undefined
  // Each way asked with the other as good as endless; a way in which no size
  // makes it fit sets no bound there (1).
  const width = fitsAt(area, ENDLESS, ENDLESS, scale, "x") ? smallest(ENDLESS, (w) => fitsAt(area, w, ENDLESS, scale, "x")) : 1
  const across = Math.max(width, area.width)
  const height = fitsAt(area, across, ENDLESS, scale, "y") ? smallest(ENDLESS, (h) => fitsAt(area, across, h, scale, "y")) : 1
  return { width, height }
}

/** Whether `area`, at its own size, gives everything in it its room. */
export function holdsItsContent(area: ScreenObject, scale: LayoutScale): boolean {
  return fitsAt(area, area.width, area.height, scale)
}

// A grown area keeps its new size where something else sizes it from what
// it says it has: the size it is drawn at in a table's cell, stretched there
// (cell.drawnWidth/drawnHeight - a row as high as that, lib/snap-table.ts),
// and its own size when it is docked in another area (ownSize, lib/dock.ts).
// Without, the table stretched it back and its own table was left out again
// («Deckenlampe», the user 2026-11-06).
function remembered(area: ScreenObject, width: number, height: number, set = false): ScreenObject {
  const to = (was: number, now: number) => (set ? now : Math.max(was, now))
  const p = area.properties ?? {}
  const cell = p.cell && typeof p.cell === "object" ? { ...p.cell } : undefined
  if (cell && typeof cell.drawnWidth === "number") cell.drawnWidth = to(cell.drawnWidth, width)
  if (cell && typeof cell.drawnHeight === "number") cell.drawnHeight = to(cell.drawnHeight, height)
  const own = p.ownSize && typeof p.ownSize === "object" ? { ...p.ownSize } : undefined
  if (own && typeof own.width === "number") own.width = to(own.width, width)
  if (own && typeof own.height === "number") own.height = to(own.height, height)
  return { ...area, properties: { ...p, ...(cell ? { cell } : {}), ...(own ? { ownSize: own } : {}) } }
}

// `objects` with each free area that does not give what it holds its room
// grown to the room that needs, innermost first. The same reference where
// nothing grew.
/**
 * `area` with each object standing free in it that reaches into its padding
 * on a side it keeps its distance to moved in onto the padding (the user,
 * 2026-11-06) - all four sides keep it. Kept to the left or the top: moved
 * in there; kept to the right or the bottom: moved in there; stretched: in
 * on both, made narrower or lower where it has to be. Into the padding on
 * the side it does not keep to, the card grows instead (grownIn). The same
 * reference where nothing moved.
 */
export function keptInPadding(area: ScreenObject, scale: LayoutScale): ScreenObject {
  if (area.type !== "free" || !area.children?.length) return area
  const pad = Math.round(paddingOf(area) * scale.pixelsPerMm)
  if (pad <= 0) return area
  let moved = false
  const children = area.children.map((child) => {
    if (dockOf(child)) return child
    const anchor = areaAnchorOf(child)
    const b = objectBounds(child)
    const line = Array.isArray(child.properties?.points)
    // Along one side: how far to move it, and how much narrower it gets.
    const along = (a: string, start: string, end: string, lo: number, hi: number, size: number) => {
      if (a === start) return { move: lo < pad ? pad - lo : 0, shrink: 0 }
      if (a === end) return { move: hi > size - pad ? size - pad - hi : 0, shrink: 0 }
      if (a !== "stretch") return { move: 0, shrink: 0 }
      const move = lo < pad ? pad - lo : 0
      return { move, shrink: line ? 0 : Math.max(0, hi + move - (size - pad)) }
    }
    const h = along(anchor.x, "left", "right", b.minX, b.maxX, area.width)
    const v = along(anchor.y, "top", "bottom", b.minY, b.maxY, area.height)
    if (h.move === 0 && v.move === 0 && h.shrink === 0 && v.shrink === 0) return child
    moved = true
    const shifted = translateObject(child, h.move, v.move)
    if (h.shrink === 0 && v.shrink === 0) return shifted
    const width = Math.max(1, shifted.width - h.shrink)
    const height = Math.max(1, shifted.height - v.shrink)
    return shifted.type === "free" ? { ...resizeFree(shifted, width, height), x: shifted.x, y: shifted.y } : { ...shifted, width, height }
  })
  return moved ? { ...area, children } : area
}

function grownIn(objects: ScreenObject[], scale: LayoutScale): ScreenObject[] {
  let changed = false
  const out = objects.map((obj) => {
    const children = obj.children ? grownIn(obj.children, scale) : obj.children
    let current = keptInPadding(children === obj.children ? obj : { ...obj, children }, scale)
    if (current.type === "free" && current.children?.length && !holdsItsContent(current, scale)) {
      const min = freeMinSize(current, scale)
      if (min && (min.width > current.width || min.height > current.height)) {
        const width = Math.max(min.width, current.width)
        const height = Math.max(min.height, current.height)
        current = remembered(dockFree(resizeFree(current, width, height), scale), width, height)
      }
    }
    if (current !== obj) changed = true
    return current
  })
  return changed ? out : objects
}

/**
 * A card grows when what it holds does not fit (the user, 2026-11-06): no
 * docked object left out, nothing cut at its edge or standing past it.
 * Every free area that does not give its content the room it needs is made
 * as large as that - after an edit, and on opening a project («the new rule
 * holds», the user). Its top left corner stays. `relayout` places
 * everything again after a card grew, as a table it stands in follows it;
 * up to three rounds, for cards in tables in cards.
 */
export function withCardsGrown<P extends { screens?: Array<{ objects?: ScreenObject[] }> }>(project: P, scale: LayoutScale, relayout: (project: P) => P): P {
  if (!project?.screens) return project
  let current = project
  for (let round = 0; round < 3; round++) {
    let changed = false
    const screens = current.screens!.map((screen) => {
      if (!screen.objects) return screen
      const objects = grownIn(screen.objects, scale)
      if (objects === screen.objects) return screen
      changed = true
      return { ...screen, objects }
    })
    if (!changed) break
    current = relayout({ ...current, screens })
  }
  return current
}

// `next` with each free area that was as small as what it held - in `prev`,
// matched by id - and whose content the edit changed, made as small as its
// content now is, innermost first; the same reference where none changed.
function followingIn(prev: ScreenObject[] | undefined, next: ScreenObject[], scale: LayoutScale): ScreenObject[] {
  let changed = false
  const out = next.map((obj) => {
    const before = prev?.find((p) => p.id === obj.id)
    const children = obj.children ? followingIn(before?.children, obj.children, scale) : obj.children
    let current = children === obj.children ? obj : { ...obj, children }
    if (
      current.type === "free" &&
      before?.type === "free" &&
      before.children !== obj.children &&
      before.width === obj.width &&
      before.height === obj.height
    ) {
      const was = freeMinSize(before, scale)
      const now = freeMinSize(current, scale)
      if (was && now) {
        // A way with no bound (1: nothing fits there at any size) is not followed.
        const width = before.width === was.width && now.width > 1 ? now.width : current.width
        const height = before.height === was.height && now.height > 1 ? now.height : current.height
        if (width !== current.width || height !== current.height) {
          current = remembered(dockFree(resizeFree(current, width, height), scale), width, height, true)
        }
      }
    }
    if (current !== obj) changed = true
    return current
  })
  return changed ? out : next
}

/**
 * A card that ended where its content did follows it, smaller as well as
 * larger (the user, 2026-11-06): «Deckenlampe» docked above its slider made
 * the card grow, docked back beside it the card stayed as tall - and,
 * stretched in a cell, it had no handle to be made smaller by. A card that
 * was as wide or as tall as its content needs, in `prev`, is so again after
 * an edit that changed its content; one given more room of its own keeps it
 * (as Convert to, lib/convert-object.ts). Then laid out with `relayout`.
 */
export function withCardsFollowing<P extends { name?: string; screens?: Array<{ id: string; objects?: ScreenObject[] }> }>(
  prev: P,
  next: P,
  scale: LayoutScale,
  relayout: (project: P) => P,
): P {
  if (!prev?.screens || !next?.screens || prev.name !== next.name) return next
  let changed = false
  const screens = next.screens.map((screen) => {
    const before = prev.screens!.find((s) => s.id === screen.id)
    if (!before?.objects || !screen.objects || before.objects === screen.objects) return screen
    const objects = followingIn(before.objects, screen.objects, scale)
    if (objects === screen.objects) return screen
    changed = true
    return { ...screen, objects }
  })
  return changed ? relayout({ ...next, screens }) : next
}
