"use client"

/**
 * A time field: a topic's time of day, and a new one set on the device's
 * picker and sent to the write topic (tasks/ha-time-plan.md). Its look is
 * the text field's - the field in «Panel», the line in the accent, the time
 * in «Text» - so its Colour section is the same three.
 */

import type { TextScale } from "@/lib/size-scale"
import { timeFieldStep, TIME_FIELD_STEPS } from "@/lib/time-field"
import type { ScreenObject, ProjectFont, Topic } from "../project-editor"
import {
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  PropertySection,
  PropertySections,
  SelectField,
  TextStyleField,
  TopicField,
  frameSummary,
} from "./fields"

const STEPS = TIME_FIELD_STEPS.map((step) => ({ value: String(step), label: `${step} min` }))

interface TimeFieldPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  fonts: ProjectFont[]
  textScale?: TextScale
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts?: () => void
}

export function TimeFieldProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  textScale,
  colorDepth,
  onManageFonts,
}: TimeFieldPropertiesProps) {
  const properties = selectedObject.properties
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, { properties: { ...properties, [key]: value } })
  }
  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  return (
    <PropertySections>
      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
          hint="The time the field shows. Without one it shows what was last sent."
        />
        <TopicField
          label="Write topic"
          selectedTopicId={properties.writeTopic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("writeTopic", topic)}
          onManageTopics={onManageTopics}
          allowSubtopics={false}
        />
        <FieldNote>A tap on the field opens a picker; OK sends the time as 06:45:00.</FieldNote>
      </PropertySection>

      <PropertySection title="Picking">
        <SelectField
          id="minuteStep"
          label="Minute step"
          value={String(timeFieldStep(properties))}
          options={STEPS}
          onChange={(value) => updateProperty("minuteStep", Number(value))}
          hint="The minutes the picker offers. What is sent is rounded onto the step."
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
          hint="Along the bottom: what says the field can be set."
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
