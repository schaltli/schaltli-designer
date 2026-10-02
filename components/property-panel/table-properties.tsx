"use client"

/**
 * A table's properties (docs/2026-10-02-layout-tables.md, module
 * table-canvas): the table itself, one of its columns - opened by clicking
 * the strip above it on the canvas - and the cell an object stands in,
 * which an object in a table shows instead of its x, y and width.
 */

import type { ScreenObject } from "../project-editor"
import { cellOf, columnsOf, type CellAlign, type ColumnWidth, type TableColumn } from "@/lib/table"
import { SIZE_STEPS, type SizeStep } from "@/lib/size-scale"
import { FieldNote, FrameFields, NumberField, PropertySection, PropertySections, SelectField, frameSummary } from "./fields"

const ALIGN_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "centre", label: "Centre" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
] as const

const WIDTH_KINDS = [
  { value: "auto", label: "Auto" },
  { value: "share", label: "Share" },
  { value: "mm", label: "Fixed (mm)" },
  { value: "step", label: "Size multiple" },
] as const

type WidthKind = (typeof WIDTH_KINDS)[number]["value"]

const kindOf = (width: ColumnWidth): WidthKind => (width === "auto" ? "auto" : "share" in width ? "share" : "mm" in width ? "mm" : "step")

/** A table selected: its rows and columns, and its frame. */
export function TableProperties({
  selectedObject,
  onUpdateObject,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}) {
  const props = selectedObject.properties ?? {}
  return (
    <PropertySections>
      <PropertySection title="Table">
        <NumberField
          id="tableRows"
          label="Rows"
          value={typeof props.rows === "number" ? props.rows : 1}
          min={1}
          onChange={(rows) => onUpdateObject(selectedObject.id, { properties: { ...props, rows: Math.max(1, rows) } })}
        />
        <FieldNote>{`${columnsOf(selectedObject).length} columns. Click above a column on the canvas to set its width and alignment.`}</FieldNote>
        {props.overflow ? <FieldNote>What it holds does not fit: the device cuts it off where the screen ends.</FieldNote> : null}
      </PropertySection>
      <PropertySection title="Frame" defaultCollapsed summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}>
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={(key, value) => onUpdateObject(selectedObject.id, { [key]: value })}
        />
      </PropertySection>
    </PropertySections>
  )
}

/** One of a table's columns: how wide, and where its objects stand. */
export function TableColumnProperties({
  columns,
  index,
  onChange,
  onRemove,
}: {
  columns: TableColumn[]
  index: number
  onChange: (columns: TableColumn[]) => void
  onRemove: () => void
}) {
  const column = columns[index]
  if (!column) return null
  const set = (next: TableColumn) => onChange(columns.map((c, i) => (i === index ? next : c)))
  const kind = kindOf(column.width)
  const width = column.width
  return (
    <PropertySections>
      <PropertySection title={`Column ${index + 1}`}>
        <SelectField
          id="columnWidthKind"
          label="Width"
          value={kind}
          options={WIDTH_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          onChange={(value) => {
            const next: ColumnWidth =
              value === "auto" ? "auto" : value === "share" ? { share: 50 } : value === "mm" ? { mm: 20 } : { step: "m", times: 2 }
            set({ ...column, width: next })
          }}
        />
        {typeof width === "object" && "share" in width && (
          <NumberField id="columnShare" label="Share" unit="%" value={width.share} min={1} onChange={(share) => set({ ...column, width: { share: Math.max(1, share) } })} />
        )}
        {typeof width === "object" && "mm" in width && (
          <NumberField id="columnMm" label="Width" unit="mm" value={width.mm} min={1} onChange={(mm) => set({ ...column, width: { mm: Math.max(1, mm) } })} />
        )}
        {typeof width === "object" && "step" in width && (
          <>
            <NumberField id="columnTimes" label="Times" value={width.times} min={1} onChange={(times) => set({ ...column, width: { ...width, times: Math.max(1, times) } })} />
            <SelectField
              id="columnStep"
              label="Size"
              value={width.step}
              options={SIZE_STEPS.map((s) => ({ value: s, label: s.toUpperCase() }))}
              onChange={(step) => set({ ...column, width: { ...width, step: step as SizeStep } })}
            />
          </>
        )}
        <SelectField
          id="columnAlign"
          label="Align"
          value={column.align ?? "start"}
          options={ALIGN_OPTIONS.map((a) => ({ value: a.value, label: a.label }))}
          onChange={(align) => set({ ...column, align: align as CellAlign })}
        />
        {columns.length > 1 && (
          <button type="button" id="removeColumn" className="text-xs text-destructive underline" onClick={onRemove}>
            Remove column
          </button>
        )}
        <FieldNote>Auto: as wide as what is in it. Share: a part of what the other columns leave. Fixed: millimetres, or a multiple of a size step's height.</FieldNote>
      </PropertySection>
    </PropertySections>
  )
}

/** The cell an object in a table stands in, and how it stands there. */
export function CellProperties({
  selectedObject,
  onUpdateObject,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}) {
  const cell = cellOf(selectedObject) ?? { row: 0, column: 0 }
  const set = (updates: Partial<typeof cell>) => {
    const next: Record<string, unknown> = { ...cell, ...updates }
    for (const key of ["rowSpan", "columnSpan"] as const) if (next[key] === 1) delete next[key]
    if (!next.align) delete next.align
    onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, cell: next } })
  }
  return (
    <PropertySection title="Cell">
      <NumberField id="cellRow" label="Row" value={cell.row + 1} min={1} onChange={(row) => set({ row: Math.max(1, row) - 1 })} />
      <NumberField id="cellColumn" label="Column" value={cell.column + 1} min={1} onChange={(column) => set({ column: Math.max(1, column) - 1 })} />
      <NumberField id="cellRowSpan" label="Row span" value={cell.rowSpan ?? 1} min={1} onChange={(rowSpan) => set({ rowSpan: Math.max(1, rowSpan) })} />
      <NumberField id="cellColumnSpan" label="Column span" value={cell.columnSpan ?? 1} min={1} onChange={(columnSpan) => set({ columnSpan: Math.max(1, columnSpan) })} />
      <SelectField
        id="cellAlign"
        label="Align"
        value={cell.align ?? ""}
        options={[{ value: "", label: "As its column" }, ...ALIGN_OPTIONS.map((a) => ({ value: a.value, label: a.label }))]}
        onChange={(align) => set({ align: (align || undefined) as CellAlign | undefined })}
      />
      <FieldNote>The table places it in this cell and gives it its width. Drag its right or bottom edge across a line to span cells.</FieldNote>
    </PropertySection>
  )
}

/** A free area: only its frame - what is in it stays where it is placed. */
export function FreeProperties({
  selectedObject,
  onUpdateObject,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}) {
  return (
    <PropertySections>
      <PropertySection title="Free">
        <FieldNote>What is put into it stays where it is placed, as on a free screen.</FieldNote>
      </PropertySection>
      <PropertySection title="Frame" summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}>
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={(key, value) => onUpdateObject(selectedObject.id, { [key]: value })}
        />
      </PropertySection>
    </PropertySections>
  )
}
