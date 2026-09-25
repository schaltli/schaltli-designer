"use client"

/**
 * Text: words the author writes, some of which the export fills in.
 *
 * Round 7 of the rebuild (docs/2026-09-20-property-panel.md), and the
 * simplest object in the toolbar - which makes it the one place the
 * placeholder tokens can be shown rather than hidden. They used to live
 * behind an "Insert Placeholder" dropdown above the field; here they are the
 * `ButtonGroupRow` the field set was given for exactly this
 * (fields/button-group-row.tsx names them in its own comment), so a person
 * can see that {screen} and {project} exist without opening anything.
 *
 * Align sits in Text with the font, not in Content - the same property in
 * the same place as Live Text's, which is the whole promise. The table in
 * that document had it in Content here and in Text there.
 */

import { AVAILABLE_PLACEHOLDERS } from "@/lib/placeholder-utils"
import { calculateTextObjectHeight, getFontHeight } from "@/lib/font-utils"
import type { ScreenObject, ProjectFont } from "../project-editor"
import {
  ButtonGroupRow,
  ColorField,
  FontField,
  FrameFields,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  frameSummary,
} from "./fields"

const ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const

interface LabelPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts: () => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function LabelProperties({
  selectedObject,
  onUpdateObject,
  fonts,
  colorDepth,
  onManageFonts,
  allScreens,
}: LabelPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    if (key === "height") return
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const insertPlaceholder = (token: string) => {
    updateProperty("text", (selectedObject.properties.text || "") + token)
  }

  // As tall as the font it is drawn in, exactly as Live Text is.
  const font = fonts.find((f) => f.id === selectedObject.properties.fontId)
  const derivedHeight = font
    ? getFontHeight(font)
    : calculateTextObjectHeight(selectedObject.properties.fontSize || 16)

  return (
    <PropertySections>
      <PropertySection title="Content">
        <TextField
          id="text"
          label="Text"
          value={selectedObject.properties.text}
          onChange={(value) => updateProperty("text", value)}
        />
        {/* Filled in when the project is exported to a device, and left as
            written in the editable copy - so a label can say which screen it
            is on without anybody keeping it in step by hand. */}
        <ButtonGroupRow
          label="Insert"
          hint="Added at the end of the text. The device sees the value; the project file keeps the token."
          buttons={AVAILABLE_PLACEHOLDERS.map((placeholder) => ({
            label: placeholder.token,
            title: placeholder.description,
            onClick: () => insertPlaceholder(placeholder.token),
          }))}
        />
      </PropertySection>

      <PropertySection title="Text">
        <FontField
          value={selectedObject.properties.fontId}
          fonts={fonts}
          onManageFonts={onManageFonts}
          onChange={(value) => {
            const f = fonts.find((fn) => fn.id === value)
            const fontSize = f?.size || selectedObject.properties.fontSize || 16
            onUpdateObject(selectedObject.id, {
              height: calculateTextObjectHeight(fontSize),
              properties: { ...selectedObject.properties, fontId: value, fontSize },
            })
          }}
        />
        <SelectField
          id="textAlign"
          label="Align"
          value={selectedObject.properties.textAlign || "left"}
          options={ALIGN}
          onChange={(value) => updateProperty("textAlign", value)}
        />
      </PropertySection>

      <PropertySection title="Colour">
        {/* `color`, not `textColor`: the shared text-box renderer resolves
            `color` first and only falls back to `textColor` for what the MQTT
            field writes (render-text-box.ts), and the firmware's
            ScreenRenderer checks the same order. Writing the other one here
            would edit a property nothing reads. */}
        <ColorField
          label="Text"
          value={selectedObject.properties.color || selectedObject.properties.textColor || "text"}
          onChange={(value) => updateProperty("color", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Background"
          value={selectedObject.properties.backgroundColor || "surface"}
          onChange={(value) => updateProperty("backgroundColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
        <ColorField
          label="Border"
          value={selectedObject.properties.borderColor || "outline"}
          onChange={(value) => updateProperty("borderColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, derivedHeight)}
      >
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={derivedHeight}
          onChange={updatePosition}
          locked={["height"]}
          lockedHint="As tall as the font it is drawn in. Choose another font to change it."
        />
      </PropertySection>
    </PropertySections>
  )
}
