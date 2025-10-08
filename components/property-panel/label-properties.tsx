"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import type { ScreenObject } from "../../types"
import { AVAILABLE_PLACEHOLDERS } from "@/lib/placeholder-utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { ScreenmanFont } from "../screenman-editor"
import { Separator } from "@/components/ui/separator"
import { FontIcon } from "@/components/icons/font-icon"
import { calculateTextObjectHeight } from "@/lib/font-utils"

const ChevronDown = ({ className }: { className?: string }) => (
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
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const AlignLeft = ({ className }: { className?: string }) => (
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
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="15" y1="12" x2="3" y2="12" />
    <line x1="17" y1="18" x2="3" y2="18" />
  </svg>
)

const AlignCenter = ({ className }: { className?: string }) => (
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
    <line x1="18" y1="6" x2="6" y2="6" />
    <line x1="21" y1="12" x2="9" y2="12" />
    <line x1="16" y1="18" x2="8" y2="18" />
  </svg>
)

const AlignRight = ({ className }: { className?: string }) => (
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
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="12" x2="9" y2="12" />
    <line x1="21" y1="18" x2="7" y2="18" />
  </svg>
)

interface LabelPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  fonts: ScreenmanFont[]
  onManageFonts: () => void // Added onManageFonts prop
}

export function LabelProperties({ selectedObject, onUpdateObject, fonts, onManageFonts }: LabelPropertiesProps) {
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

  const insertPlaceholder = (placeholder: string) => {
    const currentText = selectedObject.properties.text || ""
    const newText = currentText + placeholder
    updateProperty("text", newText)
  }

  return (
    <div className="space-y-3">
      {/* Text Content */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="text" className="text-xs">
            Text
          </Label>
          {/* Placeholder Dropdown Button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                Insert Placeholder
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {AVAILABLE_PLACEHOLDERS.map((placeholder) => (
                <DropdownMenuItem
                  key={placeholder.token}
                  onClick={() => insertPlaceholder(placeholder.token)}
                  className="flex flex-col items-start"
                >
                  <span className="font-mono text-xs font-semibold">{placeholder.token}</span>
                  <span className="text-xs text-muted-foreground">{placeholder.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Input
          id="text"
          value={selectedObject.properties.text || ""}
          onChange={(e) => updateProperty("text", e.target.value)}
          className="h-8"
        />
      </div>

      {/* Font */}
      <div>
        <Label htmlFor="fontId" className="text-xs">
          Font
        </Label>
        <Select
          value={selectedObject.properties.fontId || ""}
          onValueChange={(value) => {
            if (value === "manage-fonts") {
              onManageFonts()
              return
            }
            const f = fonts.find((fn) => fn.id === value)
            const fontSize = f?.size || selectedObject.properties.fontSize || 16
            const newHeight = calculateTextObjectHeight(fontSize)
            onUpdateObject(selectedObject.id, {
              height: newHeight,
              properties: {
                ...selectedObject.properties,
                fontId: value,
                fontSize: fontSize,
              },
            })
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select a font" />
          </SelectTrigger>
          <SelectContent>
            {fonts.map((font) => (
              <SelectItem key={font.id} value={font.id}>
                {(font.displayName || font.name)}{font.size ? ` — ${font.size}px` : ""}
              </SelectItem>
            ))}
            {fonts.length > 0 && <Separator className="my-1" />}
            <SelectItem value="manage-fonts" className="text-primary">
              <div className="flex items-center gap-2">
                <FontIcon className="h-4 w-4" />
                Manage Fonts...
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Text Alignment */}
      <div>
        <Label htmlFor="textAlign" className="text-xs">
          Text Align
        </Label>
        <Select
          value={selectedObject.properties.textAlign || "left"}
          onValueChange={(value) => updateProperty("textAlign", value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">
              <div className="flex items-center gap-2">
                <AlignLeft className="h-3 w-3" />
                Left
              </div>
            </SelectItem>
            <SelectItem value="center">
              <div className="flex items-center gap-2">
                <AlignCenter className="h-3 w-3" />
                Center
              </div>
            </SelectItem>
            <SelectItem value="right">
              <div className="flex items-center gap-2">
                <AlignRight className="h-3 w-3" />
                Right
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Colors */}
      <ColorPickerWithTransparency
        label="Background Color"
        value={selectedObject.properties.backgroundColor || "#ffffff"}
        onChange={(value) => updateProperty("backgroundColor", value)}
        allowTransparent={true}
      />

      <ColorPickerWithTransparency
        label="Border Color"
        value={selectedObject.properties.borderColor || "#cccccc"}
        onChange={(value) => updateProperty("borderColor", value)}
        allowTransparent={true}
      />

      <div>
        <Label htmlFor="color" className="text-xs">
          Text Color
        </Label>
        <Input
          id="color"
          type="color"
          value={selectedObject.properties.color || "#000000"}
          onChange={(e) => updateProperty("color", e.target.value)}
          className="h-8"
        />
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
    </div>
  )
}
