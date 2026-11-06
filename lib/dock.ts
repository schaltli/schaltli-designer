/**
 * Padding and Dock in a free area (docs/2026-11-03-anchor-dock.md, Task 3).
 *
 * An object directly in a free area may be docked: Top, Bottom, Left, Right
 * or Fill. The area places its docked objects inside its padding, in the
 * order of the object list - top of the list first, which is front first -
 * each along the edge it is docked to, the table gap between them, Fill
 * taking what is left. Across the dock an object takes the room where it can
 * stretch that way, else it stands in it by its Horizontal/Vertical.
 *
 * Too little room: an object that can be made smaller along the dock is cut
 * to what is left; one that cannot - a text's height, an icon, a ring - and
 * does not fit whole is left out (`properties.dockedOut`): not exported, not
 * in the preview, an outline in the editor. Devices clip nothing to an area,
 * so the designer clips by what it exports (tasks/anchor-dock-plan.md).
 * Except a table docked Fill too wide for an area that clips (a card, Clip
 * on - docs/2026-11-03-card-clip.md): that area cuts it, so it stays.
 *
 * Docking overwrites an object's size; its own is kept in
 * `properties.ownSize` while it differs, and given back once it is undocked.
 */

import type { ScreenObject } from "@/components/project-editor"
import { areaAnchorOf, offsetIn, resizeFree, STRETCHES_HEIGHT_IN_AREA, STRETCHES_WIDTH_IN_AREA } from "@/lib/anchor"
import { arrangeSnapTable, isSnapTable, SNAP_GAP_MM } from "@/lib/snap-table"
import { sortChildrenByZIndex } from "@/lib/object-order"
import { translateObject } from "@/lib/object-groups"
import { clipsContents } from "@/lib/clip"

export type Dock = "top" | "bottom" | "left" | "right" | "fill"
const DOCKS: ReadonlySet<string> = new Set(["top", "bottom", "left", "right", "fill"])

export interface DockScale {
  pixelsPerMm: number
}

export function dockOf(obj: ScreenObject): Dock | undefined {
  const d = obj.properties?.dock
  return typeof d === "string" && DOCKS.has(d) ? (d as Dock) : undefined
}

/** A free area's padding in mm, 0 when unset. */
export function paddingOf(area: ScreenObject): number {
  const p = Number(area.properties?.padding)
  return Number.isFinite(p) && p > 0 ? p : 0
}

// The size the object has of its own, before docking overwrote it.
function own(child: ScreenObject): { width: number; height: number } {
  const o = child.properties?.ownSize
  return {
    width: typeof o?.width === "number" ? o.width : child.width,
    height: typeof o?.height === "number" ? o.height : child.height,
  }
}

// A child given back its own size and no marks of docking.
function undocked(child: ScreenObject): ScreenObject {
  const p = child.properties ?? {}
  if (!("ownSize" in p) && !("dockedOut" in p)) return child
  const size = own(child)
  const { ownSize: _o, dockedOut: _d, ...rest } = p
  return child.type === "free" ? { ...resizeFree(child, size.width, size.height), properties: rest } : { ...child, ...size, properties: rest }
}

// A child placed at x, y with a size: its own kept beside it where they differ.
function placed(child: ScreenObject, x: number, y: number, width: number, height: number, scale: DockScale): ScreenObject {
  const size = own(child)
  const { ownSize: _o, dockedOut: _d, ...rest } = child.properties ?? {}
  // Only what docking overwrote is kept, so the rest stays the author's to set.
  const ownSize = { ...(width !== size.width ? { width: size.width } : {}), ...(height !== size.height ? { height: size.height } : {}) }
  const properties = Object.keys(ownSize).length > 0 ? { ...rest, ownSize } : rest
  // A free area takes its own objects along, and docks its own.
  if (child.type === "free") return { ...dockFree({ ...resizeFree(child, width, height), properties }, scale), x, y }
  // A line moves whole, with its points.
  if (Array.isArray(child.properties?.points)) return translateObject({ ...child, properties }, x - child.x, y - child.y)
  return { ...child, x, y, width, height, properties }
}

/**
 * What docking sets of an object's frame, so the panel can lock it: always
 * x and y; along the dock nothing more (its length along it is its own),
 * across it the size it stretches to, both where it fills.
 */
export function dockSets(obj: ScreenObject): Array<"x" | "y" | "width" | "height"> {
  const dock = dockOf(obj)
  if (!dock) return []
  const canW = STRETCHES_WIDTH_IN_AREA.has(obj.type) || isSnapTable(obj)
  const canH = STRETCHES_HEIGHT_IN_AREA.has(obj.type)
  const sets: Array<"x" | "y" | "width" | "height"> = ["x", "y"]
  if ((dock === "top" || dock === "bottom" || dock === "fill") && canW) sets.push("width")
  if ((dock === "left" || dock === "right" || dock === "fill") && canH) sets.push("height")
  return sets
}

