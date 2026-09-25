"use client"

/**
 * Live Text: a value from the broker, drawn as words.
 *
 * Round 6 of the rebuild (docs/2026-09-20-property-panel.md). The first
 * panel where Content is a formatting block rather than a thing to write -
 * what the object shows is the topic's value, and what is in Content is how
 * that value is dressed: a prefix and a suffix around it, how many decimals,
 * what separates the thousands. They appear only for a formatted number,
 * because an arriving string is shown exactly as it arrives.
 *
 * The height is the font's, not the author's: it was already a disabled box
 * in the old panel and is a locked one here, with the reason on the row
 * instead of in the greyed-out look.
 */

import { calculateTextObjectHeight, getFontHeight } from "@/lib/font-utils"
import type { ScreenObject, Topic, ProjectFont } from "../project-editor"
import {
  ColorField,
  FontField,
  FrameFields,
  NumberField,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  TextPair,
  TopicField,
  frameSummary,
} from "./fields"

/**
 * The two stored strings, which are what the firmware reads - only their
 * names here are new.
 */
const SHOW_AS = [
  { value: "Display as-is", label: "As it arrives" },
  { value: "Formatted Number", label: "Formatted number" },
] as const

const ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const

interface MqttDataFieldPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
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

export function MqttDataFieldProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  colorDepth,
  onManageFonts,
  allScreens,
}: MqttDataFieldPropertiesProps) {
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

  // What the object is actually as tall as: the chosen font's own height,
  // and for a standard font what that size works out to.
  const font = fonts.find((f) => f.id === selectedObject.properties.fontId)
  const derivedHeight = font
    ? getFontHeight(font)
    : calculateTextObjectHeight(selectedObject.properties.fontSize || 16)

  const formatted = selectedObject.properties.displayAs === "Formatted Number"

  return (
    <PropertySections>
      <PropertySection title="Content">
        <SelectField
          id="displayAs"
          label="Show as"
          value={selectedObject.properties.displayAs || "Display as-is"}
          options={SHOW_AS}
          onChange={(value) => updateProperty("displayAs", value)}
          hint="A formatted number needs a numeric topic. As it arrives shows whatever the broker sends, text or number, untouched."
        />

        {formatted ? (
          <>
            <TextPair
              label="Prefix / suffix"
              names={["Prefix", "Suffix"]}
              placeholders={["$, €", "%, °C"]}
              values={[selectedObject.properties.prefix, selectedObject.properties.postfix]}
              onChange={(which, value) => updateProperty(which === 0 ? "prefix" : "postfix", value)}
              hint="Drawn either side of the number, with whatever spacing you type."
            />
            <NumberField
              id="numberOfDecimals"
              label="Decimals"
              value={selectedObject.properties.numberOfDecimals}
              onChange={(value) => updateProperty("numberOfDecimals", value)}
              min={0}
              max={10}
              placeholder="Auto"
              hint="Empty keeps whatever the value arrives with."
            />
            <TextField
              id="thousandsSeparator"
              label="Thousands"
              value={selectedObject.properties.thousandsSeparator}
              onChange={(value) => updateProperty("thousandsSeparator", value)}
              placeholder=",  .  '"
            />
          </>
        ) : null}
      </PropertySection>

      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={selectedObject.properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
        />
      </PropertySection>

      <PropertySection title="Text">
        {/* Choosing a font resizes the object to it, which is why the height
            is not the author's to set. */}
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
