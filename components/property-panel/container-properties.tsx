"use client"

/**
 * A layout container (lib/layout.ts, docs/2026-10-02-layout.md): how it
 * places what is put into it. Spacing in millimetres, so that it grows with
 * a device's pixel density as the size steps do; the defaults are
 * DEFAULT_CONTAINER_PADDING_MM and DEFAULT_GAP_MM.
 */

import { useEffect, useState } from "react"
import type { ScreenObject } from "../project-editor"
import {
  DEFAULT_GAP_MM,
  DEFAULT_GRID_COLUMNS,
  DEFAULT_CONTAINER_PADDING_MM,
  type GridColumn,
} from "@/lib/layout"
import {
  FieldNote,
  FrameFields,
  NumberField,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  frameSummary,
} from "./fields"

interface ContainerPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}

const CROSS_ALIGN_VERTICAL = [
  { value: "start", label: "Start" },
  { value: "centre", label: "Centre" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
] as const
const CROSS_ALIGN_HORIZONTAL = [
  { value: "start", label: "Top" },
  { value: "centre", label: "Centre" },
  { value: "end", label: "Bottom" },
] as const
const DISTRIBUTE = [
  { value: "start", label: "Start" },
  { value: "centre", label: "Centre" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Space between" },
  { value: "fill", label: "Fill" },
] as const

/** Columns as typed: "auto, 1" - `auto` or a weight each. */
export function formatColumns(columns: readonly GridColumn[]): string {
  return columns.map((c) => (c === "auto" ? "auto" : String(c))).join(", ")
}
export function parseColumns(text: string): GridColumn[] | null {
  const parts = text.split(",").map((p) => p.trim()).filter((p) => p !== "")
  if (parts.length === 0) return null
  const columns: GridColumn[] = []
  for (const part of parts) {
    if (part.toLowerCase() === "auto") columns.push("auto")
    else {
      const weight = Number(part)
      if (!Number.isFinite(weight) || weight <= 0) return null
      columns.push(weight)
    }
  }
  return columns
}

export function ContainerProperties({ selectedObject, onUpdateObject }: ContainerPropertiesProps) {
  const props = selectedObject.properties ?? {}
  const set = (key: string, value: unknown) =>
    onUpdateObject(selectedObject.id, { properties: { ...props, [key]: value } })
  const type = selectedObject.type
  const count = selectedObject.children?.length ?? 0
  const columns: GridColumn[] = Array.isArray(props.columns) && props.columns.length > 0 ? props.columns : DEFAULT_GRID_COLUMNS
  // Columns are typed as a list, half a list on the way: kept as typed, and
  // taken when the field is left - or put back if it is no list of columns.
  const [columnsDraft, setColumnsDraft] = useState(formatColumns(columns))
  const columnsText = formatColumns(columns)
  useEffect(() => setColumnsDraft(columnsText), [columnsText, selectedObject.id])

  return (
    <PropertySections>
      <PropertySection title="Layout" summary={`${count} ${count === 1 ? "object" : "objects"}`}>
        {type === "free" ? (
          <FieldNote>What is put into it stays where it is placed, as on a screen.</FieldNote>
        ) : (
          <>
            <NumberField
              id="container-padding"
              label="Padding"
              unit="mm"
              min={0}
              step={0.5}
              value={typeof props.paddingMm === "number" ? props.paddingMm : DEFAULT_CONTAINER_PADDING_MM}
              onChange={(value) => set("paddingMm", value)}
              hint="Space between the container's edge and what it holds. In millimetres, so it looks the same on every device."
            />
            <NumberField
              id="container-gap"
              label="Gap"
              unit="mm"
              min={0}
              step={0.5}
              value={typeof props.gapMm === "number" ? props.gapMm : DEFAULT_GAP_MM}
              onChange={(value) => set("gapMm", value)}
              hint="Space between the objects in it."
            />
          </>
        )}
        {type === "vertical-stack" && (
          <SelectField
            id="container-align"
            label="Align"
            value={props.align ?? "start"}
            options={CROSS_ALIGN_VERTICAL}
            onChange={(value) => set("align", value)}
            hint="Where an object narrower than the stack stands. Stretch makes every object as wide as the stack."
          />
        )}
        {type === "horizontal-stack" && (
          <>
            <SelectField
              id="container-align"
              label="Align"
              value={props.align ?? "start"}
              options={CROSS_ALIGN_HORIZONTAL}
              onChange={(value) => set("align", value)}
              hint="Where an object lower than the row stands."
            />
            <SelectField
              id="container-distribute"
              label="Distribute"
              value={props.distribute ?? "start"}
              options={DISTRIBUTE}
              onChange={(value) => set("distribute", value)}
              hint="How the objects share the row's length. Fill makes them all as wide."
            />
          </>
        )}
        {type === "grid" && (
          <TextField
            id="container-columns"
            label="Columns"
            value={columnsDraft}
            onChange={setColumnsDraft}
            onBlur={(text) => {
              const parsed = parseColumns(text)
              if (parsed) set("columns", parsed)
              else setColumnsDraft(columnsText)
            }}
            hint="One entry per column, separated by commas: auto (as wide as its widest object) or a number (a share of what is left). Names and controls: auto, 1."
          />
        )}
        {props.overflow ? (
          <FieldNote>What it holds does not fit - too tall, or a control too wide for its place: the device cuts it off where the screen ends.</FieldNote>
        ) : null}
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}
      >
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
