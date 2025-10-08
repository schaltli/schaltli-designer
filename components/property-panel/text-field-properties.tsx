"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import type { ScreenmanObject, ScreenmanFont } from "../screenman-editor"

interface TextFieldPropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  fonts: ScreenmanFont[]
}

export function TextFieldProperties({ selectedObject, onUpdateObject, fonts }: TextFieldPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    const updates: any = {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    }
    
    // If font size or font ID changes, update the height automatically
    if (key === "fontSize" || key === "fontId") {
      const f = fonts.find((fn) => fn.id === (key === "fontId" ? value : selectedObject.properties.fontId))
      const fontSize = f?.size || (key === "fontSize" ? value : selectedObject.properties.fontSize) || 16
      const newHeight = calculateTextObjectHeight(fontSize)
      updates.height = newHeight
    }
    
    onUpdateObject(selectedObject.id, updates)
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
            value={(() => {
              const f = fonts.find((fn) => fn.id === selectedObject.properties.fontId)
              const fontSize = f?.size || selectedObject.properties.fontSize || 16
              return calculateTextObjectHeight(fontSize)
            })()}
            disabled
            className="h-8 opacity-70"
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
