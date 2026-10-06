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
import { ScreenEditorFields } from "../screen-editor-fields"
import type { ProjectScreen, ProjectAsset, HardwareButton } from "../project-editor"
import { describeHardwareButtonAction } from "../project-editor"
import { resolveMasterScreen, resolveBackgroundColor } from "@/lib/master-screen"
import { resolveButtonAction, BUTTON_STATUS_COLOR } from "@/lib/hardware-button-actions"
import { themeById, themeMaster } from "@/lib/themes"
import { typographyFor } from "@/lib/size-scale"
import type { Typography } from "@/lib/device-description"
import { isPopup, type ScreenType } from "@/lib/popup"
import {
  ButtonGroupRow,
  ColorField,
  PropertySection,
  PropertySections,
  SelectField,
  ThemeField,
} from "./fields"

// The typography select's "inherit" entry; no typography is named this.
const INHERIT_TYPOGRAPHY = "__inherit__"

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
  // Both optional despite always being called together, to match the real
  // underlying setter (project-editor.tsx's updateScreenColors) - clearing
  // backgroundColor back to "inherit" needs to send undefined through, not
  // a placeholder string.
  onUpdateScreenColors: (backgroundColor: string | undefined, gridColor: string | undefined) => void
  // The screen's theme, or undefined to inherit (its master's, else the
  // project's - lib/themes.ts themeFor). A master always has one.
  onSetScreenTheme: (themeId: string | undefined) => void
  // The device's typographies (docs/2026-09-30-size-scale.md); a choice only
  // with more than one.
  typographies?: Typography[]
  // The screen's typography, or undefined to inherit its master's
  // (lib/size-scale.ts typographyNameOf).
  onSetScreenTypography: (typography: string | undefined) => void
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  allScreens: ProjectScreen[]
  onRenameScreen: (name: string) => void
  onSetScreenMaster: (masterScreenId: string | undefined) => void
  onSetScreenShowMaster: (showMaster: boolean) => void
  onSetScreenType: (type: ScreenType) => void
  onOpenScreenIconSelector: () => void
  onClearScreenIcon: () => void
  supportsSoftwareButtons: boolean
  onConfigureSwipeButton: (button: HardwareButton) => void
}

export function ScreenProperties({
  currentScreen,
  onUpdateScreenColors,
  onSetScreenTheme,
  typographies,
  onSetScreenTypography,
  projectAssets,
  colorDepth,
  allScreens,
  onRenameScreen,
  onSetScreenMaster,
  onSetScreenShowMaster,
  onSetScreenType,
  onOpenScreenIconSelector,
  onClearScreenIcon,
  supportsSoftwareButtons,
  onConfigureSwipeButton,
}: ScreenPropertiesProps) {
  const masterScreen = resolveMasterScreen(currentScreen, allScreens)
  const resolvedColor = resolveBackgroundColor(currentScreen, masterScreen)
  // What inheriting gives: the assigned master's theme, even with "Show
  // master" off - that hides the master's objects, not its theme.
  const inheritedTheme = themeById(themeMaster(currentScreen, allScreens)?.themeId)
  // The typography the same way; a screen without a master, and a master,
  // stand on "Standard" until they pick one.
  const typographyMaster = themeMaster(currentScreen, allScreens)
  const inheritedTypography = typographyMaster ? typographyFor(typographies, typographyMaster.typography) : undefined

  // The grid is the editor's own and follows the background (canvas.tsx
  // derives it); since themes it has no setting of its own.
  const handleBackgroundColorChange = (backgroundColor: string) => {
    onUpdateScreenColors(backgroundColor, undefined)
  }

  const handleInheritBackgroundColor = () => {
    onUpdateScreenColors(undefined, undefined)
  }


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
          onSetScreenType={onSetScreenType}
          onOpenIconSelector={onOpenScreenIconSelector}
          onClearIcon={onClearScreenIcon}
        />
      </PropertySection>

      {/* Swipe-left/right/up/down are fixed button ids with nothing on the
          canvas to click, so this is their only way in. Touch devices only,
          on the same signal the Button tool uses. */}
      {supportsSoftwareButtons && isPopup(currentScreen) ? (
        <PropertySection title="Swipe navigation">
          {/* On a popup every swipe closes it (lib/popup.ts); there is nothing to set. */}
          <p className="text-xs text-muted-foreground">A swipe closes a popup.</p>
        </PropertySection>
      ) : supportsSoftwareButtons ? (
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

      <PropertySection title="Look">
        {/* The theme first: every colour below is a role of it. A master
            always has a theme of its own; every other screen has a master
            and inherits its theme unless it picks one (user, 2026-09-25). */}
        <ThemeField
          value={currentScreen.themeId}
          onChange={onSetScreenTheme}
          colorDepth={colorDepth}
          inherited={currentScreen.isMaster ? undefined : inheritedTheme}
        />
        {/* Beside the theme, inherited the same way: the two are the
            screen's look (user, 2026-09-30). Only where the device offers
            more than one. */}
        {typographies && typographies.length > 1 && (
          <SelectField
            id="typography"
            label="Typography"
            value={
              currentScreen.typography ??
              (inheritedTypography ? INHERIT_TYPOGRAPHY : typographyFor(typographies, undefined)?.name)
            }
            options={[
              ...(inheritedTypography
                ? [{ value: INHERIT_TYPOGRAPHY, label: `Inherit from Master (${inheritedTypography.name})` }]
                : []),
              ...typographies.map((t) => ({ value: t.name, label: t.name })),
            ]}
            onChange={(value) => onSetScreenTypography(value === INHERIT_TYPOGRAPHY ? undefined : value)}
          />
        )}
        {/* The background inherits from the assigned master, like the theme;
            the editor's grid follows it. */}
        <ColorField
          label="Background"
          value={resolvedColor.color}
          onChange={handleBackgroundColorChange}
          colorDepth={colorDepth}
          allowTransparent={false}
          masterRole={masterScreen?.backgroundColor ?? (masterScreen ? "surface" : undefined)}
          isInherited={resolvedColor.source === "inherited"}
          onInherit={handleInheritBackgroundColor}
        />
      </PropertySection>

    </PropertySections>
  )
}
