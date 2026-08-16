"use client"

import type React from "react"
import { useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { ScreenEditorFields } from "../screen-editor-fields"
import type { ProjectScreen, ProjectAsset } from "../project-editor"

interface ScreenPropertiesProps {
  currentScreen: ProjectScreen
  onUpdateScreenBackground: (assetId?: string) => void
  onUpdateScreenColors: (backgroundColor: string, gridColor: string) => void
  calculateOptimalGridColor: (backgroundColor: string) => string
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onAddOrFindAsset: (file: File, dataUrl: string) => Promise<string>
  allScreens: ProjectScreen[]
  onRenameScreen: (name: string) => void
  onSetScreenMaster: (masterScreenId: string | undefined) => void
  onSetScreenShowMaster: (showMaster: boolean) => void
  onOpenScreenIconSelector: () => void
  onClearScreenIcon: () => void
}

export function ScreenProperties({
  currentScreen,
  onUpdateScreenBackground,
  onUpdateScreenColors,
  calculateOptimalGridColor,
  projectAssets,
  colorDepth,
  onAddOrFindAsset,
  allScreens,
  onRenameScreen,
  onSetScreenMaster,
  onSetScreenShowMaster,
  onOpenScreenIconSelector,
  onClearScreenIcon,
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
    onUpdateScreenColors(currentScreen.backgroundColor || "#ffffff", gridColor)
  }

  const backgroundAsset = currentScreen.backgroundImageAssetId
    ? projectAssets.find((asset) => asset.id === currentScreen.backgroundImageAssetId)
    : null

  return (
    <div className="space-y-6">
      {/* Screen - the same rename/icon/master editor as Project Settings >
          Screens (ScreenEditorFields), reachable here without opening that
          dialog: shown whenever no object is selected, whether that's
          because nothing was ever selected or the object tree's "Screen"
          root was clicked (see project-editor.tsx's onSelectObject(null) -
          2026-08-16). */}
      <div>
        <h3 className="text-sm font-medium mb-3">Screen</h3>
        <ScreenEditorFields
          screen={currentScreen}
          allScreens={allScreens}
          projectAssets={projectAssets}
          onRename={onRenameScreen}
          onSetMaster={onSetScreenMaster}
          onSetShowMaster={onSetScreenShowMaster}
          onOpenIconSelector={onOpenScreenIconSelector}
          onClearIcon={onClearScreenIcon}
        />
      </div>

      {/* Screen Colors */}
      <div>
        <h3 className="text-sm font-medium mb-3">Screen Colors</h3>
        <div className="space-y-3">
          <ColorDepthAwarePicker
            label="Background Color"
            value={currentScreen.backgroundColor || "#ffffff"}
            onChange={(value) => handleBackgroundColorChange(value)}
            colorDepth={colorDepth}
            allowTransparent={false}
            screens={allScreens}
          />

          <ColorDepthAwarePicker
            label="Grid Color"
            value={currentScreen.gridColor || calculateOptimalGridColor(currentScreen.backgroundColor || "#ffffff")}
            onChange={(value) => handleGridColorChange(value)}
            colorDepth={colorDepth}
            allowTransparent={false}
            screens={allScreens}
          />
          <div className="text-xs text-muted-foreground mt-1">Auto-adjusts when background color changes</div>
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
    </div>
  )
}
