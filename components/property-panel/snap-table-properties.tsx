"use client"

/**
 * A table put together by snapping, in the property panel
 * (docs/2026-10-09-snap-tables.md, module snap-table-panel): the table -
 * its size, «Auto sizes» - and how an object stands in its cell: Horizontal
 * and Vertical (lib/anchor.ts). x, y and width are the table's and not shown
 * (property-panel.tsx layoutFrameLock).
 */

import { canShareCell } from "@/lib/cell-area"
import type { ScreenObject } from "../project-editor"
import { dimensions, gapMmOf, lineStateOf, snapColumnsOf, snapRowsOf } from "@/lib/snap-table"
import { cellAnchorOf, cellDefault, STRETCHES_HEIGHT, STRETCHES_WIDTH, type AnchorX, type AnchorY } from "@/lib/anchor"
import { ButtonGroupRow, FieldNote, FrameFields, NumberField, PropertySection, SelectField, ToggleRow, frameSummary } from "./fields"

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
  const byHand = [...snapColumnsOf(selectedObject), ...snapRowsOf(selectedObject)].some((line) => lineStateOf(line) !== "auto")
  const set = (key: string, value: unknown) => {
    const { [key]: _old, ...rest } = selectedObject.properties ?? {}
    onUpdateObject(selectedObject.id, { properties: value === undefined ? rest : { ...rest, [key]: value } })
  }
  const automatic = () => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        columns: snapColumnsOf(selectedObject).map(() => ({})),
        rows: snapRowsOf(selectedObject).map(() => ({})),
      },
    })
  }
  return (
    <>
    {/* A table has a size of its own (docs/2026-11-16-table-sizes.md,
        decision 2): typed here or pulled at a handle, never below what it
        holds. Docked, its area places it (FrameLockContext). */}
    <PropertySection title="Frame" defaultCollapsed summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}>
      <FrameFields
        x={selectedObject.x}
        y={selectedObject.y}
        width={selectedObject.width}
        height={selectedObject.height}
        onChange={(key, value) => onUpdateObject(selectedObject.id, { [key]: value })}
      />
    </PropertySection>
    <PropertySection title="Table" summary={`${columns} × ${rows}`}>
      <FieldNote>
        Each column and row says on the canvas what sets its size: auto (what it holds), a size in mm (its line dragged), or fill (a share of what
        the table has left over). Click the sign to change it. The table is as large as what it holds, or as you drag it at a handle.
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
    </PropertySection>
    </>
  )
}

const CELL_DOCK = [
  { value: "fill", label: "Fill" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
]
const CELL_LOOK = [
  { value: "none", label: "None" },
  { value: "card", label: "Card" },
  { value: "card-accent", label: "Card, accent" },
]

/**
 * «Position» of an object alone in a table's cell (docs/2026-11-16-areas.md,
 * decisions 8, 12 and 13): the three fields an object has wherever it stands
 * - Dock, Horizontal, Vertical - and its cell's Look. Alone in its cell it
 * fills it, standing in it by Horizontal and Vertical. Docked to an edge, or
 * its cell given a look, the cell becomes an area around it (`onMakeCell`,
 * lib/cell-area.ts) and is «Cell» in the object list from then on.
 */
export function SnapCellProperties({
  selectedObject,
  onUpdateObject,
  onMakeCell,
}: {
  selectedObject: ScreenObject
  onUpdateObject: Update
  onMakeCell?: (id: string, own: { dock?: string; look?: string }) => void
}) {
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
  // What can share its cell (not an area, a table or a switcher: those hold their own).
  const shares = !!onMakeCell && canShareCell(selectedObject)
  return (
    <PropertySection title="Position">
      {shares ? (
        <SelectField id="cellDock" label="Dock" value="fill" options={CELL_DOCK} onChange={(dock) => dock !== "fill" && onMakeCell!(selectedObject.id, { dock })} />
      ) : null}
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
      {shares ? (
        <SelectField id="cellLook" label="Cell look" value="none" options={CELL_LOOK} onChange={(look) => look !== "none" && onMakeCell!(selectedObject.id, { look })} />
      ) : null}
      <FieldNote>
        The table places it in its cell. Drag ⇤ ⇥ ⤒ ⤓ on the canvas to make it span more cells.
        {shares ? " Its cell holds more: let another object go on it, dock this one to an edge of it, or give the cell a look." : ""}
      </FieldNote>
    </PropertySection>
  )
}
