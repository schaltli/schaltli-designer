"use client"

import type React from "react"
import { useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ScreenmanScreen, ScreenmanAsset } from "../screenman-editor"

interface ScreenPropertiesProps {
  currentScreen: ScreenmanScreen
  onUpdateScreenBackground: (assetId?: string) => void
  onUpdateScreenColors: (backgroundColor: string, gridColor: string) => void
  calculateOptimalGridColor: (backgroundColor: string) => string
  projectAssets: ScreenmanAsset[]
  onAddOrFindAsset: (file: File, dataUrl: string) => Promise<string>
}

export function ScreenProperties({
  currentScreen,
  onUpdateScreenBackground,
  onUpdateScreenColors,
  calculateOptimalGridColor,
  projectAssets,
  onAddOrFindAsset,
}: ScreenPropertiesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image file is too large. Please select a file smaller than 5MB.")
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      const result = e.target?.result as string
      try {
        const assetId = await onAddOrFindAsset(file, result)
        onUpdateScreenBackground(assetId)
        console.log("[v0] Background updated with asset ID:", assetId)
      } catch (error) {
        console.error("Failed to add background asset:", error)
        alert("Failed to add background image. Please try again.")
      }
    }
    reader.readAsDataURL(file)

    event.target.value = ""
  }

  const handleBackgroundColorChange = (backgroundColor: string) => {
    const optimalGridColor = calculateOptimalGridColor(backgroundColor)
    onUpdateScreenColors(backgroundColor, optimalGridColor)
  }

  const handleGridColorChange = (gridColor: string) => {
    onUpdateScreenColors(currentScreen.backgroundColor, gridColor)
  }

  const backgroundAsset = currentScreen.backgroundImageAssetId
    ? projectAssets.find((asset) => asset.id === currentScreen.backgroundImageAssetId)
    : null

  return (
    <div className="space-y-6">
      {/* Screen Colors */}
      <div>
        <h3 className="text-sm font-medium mb-3">Screen Colors</h3>
        <div className="space-y-3">
          <div>
            <Label htmlFor="screenBackgroundColor" className="text-xs">
              Background Color
            </Label>
            <Input
              id="screenBackgroundColor"
              type="color"
              value={currentScreen.backgroundColor || "#ffffff"}
              onChange={(e) => handleBackgroundColorChange(e.target.value)}
              className="h-8"
            />
          </div>

          <div>
            <Label htmlFor="screenGridColor" className="text-xs">
              Grid Color
            </Label>
            <Input
              id="screenGridColor"
              type="color"
              value={currentScreen.gridColor || calculateOptimalGridColor(currentScreen.backgroundColor || "#ffffff")}
              onChange={(e) => handleGridColorChange(e.target.value)}
              className="h-8"
            />
            <div className="text-xs text-muted-foreground mt-1">Auto-adjusts when background color changes</div>
          </div>
        </div>
      </div>

      {/* Background Image */}
      <div>
        <h3 className="text-sm font-medium mb-3">Background Image</h3>
        <div className="space-y-3">
          {backgroundAsset && <div className="text-xs text-muted-foreground">Current: {backgroundAsset.name}</div>}

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" />

          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-3 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              {backgroundAsset ? "Change Background" : "Add Background"}
            </button>

            {backgroundAsset && (
              <button
                onClick={() => onUpdateScreenBackground(undefined)}
                className="px-3 py-2 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* No Selection Message */}
      <div className="text-center text-muted-foreground">
        <div className="text-sm">No object selected</div>
        <div className="text-xs mt-1">Select an object to edit its properties</div>
      </div>
    </div>
  )
}
