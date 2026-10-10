"use client"

/**
 * A free area's properties (docs/2026-10-03-free-screens.md): what is put
 * into it stays where it is placed; it may look like a box.
 */

import type { ScreenObject } from "../project-editor"
import { ColorField, FieldNote, FrameFields, NumberField, PropertySection, PropertySections, frameSummary } from "./fields"

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
        <FieldNote>What is put into it stays where it is placed, as on a free screen. It looks like a Box, if you give it a fill or an edge.</FieldNote>
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
