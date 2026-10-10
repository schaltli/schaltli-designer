"use client"

/**
 * The navigator (docs/2026-10-08-navigator.md): a bar along one edge of the
 * master with an entry per screen. It is not placed by hand - «Edge» and
 * «Shows» put it where it goes and size it (lib/navigator.ts) - so there is
 * no position here. Its colours are the theme's: «Panel» with a line in
 * «Outline» towards the screen, «Text», the open screen's entry «Accent» and
 * «Text on accent».
 */

import type { ProjectFont, ScreenObject } from "../project-editor"
import { navigatorStrip, type Edge, type Shows } from "@/lib/navigator"
import { FontField, PropertySection, PropertySections, SelectField } from "./fields"

interface NavigatorPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  fonts: ProjectFont[]
  onManageFonts?: () => void
  screenWidth: number
  screenHeight: number
}

const EDGES: { value: Edge; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
]

const SHOWS: { value: Shows; label: string }[] = [
  { value: "icons", label: "Icons" },
  { value: "iconsAndText", label: "Icons and text" },
]

export function NavigatorProperties({
  selectedObject,
  onUpdateObject,
  fonts,
  onManageFonts,
  screenWidth,
  screenHeight,
}: NavigatorPropertiesProps) {
  const edge: Edge = selectedObject.properties.edge ?? "left"
  const shows: Shows = selectedObject.properties.shows ?? "iconsAndText"

  // A change of edge or of what an entry shows moves and sizes the strip.
  const place = (next: { edge?: Edge; shows?: Shows }) => {
    const properties = { ...selectedObject.properties, ...next }
    onUpdateObject(selectedObject.id, {
      ...navigatorStrip(properties.edge ?? "left", properties.shows ?? "iconsAndText", screenWidth, screenHeight),
      properties,
    })
  }

  return (
    <PropertySections>
      <PropertySection title="Layout">
        <SelectField
          id="navigatorEdge"
          label="Edge"
          value={edge}
          options={EDGES}
          onChange={(value) => place({ edge: value as Edge })}
          hint="It fills that edge on every screen using this master."
        />
        <SelectField
          id="navigatorShows"
          label="Shows"
          value={shows}
          options={SHOWS}
          onChange={(value) => place({ shows: value as Shows })}
          hint="The screen's icon, and its name under it."
        />
        {shows === "iconsAndText" && (
          <FontField
            value={selectedObject.properties.fontId}
            fonts={fonts}
            onChange={(fontId) => onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, fontId } })}
            onManageFonts={onManageFonts}
          />
        )}
      </PropertySection>
    </PropertySections>
  )
}
