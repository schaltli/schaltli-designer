/**
 * A screen's «Layout» option (docs/2026-10-02-layout-tables.md, module
 * table-templates): table shapes for the screen's root, and «Free», as
 * PowerPoint's slide layouts - each with a small picture in the list.
 * Choosing one is a copy: the table it brings is the screen's to change
 * afterwards. Changing the layout of a screen with content loses nothing:
 * the objects go into the new table's cells in the order they stood in,
 * row by row; into «Free» they keep their last places.
 */

import type { ScreenObject } from "@/components/project-editor"
import { FREE_LAYOUT, type ScreenLayout } from "@/lib/layout"
import { TABLE_TYPE, cellOf, type TableColumn } from "@/lib/table"

export type LayoutTemplateId = "one-column" | "name-and-control" | "two-columns" | "free"

export const LAYOUT_TEMPLATES: ReadonlyArray<{ id: LayoutTemplateId; label: string }> = [
  { id: "one-column", label: "One column" },
  { id: "name-and-control", label: "Name and control" },
  { id: "two-columns", label: "Two columns" },
  { id: "free", label: "Free" },
]

/** What a new screen starts with (the spec: «Name and control»). */
export const DEFAULT_LAYOUT_TEMPLATE: LayoutTemplateId = "name-and-control"

const COLUMNS: Record<Exclude<LayoutTemplateId, "free">, TableColumn[]> = {
  "one-column": [{ width: { share: 100 } }],
  "name-and-control": [{ width: "auto" }, { width: { share: 100 } }],
  "two-columns": [{ width: { share: 50 } }, { width: { share: 50 } }],
}

/** The columns of a layout, for its picture; none for «Free». */
export function templateColumns(id: LayoutTemplateId): TableColumn[] | undefined {
  return id === "free" ? undefined : COLUMNS[id]
}

function rootOf(id: LayoutTemplateId): ScreenLayout {
  return id === "free" ? FREE_LAYOUT : { type: TABLE_TYPE, properties: { columns: COLUMNS[id], rows: 1 } }
}

/** The root a new screen starts with. */
export function newScreenLayout(): ScreenLayout {
  return rootOf(DEFAULT_LAYOUT_TEMPLATE)
}

/**
 * Which layout a screen's root is: by its table's columns, as the layouts
 * make them; "custom" for a table changed since (its columns dragged, a
 * column added).
 */
export function templateOf(screen: { layout?: ScreenLayout; objects: ScreenObject[] }): LayoutTemplateId | "custom" {
  if (screen.layout?.type !== TABLE_TYPE) return "free"
  const columns = JSON.stringify(screen.layout.properties?.columns ?? [])
  const found = (Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>).find((id) => JSON.stringify(COLUMNS[id]) === columns)
  return found ?? "custom"
}

/**
 * Everything on the screen, in order: a table's row by row, left to right;
 * a free screen as it reads - top to bottom, left to right - since there
 * the stacking order says nothing about an order.
 */
function contentOf(screen: { layout?: ScreenLayout; objects: ScreenObject[] }): ScreenObject[] {
  if (screen.layout?.type === TABLE_TYPE) {
    return [...screen.objects].sort(
      (a, b) => (cellOf(a)?.row ?? 0) - (cellOf(b)?.row ?? 0) || (cellOf(a)?.column ?? 0) - (cellOf(b)?.column ?? 0),
    )
  }
  return [...screen.objects].sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * The screen with the layout's root and its content in the new cells - or,
 * into «Free», at its last places without cells. `nextId` is passed through
 * unchanged: a table root brings no objects of its own.
 */
export function withTemplate<S extends { layout?: ScreenLayout; objects: ScreenObject[] }>(
  screen: S,
  id: LayoutTemplateId,
  nextId: number,
): { screen: S; nextId: number } {
  const content = contentOf(screen)
  const layout = rootOf(id)
  if (id === "free") {
    const objects = content.map((obj, i) => {
      const { cell: _cell, ...properties } = obj.properties ?? {}
      return { ...obj, zIndex: i, properties }
    })
    return { screen: { ...screen, layout, objects }, nextId }
  }
  const n = COLUMNS[id].length
  const objects = content.map((obj, i) => {
    const { cell: _cell, ...properties } = obj.properties ?? {}
    return { ...obj, zIndex: i, properties: { ...properties, cell: { row: Math.floor(i / n), column: i % n } } }
  })
  const rows = Math.max(1, Math.ceil(objects.length / n))
  return { screen: { ...screen, layout: { ...layout, properties: { ...layout.properties, rows } }, objects }, nextId }
}
