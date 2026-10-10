/**
 * Layout containers (docs/2026-10-02-layout.md): objects get their place and
 * their size from the container they are in, instead of holding x, y and
 * width themselves. Width from the container, height from the object - a
 * control's from its size step, a text's from its font, both already kept in
 * `height` by the size scale (lib/size-scale.ts) and re-applied on a device
 * change - so a layout only ever writes x, y and width, and the height of a
 * container that grows with what it holds.
 *
 * The result is written into the objects, as normalizeGroups writes a
 * group's box: everything that reads positions - the canvas, the preview,
 * baked bitmaps, deploy - reads finished coordinates and knows nothing of
 * containers. Pure: objects in, objects out.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { controlMinWidth, textWidthIn } from "@/lib/size-scale"
import { arrangeSnapTable, isSnapTable } from "@/lib/snap-table"

// A table put together by snapping (lib/snap-table.ts) and a free area. The
// stacks, the grid and the spacer of layout Tasks 1-12 and the old tables
// are gone; a file that has them opens with them dissolved (lib/table.ts).
export const CONTAINER_TYPES = ["free", "table"] as const

/** What only the designer knows: the containers. A device never declares or draws them. */
export function isLayoutOnlyType(type: string | undefined): boolean {
  return isContainerType(type)
}

export type ContainerType = (typeof CONTAINER_TYPES)[number]

export function isContainerType(type: string | undefined): type is ContainerType {
  return (CONTAINER_TYPES as readonly string[]).includes(type ?? "")
}

/**
 * What a layout needs to know of the device. Without millimetres in its
 * description (lib/device-description.ts), about a 100 dpi panel.
 */
export interface LayoutScale {
  pixelsPerMm: number
  /** The project's fonts, to measure a text's words and a control's labels. */
  fonts?: readonly ProjectFont[]
}
export const FALLBACK_SCALE: LayoutScale = { pixelsPerMm: 4 }

// What a ring is drawn with when it has no track thickness of its own.
const FALLBACK_RING_THICKNESS = 10

/**
 * How wide an object needs to be: a text as wide as its words, in its font
 * (decided with the user 2026-10-02, not as wide as it was drawn); a switch,
 * button group or button as wide as its labels need at its height; anything
 * else as wide as it is.
 */
export function naturalWidth(obj: ScreenObject, scale: LayoutScale = FALLBACK_SCALE): number {
  // A table as its columns need (lib/snap-table.ts).
  if (isSnapTable(obj)) return arrangeSnapTable(obj, scale).width
  // A switcher as wide as the widest of its panels' content, so it stands in
  // a table put together by snapping no wider than what it shows; one with
  // nothing in its panels as wide as it is.
  if (obj.type === "switcher") {
    const content = (obj.children ?? []).flatMap((panel) => (panel.children ?? []).map((child) => Math.max(0, child.x) + naturalWidth(child, scale)))
    return content.length > 0 ? Math.max(1, ...content) : obj.width
  }
  const fonts = scale.fonts ?? []
  if (obj.type === "text") {
    const font = fonts.find((f) => f.id === obj.properties?.fontId)
    return Math.max(1, textWidthIn(String(obj.properties?.text ?? ""), font))
  }
  if (obj.type === "switch" || obj.type === "button-group" || obj.type === "button") {
    return Math.max(1, controlMinWidth(obj, obj.height, fonts))
  }
  return obj.width
}

/**
 * A child given a width by its container, with the height that follows: a
 * ring keeps its diameter, but never more than the room (on the grid of its
 * track, as the size scale puts it - snapDiameter, rounded down here, so it
 * never sticks out); a container as tall as its content; a switcher as tall
 * as its tallest panel; a `free` container and everything else as tall as
 * it is.
 */
export function fit(child: ScreenObject, width: number, scale: LayoutScale): ScreenObject {
  if (child.type === "gauge" || child.type === "dial") {
    const grid = 2 * (child.properties?.thickness ?? FALLBACK_RING_THICKNESS)
    const diameter = Math.max(2 * grid, Math.floor(Math.min(child.width, width) / grid) * grid)
    return { ...child, width: diameter, height: diameter }
  }
  if (child.type === "switcher") return fitSwitcher({ ...child, width }, scale)
  // A group keeps the box around its pieces (normalizeGroups).
  if (child.type === "group") return layoutOne(child, scale)
  return layoutOne({ ...child, width }, scale)
}

