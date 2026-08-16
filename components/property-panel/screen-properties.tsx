"use client"

import type React from "react"
import { useRef } from "react"
import { Label } from "@/components/ui/label"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { ScreenEditorFields } from "../screen-editor-fields"
import type { ProjectScreen, ProjectAsset } from "../project-editor"
import { resolveMasterScreen, resolveBackgroundColor, resolveBackgroundImage } from "@/lib/master-screen"

interface ScreenPropertiesProps {
  currentScreen: ProjectScreen
  onUpdateScreenBackground: (assetId?: string) => void
  onSetScreenBackgroundImageOverrideNone: (override: boolean) => void
  // Both optional despite always being called together, to match the real
  // underlying setter (project-editor.tsx's updateScreenColors) - clearing
  // backgroundColor back to "inherit" needs to send undefined through, not
  // a placeholder string.
  onUpdateScreenColors: (backgroundColor: string | undefined, gridColor: string | undefined) => void
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
  onSetScreenBackgroundImageOverrideNone,
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

  const masterScreen = resolveMasterScreen(currentScreen, allScreens)
  const resolvedColor = resolveBackgroundColor(currentScreen, masterScreen)
  const resolvedImage = resolveBackgroundImage(currentScreen, masterScreen)

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

  // Clears only backgroundColor, leaving gridColor exactly as it was -
  // grid color deliberately doesn't inherit (2026-08-16 grilling decision),
  // so switching background color to "inherit" must not touch it.
  // updateScreenColors sets both fields together, so gridColor has to be
  // passed through explicitly rather than omitted (omitting it would clear
  // it too).
  const handleInheritBackgroundColor = () => {
    onUpdateScreenColors(undefined, currentScreen.gridColor)
  }

  const handleGridColorChange = (gridColor: string) => {
    onUpdateScreenColors(resolvedColor.color, gridColor)
  }

  const localImageAsset = currentScreen.backgroundImageAssetId
    ? projectAssets.find((asset) => asset.id === currentScreen.backgroundImageAssetId)
    : null
  const masterImageAsset = masterScreen?.backgroundImageAssetId
    ? projectAssets.find((asset) => asset.id === masterScreen.backgroundImageAssetId)
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

      {/* Screen Colors - background color inherits from the assigned master
          (a screen with no local backgroundColor of its own, undefined by
          default until someone actually picks one - see
          lib/master-screen.ts's resolveBackgroundColor); grid color stays
          purely local/auto-derived, just against whichever color is
          actually in effect. */}
      <div>
        <h3 className="text-sm font-medium mb-3">Screen Colors</h3>
        <div className="space-y-3">
          <ColorDepthAwarePicker
            label="Background Color"
            value={resolvedColor.color}
            onChange={handleBackgroundColorChange}
            colorDepth={colorDepth}
            allowTransparent={false}
            screens={allScreens}
            masterColor={masterScreen?.backgroundColor}
            isInherited={resolvedColor.source === "inherited"}
            onInherit={handleInheritBackgroundColor}
          />

          <ColorDepthAwarePicker
            label="Grid Color"
            value={currentScreen.gridColor || calculateOptimalGridColor(resolvedColor.color)}
            onChange={handleGridColorChange}
            colorDepth={colorDepth}
            allowTransparent={false}
            screens={allScreens}
          />
          <div className="text-xs text-muted-foreground mt-1">Auto-adjusts when background color changes</div>
        </div>
      </div>

      {/* Background Image - same three states as the color above, plus a
          fourth: a screen can explicitly say "no image here" even with a
          master that has one (backgroundImageOverrideNone - a plain
          undefined can't represent that, since it already means "not
          decided, so inherit"). */}
      <div>
        <h3 className="text-sm font-medium mb-3">Background Image</h3>
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleBackgroundUpload}
            className="hidden"
            data-testid="screen-background-upload"
          />

          {resolvedImage.source === "local" && (
            <>
              {localImageAsset && <div className="text-xs text-muted-foreground">Current: {localImageAsset.name}</div>}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-3 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Change Background
                </button>
                <button
                  onClick={() => onUpdateScreenBackground(undefined)}
                  className="px-3 py-2 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
                >
                  Remove
                </button>
              </div>
            </>
          )}

          {resolvedImage.source === "inherited" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  Inherited from Master
                </span>
              </div>
              {masterImageAsset && (
                <div className="text-xs text-muted-foreground">Current: {masterImageAsset.name}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-3 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Use own image instead
                </button>
                <button
                  onClick={() => onSetScreenBackgroundImageOverrideNone(true)}
                  className="px-3 py-2 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
                >
                  Remove
                </button>
              </div>
            </>
          )}

          {resolvedImage.source === "none" && (
            <>
              {currentScreen.backgroundImageOverrideNone && masterImageAsset && (
                <div className="text-xs text-muted-foreground">
                  No image on this screen - the master has one ({masterImageAsset.name}).{" "}
                  <button
                    onClick={() => onSetScreenBackgroundImageOverrideNone(false)}
                    className="underline hover:no-underline"
                  >
                    Use it instead
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 px-3 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Add Background
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
