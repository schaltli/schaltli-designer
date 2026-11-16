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
 * - What an object kept of an area it once stood in - `dock`, `anchor`,
 *   `ownSize`, `dockedOut` - and still carries on a screen or in a panel,
 *   where they meant nothing, goes: there they would now place it.
 *
 * Run once per project: `settings.formatVersion` says which form it has.
 * In place, as lib/object-types.ts migrateProject does everything.
 */

import type { ScreenObject } from "@/components/project-editor"
import { AREA_KEYS } from "@/lib/area"
import { objectBounds, translateObject } from "@/lib/object-groups"
import { dockStretches } from "@/lib/dock"

/**
 * The project format this designer writes. 2: a panel and the screen are
 * areas (step 1). 3: one kept size, `ownSize` (step 2). 4: a table's
 * columns say what sets their width, and a table has a size of its own
 * (docs/2026-11-16-table-sizes.md).
 */
export const FORMAT_VERSION = 4

type Obj = ScreenObject

// As lib/layout.ts FALLBACK_SCALE: a project without a device's scale.
const FALLBACK_PIXELS_PER_MM = 4

const STALE = ["dock", "anchor", "ownSize", "dockedOut"] as const

// `obj` without what it kept of an area it no longer stands in.
function withoutStale(obj: Obj): Obj {
  const p = obj.properties
  if (!p || !STALE.some((key) => key in p)) return obj
  return { ...obj, properties: Object.fromEntries(Object.entries(p).filter(([key]) => !(STALE as readonly string[]).includes(key))) }
}

// Every panel's own objects without it, at any depth; what stands in an
// area standing alone keeps it, there it is in use.
function panelsCleared(obj: Obj): Obj {
  if (!obj.children) return obj
  const children = obj.children.map((child) => panelsCleared(obj.type === "panel" ? withoutStale(child) : child))
  return children.some((c, i) => c !== obj.children![i]) ? { ...obj, children } : obj
}

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

// Step 2 (decision 9): the size an object stretched in a table's cell was
// drawn at, kept in its `cell` as drawnWidth and drawnHeight, is its
// `ownSize` - the one place a kept size lives. And docking keeps no size
// (decision 14): what a docked object had kept of its own across its dock,
// where it stretches, was docking's note and nobody's wish - it goes. At
// any depth.
function withOneKeptSize(obj: Obj): Obj {
  const children = obj.children?.map(withOneKeptSize)
  let current: Obj = children && children.some((c, i) => c !== obj.children![i]) ? { ...obj, children } : obj
  const stretches = dockStretches(current)
  const noted = current.properties?.ownSize
  if (noted && typeof noted === "object" && stretches.some((axis) => axis in noted)) {
    const least = Object.fromEntries(Object.entries(noted).filter(([axis]) => !(stretches as string[]).includes(axis)))
    const { ownSize: _was, ...rest } = current.properties
    current = { ...current, properties: Object.keys(least).length > 0 ? { ...rest, ownSize: least } : rest }
  }
  const cell = current.properties?.cell
  if (cell && typeof cell === "object" && ("drawnWidth" in cell || "drawnHeight" in cell)) {
    const { drawnWidth, drawnHeight, ...rest } = cell
    const least = {
      ...(current.properties?.ownSize ?? {}),
      ...(typeof drawnWidth === "number" ? { width: drawnWidth } : {}),
      ...(typeof drawnHeight === "number" ? { height: drawnHeight } : {}),
    }
    current = { ...current, properties: { ...current.properties, cell: rest, ...(Object.keys(least).length > 0 ? { ownSize: least } : {}) } }
  }
  return current
}

