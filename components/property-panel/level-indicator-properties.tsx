"use client"
import { Input } from "@/components/ui/input"
import { calibrationIsMonotonic, settableRange } from "@/lib/settable-level"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { TopicSelector } from "./topic-selector"
import { Separator } from "@/components/ui/separator"
import type { ScreenObject, Topic, ProjectFont } from "../project-editor"
import { FontIcon } from "@/components/icons/font-icon"

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
  fonts: ProjectFont[]
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
  colorDepth,
  onManageFonts,
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

  return (
    <div className="space-y-3">
      {/* Topic Selector */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.topic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("topic", topic)}
        onManageTopics={onManageTopics}
        label="Topic"
      />

      {/* Write topic - what makes this level settable
          (docs/2026-09-17-settable-level.md, decision 1). Empty is the normal
          case: a tank level is something to read. With a topic here, a finger
          on the bar sets the value and the object publishes it, the same way
          a Switch publishes a segment - so the same TopicSelector, and
          allowSubtopics=false for the same reason: a publish destination is a
          whole topic, never one field of a JSON payload. */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.writeTopic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("writeTopic", topic)}
        onManageTopics={onManageTopics}
        label="Write Topic (command, optional)"
        className="w-full"
        allowSubtopics={false}
      />

      {/* Step - only meaningful once there is something to write. A drag
          would otherwise report 37 and then 38 on its way; a dimmer wants 5,
          a temperature 0.5, a fan that only takes tens wants 10.

          The two lines under it are what the object's own numbers add up to
          (lib/settable-level.ts): how many values a finger can actually
          reach, and whether the range divides by the step at all. 0-100 in
          sevens tops out at 98, and nobody finds that out until the device
          is in front of them. */}
      {selectedObject.properties.writeTopic && (
        <>
          <div>
            <Label htmlFor="step" className="text-xs">
              Step (when set by a finger)
            </Label>
            <Input
              id="step"
              type="number"
              min="0"
              step="any"
              value={selectedObject.properties.step ?? 1}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value)
                updateProperty("step", Number.isFinite(parsed) && parsed > 0 ? parsed : 1)
              }}
              className="h-8"
            />
            {(() => {
              const range = settableRange(
                selectedObject.properties.calibrationPoints,
                selectedObject.properties.step ?? 1,
              )
              if (!range || range.steps === 0) return null
              return (
                <p
                  data-testid="step-summary"
                  className={`text-xs mt-1 ${range.ragged ? "text-amber-600" : "text-muted-foreground"}`}
                >
                  {range.ragged
                    ? `${range.steps} steps from ${range.min} - the step does not divide the range, so a finger tops out at ${range.highestReachable}, not ${range.max}.`
                    : `${range.steps} steps, ${range.min} to ${range.max}.`}
                </p>
              )
            })()}
            {!calibrationIsMonotonic(selectedObject.properties.calibrationPoints) && (
              <p data-testid="calibration-warning" className="text-xs mt-1 text-amber-600">
                The calibration rises and falls, so one position on the bar stands for more than one value - a finger
                cannot be told which one it meant. Fine for reading, not for writing.
              </p>
            )}
          </div>

          {/* The marker: what was asked for, beside what is measured. The
              same second binding the arc has had all along - a tap puts the
              marker where the finger went, and the two coincide once the
              command has landed. */}
          <TopicSelector
            selectedTopicId={selectedObject.properties.setpointTopic}
            topics={topics}
            onTopicChange={(topic) => updateProperty("setpointTopic", topic)}
            onManageTopics={onManageTopics}
            label="Topic (setpoint marker, optional)"
            className="w-full"
          />

          <div>
            {/* Pixels here, degrees on the arc: one property name for the
                marker's width, in the unit the object it sits on is measured
                in. */}
            <Label htmlFor="markerWidth" className="text-xs">
              Marker width (px)
            </Label>
            <Input
              id="markerWidth"
              type="number"
              min="1"
              value={selectedObject.properties.markerWidth ?? 4}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                updateProperty("markerWidth", Number.isFinite(parsed) && parsed > 0 ? parsed : 4)
              }}
              className="h-8"
            />
          </div>
        </>
      )}

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
            <SelectItem value="none">None</SelectItem>
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

      {/* Font */}
      <div>
        <Label htmlFor="fontId" className="text-xs">
          Font
        </Label>
        <Select
          value={selectedObject.properties.fontId || ""}
          onValueChange={(value) => {
            if (value === "manage-fonts") {
              onManageFonts()
              return
            }
            updateProperty("fontId", value)
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select a font" />
          </SelectTrigger>
          <SelectContent>
            {fonts.map((font) => (
              <SelectItem key={font.id} value={font.id}>
                {font.displayName || font.name}
              </SelectItem>
            ))}
            {fonts.length > 0 && <Separator className="my-1" />}
            <SelectItem value="manage-fonts" className="text-primary">
              <div className="flex items-center gap-2">
                <FontIcon className="h-4 w-4" />
                Manage Fonts...
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Colors */}
      <ColorDepthAwarePicker
        label="Background Color"
        value={selectedObject.properties.backgroundColor || "#ffffff"}
        onChange={(value) => updateProperty("backgroundColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      <ColorDepthAwarePicker
        label="Border Color"
        value={selectedObject.properties.borderColor || "#cccccc"}
        onChange={(value) => updateProperty("borderColor", value)}
        colorDepth={colorDepth}
        allowTransparent={true}
        screens={allScreens}
      />

      <ColorDepthAwarePicker
        label="Fill Color"
        value={selectedObject.properties.fillColor || "#4CAF50"}
        onChange={(value) => updateProperty("fillColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      {/* Only where there is a marker to colour. Named and defaulted like the
          arc's, since it is the same mark on a straight track. */}
      {selectedObject.properties.setpointTopic && (
        <ColorDepthAwarePicker
          label="Marker Color"
          value={selectedObject.properties.markerColor || "#ffffff"}
          onChange={(value) => updateProperty("markerColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
          screens={allScreens}
        />
      )}

      <ColorDepthAwarePicker
        label="Text Color"
        value={selectedObject.properties.textColor || "#000000"}
        onChange={(value) => updateProperty("textColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

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
