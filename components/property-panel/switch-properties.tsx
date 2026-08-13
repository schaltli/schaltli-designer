"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { TopicSelector } from "./topic-selector"
import { Separator } from "@/components/ui/separator"
import type { ScreenObject, Topic, ProjectAsset, ProjectFont } from "../project-editor"

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

const Search = ({ className }: { className?: string }) => (
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
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const X = ({ className }: { className?: string }) => (
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
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

interface SwitchPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  projectAssets: ProjectAsset[]
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector: (stateIndex: number) => void
  onManageFonts?: () => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
  nextId: number
  onIncrementNextId: () => void
}

export function SwitchProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  projectAssets,
  fonts,
  colorDepth,
  onOpenIconSelector,
  onManageFonts,
  allScreens,
  nextId,
  onIncrementNextId,
}: SwitchPropertiesProps) {
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

  const states: any[] = selectedObject.properties.states || []

  const updateState = (index: number, updates: Record<string, any>) => {
    const newStates = [...states]
    newStates[index] = { ...newStates[index], ...updates }
    updateProperty("states", newStates)
  }

  return (
    <div className="space-y-3">
      {/* Read Topic - retained, drives which segment shows active */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.topic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("topic", topic)}
        onManageTopics={onManageTopics}
        label="Read Topic (retained)"
        className="w-full"
      />

      {/* Write Topic - a plain command destination, not a browsable value
          like the topics above, same reasoning as SoftwareButton's
          send-mqtt action fields (software-button-properties.tsx). */}
      <div>
        <Label htmlFor="writeTopic" className="text-xs">
          Write Topic (command)
        </Label>
        <Input
          id="writeTopic"
          value={selectedObject.properties.writeTopic || ""}
          onChange={(e) => updateProperty("writeTopic", e.target.value)}
          placeholder="e.g., home/lamp/set"
          className="h-8"
        />
      </div>

      {/* Font Selection - shared across every segment's label */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Font</Label>
          {onManageFonts && (
            <button onClick={onManageFonts} className="text-xs text-blue-600 hover:underline">
              Manage Fonts
            </button>
          )}
        </div>
        <select
          value={selectedObject.properties.fontId || ""}
          onChange={(e) => updateProperty("fontId", e.target.value || undefined)}
          className="w-full h-8 px-2 text-xs border rounded"
        >
          <option value="">System Default</option>
          {fonts.map((font) => (
            <option key={font.id} value={font.id}>
              {font.name} ({font.size}px)
            </option>
          ))}
        </select>
      </div>

      <Separator />

      {/* States */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">States</Label>
          <button
            onClick={() => {
              const newStates = [
                ...states,
                {
                  id: `switchstate-${nextId}`,
                  label: `State ${states.length + 1}`,
                  readValue: "",
                  writeValue: "",
                },
              ]
              onIncrementNextId()
              updateProperty("states", newStates)
            }}
            className="p-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          Shown as segments side by side, in this order. Tapping a segment on the device publishes its write value; the
          active segment is whichever one's read value matches the read topic.
        </div>

        <div className="space-y-2">
          {states.map((state, index) => (
            <div key={state.id || `state-${index}`} className="p-2 bg-muted rounded relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">State #{index + 1}</div>
                <button
                  onClick={() => updateProperty("states", states.filter((_, i) => i !== index))}
                  className="p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Delete State"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <div>
                  <Label className="text-xs block mb-1">Label</Label>
                  <Input
                    value={state.label ?? ""}
                    onChange={(e) => updateState(index, { label: e.target.value })}
                    placeholder="Display text"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="flex gap-1">
                  <div className="flex-1">
                    <Label className="text-xs block mb-1">Read value</Label>
                    <Input
                      value={state.readValue ?? ""}
                      onChange={(e) => updateState(index, { readValue: e.target.value })}
                      placeholder="e.g. high"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs block mb-1">Write value</Label>
                    <Input
                      value={state.writeValue ?? ""}
                      onChange={(e) => updateState(index, { writeValue: e.target.value })}
                      placeholder="e.g. high"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Icon (optional)</Label>
                  {state.iconAssetId ? (
                    <div className="flex items-center gap-2 mt-1 p-2 bg-background rounded border">
                      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center p-1">
                        {(() => {
                          const iconAsset = projectAssets.find((asset) => asset.id === state.iconAssetId)
                          if (iconAsset && iconAsset.data) {
                            try {
                              let svgContent = iconAsset.data
                              if (iconAsset.data.startsWith("data:image/svg+xml;base64,")) {
                                svgContent = atob(iconAsset.data.split(",")[1])
                              } else if (iconAsset.data.startsWith("data:image/svg+xml,")) {
                                svgContent = decodeURIComponent(iconAsset.data.split(",")[1])
                              }
                              return (
                                <div
                                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                                  dangerouslySetInnerHTML={{ __html: svgContent }}
                                />
                              )
                            } catch (error) {
                              return <span className="text-xs">📄</span>
                            }
                          }
                          return <span className="text-xs">📄</span>
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {projectAssets.find((asset) => asset.id === state.iconAssetId)?.name || "Unknown"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 bg-transparent"
                        onClick={() => updateState(index, { iconAssetId: undefined })}
                        title="Clear icon"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1 p-2 bg-background rounded border">
                      <div className="flex-1 text-xs text-muted-foreground">No icon</div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 bg-transparent"
                        onClick={() => onOpenIconSelector(index)}
                        title="Select icon"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {states.length === 0 && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
            Click + to add states. Each state is one segment of the switch.
          </div>
        )}
      </div>

      <Separator />

      {/* Colors */}
      <ColorDepthAwarePicker
        label="Background Color"
        value={selectedObject.properties.backgroundColor || "#ffffff"}
        onChange={(value) => updateProperty("backgroundColor", value)}
        colorDepth={colorDepth}
        allowTransparent={true}
        screens={allScreens}
      />

      <ColorDepthAwarePicker
        label="Active Segment Background"
        value={selectedObject.properties.activeBackgroundColor || "#2563eb"}
        onChange={(value) => updateProperty("activeBackgroundColor", value)}
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
        label="Text Color"
        value={selectedObject.properties.textColor || "#000000"}
        onChange={(value) => updateProperty("textColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      <ColorDepthAwarePicker
        label="Active Segment Text Color"
        value={selectedObject.properties.activeTextColor || "#ffffff"}
        onChange={(value) => updateProperty("activeTextColor", value)}
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
