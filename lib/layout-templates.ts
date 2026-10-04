/**
 * The table shapes the Table tool offers (docs/2026-10-03-free-screens.md):
 * what a screen's «Layout» option used to be, each with a small picture in
 * the tool's menu. Choosing one is a copy: the table it draws is the
 * user's to change afterwards.
 */

import { type TableColumn } from "@/lib/table"

export type TableShapeId = "one-column" | "name-and-control" | "two-columns"

export const TABLE_SHAPES: ReadonlyArray<{ id: TableShapeId; label: string; description: string }> = [
  { id: "one-column", label: "One column", description: "Everything one below the other" },
  { id: "name-and-control", label: "Name and control", description: "Names on the left, controls on the right" },
  { id: "two-columns", label: "Two columns", description: "Two columns of the same width" },
]

/** What the Table tool draws without a choice. */
export const DEFAULT_TABLE_SHAPE: TableShapeId = "name-and-control"

const COLUMNS: Record<TableShapeId, TableColumn[]> = {
  "one-column": [{ width: { share: 100 } }],
  "name-and-control": [{ width: "auto" }, { width: { share: 100 } }],
  "two-columns": [{ width: { share: 50 } }, { width: { share: 50 } }],
}

/** A shape's columns: what the table is drawn with, and its picture. */
export function shapeColumns(id: TableShapeId): TableColumn[] {
  return COLUMNS[id]
}
