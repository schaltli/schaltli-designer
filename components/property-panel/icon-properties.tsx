"use client"

/**
 * An icon: one picture from the project's library.
 *
 * Round 8 of the rebuild (docs/2026-09-20-property-panel.md), and the
 * shortest panel of the nineteen - three rows and a frame. It is also where
 * the fourth copy of the icon slot goes: the thumbnail, the name and the
 * clear button were written out again here, with the same `atob` and the
 * same placeholder square as in three other files.
 *
 * The height is the width's. An icon's artwork is square and the canvas has
 * always enforced that when one is drawn or resized (`isSquareType`); this
 * panel was the one place left where a number could be typed into an oval
 * the canvas would never produce.
 */

import type { ScreenObject, ProjectAsset } from "../project-editor"
import {
  ColorField,
  FieldNote,
  FrameFields,
  IconField,
  IconTintField,
  PropertySection,
  PropertySections,
  frameSummary,
} from "./fields"

interface IconPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector?: () => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function IconProperties({
  selectedObject,
  onUpdateObject,
  projectAssets,
  colorDepth,
  onOpenIconSelector,
  allScreens,
}: IconPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    if (key === "width") {
      const size = Math.max(1, value)
      onUpdateObject(selectedObject.id, { width: size, height: size })
      return
    }
    if (key === "height") return
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  return (
    <PropertySections>
      <PropertySection title="Content">
        <IconField
          label="Icon"
          assetId={selectedObject.properties.assetId}
          projectAssets={projectAssets}
          onSelect={onOpenIconSelector}
          onClear={() => updateProperty("assetId", null)}
        />
        {selectedObject.properties.assetId ? (
          <FieldNote>
            The picture itself lives in Project Settings &rarr; Assets. Change it there and every icon using it
            follows.
          </FieldNote>
        ) : null}
      </PropertySection>

      <PropertySection title="Colour">
        <IconTintField
          assetIds={[selectedObject.properties.assetId]}
          projectAssets={projectAssets}
          iconColor={selectedObject.properties.iconColor}
          iconColorFlatten={selectedObject.properties.iconColorFlatten}
          onUpdate={updateProperty}
          colorDepth={colorDepth}
          screens={allScreens}
        />
        <ColorField
          label="Background"
          value={selectedObject.properties.backgroundColor || "transparent"}
          onChange={(value) => updateProperty("backgroundColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
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
          captions={{ width: "Size" }}
          locked={["height"]}
          lockedHint="An icon's artwork is square, so the height follows the size."
        />
      </PropertySection>
    </PropertySections>
  )
}
