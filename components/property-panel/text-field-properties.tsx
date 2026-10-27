"use client"

/**
 * A text field: a topic's text, and a new one typed on the device and sent
 * to the write topic (tasks/ha-text-plan.md).
 *
 * Its look comes from the theme as everything's does - the field in
 * «Panel», the line under it in the accent, the text in «Text» - so the
 * Colour section offers the three and nothing else.
 */

import type { TextScale } from "@/lib/size-scale"
import { textFieldBounds, TEXT_FIELD_MAX_LENGTH } from "@/lib/text-field"
import type { ScreenObject, ProjectFont, Topic } from "../project-editor"
import {
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  NumberField,
  PropertySection,
  PropertySections,
  TextStyleField,
  ToggleRow,
  TopicField,
  frameSummary,
} from "./fields"

interface TextFieldPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  fonts: ProjectFont[]
  textScale?: TextScale
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts?: () => void
}

export function TextFieldProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  textScale,
  colorDepth,
  onManageFonts,
}: TextFieldPropertiesProps) {
  const properties = selectedObject.properties
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, { properties: { ...properties, [key]: value } })
  }
  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }
  const bounds = textFieldBounds(properties)

  return (
    <PropertySections>
      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
          hint="The text the field shows. Without one it shows what was last sent."
        />
        <TopicField
          label="Write topic"
          selectedTopicId={properties.writeTopic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("writeTopic", topic)}
          onManageTopics={onManageTopics}
          allowSubtopics={false}
        />
        <FieldNote>A tap on the field opens a keyboard; OK sends the text as it is.</FieldNote>
      </PropertySection>

      <PropertySection title="Typing">
        <NumberField
          id="minLength"
          label="Min length"
          value={bounds.minLength}
          min={0}
          max={bounds.maxLength}
          unit="characters"
          onChange={(value) => updateProperty("minLength", value)}
          hint="OK stays grey while the text is shorter."
        />
        <NumberField
          id="maxLength"
          label="Max length"
          value={bounds.maxLength}
          min={1}
          max={TEXT_FIELD_MAX_LENGTH}
          unit="characters"
          onChange={(value) => updateProperty("maxLength", value)}
          hint="The keys stop taking more."
        />
        <ToggleRow
          label="Hide text"
          checked={properties.hidden === true}
          onChange={(checked) => updateProperty("hidden", checked)}
          text="Dots instead of letters"
          hint="For a password: the field and the keyboard show a dot for each character."
        />
      </PropertySection>

      <PropertySection title="Text">
        {textScale ? (
          <TextStyleField
            textStyle={properties.textStyle}
            textBold={properties.textBold === true}
            fontId={properties.fontId}
            fontSize={properties.fontSize}
            fonts={fonts}
            scale={textScale}
            onChange={(styled) => onUpdateObject(selectedObject.id, { properties: { ...properties, ...styled } })}
          />
        ) : (
          <FontField
            value={properties.fontId}
            fonts={fonts}
            onChange={(value) => updateProperty("fontId", value)}
            onManageFonts={onManageFonts}
          />
        )}
      </PropertySection>

      <PropertySection title="Colour">
        <ColorField
          label="Field"
          value={properties.fieldColor || "panel"}
          onChange={(value) => updateProperty("fieldColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Line"
          value={properties.lineColor || "accent"}
          onChange={(value) => updateProperty("lineColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
          hint="Along the bottom: what says the field can be typed into."
        />
        <ColorField
          label="Text"
          value={properties.textColor || "text"}
          onChange={(value) => updateProperty("textColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
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
