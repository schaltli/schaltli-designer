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
import type { ProjectScreen, ProjectAsset, HardwareButton, HardwareButtonAction, Topic } from "../project-editor"
import { HardwareButtonActionFields } from "../hardware-button-action-fields"
import { resolveMasterScreen, resolveBackgroundColor } from "@/lib/master-screen"
import { themeById, themeMaster } from "@/lib/themes"
import { typographyFor } from "@/lib/size-scale"
import type { Typography } from "@/lib/device-description"
import { isPopup, type ScreenType } from "@/lib/popup"
import type { IconTarget } from "./live-value-editor"
import type { CombinedTopic } from "@/lib/combined-topics"
import {
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
const SWIPE_PREFIX = "swipe-"
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
  onPatchScreen: (patch: Partial<ProjectScreen>) => void
  onSetScreenType: (type: ScreenType) => void
  onOpenScreenIconSelector: () => void
  // A result of the live screen icon (rule index, Otherwise, No value yet).
  onOpenScreenLiveIconSelector: (target: IconTarget) => void
  combinedTopics?: CombinedTopic[]
  onClearScreenIcon: () => void
  supportsSoftwareButtons: boolean
  // The device's buttons, the swipes among them (ProjectSettings via the
  // DDF), and what each does here - set right in this panel.
  hardwareButtons: HardwareButton[]
  onSaveScreenButtonAction: (buttonId: string, action: HardwareButtonAction | null) => void
  topics: Topic[]
  onManageTopics: () => void
  deviceActions: string[]
  // The button last clicked in the device's frame, and a key that changes
  // with every click: its row is brought into view and focused.
  focusedButton?: { id: string; key: number } | null
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
  onPatchScreen,
  onSetScreenType,
  onOpenScreenIconSelector,
  onOpenScreenLiveIconSelector,
  combinedTopics,
  onClearScreenIcon,
  supportsSoftwareButtons,
  hardwareButtons,
  onSaveScreenButtonAction,
  topics,
  onManageTopics,
  deviceActions,
  focusedButton,
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

  // The buttons on the device itself; the swipes have their own section.
  const deviceButtons = hardwareButtons.filter((button) => !button.id.startsWith(SWIPE_PREFIX))
  const focusKeyOf = (buttonId: string) => (focusedButton?.id === buttonId ? focusedButton.key : undefined)
  const focusedHere = deviceButtons.some((button) => button.id === focusedButton?.id)
  // What every row needs. Each row's ids start with its button's, so no two
  // fields in the list share one.
  const actionProps = {
    currentScreen,
    allScreens,
    onSaveScreenAction: onSaveScreenButtonAction,
    topics,
    onManageTopics,
    deviceActions,
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
          onPatch={onPatchScreen}
          topics={topics}
          combinedTopics={combinedTopics}
          onPickLiveIcon={onOpenScreenLiveIconSelector}
          onSetScreenType={onSetScreenType}
          onOpenIconSelector={onOpenScreenIconSelector}
          onClearIcon={onClearScreenIcon}
        />
      </PropertySection>

      {/* Every button and swipe with what it does, chosen right here: a
          button in the adornment, then «Does», then the action was a click
          too many, and this panel was gone after it (the user, 2026-10-07).
          A click on a button in the adornment comes here too, to its row. */}
      {deviceButtons.length > 0 ? (
        <PropertySection title="Hardware buttons" openKey={focusedHere ? focusedButton?.key : undefined}>
          {deviceButtons.map((button) => (
            <HardwareButtonActionFields
              key={button.id}
              button={button}
              label={button.name}
              idPrefix={`${button.id}-`}
              focusKey={focusKeyOf(button.id)}
              {...actionProps}
            />
          ))}
        </PropertySection>
      ) : null}

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
          {SWIPE_BUTTONS.map((button) => (
            <HardwareButtonActionFields key={button.id} button={button} label={button.name} idPrefix={`${button.id}-`} {...actionProps} />
          ))}
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
