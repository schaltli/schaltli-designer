"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { TopicSelector } from "./topic-selector"
import type { ScreenmanObject, Topic, ScreenmanAsset } from "../screenman-editor"

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

const ArrowUp = ({ className }: { className?: string }) => (
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
    <path d="m18 15-6-6-6 6" />
  </svg>
)

const ArrowDown = ({ className }: { className?: string }) => (
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
    <path d="m6 9 6 6 6-6" />
  </svg>
)

interface MqttIconFieldPropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  projectAssets: ScreenmanAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector: (index: number) => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function MqttIconFieldProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  projectAssets,
  colorDepth,
  onOpenIconSelector,
  allScreens,
}: MqttIconFieldPropertiesProps) {
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

  const moveRule = (index: number, direction: "up" | "down") => {
    const currentPairs = selectedObject.properties.valueIconPairs || []
    if ((direction === "up" && index === 0) || (direction === "down" && index === currentPairs.length - 1)) {
      return
    }

    const newPairs = [...currentPairs]
    const targetIndex = direction === "up" ? index - 1 : index + 1
    ;[newPairs[index], newPairs[targetIndex]] = [newPairs[targetIndex], newPairs[index]]
    updateProperty("valueIconPairs", newPairs)
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
        className="w-full"
      />

      {/* Icon Selection Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Icon Selection Rules</Label>
          <button
            onClick={() => {
              const currentPairs = selectedObject.properties.valueIconPairs || []
              const newPairs = [
                ...currentPairs,
                {
                  comparisonOperator: "=",
                  value: 0,
                  thenShowIcon: "",
                },
              ]
              updateProperty("valueIconPairs", newPairs)
            }}
            className="p-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          Rules are evaluated from top to bottom. First matching rule chooses icon.
        </div>

        <div className="space-y-2">
          {(selectedObject.properties.valueIconPairs || []).map((pair: any, index: number) => (
            <div key={index} className="p-2 bg-muted rounded relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">Rule #{index + 1}</div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveRule(index, "up")}
                    disabled={index === 0}
                    className="p-1 hover:bg-background rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveRule(index, "down")}
                    disabled={index === (selectedObject.properties.valueIconPairs || []).length - 1}
                    className="p-1 hover:bg-background rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      const currentPairs = selectedObject.properties.valueIconPairs || []
                      const newPairs = currentPairs.filter((_: any, i: number) => i !== index)
                      updateProperty("valueIconPairs", newPairs)
                    }}
                    className="p-1 text-destructive hover:bg-destructive/10 rounded"
                    title="Delete Rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-1 items-end">
                  <div className="flex-1">
                    <Label className="text-xs block mb-1">if value is</Label>
                    <Select
                      value={pair.comparisonOperator || "="}
                      onValueChange={(value) => {
                        const currentPairs = selectedObject.properties.valueIconPairs || []
                        const newPairs = [...currentPairs]
                        newPairs[index] = {
                          ...newPairs[index],
                          comparisonOperator: value,
                        }
                        updateProperty("valueIconPairs", newPairs)
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>
                          {(() => {
                            const operatorLabels = {
                              "=": "Equal",
                              ">": "Greater than",
                              ">=": "Greater than or equal",
                              "<": "Less than",
                              "<=": "Less than or equal",
                            }
                            return operatorLabels[pair.comparisonOperator as keyof typeof operatorLabels] || "Equal"
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="=">
                          <div className="flex items-center gap-2">
                            <span>=</span>
                            <span>Equal</span>
                            <div className="flex gap-1">
                              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                text
                              </span>
                              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                numeric
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value=">">
                          <div className="flex items-center gap-2">
                            <span>{">"}</span>
                            <span>Greater than</span>
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              numeric
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value=">=">
                          <div className="flex items-center gap-2">
                            <span>{">="}</span>
                            <span>Greater than or equal</span>
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              numeric
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="<">
                          <div className="flex items-center gap-2">
                            <span>{"<"}</span>
                            <span>Less than</span>
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              numeric
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="<=">
                          <div className="flex items-center gap-2">
                            <span>{"<="}</span>
                            <span>Less than or equal</span>
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              numeric
                            </span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs block mb-1 opacity-0">Value</Label>
                    <Input
                      type={pair.comparisonOperator === "=" ? "text" : "number"}
                      value={pair.value ?? ""}
                      onChange={(e) => {
                        const currentPairs = selectedObject.properties.valueIconPairs || []
                        const newPairs = [...currentPairs]
                        newPairs[index] = {
                          ...newPairs[index],
                          value:
                            pair.comparisonOperator === "="
                              ? e.target.value
                              : e.target.value
                                ? Number(e.target.value)
                                : 0,
                        }
                        updateProperty("valueIconPairs", newPairs)
                      }}
                      placeholder={pair.comparisonOperator === "=" ? "text or number" : "0"}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">then icon is</Label>
                  {pair.thenShowIcon ? (
                    <div className="flex items-center gap-2 mt-1 p-2 bg-background rounded border">
                      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center p-1">
                        {(() => {
                          const iconAsset = projectAssets.find((asset) => asset.id === pair.thenShowIcon)
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
                          {(() => {
                            const iconAsset = projectAssets.find((asset) => asset.id === pair.thenShowIcon)
                            return iconAsset?.name || "Unknown"
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground">ICON • 1KB</div>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 bg-transparent"
                        onClick={() => {
                          const currentPairs = selectedObject.properties.valueIconPairs || []
                          const newPairs = [...currentPairs]
                          newPairs[index] = {
                            ...newPairs[index],
                            thenShowIcon: "",
                          }
                          updateProperty("valueIconPairs", newPairs)
                        }}
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
                        onClick={() => {
                          onOpenIconSelector(index)
                        }}
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

        {(!selectedObject.properties.valueIconPairs || selectedObject.properties.valueIconPairs.length === 0) && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
            Click + to add icon selection rules. Each rule maps a value condition to an icon.
          </div>
        )}
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
