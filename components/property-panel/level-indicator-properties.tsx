"use client"

/**
 * A bar and a slider: a value along a straight track, and the same track with
 * a finger on it.
 *
 * Round 2 of the rebuild (docs/2026-09-20-property-panel.md), and the hard
 * one on purpose: nineteen rows, ten of the fourteen fields, a list, and two
 * objects out of one file. The Bar is this panel with the Data section's
 * write half taken away - that is the whole difference, and keeping them in
 * one file is what makes it stay that way.
 *
 * Three things the old panel did that the table in that document did not
 * expect, and that the rebuild had to decide rather than copy:
 *
 * - The marker rows (style, width, setpoint topic, colour) were hidden
 *   unless the object was a slider *and* had a write topic, so a bar that
 *   reports a target - a thermostat's setpoint - could only be given one by
 *   editing the project file. `levelHasHandle` has always said a marker
 *   belongs to either binding, and the approved mockups show those rows on
 *   the Bar. They are shown for both types now.
 * - There is no Track colour, though the table and the mockups list one: the
 *   track is mixed from the bar's own colour and the screen's background
 *   (docs/2026-09-19-slider-look.md, decision 12) and setting it separately
 *   would put back the thing that decision removed.
 * - The icon's colour is not in the table at all. It exists, four object
 *   types share it, and it goes in the Colour section with the rest.
 */

import { LEVEL_DEFAULT_THICKNESS, levelDirection, levelThickness } from "@/lib/level-shape"
import { calibrationIsMonotonic, settableRange, type CalibrationPoint } from "@/lib/settable-level"
import { isSettableLevel } from "@/lib/object-types"
import type { ScreenObject, Topic, ProjectAsset, ProjectFont } from "../project-editor"
import { referencedTopics, type Separators } from "@/lib/placeholders"
import {
  AddListItem,
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  IconField,
  IconTintField,
  ListItem,
  NumberField,
  PlaceholderTextField,
  PropertySection,
  PropertySections,
  SelectField,
  TopicField,
  frameSummary,
  listSummary,
} from "./fields"

const DIRECTIONS = [
  { value: "left-to-right", label: "Left to Right" },
  { value: "bottom-to-top", label: "Bottom to Top" },
  { value: "right-to-left", label: "Right to Left" },
  { value: "top-to-bottom", label: "Top to Bottom" },
] as const

const SHOW_VALUE = [
  { value: "none", label: "None" },
  { value: "value", label: "Value" },
  { value: "percentage", label: "Percentage" },
] as const