// A switcher in a container: as tall as the tallest of its panels' content,
// each panel laid out at the switcher's width.
// A table put together by snapping in a panel is stretched to the
// switcher's width, so what fills its cells spans the switcher (a block's
// parts, docs/2026-10-09-snap-tables.md).
function fitSwitcher(switcher: ScreenObject, scale: LayoutScale): ScreenObject {
  const stretched = (child: ScreenObject) => ({ ...arrangeSnapTable(child, scale, switcher.width), x: 0, y: 0 })
  const panels = (switcher.children ?? []).map((panel) => ({
    ...panel,
    children: (panel.children ?? []).map((child) =>
      isSnapTable(child)
        ? stretched(layoutOne(child, scale))
        : isContainerType(child.type) && child.type !== "free"
          ? { ...fit(child, switcher.width, scale), x: 0, y: 0 }
          : child,
    ),
  }))
  const height = Math.max(0, ...panels.flatMap((panel) => (panel.children ?? []).map((child) => child.y + child.height)))
  const filled = withFilledPanels({ ...switcher, height: height || switcher.height, children: panels }, scale)
  // Laid out again as panels, the tables in them are stretched once more.
  return {
    ...filled,
    children: (filled.children ?? []).map((panel) => ({ ...panel, children: (panel.children ?? []).map((child) => (isSnapTable(child) ? stretched(child) : child)) })),
  }
}

/**
 * Every container in `objects` laid out, at any depth - in a group, in a
 * switcher's panel, in another container. Objects outside a container, and
 * those in `free`, keep their own geometry.
 */
export function layoutObjects(objects: ScreenObject[], scale: LayoutScale = FALLBACK_SCALE): ScreenObject[] {
  return objects.map((obj) => layoutOne(obj, scale))
}

// An object with its subtree laid out inside its own width and height.
function layoutOne(obj: ScreenObject, scale: LayoutScale): ScreenObject {
  // A table put together by snapping: what it holds laid out first (a
  // switcher's panels, a free area's tables), then placed in its cells.
  if (isSnapTable(obj)) return arrangeSnapTable({ ...obj, children: layoutObjects(obj.children ?? [], scale) }, scale)
  if (!obj.children || obj.children.length === 0) return obj
  return { ...obj, children: layoutObjects(obj.children, scale) }
}

// A switcher a container places: each panel filling it (docs/device-
// contract.md), at its origin and its size, written as 0 and its size so
// that every rule that adds coordinates up - childOrigin,
// getAbsolutePosition, the firmware's - agrees on where the children are.
// A switcher outside a container is left as it was saved.
function withFilledPanels(switcher: ScreenObject, scale: LayoutScale): ScreenObject {
  return {
    ...switcher,
    children: (switcher.children ?? []).map((panel) =>
      layoutOne({ ...panel, x: 0, y: 0, width: switcher.width, height: switcher.height }, scale),
    ),
  }
}

/**
 * `next`, but every part of it equal to the same part of `prev` replaced by
 * `prev`'s - so a layout that moved nothing changes no reference, costs no
 * render and makes no undo step, as normalizeGroups promises.
 */
export function keepUnchanged<T>(prev: T, next: T): T {
  if (prev === next) return prev
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) return next
    let same = true
    const out = next.map((item, i) => {
      const kept = keepUnchanged(prev[i], item)
      if (kept !== prev[i]) same = false
      return kept
    })
    return (same ? prev : out) as T
  }
  if (prev && next && typeof prev === "object" && typeof next === "object" && !Array.isArray(prev) && !Array.isArray(next)) {
    const p = prev as Record<string, unknown>
    const n = next as Record<string, unknown>
    const keys = Object.keys(n)
    if (keys.length !== Object.keys(p).length) return next
    let same = true
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      if (!(key in p)) return next
      out[key] = keepUnchanged(p[key], n[key])
      if (out[key] !== p[key]) same = false
    }
    return (same ? prev : out) as T
  }
  return next
}

/**
 * Every screen of a project laid out - the pass after every change. The
 * same reference where nothing moved. A screen is free
 * (docs/2026-10-03-free-screens.md): its tables and areas lay out what is
 * in them.
 */
export function layoutProject<P extends {
  screens?: Array<{ objects?: ScreenObject[] }>
  fonts?: readonly ProjectFont[]
  settings?: { pixelsPerMm?: number }
}>(project: P): P {
  if (!project?.screens) return project
  const scale: LayoutScale = {
    pixelsPerMm: project.settings?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm,
    fonts: project.fonts,
  }
  let changed = false
  const screens = project.screens.map((screen) => {
    const objects = screen.objects ?? []
    const laid = keepUnchanged(objects, layoutObjects(objects, scale))
    if (laid === objects) return screen
    changed = true
    return { ...screen, objects: laid }
  })
  return changed ? { ...project, screens } : project
}