const leftOut = (child: ScreenObject): ScreenObject => ({ ...child, properties: { ...child.properties, dockedOut: true } })

/**
 * A free area with its docked objects placed, and every object no longer
 * docked given back its own size. An area with nothing docked and nothing to
 * give back comes back as it was.
 */
export function dockFree(area: ScreenObject, scale: DockScale): ScreenObject {
  if (area.type !== "free") return area
  const children = area.children ?? []
  // Fill last, whatever its place in the list: it takes what the others
  // leave - docked first, it left none, and a heading docked Top after it
  // was left out at any size (the user, 2026-11-06).
  const inOrder = [...sortChildrenByZIndex(children)].reverse().filter((c) => dockOf(c) !== undefined)
  const docked = [...inOrder.filter((c) => dockOf(c) !== "fill"), ...inOrder.filter((c) => dockOf(c) === "fill")]
  const stale = children.some((c) => dockOf(c) === undefined && c.properties && ("ownSize" in c.properties || "dockedOut" in c.properties))
  if (docked.length === 0 && !stale) return area

  const px = (mm: number) => Math.round(mm * scale.pixelsPerMm)
  const pad = px(paddingOf(area))
  const gap = px(SNAP_GAP_MM)
  let room = { x: pad, y: pad, w: Math.max(0, area.width - 2 * pad), h: Math.max(0, area.height - 2 * pad) }
  const done = new Map<string, ScreenObject>()

  for (const child of docked) {
    const dock = dockOf(child)!
    const size = own(child)
    const anchor = areaAnchorOf(child)
    const table = isSnapTable(child)
    const canW = STRETCHES_WIDTH_IN_AREA.has(child.type)
    const canH = STRETCHES_HEIGHT_IN_AREA.has(child.type)
    // A table takes a width the way a switcher's panel stretches it; its
    // height is its content's.
    const across = (w: number): { width: number; height: number; laid?: ScreenObject } => {
      if (table) {
        const laid = arrangeSnapTable(child, scale, w)
        return { width: laid.width, height: laid.height, laid }
      }
      return { width: canW ? w : size.width, height: size.height }
    }

    if (dock === "top" || dock === "bottom") {
      const a = across(room.w)
      let h = a.height
      if (h > room.h) {
        if (!canH || room.h <= 0) {
          done.set(child.id, leftOut(child))
          continue
        }
        h = room.h
      }
      const x = room.x + (canW || table ? 0 : offsetIn(room.w, a.width, anchor.x === "stretch" ? "left" : anchor.x))
      const y = dock === "top" ? room.y : room.y + room.h - h
      done.set(child.id, placed(a.laid ?? child, x, y, a.width, h, scale))
      room = dock === "top" ? { ...room, y: room.y + h + gap, h: room.h - h - gap } : { ...room, h: room.h - h - gap }
      continue
    }

    if (dock === "left" || dock === "right") {
      let w = table ? across(0).width : size.width
      const h = canH ? room.h : size.height
      if (w > room.w || (!canH && h > room.h)) {
        if (!canW || room.w <= 0 || (!canH && h > room.h)) {
          done.set(child.id, leftOut(child))
          continue
        }
        w = room.w
      }
      const laid = table ? arrangeSnapTable(child, scale) : child
      const y = room.y + (canH ? 0 : offsetIn(room.h, h, anchor.y === "stretch" ? "top" : anchor.y))
      const x = dock === "left" ? room.x : room.x + room.w - w
      done.set(child.id, placed(laid, x, y, w, h, scale))
      room = dock === "left" ? { ...room, x: room.x + w + gap, w: room.w - w - gap } : { ...room, w: room.w - w - gap }
      continue
    }

    // Fill: what is left.
    const a = across(room.w)
    const w = a.width
    const h = canH ? room.h : a.height
    // A table wider than the room, in an area that clips what it holds: it
    // stands there, cut at the area's edge on every device (lib/clip.ts) -
    // rather than left out, which showed an empty card and no reason why
    // (the user, 2026-11-04).
    const cutByClip = table && w > room.w && clipsContents(area)
    if (room.w <= 0 || room.h <= 0 || (w > room.w && !cutByClip) || h > room.h) {
      done.set(child.id, leftOut(child))
      continue
    }
    const x = room.x + (canW || table ? 0 : offsetIn(room.w, w, anchor.x === "stretch" ? "left" : anchor.x))
    const y = room.y + (canH ? 0 : offsetIn(room.h, h, anchor.y === "stretch" ? "top" : anchor.y))
    done.set(child.id, placed(a.laid ?? child, x, y, w, h, scale))
    room = { ...room, w: 0, h: 0 }
  }

  return { ...area, children: children.map((c) => done.get(c.id) ?? undocked(c)) }
}
