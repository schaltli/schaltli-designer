/**
 * Projects from before areas (docs/2026-11-16-areas.md, «Old projects»),
 * brought to them on load. The rule for all of it: nothing moves - what a
 * device gets is what it got.
 *
 * Step 1, a switcher's panel is an area:
 * - A panel holding exactly one area that fills it takes that area's look,
 *   padding, gap and colours, and what the area held; the area is gone. It
 *   was only there because a panel could not dock or carry a look.
 * - A switcher whose panels hold something past their left or top edge
 *   grows to hold it, its corner moved and everything in its panels with it,
 *   so each object stays where it was on the glass (E2a). Past the right or
 *   bottom edge it grows when the project is laid out
 *   (lib/free-min-size.ts withCardsGrown).
 *
 * Run once per project: `settings.formatVersion` says which form it has.
 * In place, as lib/object-types.ts migrateProject does everything.
 */

import type { ScreenObject } from "@/components/project-editor"
import { AREA_KEYS } from "@/lib/area"
import { objectBounds, translateObject } from "@/lib/object-groups"

/** The project format this designer writes: 2 since areas. */
export const FORMAT_VERSION = 2

type Obj = ScreenObject

// The one area a panel holds that fills it, or undefined.
function fillingArea(panel: Obj, switcher: Obj): Obj | undefined {
  const children = panel.children ?? []
  if (children.length !== 1) return undefined
  const only = children[0]
  if (only.type !== "free") return undefined
  return only.x === 0 && only.y === 0 && only.width === switcher.width && only.height === switcher.height ? only : undefined
}

// A panel with the area that filled it taken over: the area's own properties
// its own, the box a device drew for the area noted by its id and its place
// in the stacking (`areaBox`), so the export is the same bytes.
function takenOver(panel: Obj, area: Obj): Obj {
  const from = area.properties ?? {}
  const own = Object.fromEntries(AREA_KEYS.filter((key) => key !== "areaBox" && key in from).map((key) => [key, from[key]]))
  return {
    ...panel,
    properties: { ...panel.properties, ...own, areaBox: { id: `${area.id}-background`, zIndex: area.zIndex } },
    children: area.children ?? [],
  }
}

// How far a switcher's panels reach past their left and top edge.
function reachOutside(switcher: Obj): { left: number; top: number } {
  let left = 0
  let top = 0
  for (const panel of switcher.children ?? []) {
    for (const child of panel.children ?? []) {
      if (child.properties?.dock) continue
      const b = objectBounds(child)
      left = Math.max(left, -b.minX)
      top = Math.max(top, -b.minY)
    }
  }
  return { left: Math.ceil(left), top: Math.ceil(top) }
}

function migrated(obj: Obj): Obj {
  const children = obj.children?.map(migrated)
  let current: Obj = children && children.some((c, i) => c !== obj.children![i]) ? { ...obj, children } : obj
  if (current.type !== "switcher") return current

  // The one area filling a panel becomes the panel.
  const areas = (current.children ?? []).map((panel) => fillingArea(panel, current))
  if (areas.some(Boolean)) {
    const properties = { ...current.properties }
    // In a table's cell a switcher is as large as what its panels hold: it
    // keeps the size the areas gave it as the least it asks for.
    if (properties.cell && !properties.ownSize) properties.ownSize = { width: current.width, height: current.height }
    current = { ...current, properties, children: current.children!.map((panel, i) => (areas[i] ? takenOver(panel, areas[i]!) : panel)) }
  }

  // What lies past a panel's left or top edge: the switcher's corner moves
  // out to it, everything in its panels the other way.
  const { left, top } = reachOutside(current)
  if (left > 0 || top > 0) {
    current = {
      ...current,
      x: current.x - left,
      y: current.y - top,
      width: current.width + left,
      height: current.height + top,
      children: (current.children ?? []).map((panel) => ({
        ...panel,
        x: 0,
        y: 0,
        width: current.width + left,
        height: current.height + top,
        children: (panel.children ?? []).map((child) => translateObject(child, left, top)),
      })),
    }
  }
  return current
}

/**
 * A project brought to areas, in place; one that is there already is left
 * as it is. True if it was changed.
 */
export function migrateToAreas(project: { screens?: Array<{ objects?: unknown[] }>; settings?: Record<string, any> }): boolean {
  const version = Number(project.settings?.formatVersion) || 1
  if (version >= FORMAT_VERSION) return false
  for (const screen of project.screens ?? []) {
    if (Array.isArray(screen.objects)) screen.objects = (screen.objects as Obj[]).map(migrated)
  }
  project.settings = { ...(project.settings ?? {}), formatVersion: FORMAT_VERSION }
  return true
}
