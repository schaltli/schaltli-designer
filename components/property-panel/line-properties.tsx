"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import type { ScreenmanObject } from "../screenman-editor"

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

// A line's own points array if it's already been drawn/edited with the
// segmented-line tool, or the two-point fallback derived from x/y/width/
// height for a line that predates that tool (or a fresh single-drag line -
// see canvas.tsx's line creation, which also always populates `points` for
// new lines going forward). Mirrors render-line.ts's getLinePoints() so the
// panel always edits exactly what actually gets drawn.
function getPoints(obj: ScreenmanObject): { x: number; y: number }[] {
  const points = obj.properties.points
  if (Array.isArray(points) && points.length >= 2) return points
  return [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.height },
  ]
}

// Recomputes the bounding box (x/y/width/height) every non-line object
// already keeps in sync with its own bounds - a line's box is just derived
// from whatever its current points happen to be, kept alongside `points`
// purely so selection/snap/drag code that reads x/y/width/height generically
// (not every caller knows a line is special) still sees the right numbers.
function boundingBoxOf(points: { x: number; y: number }[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

interface LinePropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
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
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const points = getPoints(selectedObject)
  const hasExplicitPoints = Array.isArray(selectedObject.properties.points) && selectedObject.properties.points.length >= 2

  // Every points-array edit (add/remove/move a vertex) writes both `points`
  // and the recomputed bounding box in the same update - x/y/width/height
  // stay meaningful to every other piece of code that reads them generically
  // (selection outline, snapping, the canvas's own drag-move code) without
  // those callers needing to know a line is special.
  const updatePoints = (newPoints: { x: number; y: number }[]) => {
    onUpdateObject(selectedObject.id, {
      ...boundingBoxOf(newPoints),
      properties: { ...selectedObject.properties, points: newPoints },
    })
  }

  return (
    <div className="space-y-3">
      {/* Color */}
      <ColorDepthAwarePicker
        label="Color"
        value={selectedObject.properties.color || "#000000"}
        onChange={(value) => updateProperty("color", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      {/* Stroke Width */}
      <div>
        <Label htmlFor="strokeWidth" className="text-xs">
          Width
        </Label>
        <div className="px-2">
          <Slider
            value={[selectedObject.properties.strokeWidth || 1]}
            onValueChange={([value]) => updateProperty("strokeWidth", value)}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.strokeWidth || 1}px</div>
        </div>
      </div>

      {/* Stroke Style */}
      <div>
        <Label htmlFor="strokeStyle" className="text-xs">
          Style
        </Label>
        <Select
          value={selectedObject.properties.strokeStyle || "solid"}
          onValueChange={(value) => updateProperty("strokeStyle", value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Points */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Points</Label>
          <button
            onClick={() => {
              const last = points[points.length - 1]
              const secondLast = points[points.length - 2] ?? last
              // Extends in the same direction as the last segment (falls
              // back to a plain rightward offset for a still-2-point line
              // whose two points happen to coincide) so a fresh point
              // doesn't land exactly on top of an existing one.
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

      {/* Fillet Radius - only meaningful with an interior vertex to round */}
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

      {/* Position Controls - only for a legacy two-point line with no
          points array of its own yet; once a line has real points (drawn
          with the segmented-line tool, or edited via the Points list above),
          x/y/width/height are a derived bounding box, not independently
          meaningful fields - move the line by dragging it on the canvas, or
          edit its Points directly. */}
      {!hasExplicitPoints && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="x" className="text-xs">
                X
              </Label>
              <Input
                id="x"
                type="number"
                value={selectedObject.x}
                onChange={(e) => updatePosition("x", Number.parseInt(e.target.value) || 0)}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="y" className="text-xs">
                Y
              </Label>
              <Input
                id="y"
                type="number"
                value={selectedObject.y}
                onChange={(e) => updatePosition("y", Number.parseInt(e.target.value) || 0)}
                className="h-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="width" className="text-xs">
                Width
              </Label>
              <Input
                id="width"
                type="number"
                value={selectedObject.width}
                onChange={(e) => updatePosition("width", Number.parseInt(e.target.value) || 1)}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="height" className="text-xs">
                Height
              </Label>
              <Input
                id="height"
                type="number"
                value={selectedObject.height}
                onChange={(e) => updatePosition("height", Number.parseInt(e.target.value) || 1)}
                className="h-8"
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
