"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import type { ScreenmanObject, ScreenmanAsset, ScreenmanFont, HardwareButtonAction } from "../screenman-editor"
import { Search, X } from "lucide-react"

interface SoftwareButtonPropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  projectAssets: ScreenmanAsset[]
  fonts: ScreenmanFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector?: () => void
  onManageFonts?: () => void
  allScreens?: Array<{
    id: string
    name: string
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function SoftwareButtonProperties({
  selectedObject,
  onUpdateObject,
  projectAssets,
  fonts,
  colorDepth,
  onOpenIconSelector,
  onManageFonts,
  allScreens,
}: SoftwareButtonPropertiesProps) {
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

  const handleClearIcon = () => {
    updateProperty("iconAssetId", null)
  }
  
  const handleSelectIcon = () => {
    if (onOpenIconSelector) {
      onOpenIconSelector()
    }
  }

  // Action handling
  const buttonAction = selectedObject.properties.action as HardwareButtonAction | undefined
  
  const updateAction = (action: HardwareButtonAction | null) => {
    updateProperty("action", action)
  }

  return (
    <div className="space-y-3">
      {/* Action Configuration */}
      <div className="border-t pt-3">
        <Label className="text-xs font-semibold">Button Action</Label>
        
        <div className="mt-2 space-y-2">
          <div>
            <Label className="text-xs">Action Type</Label>
            <select
              value={buttonAction?.type || "next-screen"}
              onChange={(e) => {
                const type = e.target.value as HardwareButtonAction["type"]
                if (type === "next-screen" || type === "previous-screen") {
                  updateAction({ type })
                } else if (type === "goto-screen") {
                  updateAction({ type, targetScreenId: buttonAction?.targetScreenId || "" })
                } else if (type === "send-mqtt") {
                  updateAction({ type, mqttTopic: buttonAction?.mqttTopic || "", mqttMessage: buttonAction?.mqttMessage || "" })
                }
              }}
              className="w-full h-8 px-2 text-xs border rounded mt-1"
            >
              <option value="next-screen">Next Screen</option>
              <option value="previous-screen">Previous Screen</option>
              <option value="goto-screen">Go to Specific Screen</option>
              <option value="send-mqtt">Send MQTT Message</option>
            </select>
          </div>

          {buttonAction?.type === "goto-screen" && (
            <div>
              <Label className="text-xs">Target Screen</Label>
              <select
                value={buttonAction.targetScreenId || ""}
                onChange={(e) => updateAction({ ...buttonAction, targetScreenId: e.target.value })}
                className="w-full h-8 px-2 text-xs border rounded mt-1"
              >
                <option value="">Select screen...</option>
                {allScreens?.map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {screen.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {buttonAction?.type === "send-mqtt" && (
            <>
              <div>
                <Label className="text-xs">MQTT Topic</Label>
                <Input
                  value={buttonAction.mqttTopic || ""}
                  onChange={(e) => updateAction({ ...buttonAction, mqttTopic: e.target.value })}
                  placeholder="e.g., home/button/click"
                  className="h-8 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">MQTT Message</Label>
                <Input
                  value={buttonAction.mqttMessage || ""}
                  onChange={(e) => updateAction({ ...buttonAction, mqttMessage: e.target.value })}
                  placeholder="e.g., ON"
                  className="h-8 mt-1"
                />
              </div>
            </>
          )}
        </div>
      </div>
      {/* Text */}
      <div>
        <Label htmlFor="text" className="text-xs">
          Button Text
        </Label>
        <Input
          id="text"
          value={selectedObject.properties.text || ""}
          onChange={(e) => updateProperty("text", e.target.value)}
          placeholder="Button"
          className="h-8"
        />
      </div>

      {/* Icon Selection */}
      <div>
        <Label className="text-xs">Icon (Optional)</Label>
        {selectedObject.properties.iconAssetId ? (
          <div className="space-y-2">
            {(() => {
              const asset = projectAssets.find((a) => a.id === selectedObject.properties.iconAssetId)
              return (
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  <div className="w-8 h-8 bg-background rounded border flex items-center justify-center flex-shrink-0">
                    {asset && asset.data ? (
                      <div
                        className="w-6 h-6 [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{
                          __html: (() => {
                            try {
                              let svgContent = asset.data
                              if (asset.data.startsWith("data:image/svg+xml;base64,")) {
                                svgContent = atob(asset.data.split(",")[1])
                              } else if (asset.data.startsWith("data:image/svg+xml,")) {
                                svgContent = decodeURIComponent(asset.data.split(",")[1])
                              }
                              return svgContent
                            } catch (error) {
                              return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
                            }
                          })(),
                        }}
                      />
                    ) : (
                      <span className="text-xs">📄</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{asset?.name || "Unknown Asset"}</div>
                    <div className="text-xs text-muted-foreground">
                      {asset?.type?.toUpperCase() || "UNKNOWN"}
                    </div>
                  </div>
                  {onOpenIconSelector && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
                      onClick={handleSelectIcon}
                      title="Change icon"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
                    onClick={handleClearIcon}
                    title="Clear icon"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 bg-muted rounded">
            <div className="flex-1 text-xs text-muted-foreground">
              No icon selected
            </div>
            {onOpenIconSelector && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
                onClick={handleSelectIcon}
                title="Select icon"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Font Selection */}
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
        <p className="text-xs text-muted-foreground mt-1">
          Font size is determined by the selected font
        </p>
      </div>

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

      {/* Border Width */}
      <div>
        <Label htmlFor="borderWidth" className="text-xs">
          Border Width
        </Label>
        <div className="px-2">
          <Slider
            value={[selectedObject.properties.borderWidth || 1]}
            onValueChange={([value]) => updateProperty("borderWidth", value)}
            min={0}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.borderWidth || 1}px</div>
        </div>
      </div>

      {/* Corner Radius */}
      <div>
        <Label htmlFor="cornerRadius" className="text-xs">
          Corner Radius
        </Label>
        <div className="px-2">
          <Slider
            value={[selectedObject.properties.cornerRadius || 0]}
            onValueChange={([value]) => updateProperty("cornerRadius", value)}
            min={0}
            max={50}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.cornerRadius || 0}px</div>
        </div>
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

