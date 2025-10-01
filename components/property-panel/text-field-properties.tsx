"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import type { ScreenObject } from "../../types"

interface TextFieldPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}

export function TextFieldProperties({ selectedObject, onUpdateObject }: TextFieldPropertiesProps) {
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
    </div>
  )
}
