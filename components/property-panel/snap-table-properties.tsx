"use client"

/**
 * A table put together by snapping, in the property panel
 * (docs/2026-10-09-snap-tables.md, module snap-table-panel): the table -
 * its size, «Auto sizes» - and how an object stands in its cell: Horizontal
 * and Vertical (lib/anchor.ts). x, y and width are the table's and not shown
 * (property-panel.tsx layoutFrameLock).
 */

import type { ScreenObject } from "../project-editor"
import { dimensions, gapMmOf, snapColumnsOf, snapRowsOf, widthMmOf } from "@/lib/snap-table"
import { cellAnchorOf, cellDefault, STRETCHES_HEIGHT, STRETCHES_WIDTH, type AnchorX, type AnchorY } from "@/lib/anchor"
import { ButtonGroupRow, FieldNote, NumberField, PropertySection, SelectField, ToggleRow } from "./fields"

const HORIZONTAL: Array<{ value: AnchorX; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "stretch", label: "Stretch" },
]
const VERTICAL: Array<{ value: AnchorY; label: string }> = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
  { value: "stretch", label: "Stretch" },
]
const TEXT_ALIGN = HORIZONTAL.filter((o) => o.value !== "stretch")

type Update = (id: string, updates: Partial<ScreenObject>) => void

export function SnapTableProperties({ selectedObject, onUpdateObject }: { selectedObject: ScreenObject; onUpdateObject: Update }) {
  const { rows, columns } = dimensions(selectedObject)
  const byHand = [...snapColumnsOf(selectedObject), ...snapRowsOf(selectedObject)].some((line) => typeof line?.mm === "number")
  const set = (key: string, value: unknown) => {
    const { [key]: _old, ...rest } = selectedObject.properties ?? {}
    onUpdateObject(selectedObject.id, { properties: value === undefined ? rest : { ...rest, [key]: value } })
  }
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
      {/* A grid of cards (docs/2026-11-03-card-grid.md). */}
      <NumberField
        id="tableGap"
        label="Gap"
        value={gapMmOf(selectedObject)}
        onChange={(value) => set("gapMm", value === 1.5 ? undefined : value)}
        min={0}
        max={10}
        step={0.5}
        unit="mm"
        hint="Between its columns and between its rows."
      />
      <NumberField
        id="tableWidth"
        label="Width"
        value={widthMmOf(selectedObject) ?? 0}
        onChange={(value) => set("widthMm", value > 0 ? value : undefined)}
        min={0}
        max={500}
        step={1}
        unit="mm"
        hint="Zero: as wide as what it holds. Set, the last column takes what is left, or with Equal columns all share it."
      />
      <ToggleRow label="" text="Equal columns" checked={selectedObject.properties?.equalColumns === true} onChange={(on) => set("equalColumns", on ? true : undefined)} />
    </PropertySection>
  )
}

export function SnapCellProperties({ selectedObject, onUpdateObject }: { selectedObject: ScreenObject; onUpdateObject: Update }) {
  const cell: Record<string, any> = selectedObject.properties?.cell ?? {}
  const anchor = cellAnchorOf(selectedObject)
  const defaults = cellDefault(selectedObject)
  // Only what was chosen is stored: an axis at its default is dropped.
  const set = (axis: "x" | "y", value: string) => {
    const nextAnchor: Record<string, string> = { ...(cell.anchor ?? {}), [axis]: value }
    if (nextAnchor.x === undefined || nextAnchor.x === defaults.x) delete nextAnchor.x
    if (nextAnchor.y === undefined || nextAnchor.y === defaults.y) delete nextAnchor.y
    const { anchor: _old, ...rest } = cell
    const next = Object.keys(nextAnchor).length > 0 ? { ...rest, anchor: nextAnchor } : rest
    onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, cell: next } })
  }
  const offer = <T extends { value: string }>(options: T[], stretches: boolean) => (stretches ? options : options.filter((o) => o.value !== "stretch"))
  // A text spans its cell (lib/snap-table.ts): Horizontal is its own alignment.
  const isText = selectedObject.type === "text"
  return (
    <PropertySection title="Cell">
      {isText ? (
        <SelectField
          id="cellHorizontal"
          label="Horizontal"
          value={selectedObject.properties?.textAlign ?? "left"}
          options={TEXT_ALIGN}
          onChange={(textAlign) => onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, textAlign } })}
        />
      ) : (
        <SelectField id="cellHorizontal" label="Horizontal" value={anchor.x} options={offer(HORIZONTAL, STRETCHES_WIDTH.has(selectedObject.type))} onChange={(x) => set("x", x)} />
      )}
      <SelectField id="cellVertical" label="Vertical" value={anchor.y} options={offer(VERTICAL, STRETCHES_HEIGHT.has(selectedObject.type))} onChange={(y) => set("y", y)} />
      <FieldNote>The table places it in its cell. Drag ⇤ ⇥ ⤒ ⤓ on the canvas to make it span more cells.</FieldNote>
    </PropertySection>
  )
}
