/**
 * What is left of the old tables (docs/2026-10-02-layout-tables.md) and the
 * containers before them (docs/2026-10-02-layout.md): nothing but their
 * removal on load (docs/2026-10-09-snap-tables.md, module old-table-removal,
 * the user 2026-10-09: no migration). A table now is one put together by
 * snapping (lib/snap-table.ts); every other container that laid out cells
 * becomes what it held, each object where it last stood.
 */

import type { ScreenObject } from "@/components/project-editor"
import { isSnapTable } from "@/lib/snap-table"
import { translateObject } from "@/lib/object-groups"

export const TABLE_TYPE = "table"

// What layout Tasks 1-12 saved (docs/2026-10-02-layout.md): stacks, rows,
// grids and the spacers in them. No longer types of their own, so read as
// names.
const OLD_CONTAINERS = new Set(["vertical-stack", "horizontal-stack", "grid"])
const OLD_SPACER = "spacer"

/**
 * An old table, or an old stack, row or grid: a container that laid out its
 * cells and is no more - not a table put together by snapping, which shares
 * the type.
 */
export function isOldTable(obj: ScreenObject | null | undefined): boolean {
  if (!obj) return false
  return (obj.type === TABLE_TYPE && !isSnapTable(obj)) || OLD_CONTAINERS.has(obj.type as string)
}

/** A screen root that laid out its objects: an old table, stack, row or grid (lib/free-screens.ts). */
export const isOldRoot = (type: string | undefined) => type === TABLE_TYPE || OLD_CONTAINERS.has(type ?? "")

/**
 * Every old table in `objects`, at any depth - in a panel, a free area, a
 * group, another old table - replaced by what it holds, each where it last
 * stood. What it held is free from then on, its old cell gone; a spacer it
 * held goes; stacking keeps its order, the table's objects where the table
 * stood. A list without an old table comes back as it was.
 */
export function dissolveOldTables(objects: ScreenObject[]): ScreenObject[] {
  let changed = false
  // Each object with where it stacks: [its list's zIndex, then inside a
  // dissolved table its own].
  const out: Array<{ obj: ScreenObject; order: number[] }> = []
  const take = (obj: ScreenObject, order: number[]) => {
    if (isOldTable(obj)) {
      changed = true
      for (const child of obj.children ?? []) {
        if ((child.type as string) === OLD_SPACER) continue
        const { cell: _cell, ...properties } = child.properties ?? {}
        take(translateObject({ ...child, properties }, obj.x, obj.y), [...order, child.zIndex])
      }
      return
    }
    const children = obj.children ? dissolveOldTables(obj.children) : undefined
    if (children !== obj.children) changed = true
    out.push({ obj: children !== obj.children ? { ...obj, children } : obj, order })
  }
  for (const obj of objects) take(obj, [obj.zIndex])
  if (!changed) return objects
  const before = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? -Infinity) !== (b[i] ?? -Infinity)) return (a[i] ?? -Infinity) - (b[i] ?? -Infinity)
    return 0
  }
  const sorted = [...out].sort((a, b) => before(a.order, b.order))
  // Numbered again from 0 in that order, so nothing that came out of a
  // table lands behind or in front of where the table stood.
  const zIndex = new Map(sorted.map((entry, i) => [entry, i]))
  return out.map((entry) => (entry.obj.zIndex === zIndex.get(entry) ? entry.obj : { ...entry.obj, zIndex: zIndex.get(entry)! }))
}
