"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import { TopicSelector } from "./topic-selector"
import type { ScreenObject, Topic } from "../../types"

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

interface LevelIndicatorPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
}

export function LevelIndicatorProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
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

  return (
    <div className="space-y-3">
      {/* Topic Selector */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.topicId}
        topics={topics}
        onTopicChange={(topicId) => updateProperty("topicId", topicId)}
        onManageTopics={onManageTopics}
        label="Topic"
      />

      {/* Bar Direction */}
      <div>
        <Label htmlFor="barDirection" className="text-xs">
          Bar Direction
        </Label>
        <Select
          value={selectedObject.properties.barDirection || "left-to-right"}
          onValueChange={(value) => updateProperty("barDirection", value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left-to-right">Left to Right</SelectItem>
            <SelectItem value="bottom-to-top">Bottom to Top</SelectItem>
            <SelectItem value="right-to-left">Right to Left</SelectItem>
            <SelectItem value="top-to-bottom">Top to Bottom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Display Value */}
      <div>
        <Label htmlFor="displayValue" className="text-xs">
          Display Value
        </Label>
        <Select
          value={selectedObject.properties.displayValue || "value"}
          onValueChange={(value) => updateProperty("displayValue", value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="value">Value</SelectItem>
            <SelectItem value="percentage">Percentage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Calibration Points */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Calibration Points</Label>
          <button
            onClick={() => {
              const currentPoints = selectedObject.properties.calibrationPoints || []
              const newPoints = [...currentPoints, { value: 50, barSizePercent: 50 }]
              updateProperty("calibrationPoints", newPoints)
            }}
            className="p-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2">
          {(selectedObject.properties.calibrationPoints || []).map((point: any, index: number) => (
            <div key={index} className="p-2 bg-muted rounded relative">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs block mb-1">Value</Label>
                  <Input
                    type="number"
                    value={point.value ?? ""}
                    onChange={(e) => {
                      const currentPoints = selectedObject.properties.calibrationPoints || []
                      const newPoints = [...currentPoints]
                      newPoints[index] = {
                        ...newPoints[index],
                        value: Number(e.target.value) || 0,
                      }
                      updateProperty("calibrationPoints", newPoints)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs block mb-1">Bar Size %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={point.barSizePercent ?? ""}
                    onChange={(e) => {
                      const currentPoints = selectedObject.properties.calibrationPoints || []
                      const newPoints = [...currentPoints]
                      newPoints[index] = {
                        ...newPoints[index],
                        barSizePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      }
                      updateProperty("calibrationPoints", newPoints)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {(selectedObject.properties.calibrationPoints || []).length > 2 && (
                <button
                  onClick={() => {
                    const currentPoints = selectedObject.properties.calibrationPoints || []
                    const newPoints = currentPoints.filter((_: any, i: number) => i !== index)
                    updateProperty("calibrationPoints", newPoints)
                  }}
                  className="absolute bottom-2 right-2 p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Delete Point"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {(!selectedObject.properties.calibrationPoints || selectedObject.properties.calibrationPoints.length === 0) && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
            Click + to add calibration points. Each point maps a value to a bar fill percentage.
          </div>
        )}
      </div>

      {/* Font Size */}
      <div>
        <Label htmlFor="fontSize" className="text-xs">
          Font Size
        </Label>
        <div className="px-2">
          <Slider
            value={[selectedObject.properties.fontSize || 12]}
            onValueChange={([value]) => updateProperty("fontSize", value)}
            min={8}
            max={24}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.fontSize || 12}px</div>
        </div>
      </div>

      {/* Colors */}
      <div>
        <Label htmlFor="backgroundColor" className="text-xs">
          Background Color
        </Label>
        <Input
          id="backgroundColor"
          type="color"
          value={selectedObject.properties.backgroundColor || "#ffffff"}
          onChange={(e) => updateProperty("backgroundColor", e.target.value)}
          className="h-8"
        />
      </div>

      <ColorPickerWithTransparency
        label="Border Color"
        value={selectedObject.properties.borderColor || "#cccccc"}
        onChange={(value) => updateProperty("borderColor", value)}
        allowTransparent={true}
      />

      <div>
        <Label htmlFor="fillColor" className="text-xs">
          Fill Color
        </Label>
        <Input
          id="fillColor"
          type="color"
          value={selectedObject.properties.fillColor || "#4CAF50"}
          onChange={(e) => updateProperty("fillColor", e.target.value)}
          className="h-8"
        />
      </div>

      <div>
        <Label htmlFor="textColor" className="text-xs">
          Text Color
        </Label>
        <Input
          id="textColor"
          type="color"
          value={selectedObject.properties.textColor || "#000000"}
          onChange={(e) => updateProperty("textColor", e.target.value)}
          className="h-8"
        />
      </div>

      {/* Position Controls */}
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
    </div>
  )
}
