"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ColorPickerWithTransparency } from "./color-picker-with-transparency"
import { TopicSelector } from "./topic-selector"
import { Separator } from "@/components/ui/separator"
import type { ScreenObject, Topic } from "../../types"
import type { ScreenmanFont } from "../screenman-editor"
import { FontIcon } from "@/components/icons/font-icon"

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

interface MqttDataFieldPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  fonts: ScreenmanFont[]
  onManageFonts: () => void // Added onManageFonts prop
}

export function MqttDataFieldProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  onManageFonts, // Added onManageFonts parameter
}: MqttDataFieldPropertiesProps) {
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
      {/* Topic Selector */}
      <div className="w-full">
        <TopicSelector
          selectedTopicId={selectedObject.properties.topicId}
          topics={topics}
          onTopicChange={(topicId) => updateProperty("topicId", topicId)}
          onManageTopics={onManageTopics}
          label="Topic"
          className="w-full"
        />
      </div>

      {/* Display As */}
      <div className="w-full">
        <Label htmlFor="displayAs" className="text-xs">
          Display As
        </Label>
        <Select
          value={selectedObject.properties.displayAs || "Display as-is"}
          onValueChange={(value) => updateProperty("displayAs", value)}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Display as-is">
              <div className="flex items-center gap-2">
                <span>Display as-is</span>
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
            <SelectItem value="Formatted Number">
              <div className="flex items-center gap-2">
                <span>Formatted Number</span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  numeric
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Formatted Number Options */}
      {selectedObject.properties.displayAs === "Formatted Number" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="prefix" className="text-xs">
                Prefix
              </Label>
              <Input
                id="prefix"
                value={selectedObject.properties.prefix || ""}
                onChange={(e) => updateProperty("prefix", e.target.value)}
                placeholder="$, €, etc."
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="postfix" className="text-xs">
                Postfix
              </Label>
              <Input
                id="postfix"
                value={selectedObject.properties.postfix || ""}
                onChange={(e) => updateProperty("postfix", e.target.value)}
                placeholder="%, °C, etc."
                className="h-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="numberOfDecimals" className="text-xs">
                Decimals
              </Label>
              <Input
                id="numberOfDecimals"
                type="number"
                min="0"
                max="10"
                value={selectedObject.properties.numberOfDecimals ?? ""}
                onChange={(e) =>
                  updateProperty("numberOfDecimals", e.target.value ? Number.parseInt(e.target.value) : undefined)
                }
                placeholder="Auto"
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="thousandsSeparator" className="text-xs">
                Thousands Sep
              </Label>
              <Input
                id="thousandsSeparator"
                value={selectedObject.properties.thousandsSeparator || ""}
                onChange={(e) => updateProperty("thousandsSeparator", e.target.value)}
                placeholder=",  .  '"
                className="h-8"
              />
            </div>
          </div>
        </>
      )}

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
            updateProperty("fontId", value)
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select a font" />
          </SelectTrigger>
          <SelectContent>
            {fonts.map((font) => (
              <SelectItem key={font.id} value={font.id}>
                {font.displayName || font.name}
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
            value={selectedObject.height}
            onChange={(e) => updatePosition("height", Number.parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}
