"use client"

/**
 * A box: a rectangle, and what its edge looks like.
 *
 * Round 12 of the rebuild (docs/2026-09-20-property-panel.md), and the
 * plainest object there is - four rows and a frame, and no stored property
 * that anything else has to agree with.
 *
 * It also holds the last two sliders in the designer. Rounds 10 and 11 said
 * they were gone and they were not: stroke width and corner radius were
 * still `<Slider>` here, each with a second line underneath to say "3px"
 * because a slider cannot say it itself. That is exactly what decision 8
 * was about, and now there are none.
 */

import type { ScreenObject } from "../project-editor"
import {
  ColorField,
  FrameFields,
  NumberField,
  PropertySection,
  PropertySections,
  frameSummary,
} from "./fields"

interface BoxPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function BoxProperties({ selectedObject, onUpdateObject, colorDepth, allScreens }: BoxPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  return (
    <PropertySections>
      <PropertySection title="Shape">
        <NumberField
          id="strokeWidth"
          label="Stroke width"
          value={selectedObject.properties.strokeWidth ?? 1}
          onChange={(value) => updateProperty("strokeWidth", value)}
          min={0}
          max={10}
          unit="px"
          hint="Zero draws no edge at all, which leaves a plain filled rectangle."
        />
        <NumberField
          id="cornerRadius"
          label="Corner radius"
          value={selectedObject.properties.cornerRadius || 0}
          onChange={(value) => updateProperty("cornerRadius", value)}
          min={0}
          max={20}
          unit="px"
        />
      </PropertySection>

      <PropertySection title="Colour">
        <ColorField
          label="Fill"
          value={selectedObject.properties.fillColor || "#cccccc"}
          onChange={(value) => updateProperty("fillColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
          screens={allScreens}
        />
        <ColorField
          label="Stroke"
          value={selectedObject.properties.strokeColor || "#000000"}
          onChange={(value) => updateProperty("strokeColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
          screens={allScreens}
        />
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
          onChange={updatePosition}
        />
      </PropertySection>
    </PropertySections>
  )
}
