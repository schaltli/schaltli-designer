"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import type { ScreenmanObject } from "../screenman-editor"

interface LinePropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  colorDepth: "1bit" | "4bit" | "24bit"
}

export function LineProperties({ selectedObject, onUpdateObject, colorDepth }: LinePropertiesProps) {
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
      {/* Color */}
      <ColorDepthAwarePicker
        label="Color"
        value={selectedObject.properties.color || "#000000"}
        onChange={(value) => updateProperty("color", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
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
