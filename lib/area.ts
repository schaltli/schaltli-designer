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
 * Today: the area standing alone, `free` in a project file.
 */

/** Whether `obj` holds and places its children as an area does. */
export function isArea(obj: { type?: string } | null | undefined): boolean {
  return obj?.type === "free"
}
