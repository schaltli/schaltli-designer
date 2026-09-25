"use client"

/**
 * A gauge and a dial: a value along a ring, and the same ring with a finger
 * on it.
 *
 * Round 3 of the rebuild (docs/2026-09-20-property-panel.md), and the Bar's
 * twin - the same seven sections holding the same properties, measured in
 * degrees instead of pixels. What is genuinely different is the scale: where
 * a bar runs from one edge to the other, a ring has to be told where it
 * starts and where it stops.
 *
 * It had a control of its own for a day: a clock face for picking where the
 * scale starts and stops, because "from half past seven to half past four"
 * is how anyone describes a position on a round display, and two number
 * boxes show nothing. On 2026-09-21 the ends became draggable on the canvas
 * itself (docs/2026-09-21-arc-handles.md), which is a better preview than a
 * picture of a clock beside it - so the clock went, and the four shape
 * presets with it. What is left is what the canvas cannot do: type an exact
 * angle.
 *
 * The rule that survives the clock: a field is shared unless the object has
 * something no other object has. It turned out the arc did not.
 */

import { calibrationIsMonotonic, settableRange, type CalibrationPoint } from "@/lib/settable-level"
import { LEVEL_DEFAULT_THICKNESS } from "@/lib/level-shape"
import { isSettableLevel } from "@/lib/object-types"
import type { ScreenObject, Topic, ProjectFont } from "../project-editor"
import { formatClock } from "@/lib/arc-raster"
import {
  AddListItem,
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  ListItem,
  NumberField,
  NumberPair,
  PropertySection,
  PropertySections,
  SelectField,
  TopicField,
  frameSummary,
  listSummary,
} from "./fields"

interface ArcLevelPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts: () => void
}

const DIRECTIONS = [
  { value: "cw", label: "Clockwise" },
  { value: "ccw", label: "Counter-clockwise" },
] as const

const SHOW_VALUE = [
  { value: "none", label: "None" },
  { value: "value", label: "Value" },
  { value: "percentage", label: "Percentage" },
] as const