interface LevelIndicatorPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  /**
   * Declares the topics a text's placeholders name, when the field is left
   * (docs/2026-09-25-text-placeholders.md) - not on every keystroke, which
   * would declare every half-typed path on the way.
   */
  onDeclareTopics?: (topics: string[]) => void
  topics: Topic[]
  /** The number format the Name's placeholder picker previews in. */
  numberSeparators?: Separators
  onManageTopics: () => void
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts: () => void
  onOpenIconSelector?: () => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function LevelIndicatorProperties({
  selectedObject,
  onUpdateObject,
  onDeclareTopics,
  topics,
  numberSeparators,
  onManageTopics,
  fonts,
  projectAssets,
  colorDepth,
  onManageFonts,
  onOpenIconSelector,
  allScreens,
}: LevelIndicatorPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const settable = isSettableLevel(selectedObject.type)
  const points: CalibrationPoint[] = selectedObject.properties.calibrationPoints || []

  const setPoints = (next: CalibrationPoint[]) => updateProperty("calibrationPoints", next)
  const editPoint = (index: number, patch: Partial<CalibrationPoint>) =>
    setPoints(points.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  // What the object's own numbers add up to (lib/settable-level.ts): how many
  // values a finger can actually reach, and whether the range divides by the
  // step at all. 0-100 in sevens tops out at 98, and nobody finds that out
  // until the device is in front of them.
  const range = settable ? settableRange(points, selectedObject.properties.step ?? 1) : null
  const raggedRange = Boolean(range && range.steps > 0 && range.ragged)
  const wanderingCalibration = settable && !calibrationIsMonotonic(points)

  return (
    <PropertySections>
      {/* The header line above the bar (docs/2026-09-19-slider-look.md,
          decision 9). Both optional and both empty by default: an existing
          bar must not grow a header it never asked for. */}
      <PropertySection title="Content">
        <PlaceholderTextField
          id="level-label"
          label="Name"
          value={selectedObject.properties.label}
          onChange={(value) => updateProperty("label", value)}
          onBlur={(value) => onDeclareTopics?.(referencedTopics(value))}
          topics={topics}
          separators={numberSeparators}
          placeholder="None"
        />
        <IconField
          label="Icon"
          assetId={selectedObject.properties.iconAssetId}
          projectAssets={projectAssets}
          onSelect={onOpenIconSelector}
          onClear={() => updateProperty("iconAssetId", null)}
        />
        <SelectField
          id="displayValue"
          label="Show value"
          value={selectedObject.properties.displayValue || "value"}
          options={SHOW_VALUE}
          onChange={(value) => updateProperty("displayValue", value)}
        />
      </PropertySection>

      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={selectedObject.properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
        />

        {/* The write topic is what made a level settable
            (docs/2026-09-17-settable-level.md, decision 1); since the split it
            is what makes it a Slider. allowSubtopics=false for the reason it
            always was: a publish destination is a whole topic, never one
            field of a JSON payload. */}
        {settable && (
          <TopicField
            label="Write topic"
            selectedTopicId={selectedObject.properties.writeTopic}
            topics={topics}
            onTopicChange={(topic) => updateProperty("writeTopic", topic)}
            onManageTopics={onManageTopics}
            allowSubtopics={false}
          />
        )}

        {settable && (
          <>
            <NumberField
              id="step"
              label="Step"
              value={selectedObject.properties.step ?? 1}
              onChange={(value) => updateProperty("step", value > 0 ? value : 1)}
              min={0}
              step={1}
              hint="How far a finger moves the value in one jump. A drag would otherwise report 37 and then 38 on its way; a dimmer wants 5, a temperature 0.5."
            />
            {range && range.steps > 0 ? (
              <FieldNote>
                <span
                  data-testid="step-summary"
                  className={raggedRange ? "text-amber-600" : undefined}
                >
                  {raggedRange
                    ? `${range.steps} steps from ${range.min} - the step does not divide the range, so a finger tops out at ${range.highestReachable}, not ${range.max}.`
                    : `${range.steps} steps, ${range.min} to ${range.max}.`}
                </span>
              </FieldNote>
            ) : null}
            {wanderingCalibration ? (
              <FieldNote>
                <span data-testid="calibration-warning" className="text-amber-600">
                  The calibration rises and falls, so one position on the bar stands for more than one value - a finger
                  cannot be told which one it meant. Fine for reading, not for writing.
                </span>
              </FieldNote>
            ) : null}
          </>
        )}
      </PropertySection>

      <PropertySection title="Shape">
        <SelectField
          id="direction"
          label="Direction"
          value={levelDirection(selectedObject)}
          options={DIRECTIONS}
          onChange={(value) => updateProperty("direction", value)}
        />
        {/* The track's own width, in pixels. Set rather than derived from the
            object: a vertical tank made wide enough for its name came out with
            a track as wide as the name (docs/2026-09-19-slider-look.md,
            decision 14). The handle's length follows from it. */}
        <NumberField
          id="thickness"
          label="Thickness"
          value={levelThickness(selectedObject)}
          onChange={(value) =>
            updateProperty("thickness", value > 0 ? Math.trunc(value) : LEVEL_DEFAULT_THICKNESS)
          }
          min={1}
          unit="px"
          hint="The track's own width. The object's box can be bigger - what is left over is where the name and the value go."
        />
        {/* What was asked for, beside what is measured. The same second
            binding the arc has had all along - a tap puts the marker where the
            finger went, and the two coincide once the command has landed. */}
        <TopicField
          label="Setpoint topic"
          selectedTopicId={selectedObject.properties.setpointTopic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("setpointTopic", topic)}
          onManageTopics={onManageTopics}
          hint="What the installation reports was asked for. Without one, a settable bar rests its marker on the value it reads."
        />
      </PropertySection>

      <PropertySection
        title="Calibration"
        summary={wanderingCalibration ? "rises and falls" : listSummary(points.length, "point")}
        warning={wanderingCalibration}
      >
        {points.map((point, index) => (
          <ListItem
            key={index}
            title={String(point.value ?? "")}
            summary={`${point.barSizePercent ?? 0} %`}
            defaultOpen={index === 0}
            onRemove={points.length > 2 ? () => setPoints(points.filter((_, i) => i !== index)) : undefined}
          >
            <NumberField
              label="Value"
              value={point.value}
              onChange={(value) => editPoint(index, { value })}
            />
            <NumberField
              label="Fill"
              value={point.barSizePercent}
              onChange={(value) => editPoint(index, { barSizePercent: Math.min(100, Math.max(0, value)) })}
              min={0}
              max={100}
              unit="%"
            />
          </ListItem>
        ))}
        <AddListItem label="Add point" onClick={() => setPoints([...points, { value: 50, barSizePercent: 50 }])} />
        {points.length === 0 ? <FieldNote>Each point maps a value to how full the bar is.</FieldNote> : null}
      </PropertySection>

      <PropertySection title="Text">
        <FontField
          value={selectedObject.properties.fontId}
          fonts={fonts}
          onChange={(value) => updateProperty("fontId", value)}
          onManageFonts={onManageFonts}
        />
      </PropertySection>

      {/* One colour for the bar; the track is mixed from it and the screen's
          background (docs/2026-09-19-slider-look.md, decision 12), and the
          object has no background or border of its own to set. */}
      <PropertySection title="Colour">
        <ColorField
          label="Fill"
          value={selectedObject.properties.fillColor || "accent"}
          onChange={(value) => updateProperty("fillColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Text"
          value={selectedObject.properties.textColor || "text"}
          onChange={(value) => updateProperty("textColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <IconTintField
          assetIds={[selectedObject.properties.iconAssetId]}
          projectAssets={projectAssets}
          iconColor={selectedObject.properties.iconColor}
          iconColorFlatten={selectedObject.properties.iconColorFlatten}
          onUpdate={updateProperty}
          colorDepth={colorDepth}
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
