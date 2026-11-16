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
 */

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
