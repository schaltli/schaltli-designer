/**
 * Given more room, a table without a fill column gets one
 * (docs/2026-11-16-table-sizes.md, decision 5).
 *
 * The edit that gives a table more room than its content - docked across an
 * area, put into a switcher's panel, pulled wider or taller at a handle -
 * sets its last auto column (row) to fill, where none is fill yet. It is
 * part of that edit: the layout itself never changes what a line says. A
 * table that had the room before the edit is left as it is, so a column set
 * back to auto by hand stays auto, its room empty at the table's right.
 *
 * Pure: objects in, objects out; the same reference where nothing was set.
 */

import type { ScreenObject } from "@/components/project-editor"
import { dimensions, isSnapTable, lineStateOf, snapColumnsOf, snapRowsOf, tableSizeOf, type SnapLine } from "@/lib/snap-table"

type Parent = ScreenObject | null

// Whether a table is given a width from outside or of its own.
function givenWidth(table: ScreenObject, parent: Parent): boolean {
  const dock = table.properties?.dock
  if (dock === "top" || dock === "bottom" || dock === "fill") return true
  if (!dock && parent?.type === "panel") return true
  return tableSizeOf(table).width !== undefined
}
const givenHeight = (table: ScreenObject) => tableSizeOf(table).height !== undefined

// `lines`, as many as `count`, with the last auto one set to fill - or null
// where one is fill already, or none is auto.
function withLastFill(lines: SnapLine[], count: number): SnapLine[] | null {
  const all = Array.from({ length: count }, (_, i) => ({ ...(lines[i] ?? {}) }))
  if (all.some((line) => lineStateOf(line) === "fill")) return null
  for (let i = count - 1; i >= 0; i--) {
    if (lineStateOf(all[i]) !== "auto") continue
    all[i] = { ...all[i], fill: true }
    return all
  }
  return null
}

function find(objects: ScreenObject[], id: string, parent: Parent = null): { obj: ScreenObject; parent: Parent } | null {
  for (const obj of objects) {
    if (obj.id === id) return { obj, parent }
    const inner = obj.children ? find(obj.children, id, obj) : null
    if (inner) return inner
  }
  return null
}

/**
 * `next` with each table that the edit from `prev` gave room a fill column
 * (row) where it has none.
 */
export function withFillWhereGivenRoom(prev: ScreenObject[], next: ScreenObject[]): ScreenObject[] {
  if (prev === next) return next
  const walk = (list: ScreenObject[], parent: Parent): ScreenObject[] => {
    let changed = false
    const out = list.map((obj) => {
      const children = obj.children ? walk(obj.children, obj) : obj.children
      let current = children === obj.children ? obj : { ...obj, children }
      if (isSnapTable(current)) {
        const before = find(prev, current.id)
        const had = before && isSnapTable(before.obj) ? before : null
        const size = dimensions(current)
        if (givenWidth(current, parent) && !(had && givenWidth(had.obj, had.parent))) {
          const columns = withLastFill(snapColumnsOf(current), size.columns)
          if (columns) current = { ...current, properties: { ...current.properties, columns } }
        }
        if (givenHeight(current) && !(had && givenHeight(had.obj))) {
          const rows = withLastFill(snapRowsOf(current), size.rows)
          if (rows) current = { ...current, properties: { ...current.properties, rows } }
        }
      }
      if (current !== obj) changed = true
      return current
    })
    return changed ? out : list
  }
  return walk(next, null)
}
