"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import type { ScreenmanObject } from "../screenman-editor"

interface BoxPropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
}

export function BoxProperties({ selectedObject, onUpdateObject }: BoxPropertiesProps) {
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
      {/* Fill Color */}
      <div>
        <Label htmlFor="fillColor" className="text-xs">
          Fill Color
        </Label>
        <Input
          id="fillColor"
          type="color"
          value={selectedObject.properties.fillColor || "#cccccc"}
          onChange={(e) => updateProperty("fillColor", e.target.value)}
          className="h-8"
        />
      </div>

      {/* Stroke Color */}
      <div>
        <Label htmlFor="strokeColor" className="text-xs">
          Stroke Color
        </Label>
        <Input
          id="strokeColor"
          type="color"
          value={selectedObject.properties.strokeColor || "#000000"}
          onChange={(e) => updateProperty("strokeColor", e.target.value)}
          className="h-8"
        />
      </div>

      {/* Stroke Width */}
      <div>
        <Label htmlFor="strokeWidth" className="text-xs">
          Stroke Width
        </Label>
        <div className="px-2">
          <Slider
            value={[selectedObject.properties.strokeWidth || 1]}
            onValueChange={([value]) => updateProperty("strokeWidth", value)}
            min={0}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.strokeWidth || 1}px</div>
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
            max={20}
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