// Format 4 (docs/2026-11-16-table-sizes.md, «Old projects»): what «Equal
// columns», «Width» and being stretched did to a table's columns is written
// on the columns, at any depth.
// - «Equal columns»: every column not sized by hand is fill. Except on a
//   table stretched across without a «Width»: there the columns were as
//   wide as the widest of them and the last took the rest - not equal, but
//   what was drawn. Kept as that (`levelColumns`, lib/snap-table.ts), so
//   nothing moves.
// - a «Width», or stretched across (docked Top, Bottom or Fill; standing
//   in a switcher's panel), without «Equal columns»: the last column took
//   what was left over, whatever it said, so it is fill. A size set on it
//   by hand goes: it was the least of a column that had more anyway.
// - «Width» is the table's own size, in pixels.
function withLineStates(obj: Obj, pixelsPerMm: number, parent?: Obj): Obj {
  const children = obj.children?.map((child) => withLineStates(child, pixelsPerMm, obj))
  const current: Obj = children && children.some((c, i) => c !== obj.children![i]) ? { ...obj, children } : obj
  if (current.type !== "table" || current.properties?.grid !== 1) return current
  const { equalColumns, widthMm, ...rest } = current.properties as Record<string, any>
  const width = typeof widthMm === "number" && Number.isFinite(widthMm) && widthMm > 0 ? widthMm : undefined
  const stretched = ["top", "bottom", "fill"].includes(rest.dock) || (!rest.dock && parent?.type === "panel")
  if (equalColumns !== true && width === undefined && !stretched) {
    return "equalColumns" in current.properties || "widthMm" in current.properties ? { ...current, properties: rest } : current
  }
  const reach = Math.max(0, ...(current.children ?? []).map((c) => (Number(c.properties?.cell?.column) || 0) + Math.max(1, Number(c.properties?.cell?.columnSpan) || 1)))
  const listed: Array<Record<string, any>> = Array.isArray(rest.columns) ? rest.columns : []
  const count = Math.max(listed.length, reach)
  let columns = Array.from({ length: count }, (_, i) => ({ ...(listed[i] ?? {}) }))
  const level = equalColumns === true && width === undefined && stretched
  if (equalColumns === true && !level) columns = columns.map((line) => (typeof line.mm === "number" ? line : { ...line, fill: true }))
  else if (count > 0) {
    const { mm: _byHand, ...last } = columns[count - 1]
    columns[count - 1] = { ...last, fill: true }
  }
  const properties = {
    ...rest,
    columns,
    ...(level && count > 1 ? { levelColumns: true } : {}),
    ...(width !== undefined ? { tableSize: { ...(rest.tableSize ?? {}), width: Math.round(width * pixelsPerMm) } } : {}),
  }
  return { ...current, properties }
}

/**
 * A project brought to areas, in place; one that is there already is left
 * as it is. True if it was changed.
 */
export function migrateToAreas(project: { screens?: Array<{ objects?: unknown[] }>; settings?: Record<string, any> }): boolean {
  const version = Number(project.settings?.formatVersion) || 1
  // Step 2, whatever the project had of step 1.
  if (version < 3) {
    for (const screen of project.screens ?? []) {
      if (Array.isArray(screen.objects)) screen.objects = (screen.objects as Obj[]).map(withOneKeptSize)
    }
  }
  // A project of a designer newer than this one: laid out by rules this one
  // does not know, it would open looking right and be saved wrong.
  if (version > FORMAT_VERSION) {
    throw new Error(`This project was saved by a newer Schaltli designer (format ${version}, this designer reads up to ${FORMAT_VERSION}). Reload the designer to get the current one.`)
  }
  if (version >= FORMAT_VERSION) return false
  if (version < 2) {
    for (const screen of project.screens ?? []) {
      if (Array.isArray(screen.objects)) screen.objects = (screen.objects as Obj[]).map((obj) => migrated(panelsCleared(withoutStale(obj))))
    }
  }
  // Format 4, after the panels are what they are from now on.
  const pixelsPerMm = Number(project.settings?.pixelsPerMm) || FALLBACK_PIXELS_PER_MM
  for (const screen of project.screens ?? []) {
    if (Array.isArray(screen.objects)) screen.objects = (screen.objects as Obj[]).map((obj) => withLineStates(obj, pixelsPerMm))
  }
  project.settings = { ...(project.settings ?? {}), formatVersion: FORMAT_VERSION }
  return true
}
