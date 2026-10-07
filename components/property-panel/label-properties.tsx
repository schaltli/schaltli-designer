"use client"

/**
 * Text: words the author writes, and placeholders such as
 * {topic:…:F0} that the device fills in (docs/2026-09-25-text-placeholders.md).
 *
 * Round 7 of the rebuild (docs/2026-09-20-property-panel.md). The "Insert"
 * row of {screen}-style tokens went on 2026-09-25 with the tokens; typing `{`
 * opens a picker instead (docs/2026-09-25-placeholder-picker.md).
 *
 * Align sits in Text with the font, not in Content. A value from a topic is
 * a `{topic:…}` placeholder in the text - Live Text, which did that as a type
 * of its own, went into Text on 2026-10-07.
 */

import { calculateTextObjectHeight, getFontHeight } from "@/lib/font-utils"
import { referencedTopics, type Separators } from "@/lib/placeholders"
import type { TextScale } from "@/lib/size-scale"
import type { ScreenObject, ProjectFont, Topic } from "../project-editor"
import {
  ColorField,
  FontField,
  TextStyleField,
  FrameFields,
  PlaceholderTextField,
  PropertySection,
  PropertySections,
  SelectField,
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
  /**
   * Declares the topics a text's placeholders name, when the field is left
   * (docs/2026-09-25-text-placeholders.md) - not on every keystroke, which
   * would declare every half-typed path on the way.
   */
  onDeclareTopics?: (topics: string[]) => void
  /** What `{` in the Text offers, and the number format its previews use. */
  topics: Topic[]
  numberSeparators?: Separators
  fonts: ProjectFont[]
  /** The device's scale, when it gives one: text is then set in a style. */
  textScale?: TextScale
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
  onDeclareTopics,
  topics,
  numberSeparators,
  fonts,
  textScale,
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

  // As tall as the font it is drawn in.
  const font = fonts.find((f) => f.id === selectedObject.properties.fontId)
  const derivedHeight = font
    ? getFontHeight(font)
    : calculateTextObjectHeight(selectedObject.properties.fontSize || 16)

  return (
    <PropertySections>
      <PropertySection title="Content">
        <PlaceholderTextField
          id="text"
          label="Text"
          value={selectedObject.properties.text}
          onChange={(value) => updateProperty("text", value)}
          onBlur={(value) => onDeclareTopics?.(referencedTopics(value))}
          topics={topics}
          separators={numberSeparators}
        />
      </PropertySection>

      <PropertySection title="Text">
        {textScale ? (
          // On a device with a scale the text is set in a style, and its
          // font follows from the device's typography
          // (docs/2026-09-30-size-scale.md). The height follows the font, as
          // it does below.
          <TextStyleField
            textStyle={selectedObject.properties.textStyle}
            textBold={selectedObject.properties.textBold === true}
            fontId={selectedObject.properties.fontId}
            fontSize={selectedObject.properties.fontSize}
            fonts={fonts}
            scale={textScale}
            onChange={(styled) =>
              onUpdateObject(selectedObject.id, {
                height: calculateTextObjectHeight(styled.fontSize),
                properties: { ...selectedObject.properties, ...styled },
              })
            }
          />
        ) : (
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
        )}
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
