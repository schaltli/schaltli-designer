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
 * That is why this panel keeps a control of its own. The clock face below is
 * not one of the fourteen shared fields and does not become one: a round
 * display's scale is described the way anyone describes a position on a round
 * face - "from half past seven to half past four", not "225 to 135 degrees" -
 * and it shows the result before you commit to it, which two number boxes
 * cannot. The mockups drew the pair of boxes and left the clock out; the
 * boxes are still here, underneath, for the angle the clock cannot name.
 *
 * The rule that follows, for the sixteen panels after this one: a field is
 * shared unless the object has something no other object has. One clock face
 * is not a licence for one picker per panel.
 */

import { useMemo } from "react"
import { calibrationIsMonotonic, settableRange, type CalibrationPoint } from "@/lib/settable-level"
import { isSettableLevel } from "@/lib/object-types"
import type { ScreenObject, Topic, ProjectFont } from "../project-editor"
import { ARC_CLOCK_STEP_DEGREES, formatClock } from "@/lib/arc-raster"
import { ARC_PRESETS } from "@/components/canvas/renderers/render-arc-level"
import {
  AddListItem,
  ButtonGroupRow,
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  ListItem,
  NumberField,
  NumberPair,
  PropertyRow,
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

// The 24 half-hour positions, as angles. Half hours because twelve hours span
// 360 degrees, so an hour is 30 and a half hour is 15 - both whole numbers,
// which the stored format needs. A quarter hour would be 7.5 and could not
// be stored, which is why the dial snaps rather than following the pointer.
const CLOCK_POSITIONS = Array.from({ length: 360 / ARC_CLOCK_STEP_DEGREES }, (_, i) => i * ARC_CLOCK_STEP_DEGREES)

/**
 * A clock face for picking where the scale starts and ends.
 *
 * A round display's gauge is described the way anyone describes a position on
 * a round face - "from eight to four", not "240 degrees" - and a dial shows
 * the result before you commit to it, which two number fields cannot. The
 * numeric fields are still there underneath for the case that needs an angle
 * the clock cannot name.
 */
function ClockDial({
  minAngle,
  maxAngle,
  counterClockwise,
  onPick,
}: {
  minAngle: number
  maxAngle: number
  counterClockwise: boolean
  onPick: (which: "min" | "max", angle: number) => void
}) {
  const size = 150
  const centre = size / 2
  const radius = 56

  // Screen coordinates for an angle, with zero at twelve o'clock and
  // clockwise positive - the same convention the rasterizer uses, so what is
  // picked here is literally what gets stored.
  const pointAt = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: centre + Math.cos(rad) * r, y: centre + Math.sin(rad) * r }
  }

  const span = counterClockwise ? (minAngle - maxAngle + 360) % 360 : (maxAngle - minAngle + 360) % 360
  const sweep = span === 0 ? 360 : span
  const sweepStart = counterClockwise ? maxAngle : minAngle

  // The preview arc, drawn as a polyline rather than an SVG arc so it cannot
  // disagree with the rasterizer about which way round it goes.
  const steps = Math.max(2, Math.round(sweep / 4))
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const p = pointAt(sweepStart + (sweep * i) / steps, radius)
    return `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }).join(" ")

  const minPoint = pointAt(minAngle, radius)
  const maxPoint = pointAt(maxAngle, radius)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[190px] mx-auto block select-none">
      <circle cx={centre} cy={centre} r={radius} fill="none" stroke="currentColor" strokeWidth={10} opacity={0.12} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={10} opacity={0.55} strokeLinecap="butt" />

      {CLOCK_POSITIONS.map((deg) => {
        const outer = pointAt(deg, radius + 9)
        const isHour = deg % 30 === 0
        return (
          <g key={deg}>
            {isHour && (
              <text
                x={outer.x}
                y={outer.y}
                fontSize={8}
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                opacity={0.5}
              >
                {formatClock(deg)}
              </text>
            )}
            {/* Generous invisible hit area - the visible dots are far too
                small to aim at, and every position has to be reachable. */}
            <circle
              cx={pointAt(deg, radius).x}
              cy={pointAt(deg, radius).y}
              r={9}
              fill="transparent"
              className="cursor-pointer"
              onClick={(e) => onPick(e.shiftKey ? "max" : "min", deg)}
            />
            <circle cx={pointAt(deg, radius).x} cy={pointAt(deg, radius).y} r={isHour ? 1.6 : 1} fill="currentColor" opacity={0.35} />
          </g>
        )
      })}

      <circle cx={minPoint.x} cy={minPoint.y} r={5} fill="currentColor" />
      <text x={minPoint.x} y={minPoint.y - 11} fontSize={7.5} textAnchor="middle" fill="currentColor" opacity={0.8}>
        min
      </text>
      <circle cx={maxPoint.x} cy={maxPoint.y} r={5} fill="none" stroke="currentColor" strokeWidth={2} />
      <text x={maxPoint.x} y={maxPoint.y + 14} fontSize={7.5} textAnchor="middle" fill="currentColor" opacity={0.8}>
        max
      </text>
    </svg>
  )
}

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
  const counterClockwise = props.direction === "ccw"
  const settable = isSettableLevel(selectedObject.type)
  const points: CalibrationPoint[] = props.calibrationPoints || []

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

  const presets = useMemo(
    () =>
      ARC_PRESETS.map((preset) => ({
        label: preset.label,
        title: `${formatClock(preset.minAngle)} → ${formatClock(preset.maxAngle)}`,
        onClick: () =>
          onUpdateObject(selectedObject.id, {
            properties: { ...props, minAngle: preset.minAngle, maxAngle: preset.maxAngle },
          }),
      })),
    [onUpdateObject, props, selectedObject.id],
  )

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
        <PropertyRow
          label="Scale"
          hint="Click a position for min, shift-click for max. The same position for both means a full ring."
        >
          <ClockDial
            minAngle={minAngle}
            maxAngle={maxAngle}
            counterClockwise={counterClockwise}
            onPick={(which, angle) => updateProperty(which === "min" ? "minAngle" : "maxAngle", angle)}
          />
        </PropertyRow>

        <ButtonGroupRow label="Presets" buttons={presets} />

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
        <NumberField
          id="arcThickness"
          label="Thickness"
          value={props.thickness ?? 22}
          onChange={(value) => updateProperty("thickness", Math.max(1, value))}
          min={1}
          unit="px"
        />
        <NumberField
          id="arcMarkerWidth"
          label="Marker width"
          value={props.markerWidth ?? 4}
          onChange={(value) => updateProperty("markerWidth", Math.min(45, Math.max(1, value)))}
          min={1}
          max={45}
          unit="°"
        />
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
          value={props.fillColor || "#4CAF50"}
          onChange={(value) => updateProperty("fillColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        {/* Unlike the bar's, this track is a colour of its own: the unfilled
            part of a ring is drawn, not left as background
            (docs/2026-09-20-property-panel.md). */}
        <ColorField
          label="Track"
          value={props.trackColor || "#303030"}
          onChange={(value) => updateProperty("trackColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Marker"
          value={props.markerColor || "#ffffff"}
          onChange={(value) => updateProperty("markerColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Text"
          value={props.textColor || "#ffffff"}
          onChange={(value) => updateProperty("textColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Background"
          value={props.backgroundColor || "transparent"}
          onChange={(value) => updateProperty("backgroundColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
          hint="Transparent leaves the ring floating on the screen. The anti-aliased edges then mix into the screen's own background colour, on the device exactly as here."
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
