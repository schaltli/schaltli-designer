"use client"

/**
 * A line: two points or twenty, with what is drawn at each end.
 *
 * Round 10 of the rebuild (docs/2026-09-20-property-panel.md). Two sliders
 * went - stroke width and corner radius - which is the last of the five the
 * rebuild set out to remove (decision 8): a slider needs its own line under
 * the name, lands on a value worse, and could not say "3 px" without a
 * second line under itself to do it.
 *
 * The Frame is shown even when it is derived. A line with real points has an
 * x, y, width and height that are its bounding box and nothing else, so the
 * old panel hid the four fields entirely and left "where is this line?"
 * unanswerable from the panel. They are here and locked, saying why.
 */

import type { ScreenObject } from "../project-editor"
import {
  AddListItem,
  ColorField,
  FieldNote,
  FrameFields,
  ListItem,
  NumberField,
  NumberPair,
  PropertySection,
  PropertySections,
  SelectField,
  frameSummary,
  listSummary,
} from "./fields"

const STROKE_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
] as const

const CAPS = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow" },
] as const

// A line's own points array if it has been drawn or edited with the
// segmented-line tool, or the two-point fallback derived from
// x/y/width/height for a line that predates that tool. Mirrors
// render-line.ts's getLinePoints() so the panel always edits exactly what
// gets drawn.
function getPoints(obj: ScreenObject): { x: number; y: number }[] {
  const points = obj.properties.points
  if (Array.isArray(points) && points.length >= 2) return points
  return [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.height },
  ]
}

// The bounding box every other object keeps for itself. A line's is derived
// from its points and written alongside them, purely so the selection,
// snapping and drag code that reads x/y/width/height generically still sees
// the right numbers.
function boundingBoxOf(points: { x: number; y: number }[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

interface LinePropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function LineProperties({ selectedObject, onUpdateObject, colorDepth, allScreens }: LinePropertiesProps) {
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

  // Every edit writes the points and the recomputed bounding box in the same
  // update, so x/y/width/height stay meaningful to every caller that reads
  // them without knowing a line is special.
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
    // Carries on in the direction of the last segment, so a fresh point does
    // not land exactly on top of an existing one.
    const dx = last.x - secondLast.x || 20
    const dy = last.y - secondLast.y || 0
    setPoints([...points, { x: Math.round(last.x + dx), y: Math.round(last.y + dy) }])
  }

  return (
    <PropertySections>
      <PropertySection title="Shape">
        <NumberField
          id="strokeWidth"
          label="Stroke width"
          value={selectedObject.properties.strokeWidth || 1}
          onChange={(value) => updateProperty("strokeWidth", value)}
          min={1}
          max={10}
          unit="px"
        />
        <SelectField
          id="strokeStyle"
          label="Stroke style"
          value={selectedObject.properties.strokeStyle || "solid"}
          options={STROKE_STYLES}
          onChange={(value) => updateProperty("strokeStyle", value)}
        />
        <SelectField
          id="arrowStart"
          label="Start cap"
          value={selectedObject.properties.arrowStart || "none"}
          options={CAPS}
          onChange={(value) => updateProperty("arrowStart", value)}
        />
        <SelectField
          id="arrowEnd"
          label="End cap"
          value={selectedObject.properties.arrowEnd || "none"}
          options={CAPS}
          onChange={(value) => updateProperty("arrowEnd", value)}
        />
        {/* Only where there is an interior corner to round. */}
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
        ) : null}
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

      <PropertySection title="Colour">
        <ColorField
          label="Stroke"
          value={selectedObject.properties.color || "text"}
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
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={updatePosition}
          locked={derivedBox ? ["x", "y", "width", "height"] : []}
          lockedHint="The box around the points, not a position of its own. Move the line on the canvas, or edit its points."
        />
        {derivedBox ? null : (
          <FieldNote>A two-point line drawn before the segmented tool: these four still place it.</FieldNote>
        )}
      </PropertySection>
    </PropertySections>
  )
}
