/**
 * Where a size comes from, in words (docs/2026-11-16-table-sizes.md,
 * decision 8).
 *
 * For one object of a laid-out screen: what sets its width and what sets
 * its height - its column fixed at 45.7 mm, its column filling the table,
 * the object it shares a column with, the area it is docked in, what it
 * holds, or its author. Frame shows the two lines under W and H, so a size
 * nobody typed can be traced without knowing the layout's rules.
 *
 * It reads; it sets nothing. Pure.
 */

import type { ScreenObject } from "@/components/project-editor"
import { areaAnchorOf, cellAnchorOf } from "@/lib/anchor"
import { isArea } from "@/lib/area"
import { isCellArea } from "@/lib/cell-area"
import { dockOf, dockStretches } from "@/lib/dock"
import { freeMinSize, switcherMinSize } from "@/lib/free-min-size"
import { naturalWidth, type LayoutScale } from "@/lib/layout"
import { objectTypeLabel } from "@/lib/object-types"
import { findObjectById, findParentOf } from "@/lib/object-tree"
import { isSnapTable, lineStateOf, snapCellOf, snapColumnsOf, snapRowsOf, snapTableGeometry, tableMinSize, tableSizeOf, type SnapLine } from "@/lib/snap-table"

export interface SizeSource {
  /** What sets the width, after «310 px: ». */
  width: string
  height: string
}

// An object by what an author calls it: its type, and its words where it has some.
function named(obj: ScreenObject): string {
  const words = [obj.properties?.text, obj.properties?.label, obj.properties?.name].find((w) => typeof w === "string" && w.trim().length > 0) as string | undefined
  const type = isSnapTable(obj) ? "Table" : obj.type === "free" ? (isCellArea(obj) ? "Cell" : "Area") : obj.type === "panel" ? "Panel" : objectTypeLabel(obj.type)
  if (!words) return type
  const short = words.length > 24 ? `${words.slice(0, 23)}…` : words
  return `${type} «${short}»`
}

const holderName = (parent: ScreenObject | null): string => (parent ? named(parent) : "the screen")
const DOCK_WORD: Record<string, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right", fill: "Fill" }

// What sets the size of one line of a table, for the object `obj` standing in it.
function ofLine(table: ScreenObject, obj: ScreenObject, kind: "column" | "row", scale: LayoutScale): string {
  const cell = snapCellOf(obj)
  const index = kind === "column" ? cell.column : cell.row
  const span = (kind === "column" ? cell.columnSpan : cell.rowSpan) ?? 1
  if (span > 1) return `the ${span} ${kind}s it spans`
  const lines: SnapLine[] = kind === "column" ? snapColumnsOf(table) : snapRowsOf(table)
  const state = lineStateOf(lines[index])
  if (state === "fixed") return `its ${kind}, fixed at ${Number(lines[index]!.mm).toFixed(1)} mm`
  if (state === "fill") return `its ${kind}, filling the table`
  // Auto: as large as the largest object standing in it alone.
  const g = snapTableGeometry(table, scale)
  const natural = (kind === "column" ? g.naturalWidths : g.naturalHeights)[index]
  const size = (kind === "column" ? g.widths : g.heights)[index]
  if (size > natural + 1) return `its ${kind}, ${kind === "column" ? "wider" : "taller"} than what it holds`
  const beside = (table.children ?? []).filter((child) => {
    const c = snapCellOf(child)
    return child.id !== obj.id && (kind === "column" ? c.column === index && (c.columnSpan ?? 1) === 1 : c.row === index && (c.rowSpan ?? 1) === 1)
  })
  const larger = beside.filter((child) => (kind === "column" ? child.width : child.height) >= (kind === "column" ? obj.width : obj.height))
  const size_ = kind === "column" ? "wide" : "tall"
  if (larger.length === 0) return `its ${kind}, as ${size_} as this object needs`
  const largest = larger.sort((a, b) => (kind === "column" ? b.width - a.width : b.height - a.height))[0]
  return `its ${kind}, as ${size_} as ${named(largest)}`
}

// What sets a size nothing outside the object sets.
function own(obj: ScreenObject, axis: "width" | "height", scale: LayoutScale): string {
  if (isSnapTable(obj)) {
    const size = tableSizeOf(obj)[axis]
    const min = tableMinSize(obj, scale)[axis]
    if (size !== undefined && size > min) return axis === "width" ? "pulled to this width; its fill columns share what is left" : "pulled to this height; its fill rows share what is left"
    return axis === "width" ? "its columns" : "its rows"
  }
  if (obj.type === "panel") return "its switcher: a panel fills it"
  if (obj.type === "switcher") {
    const min = switcherMinSize(obj, scale)
    return min && Math.abs(min[axis] - obj[axis]) <= 1 ? "its largest panel" : "set by hand"
  }
  if (isArea(obj) && obj.children?.length) {
    const min = freeMinSize(obj, scale)
    return min && min[axis] > 1 && Math.abs(min[axis] - obj[axis]) <= 1 ? "what it holds" : "set by hand"
  }
  if (axis === "width" && ["text", "switch", "button-group", "toggle-button", "button"].includes(obj.type)) {
    if (Math.abs(naturalWidth(obj, scale) - obj.width) <= 1) return obj.type === "text" ? "its text" : "its labels"
  }
  return "set by hand"
}

/**
 * What sets the width and the height of the object `id` among the laid-out
 * `objects` of a screen; null where there is no such object.
 */
export function sizeSourceOf(objects: ScreenObject[], id: string, scale: LayoutScale): SizeSource | null {
  const obj = findObjectById(objects, id)
  if (!obj) return null
  const parent = findParentOf(objects, id)?.parent ?? null
  const source = (axis: "width" | "height"): string => {
    // In a table's cell: stretched, its column or row; else its own.
    if (parent && isSnapTable(parent)) {
      const anchor = cellAnchorOf(obj)
      const stretched = axis === "width" ? anchor.x === "stretch" || obj.type === "text" : anchor.y === "stretch"
      return stretched ? ofLine(parent, obj, axis === "width" ? "column" : "row", scale) : own(obj, axis, scale)
    }
    // Docked on the screen or in an area: across its dock, its room.
    if (parent === null || isArea(parent)) {
      const dock = dockOf(obj)
      if (dock && dockStretches(obj).includes(axis)) return `docked ${DOCK_WORD[dock]} in ${holderName(parent)}`
      if (!dock && parent) {
        const anchor = areaAnchorOf(obj)
        if (axis === "width" ? anchor.x === "stretch" : anchor.y === "stretch") return `stretched in ${holderName(parent)}`
      }
      // A table standing in a switcher's panel is as wide as the switcher.
      if (axis === "width" && !dock && parent?.type === "panel" && isSnapTable(obj) && obj.width > tableMinSize(obj, scale).width) return "its panel: a table in a panel is as wide as the switcher"
    }
    return own(obj, axis, scale)
  }
  return { width: source("width"), height: source("height") }
}
