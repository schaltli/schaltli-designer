"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { TopicSelector } from "./topic-selector"
import type { ScreenmanObject, Topic } from "../screenman-editor"

const OPERATORS = ["==", "!=", ">", ">=", "<", "<="] as const

const Plus = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5v14" />
  </svg>
)

const Trash2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

function getPoints(obj: ScreenmanObject): { x: number; y: number }[] {
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
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

interface MqttDataLinePropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
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

// A flow-visualization line (2026-07-31 /grill-me session): stroke width
// reacts to a bound topic's magnitude via calibration points (identical
// mechanism to level-indicator's, see render-mqtt-data-line.ts's header
// comment for why the field stays named "Bar Size %"'s underlying
// `barSizePercent` even though it means px here), and each end's arrowhead
// shows independently based on its own operator+value condition against
// that same topic value - the exact condition UI tab-control panels
// already use (panel-properties.tsx), not a new concept.
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
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const points = getPoints(selectedObject)

  const updatePoints = (newPoints: { x: number; y: number }[]) => {
    onUpdateObject(selectedObject.id, {
      ...boundingBoxOf(newPoints),
      properties: { ...selectedObject.properties, points: newPoints },
    })
  }

  const calibrationPoints = selectedObject.properties.calibrationPoints || []

  return (
    <div className="space-y-3">
      <TopicSelector
        selectedTopicId={selectedObject.properties.topic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("topic", topic)}
        onManageTopics={onManageTopics}
        label="Topic"
      />

      <ColorDepthAwarePicker
        label="Color"
        value={selectedObject.properties.color || "#000000"}
        onChange={(value) => updateProperty("color", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      {/* Points */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Points</Label>
          <button
            onClick={() => {
              const last = points[points.length - 1]
              const secondLast = points[points.length - 2] ?? last
              const dx = last.x - secondLast.x || 20
              const dy = last.y - secondLast.y || 0
              updatePoints([...points, { x: Math.round(last.x + dx), y: Math.round(last.y + dy) }])
            }}
            className="p-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
            title="Add point"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={index} className="p-2 bg-muted rounded relative">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs block mb-1">X</Label>
                  <Input
                    type="number"
                    value={point.x}
                    onChange={(e) => {
                      const newPoints = [...points]
                      newPoints[index] = { ...newPoints[index], x: Number.parseInt(e.target.value) || 0 }
                      updatePoints(newPoints)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs block mb-1">Y</Label>
                  <Input
                    type="number"
                    value={point.y}
                    onChange={(e) => {
                      const newPoints = [...points]
                      newPoints[index] = { ...newPoints[index], y: Number.parseInt(e.target.value) || 0 }
                      updatePoints(newPoints)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {points.length > 2 && (
                <button
                  onClick={() => updatePoints(points.filter((_, i) => i !== index))}
                  className="absolute bottom-2 right-2 p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Delete point"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {points.length > 2 && (
        <div>
          <Label htmlFor="filletRadius" className="text-xs">
            Fillet Radius
          </Label>
          <div className="px-2">
            <Slider
              value={[selectedObject.properties.filletRadius || 0]}
              onValueChange={([value]) => updateProperty("filletRadius", value)}
              min={0}
              max={50}
              step={1}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.filletRadius || 0}px</div>
          </div>
        </div>
      )}

      {/* Calibration Points - value -> stroke width in px, same mechanism
          as level-indicator's value -> bar fill percentage */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Width Calibration</Label>
          <button
            onClick={() => {
              const newPoints = [...calibrationPoints, { value: 50, barSizePercent: 3 }]
              updateProperty("calibrationPoints", newPoints)
            }}
            className="p-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2">
          {calibrationPoints.map((point: any, index: number) => (
            <div key={index} className="p-2 bg-muted rounded relative">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs block mb-1">Value</Label>
                  <Input
                    type="number"
                    value={point.value ?? ""}
                    onChange={(e) => {
                      const newPoints = [...calibrationPoints]
                      newPoints[index] = { ...newPoints[index], value: Number(e.target.value) || 0 }
                      updateProperty("calibrationPoints", newPoints)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs block mb-1">Stroke Width (px)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={point.barSizePercent ?? ""}
                    onChange={(e) => {
                      const newPoints = [...calibrationPoints]
                      newPoints[index] = { ...newPoints[index], barSizePercent: Math.max(1, Number(e.target.value) || 1) }
                      updateProperty("calibrationPoints", newPoints)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {calibrationPoints.length > 2 && (
                <button
                  onClick={() => updateProperty("calibrationPoints", calibrationPoints.filter((_: any, i: number) => i !== index))}
                  className="absolute bottom-2 right-2 p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Delete Point"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {calibrationPoints.length === 0 && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
            Click + to add calibration points. Each point maps a topic value to a stroke width in pixels.
          </div>
        )}
      </div>

      {/* Arrow conditions - independent per end, same operator+value UI as
          a tab-control panel's own condition */}
      {(["Start", "End"] as const).map((end) => (
        <div key={end}>
          <Label className="text-xs">Arrow at {end} when value</Label>
          <div className="flex items-center gap-1 mt-1">
            <Select
              value={selectedObject.properties[`arrow${end}Operator`] || (end === "Start" ? "<" : ">")}
              onValueChange={(value) => updateProperty(`arrow${end}Operator`, value)}
            >
              <SelectTrigger className="h-8 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8"
              placeholder="0"
              value={selectedObject.properties[`arrow${end}Value`] ?? "0"}
              onChange={(e) => updateProperty(`arrow${end}Value`, e.target.value)}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
