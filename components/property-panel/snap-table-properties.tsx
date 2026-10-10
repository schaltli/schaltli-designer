"use client"

/**
 * A table put together by snapping, in the property panel
 * (docs/2026-10-09-snap-tables.md, module snap-table-panel): the table -
 * its size, «Auto sizes» - and how an object stands in its cell: Align and,
 * where it can, Fill. x, y and width are the table's and not shown
 * (property-panel.tsx layoutFrameLock).
 */

import type { ScreenObject } from "../project-editor"
import { dimensions, roleOf, snapColumnsOf, snapRowsOf, type SnapAlign, type SnapAlignY } from "@/lib/snap-table"
import { ButtonGroupRow, FieldNote, PropertySection, SelectField, ToggleRow } from "./fields"

// What can fill its cell's width or height (open question 1, proposed): a
// text, an icon, a switch or a ring keeps its own size.
const FILLS_WIDTH = new Set(["button", "button-group", "bar", "slider", "box", "free"])
const FILLS_HEIGHT = new Set(["button", "box", "free"])

const ALIGN: Array<{ value: SnapAlign; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
]
const ALIGN_Y: Array<{ value: SnapAlignY; label: string }> = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
]

type Update = (id: string, updates: Partial<ScreenObject>) => void

export function SnapTableProperties({ selectedObject, onUpdateObject }: { selectedObject: ScreenObject; onUpdateObject: Update }) {
  const { rows, columns } = dimensions(selectedObject)
  const byHand = [...snapColumnsOf(selectedObject), ...snapRowsOf(selectedObject)].some((line) => typeof line?.mm === "number")
  const automatic = () =>
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        columns: snapColumnsOf(selectedObject).map(() => ({})),
        rows: snapRowsOf(selectedObject).map(() => ({})),
      },
    })
  return (
    <PropertySection title="Table" summary={`${columns} × ${rows}`}>
      <FieldNote>
        Each column is as wide as what it holds, each row as tall, or as set by dragging its line on the canvas. Snap an object beside it to add a
        column or a row.
      </FieldNote>
      {byHand ? <ButtonGroupRow label="" buttons={[{ label: "Auto sizes", onClick: automatic }]} /> : null}
    </PropertySection>
  )
}

export function SnapCellProperties({ selectedObject, onUpdateObject }: { selectedObject: ScreenObject; onUpdateObject: Update }) {
  const cell: Record<string, any> = selectedObject.properties?.cell ?? {}
  const startAlign: SnapAlign = roleOf(selectedObject) === "label" ? "left" : "center"
  const set = (updates: Record<string, unknown>) => {
    const next: Record<string, any> = { ...cell, ...updates }
    if (next.align === undefined || next.align === startAlign) delete next.align
    if (next.alignY === undefined || next.alignY === "middle") delete next.alignY
    if (next.fill && !next.fill.width && !next.fill.height) delete next.fill
    onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, cell: next } })
  }
  const fill = (key: "width" | "height", on: boolean) => {
    const next = { ...(cell.fill ?? {}) }
    if (on) next[key] = true
    else delete next[key]
    set({ fill: next })
  }
  const width = FILLS_WIDTH.has(selectedObject.type)
  const height = FILLS_HEIGHT.has(selectedObject.type)
  return (
    <PropertySection title="Cell">
      <SelectField id="snapAlign" label="Align" value={cell.align ?? startAlign} options={ALIGN} onChange={(align) => set({ align })} />
      <SelectField id="snapAlignY" label="Vertical align" value={cell.alignY ?? "middle"} options={ALIGN_Y} onChange={(alignY) => set({ alignY })} />
      {width ? <ToggleRow label="Fill" text="Width" checked={!!cell.fill?.width} onChange={(on) => fill("width", on)} /> : null}
      {height ? <ToggleRow label={width ? "" : "Fill"} text="Height" checked={!!cell.fill?.height} onChange={(on) => fill("height", on)} /> : null}
      <FieldNote>The table places it in its cell. Drag ⇤ ⇥ ⤒ ⤓ on the canvas to make it span more cells.</FieldNote>
    </PropertySection>
  )
}
