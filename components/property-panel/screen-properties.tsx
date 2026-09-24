"use client"

/**
 * The screen itself: what it is called, what it inherits, and what it is
 * drawn on.
 *
 * Round 14 of the rebuild (docs/2026-09-20-property-panel.md), and the only
 * panel that is not about an object. It has no Frame - a screen is the size
 * the device is - and no Text, which leaves five positions filled.
 *
 * One block is deliberately not rebuilt. `ScreenEditorFields` (the name, the
 * icon, the master and whether it shows through) is shared with Project
 * Settings > Screens so that both behave identically - it carries its own
 * rename buffer and duplicate-name check - and it was made shared on purpose
 * in August. Forking it to gain a name column would put back exactly the
 * duplication this rebuild exists to remove, so it is wrapped rather than
 * replaced, the same way the colour, font and topic pickers are.
 */

import type React from "react"
import { useRef } from "react"
import { ScreenEditorFields } from "../screen-editor-fields"
import type { ProjectScreen, ProjectAsset, HardwareButton } from "../project-editor"
import { describeHardwareButtonAction } from "../project-editor"
import { resolveMasterScreen, resolveBackgroundColor, resolveBackgroundImage } from "@/lib/master-screen"
import { resolveButtonAction, BUTTON_STATUS_COLOR } from "@/lib/hardware-button-actions"
import { resolveColor, themeFor } from "@/lib/themes"
import {
  ButtonGroupRow,
  ColorField,
  FieldNote,
  PropertySection,
  PropertySections,
} from "./fields"

// Fixed, firmware-invented ids with no adornment SVG element to click on the
// canvas (see lib/device-description.ts) - this section is their only UI
// entry point, since the canvas's hit-testing cannot discover them.
const SWIPE_BUTTONS: HardwareButton[] = [
  { id: "swipe-left", name: "Swipe left" },
  { id: "swipe-right", name: "Swipe right" },
  { id: "swipe-up", name: "Swipe up" },
  { id: "swipe-down", name: "Swipe down" },
]

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
  supportsSoftwareButtons: boolean
  onConfigureSwipeButton: (button: HardwareButton) => void
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
  supportsSoftwareButtons,
  onConfigureSwipeButton,
}: ScreenPropertiesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const masterScreen = resolveMasterScreen(currentScreen, allScreens)
  // Until the role picker (Task 4 of tasks/todo.md) the colour picker shows
  // a hex, so the background's role is resolved for it here - light, in the
  // screen's theme. The project's own theme is not known to this panel yet.
  const rawColor = resolveBackgroundColor(currentScreen, masterScreen)
  const resolvedColor = {
    ...rawColor,
    color: resolveColor(rawColor.color, themeFor(undefined, currentScreen, masterScreen), "light", colorDepth),
  }
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
    onUpdateScreenColors(backgroundColor, calculateOptimalGridColor(backgroundColor))
  }

  // Clears only backgroundColor, leaving gridColor exactly as it was - the
  // grid colour deliberately does not inherit (2026-08-16), so switching the
  // background back to "inherit" must not touch it. updateScreenColors sets
  // both together, so gridColor has to be passed through explicitly.
  const handleInheritBackgroundColor = () => {
    onUpdateScreenColors(undefined, currentScreen.gridColor)
  }

  const localImageAsset = currentScreen.backgroundImageAssetId
    ? projectAssets.find((asset) => asset.id === currentScreen.backgroundImageAssetId)
    : null
  const masterImageAsset = masterScreen?.backgroundImageAssetId
    ? projectAssets.find((asset) => asset.id === masterScreen.backgroundImageAssetId)
    : null

  const chooseFile = () => fileInputRef.current?.click()

  return (
    <PropertySections>
      <PropertySection title="Screen">
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
      </PropertySection>

      {/* Swipe-left/right/up/down are fixed button ids with nothing on the
          canvas to click, so this is their only way in. Touch devices only,
          on the same signal the Button tool uses. */}
      {supportsSoftwareButtons ? (
        <PropertySection title="Swipe navigation">
          {SWIPE_BUTTONS.map((button) => {
            const resolved = resolveButtonAction(currentScreen, masterScreen, button.id)
            return (
              <ButtonGroupRow
                key={button.id}
                label={button.name}
                buttons={[
                  {
                    label: resolved.action ? describeHardwareButtonAction(resolved.action, allScreens) : "Unassigned",
                    // Named for the direction, not for what it does now -
                    // otherwise the accessible name changes every time the
                    // action does.
                    ariaLabel: button.name,
                    title: button.name,
                    onClick: () => onConfigureSwipeButton(button),
                    icon: (
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: BUTTON_STATUS_COLOR[resolved.source] }}
                      />
                    ),
                  },
                ]}
              />
            )
          })}
        </PropertySection>
      ) : null}

      <PropertySection title="Colour">
        {/* The background inherits from the assigned master; the grid colour
            stays local and is derived against whichever background is
            actually in effect. */}
        <ColorField
          label="Background"
          value={resolvedColor.color}
          onChange={handleBackgroundColorChange}
          colorDepth={colorDepth}
          allowTransparent={false}
          screens={allScreens}
          masterColor={masterScreen?.backgroundColor}
          isInherited={resolvedColor.source === "inherited"}
          onInherit={handleInheritBackgroundColor}
        />
        <ColorField
          label="Grid"
          value={currentScreen.gridColor || calculateOptimalGridColor(resolvedColor.color)}
          onChange={(gridColor) => onUpdateScreenColors(resolvedColor.color, gridColor)}
          colorDepth={colorDepth}
          allowTransparent={false}
          screens={allScreens}
          hint="The editor's own grid, not something the device draws. It follows the background unless you set it."
        />
      </PropertySection>

      {/* Three states, plus a fourth: a screen can say "no image here" even
          with a master that has one - a plain undefined cannot mean that,
          since it already means "not decided, so inherit". */}
      <PropertySection title="Background image">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleBackgroundUpload}
          className="hidden"
          data-testid="screen-background-upload"
        />

        {resolvedImage.source === "local" ? (
          <>
            <ButtonGroupRow
              label="Image"
              buttons={[
                { label: "Change", onClick: chooseFile },
                { label: "Remove", onClick: () => onUpdateScreenBackground(undefined) },
              ]}
            />
            {localImageAsset ? <FieldNote>{localImageAsset.name}</FieldNote> : null}
          </>
        ) : null}

        {resolvedImage.source === "inherited" ? (
          <>
            <ButtonGroupRow
              label="Image"
              buttons={[
                { label: "Use own image instead", onClick: chooseFile },
                { label: "Remove", onClick: () => onSetScreenBackgroundImageOverrideNone(true) },
              ]}
            />
            <FieldNote>
              From the master{masterImageAsset ? `: ${masterImageAsset.name}` : ""}.
            </FieldNote>
          </>
        ) : null}

        {resolvedImage.source === "none" ? (
          <>
            <ButtonGroupRow label="Image" buttons={[{ label: "Add Background", onClick: chooseFile }]} />
            {currentScreen.backgroundImageOverrideNone && masterImageAsset ? (
              <FieldNote>
                None on this screen, though the master has one ({masterImageAsset.name}).{" "}
                <button
                  type="button"
                  onClick={() => onSetScreenBackgroundImageOverrideNone(false)}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Use it instead
                </button>
              </FieldNote>
            ) : null}
          </>
        ) : null}
      </PropertySection>
    </PropertySections>
  )
}
