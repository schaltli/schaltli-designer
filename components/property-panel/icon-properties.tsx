"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import type { ScreenObject, ProjectAsset } from "../../types"
import { Search, X } from "lucide-react"

interface IconPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  projectAssets: ProjectAsset[]
  onOpenIconSelector?: () => void
}

export function IconProperties({
  selectedObject,
  onUpdateObject,
  projectAssets,
  onOpenIconSelector,
}: IconPropertiesProps) {
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
    console.log("[v0] Clearing icon, current assetId:", selectedObject.properties.assetId)
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        assetId: null,
        iconName: null,
      },
    })
    console.log("[v0] Icon cleared")
  }

  return (
    <div className="space-y-3">
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

      {/* Referenced Asset */}
      <div>
        <Label className="text-xs">Referenced Asset</Label>
        {selectedObject.properties.assetId ? (
          <div className="space-y-2">
            {(() => {
              const asset = projectAssets.find((a) => a.id === selectedObject.properties.assetId)
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
                      {asset?.size && ` • ${Math.round(asset.size / 1024)}KB`}
                    </div>
                  </div>
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
            <div className="text-xs text-muted-foreground">
              Colors are managed in Project Settings → Assets. Changes to the asset will automatically update this icon.
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 bg-muted rounded">
            <div className="flex-1 text-xs text-muted-foreground">
              No asset selected. Click the button to select an icon from the library.
            </div>
            {onOpenIconSelector && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
                onClick={onOpenIconSelector}
                title="Select icon"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Background Color */}
      <ColorPickerWithTransparency
        label="Background Color"
        value={selectedObject.properties.backgroundColor || "transparent"}
        onChange={(value) => updateProperty("backgroundColor", value)}
        allowTransparent={true}
      />
    </div>
  )
}
