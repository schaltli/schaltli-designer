"use client"

/**
 * Live Line: a line whose thickness, and whose arrowheads, come from a topic.
 *
 * Round 11 of the rebuild (docs/2026-09-20-property-panel.md), and the only
 * panel with three lists - the points it is drawn through, the value-to-width
 * table, and the two conditions that decide whether each end carries an
 * arrow. They are three sections in the list position, which is what that
 * position is for.
 *
 * It also had the fourth hand-written operator list. It happened to agree
 * with the other three, which is luck rather than design; it is the shared
 * `ConditionRow` now (lib/comparison-operators.ts).
 */

import type { ScreenObject, Topic } from "../project-editor"
import type { ComparisonOperator } from "@/lib/comparison-operators"
import {
  AddListItem,
  ColorField,
  ConditionRow,
  FieldNote,
  FrameFields,
  ListItem,
  NumberField,
  NumberPair,
  PropertySection,
  PropertySections,
  TopicField,
  frameSummary,
  listSummary,
} from "./fields"

// The same two helpers the plain line uses, for the same reason: this object
// shares getLinePoints with it (render-mqtt-data-line.ts), so the panel edits
// exactly what gets drawn.
function getPoints(obj: ScreenObject): { x: number; y: number }[] {
  const points = obj.properties.points
  if (Array.isArray(points) && points.length >= 2) return points
  return [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.height },
  ]
}

function boundingBoxOf(points: { x: number; y: number }[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

interface MqttDataLinePropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function MqttDataLineProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  colorDepth,
  allScreens,
}: MqttDataLinePropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const points = getPoints(selectedObject)
  const derivedBox =
    Array.isArray(selectedObject.properties.points) && selectedObject.properties.points.length >= 2

  const setPoints = (next: { x: number; y: number }[]) => {
    onUpdateObject(selectedObject.id, {
      ...boundingBoxOf(next),
      properties: { ...selectedObject.properties, points: next },
    })
  }

  const editPoint = (index: number, patch: Partial<{ x: number; y: number }>) =>
    setPoints(points.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  const movePoint = (from: number, to: number) => {
    const next = [...points]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setPoints(next)
  }

  const addPoint = () => {
    const last = points[points.length - 1]
    const secondLast = points[points.length - 2] ?? last
    const dx = last.x - secondLast.x || 20
    const dy = last.y - secondLast.y || 0
    setPoints([...points, { x: Math.round(last.x + dx), y: Math.round(last.y + dy) }])
  }

  // The same piecewise table a bar calibrates its fill with, reading pixels
  // of stroke instead of a percentage - which is why the stored field is
  // still called barSizePercent.
  const widths: any[] = selectedObject.properties.calibrationPoints || []
  const setWidths = (next: any[]) => updateProperty("calibrationPoints", next)
  const editWidth = (index: number, patch: Record<string, number>) =>
    setWidths(widths.map((w, i) => (i === index ? { ...w, ...patch } : w)))

  return (
    <PropertySections>
      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={selectedObject.properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
        />
      </PropertySection>

      <PropertySection title="Shape">
        {points.length > 2 ? (
          <NumberField
            id="filletRadius"
            label="Corner radius"
            value={selectedObject.properties.filletRadius || 0}
            onChange={(value) => updateProperty("filletRadius", value)}
            min={0}
            max={50}
            unit="px"
          />
        ) : (
          <FieldNote>A line of two points has no corner to round.</FieldNote>
        )}
      </PropertySection>

      <PropertySection title="Points" summary={listSummary(points.length, "point")}>
        {points.map((point, index) => (
          <ListItem
            key={index}
            title={String(index + 1)}
            summary={`${point.x}, ${point.y}`}
            defaultOpen={index === 0}
            index={index}
            onReorder={movePoint}
            onRemove={points.length > 2 ? () => setPoints(points.filter((_, i) => i !== index)) : undefined}
          >
            <NumberPair
              label="Position"
              names={["X", "Y"]}
              values={[point.x, point.y]}
              onChange={(which, value) => editPoint(index, which === 0 ? { x: value } : { y: value })}
            />
          </ListItem>
        ))}
        <AddListItem label="Add point" onClick={addPoint} />
      </PropertySection>

      <PropertySection title="Width by value" summary={listSummary(widths.length, "point")}>
        {widths.map((width, index) => (
          <ListItem
            key={index}
            title={String(width.value ?? "")}
            summary={`${width.barSizePercent ?? 0} px`}
            defaultOpen={index === 0}
            onRemove={widths.length > 2 ? () => setWidths(widths.filter((_, i) => i !== index)) : undefined}
          >
            <NumberField
              label="Value"
              value={width.value}
              onChange={(value) => editWidth(index, { value })}
            />
            <NumberField
              label="Stroke"
              value={width.barSizePercent}
              onChange={(value) => editWidth(index, { barSizePercent: Math.max(0, value) })}
              min={0}
              unit="px"
            />
          </ListItem>
        ))}
        <AddListItem
          label="Add point"
          onClick={() => setWidths([...widths, { value: 50, barSizePercent: 3 }])}
        />
        {widths.length === 0 ? (
          <FieldNote>Each point maps a value to a stroke width. Without any, the line keeps one thickness.</FieldNote>
        ) : null}
      </PropertySection>

      {/* Independent per end, and the same condition a panel is shown by. */}
      <PropertySection title="Arrows">
        <ConditionRow
          label="Start when"
          operator={selectedObject.properties.arrowStartOperator || "<"}
          value={selectedObject.properties.arrowStartValue ?? "0"}
          onOperatorChange={(operator: ComparisonOperator) => updateProperty("arrowStartOperator", operator)}
          onValueChange={(value) => updateProperty("arrowStartValue", value)}
          placeholder="0"
        />
        <ConditionRow
          label="End when"
          operator={selectedObject.properties.arrowEndOperator || ">"}
          value={selectedObject.properties.arrowEndValue ?? "0"}
          onOperatorChange={(operator: ComparisonOperator) => updateProperty("arrowEndOperator", operator)}
          onValueChange={(value) => updateProperty("arrowEndValue", value)}
          placeholder="0"
        />
      </PropertySection>

      <PropertySection title="Colour">
        <ColorField
          label="Stroke"
          value={selectedObject.properties.color || "#000000"}
          onChange={(value) => updateProperty("color", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}
      >
        {/* New here: this object shares getLinePoints with the plain line,
            and that falls back to {x, y} -> {x+width, y+height} when there
            are no points - so a Live Line could be positioned by four values
            its panel offered no way to see, let alone edit. */}
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={updatePosition}
          locked={derivedBox ? ["x", "y", "width", "height"] : []}
          lockedHint="The box around the points, not a position of its own. Move the line on the canvas, or edit its points."
        />
      </PropertySection>
    </PropertySections>
  )
}
