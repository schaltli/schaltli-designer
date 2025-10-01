"use client"
import { Button } from "@/components/ui/button"

interface ColorPickerWithTransparencyProps {
  value: string
  onChange: (value: string) => void
  label: string
  allowTransparent?: boolean
}

export function ColorPickerWithTransparency({
  value,
  onChange,
  label,
  allowTransparent = true,
}: ColorPickerWithTransparencyProps) {
  const isTransparent = value === "transparent"
  const colorValue = isTransparent ? "#000000" : value

  const handleColorChange = (newColor: string) => {
    if (!isTransparent) {
      onChange(newColor)
    }
  }

  const toggleTransparency = () => {
    if (isTransparent) {
      onChange("#000000") // Default to black when making opaque
    } else {
      onChange("transparent")
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium">{label}</label>
      <div className="flex items-center gap-2">
        {/* Color picker - disabled when transparent */}
        <div className="relative">
          <input
            type="color"
            value={colorValue}
            onChange={(e) => handleColorChange(e.target.value)}
            disabled={isTransparent}
            className={`w-8 h-8 rounded border cursor-pointer ${isTransparent ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          {/* Checkerboard pattern overlay when transparent */}
          {isTransparent && (
            <div
              className="absolute inset-0 rounded border pointer-events-none"
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
          )}
        </div>

        {/* Transparency toggle button */}
        {allowTransparent && (
          <Button
            type="button"
            variant={isTransparent ? "default" : "outline"}
            size="sm"
            onClick={toggleTransparency}
            className="text-xs"
          >
            {isTransparent ? "Opaque" : "Transparent"}
          </Button>
        )}

        {/* Color preview text */}
        <span className="text-xs text-muted-foreground">{isTransparent ? "transparent" : colorValue}</span>
      </div>
    </div>
  )
}
