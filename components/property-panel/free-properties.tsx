"use client"

/**
 * A free area's properties (docs/2026-10-03-free-screens.md): what is put
 * into it stays where it is placed; it may look like a box.
 */

import type { ScreenObject } from "../project-editor"
import { ColorField, FieldNote, FrameFields, NumberField, PropertySection, PropertySections, SelectField, frameSummary } from "./fields"
import { areaAnchorOf, STRETCHES_HEIGHT_IN_AREA, STRETCHES_WIDTH_IN_AREA, type AnchorX, type AnchorY } from "@/lib/anchor"

/** A free area: only its frame - what is in it stays where it is placed. */
export function FreeProperties({
  selectedObject,
  onUpdateObject,
  colorDepth,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  colorDepth: "1bit" | "4bit" | "24bit"
}) {
  const set = (key: string, value: unknown) =>
    onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, [key]: value } })
  // A box's look (asked 2026-10-05): fill, edge and corners, the same
  // properties a Box has. A device gets it as a box behind what the area
  // holds (lib/object-groups.ts freeBox). Without them it draws nothing.
  return (
    <PropertySections>
      <PropertySection title="Free">
        <FieldNote>
          What is put into it stays where it is placed, as on a free screen, and follows its edges when it is resized as its Position says. It looks like a
          Box, if you give it a fill or an edge.
        </FieldNote>
      </PropertySection>
      <PropertySection title="Shape">
        <NumberField
          id="strokeWidth"
          label="Stroke width"
          value={selectedObject.properties.strokeWidth ?? 0}
          onChange={(value) => set("strokeWidth", value)}
          min={0}
          max={10}
          unit="px"
          hint="Zero draws no edge at all."
        />
        <NumberField
          id="cornerRadius"
          label="Corner radius"
          value={selectedObject.properties.cornerRadius || 0}
          onChange={(value) => set("cornerRadius", value)}
          min={0}
          max={20}
          unit="px"
        />
      </PropertySection>
      <PropertySection title="Colour">
        <ColorField
          label="Fill"
          value={selectedObject.properties.fillColor || "transparent"}
          onChange={(value) => set("fillColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
        <ColorField
          label="Stroke"
          value={selectedObject.properties.strokeColor || "text"}
          onChange={(value) => set("strokeColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
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

/**
 * An object directly in a free area (docs/2026-11-03-anchor-dock.md): which
 * edges of the area it keeps its distance to when the area is resized.
 * Left/Top, the default, is not stored.
 */
export function FreePositionProperties({
  selectedObject,
  onUpdateObject,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}) {
  const anchor = areaAnchorOf(selectedObject)
  const set = (axis: "x" | "y", value: string) => {
    const next: Record<string, string> = { ...(selectedObject.properties?.anchor ?? {}), [axis]: value }
    if (next.x === "left") delete next.x
    if (next.y === "top") delete next.y
    const { anchor: _old, ...rest } = selectedObject.properties ?? {}
    onUpdateObject(selectedObject.id, { properties: Object.keys(next).length > 0 ? { ...rest, anchor: next } : rest })
  }
  const offer = <T extends { value: string }>(options: T[], stretches: boolean) => (stretches ? options : options.filter((o) => o.value !== "stretch"))
  return (
    <PropertySection title="Position">
      <SelectField id="areaHorizontal" label="Horizontal" value={anchor.x} options={offer(HORIZONTAL, STRETCHES_WIDTH_IN_AREA.has(selectedObject.type))} onChange={(x) => set("x", x)} />
      <SelectField id="areaVertical" label="Vertical" value={anchor.y} options={offer(VERTICAL, STRETCHES_HEIGHT_IN_AREA.has(selectedObject.type))} onChange={(y) => set("y", y)} />
      <FieldNote>When the free area is resized, it keeps its distance to these edges; Center and Middle keep it to the middle, Stretch to both.</FieldNote>
    </PropertySection>
  )
}