export function ArcLevelProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  colorDepth,
  onManageFonts,
}: ArcLevelPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const props = selectedObject.properties
  const minAngle = props.minAngle ?? 225
  const maxAngle = props.maxAngle ?? 135
  const settable = isSettableLevel(selectedObject.type)
  const points: CalibrationPoint[] = props.calibrationPoints || []

  // The ring is inscribed in its box, so half the object is all the room
  // there is: at that thickness the inner edge reaches the centre.
  const maxThickness = Math.max(1, Math.floor(Math.min(selectedObject.width, selectedObject.height) / 2))

  const setPoints = (next: CalibrationPoint[]) => updateProperty("calibrationPoints", next)
  const editPoint = (index: number, patch: Partial<CalibrationPoint>) =>
    setPoints(points.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    // One number, not a width and a height. The ring is inscribed in its box,
    // so the two are always equal - and the canvas already enforces that when
    // you drag or resize. Offering them separately here would let someone
    // type an oval that the canvas would never produce, which is what the
    // icon panel still does. The height field says so and is read-only.
    if (key === "width") {
      const size = Math.max(1, value)
      onUpdateObject(selectedObject.id, { width: size, height: size })
      return
    }
    if (key === "height") return
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  // What the object's own numbers add up to (lib/settable-level.ts) - the
  // same two answers the bar gives, from the same arithmetic the firmware
  // and the live preview do when a finger lands.
  const range = settable ? settableRange(points, props.step ?? 1) : null
  const raggedRange = Boolean(range && range.steps > 0 && range.ragged)
  const wanderingCalibration = settable && !calibrationIsMonotonic(points)

  return (
    <PropertySections>
      <PropertySection title="Content">
        <SelectField
          id="arcDisplayValue"
          label="Show value"
          value={props.displayValue || "value"}
          options={SHOW_VALUE}
          onChange={(value) => updateProperty("displayValue", value)}
        />
      </PropertySection>

      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={props.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
        />

        {/* What makes the ring settable, and in what steps - the same pair the
            bar has (docs/2026-09-17-settable-level.md, decision 1). With a
            setpoint topic below, a finger moves that marker: the fill is a
            measurement and nothing can set it (decision 6b). */}
        {settable && (
          <TopicField
            label="Write topic"
            selectedTopicId={props.writeTopic}
            topics={topics}
            onTopicChange={(topic) => updateProperty("writeTopic", topic)}
            onManageTopics={onManageTopics}
            allowSubtopics={false}
          />
        )}

        <TopicField
          label="Setpoint topic"
          selectedTopicId={props.setpointTopic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("setpointTopic", topic)}
          onManageTopics={onManageTopics}
          hint="What was asked for, beside what is measured. Leave it empty for a plain filled arc - a tank level has nothing to aim at."
        />

        {settable && (
          <>
            <NumberField
              id="arcStep"
              label="Step"
              value={props.step ?? 1}
              onChange={(value) => updateProperty("step", value > 0 ? value : 1)}
              min={0}
              hint="How far a finger moves the value in one jump. A drag would otherwise report 37 and then 38 on its way; a thermostat wants 0.5."
            />
            {range && range.steps > 0 ? (
              <FieldNote>
                <span data-testid="step-summary" className={raggedRange ? "text-amber-600" : undefined}>
                  {raggedRange
                    ? `${range.steps} steps from ${range.min} - the step does not divide the range, so a finger tops out at ${range.highestReachable}, not ${range.max}.`
                    : `${range.steps} steps, ${range.min} to ${range.max}.`}
                </span>
              </FieldNote>
            ) : null}
            {wanderingCalibration ? (
              <FieldNote>
                <span data-testid="calibration-warning" className="text-amber-600">
                  The calibration rises and falls, so one position on the ring stands for more than one value - a finger
                  cannot be told which one it meant. Fine for reading, not for writing.
                </span>
              </FieldNote>
            ) : null}
          </>
        )}
      </PropertySection>

      <PropertySection title="Shape">
        {/* The ends are dragged on the ring itself; these are for the
            angle a drag cannot land on, since it moves in half hours
            (docs/2026-09-21-arc-handles.md). */}
        <NumberPair
          label="Angles"
          names={["Min", "Max"]}
          values={[minAngle, maxAngle]}
          onChange={(index, value) =>
            updateProperty(index === 0 ? "minAngle" : "maxAngle", (((value || 0) % 360) + 360) % 360)
          }
          unit="°"
          min={0}
          max={359}
          hint="Degrees, zero at twelve o'clock. The clock snaps to half hours because a quarter hour is 7.5 degrees and cannot be stored whole."
        />
        <FieldNote>
          Min ({formatClock(minAngle)}) to Max ({formatClock(maxAngle)}).
        </FieldNote>

        <SelectField
          id="arcDirection"
          label="Direction"
          value={props.direction || "cw"}
          options={DIRECTIONS}
          onChange={(value) => updateProperty("direction", value)}
          hint="Which way round the dial the scale runs from min to max - so the other way between the same two positions is the complementary arc, not a mirrored one. For a mirrored dial, name the ends in the order the scale runs."
        />
        {/* A ring thicker than half the object has no hole left: its inner
            edge would be at or past the centre. The renderer has always
            clamped it there (buildGeometry), which meant a number could be
            typed in and silently ignored - so the field stops at the same
            place instead. */}
        <NumberField
          id="arcThickness"
          label="Thickness"
          value={props.thickness ?? LEVEL_DEFAULT_THICKNESS}
          onChange={(value) => updateProperty("thickness", Math.min(maxThickness, Math.max(1, value)))}
          min={1}
          max={maxThickness}
          unit="px"
          hint={`At most half the object, which is ${maxThickness} px here - a thicker ring would have no hole.`}
        />
        {(props.thickness ?? LEVEL_DEFAULT_THICKNESS) > maxThickness ? (
          <FieldNote>
            Stored as {props.thickness}, drawn at {maxThickness} - the object was made smaller after this was set.
          </FieldNote>
        ) : null}
      </PropertySection>

      {/* The same piecewise-linear table the bar uses, and the same shared
          interpolation, so the two cannot drift. */}
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
            <NumberField label="Value" value={point.value} onChange={(value) => editPoint(index, { value })} />
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
        {points.length === 0 ? <FieldNote>Each point maps a value to how far round the ring is filled.</FieldNote> : null}
      </PropertySection>

      <PropertySection title="Text">
        <FontField
          value={props.fontId}
          fonts={fonts}
          onChange={(value) => updateProperty("fontId", value)}
          onManageFonts={onManageFonts}
        />
      </PropertySection>

      <PropertySection title="Colour">
        <ColorField
          label="Fill"
          value={props.fillColor || "accent"}
          onChange={(value) => updateProperty("fillColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        {/* The track and the handle are not colours any more: the unfilled
            part is this colour mixed halfway into what the ring stands on,
            and the handle is this colour itself - exactly the bar's rule
            since 2026-09-22 (docs/2026-09-22-arc-look.md). A ring on a panel
            that cannot show the mixture draws the track as an outline
            instead. */}
        <ColorField
          label="Text"
          value={props.textColor || props.color || "text"}
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
          captions={{ width: "Size" }}
          locked={["height"]}
          lockedHint="The ring is inscribed in its box, so the height follows the size."
        />
      </PropertySection>
    </PropertySections>
  )
}
