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
 *
 * No Name and no Icon since 2026-09-29: a label beside a bar is a Text object
 * and an icon an Icon object, placed next to it like anything else on the
 * screen. The header line they made above the bar went with them.
 */

import { LEVEL_DEFAULT_THICKNESS, levelDirection, levelThickness } from "@/lib/level-shape"
import { calibrationIsMonotonic, settableRange, type CalibrationPoint } from "@/lib/settable-level"
import { isSettableLevel } from "@/lib/object-types"
import { stepUpdates, type TextScale } from "@/lib/size-scale"
import type { ScreenObject, Topic, ProjectFont } from "../project-editor"
import {
  AddListItem,
  ColorField,
  FieldNote,
  FontField,
  TextStyleField,
  FrameFields,
  ListItem,
  NumberField,
  PropertySection,
  PropertySections,
  SelectField,
  SizeStepField,
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
  topics: Topic[]
  onManageTopics: () => void
  fonts: ProjectFont[]
  /** The device's scale, when it gives one: the value is then set in a style. */
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

export function LevelIndicatorProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  textScale,
  colorDepth,
  onManageFonts,
  allScreens,
}: LevelIndicatorPropertiesProps) {
  const updateProperty = (key: string, value: any) => updateProperties({ [key]: value })
  const updateProperties = (patch: Record<string, any>) => {
    const properties = { ...selectedObject.properties, ...patch }
    // A bar on a size step keeps it: a handle, a number or a glow that comes
    // or goes changes what the step asks of the track and the box. A
    // thickness typed in is the author leaving the step (Custom).
    const step = !("thickness" in patch) && textScale ? properties.sizeStep : undefined
    const sized = step ? stepUpdates({ ...selectedObject, properties }, step, textScale!.pixelsPerMm, fonts) : undefined
    onUpdateObject(selectedObject.id, sized ?? { properties })
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
      <PropertySection title="Content">
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
        {/* The size in millimetres where the device gives a scale: S, M or
            L across (docs/2026-09-30-size-scale.md). */}
        {textScale ? (
          <SizeStepField
            object={selectedObject}
            pixelsPerMm={textScale.pixelsPerMm}
            fonts={fonts}
            onChange={(updates) => onUpdateObject(selectedObject.id, updates)}
          />
        ) : null}
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
          hint="The track's own width. The object's box can be bigger; the bar sits in the middle of it."
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
        {textScale ? (
          // On a device with a scale the value is set in a style, like text
          // (docs/2026-09-30-size-scale.md).
          <TextStyleField
            textStyle={selectedObject.properties.textStyle}
            textBold={selectedObject.properties.textBold === true}
            fontId={selectedObject.properties.fontId}
            fontSize={selectedObject.properties.fontSize}
            fonts={fonts}
            scale={textScale}
            onChange={(styled) => updateProperties(styled)}
          />
        ) : (
          <FontField
            value={selectedObject.properties.fontId}
            fonts={fonts}
            onChange={(value) => updateProperty("fontId", value)}
            onManageFonts={onManageFonts}
          />
        )}
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
        {/* The empty track and an edge round it: roles of the theme since
            2026-09-30 (Track, Track edge) - a theme's own unless set here. */}
        <ColorField
          label="Track"
          value={selectedObject.properties.trackColor || "track"}
          onChange={(value) => updateProperty("trackColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Track edge"
          value={selectedObject.properties.trackEdgeColor || "trackEdge"}
          onChange={(value) => updateProperty("trackEdgeColor", value)}
          colorDepth={colorDepth}
          transparentLabel="None"
        />
        <ColorField
          label="Text"
          value={selectedObject.properties.textColor || "text"}
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
