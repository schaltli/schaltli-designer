"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { getColorPaletteForDepth, findClosestPaletteColor, type ColorPaletteEntry } from "@/lib/color-palette"

interface ColorDepthAwarePickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allowTransparent?: boolean
}

export function ColorDepthAwarePicker({
  label,
  value,
  onChange,
  colorDepth,
  allowTransparent = false,
}: ColorDepthAwarePickerProps) {
  const palette = getColorPaletteForDepth(colorDepth)
  const isTransparent = value === "transparent"
  
  // Find the current color in the palette or closest match
  const currentColor = isTransparent 
    ? null 
    : findClosestPaletteColor(value, palette)

  const handleColorChange = (newColorId: string) => {
    if (newColorId === "transparent") {
      onChange("transparent")
    } else {
      onChange(newColorId)
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {/* Color dropdown selector */}
        <Select
          value={isTransparent ? "transparent" : currentColor?.id || palette[0].id}
          onValueChange={handleColorChange}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue>
              <div className="flex items-center gap-2">
                {/* Color preview swatch */}
                {isTransparent ? (
                  <div 
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{
                      backgroundImage: `
                        linear-gradient(45deg, #ccc 25%, transparent 25%), 
                        linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                        linear-gradient(45deg, transparent 75%, #ccc 75%), 
                        linear-gradient(-45deg, transparent 75%, #ccc 75%)
                      `,
                      backgroundSize: "4px 4px",
                      backgroundPosition: "0 0, 0 2px, 2px -2px, -2px 0px",
                    }}
                  />
                ) : (
                  <div 
                    className="w-4 h-4 rounded border border-gray-300" 
                    style={{ backgroundColor: currentColor?.hex || palette[0].hex }}
                  />
                )}
                <span className="text-sm">
                  {isTransparent ? "Transparent" : currentColor?.name || palette[0].name}
                </span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {allowTransparent && (
              <>
                <SelectItem value="transparent">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{
                        backgroundImage: `
                          linear-gradient(45deg, #ccc 25%, transparent 25%), 
                          linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                          linear-gradient(45deg, transparent 75%, #ccc 75%), 
                          linear-gradient(-45deg, transparent 75%, #ccc 75%)
                        `,
                        backgroundSize: "4px 4px",
                        backgroundPosition: "0 0, 0 2px, 2px -2px, -2px 0px",
                      }}
                    />
                    <span>Transparent</span>
                  </div>
                </SelectItem>
                <div className="border-t my-1" />
              </>
            )}
            {palette.map((color) => (
              <SelectItem key={color.id} value={color.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded border border-gray-300" 
                    style={{ backgroundColor: color.hex }}
                  />
                  <span>{color.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
