/**
 * An area holds objects and places them, free or docked
 * (docs/2026-11-16-areas.md): each stands at its x and y with a Position, or
 * is docked to an edge (lib/dock.ts); the area pads them, keeps a gap between
 * the docked ones and is never smaller than what it holds
 * (lib/free-min-size.ts).
 *
 * This says what is one. Docking, resizing and the smallest size ask here
 * instead of for a type by name, so that a switcher's panel, a table's cell
 * and the screen become areas by being named here and nowhere else.
 *
 * Today: the area standing alone, `free` in a project file, and a
 * switcher's panel. A panel has the size of its switcher, which is as large
 * as the largest of its panels needs (lib/dock.ts resizeSwitcher,
 * lib/free-min-size.ts switcherMinSize).
 *
 * And the screen (screenAreaLaid, below). It is not an object: its objects
 * are `screen.objects`, its own properties `screen.area`, its size the
 * device's panel.
 */

import type { ScreenObject } from "@/components/project-editor"
import { dockFree, dockOf, type DockScale } from "@/lib/dock"
import { freeMinSize } from "@/lib/free-min-size"
import type { LayoutScale } from "@/lib/layout"

/** A screen's own properties as an area: Padding and Gap, in mm. */
export interface ScreenArea {
  padding?: number
  gapMm?: number
}

/**
 * A screen's objects placed by its area (docs/2026-11-16-areas.md, step 1):
 * what is docked along the panel's edges, inside the screen's padding.
 *
 * Only what is docked is placed. What stands free on a screen may lie
 * anywhere, past its edges too, and never makes its area grow (E1a). What is
 * docked and needs more than the panel makes the area grow to the right and
 * downwards, its top left corner staying, so nothing docked is cut or left
 * out; it then lies partly past the panel, where a device draws only what
 * is on it (E1). `size` is the grown area, absent while it is the panel's.
 *
 * The same list where nothing is docked.
 */
export function screenAreaLaid(
  objects: ScreenObject[],
  area: ScreenArea | undefined,
  width: number,
  height: number,
  scale: LayoutScale & DockScale,
): { objects: ScreenObject[]; size?: { width: number; height: number } } {
  if (!objects.some((obj) => dockOf(obj) !== undefined)) return { objects }
  const properties: Record<string, unknown> = {}
  if (typeof area?.padding === "number") properties.padding = area.padding
  if (typeof area?.gapMm === "number") properties.gapMm = area.gapMm
  const wrapped = (children: ScreenObject[], w: number, h: number): ScreenObject => ({
    id: "screen-area",
    type: "free",
    x: 0,
    y: 0,
    width: w,
    height: h,
    zIndex: 0,
    properties,
    children,
  })
  // What the docked objects alone need.
  const need = freeMinSize(wrapped(objects.filter((obj) => dockOf(obj) !== undefined), width, height), scale)
  const w = Math.max(width, need?.width ?? 0)
  const h = Math.max(height, need?.height ?? 0)
  const laid = dockFree(wrapped(objects, w, h), scale)
  return { objects: laid.children ?? objects, ...(w > width || h > height ? { size: { width: w, height: h } } : {}) }
}

/**
 * An area's own properties (docs/2026-11-16-areas.md, «Data model»): its
 * look, its padding and gap, the fill, edge and corners of the box a device
 * draws for it. `areaBox` is the designer's note of that box's id and place
 * in the stacking where an area was taken over by a panel
 * (lib/area-migration.ts). A device gets none of them: an area standing
 * alone is dissolved on export, a panel is exported without them
 * (lib/object-groups.ts).
 */
export const AREA_KEYS = ["look", "padding", "gapMm", "fillColor", "strokeColor", "strokeWidth", "cornerRadius", "areaBox"] as const

/** Whether `obj` holds and places its children as an area does. */
export function isArea(obj: { type?: string } | null | undefined): boolean {
  return obj?.type === "free" || obj?.type === "panel"
}
