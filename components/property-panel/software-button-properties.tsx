"use client"

/**
 * A button: something to press, and what happens when you do.
 *
 * Round 5 of the rebuild (docs/2026-09-20-property-panel.md), and the first
 * panel whose second position is Action rather than Data. It is the same
 * position all the same: what the object is wired to. A button is wired to a
 * thing that happens instead of to a value that arrives, and the rows the
 * action needs appear under it - a screen to go to, an id the device knows,
 * or a topic and a message.
 *
 * What is not here is deliberate. Material 3's three common buttons come out
 * of one colour: the tonal tint, the label's white-or-black and the pressed
 * state all follow from it and from the screen behind the button, so there
 * is no background, border, text or icon colour, no border width and no
 * corner radius to set (docs/2026-09-19-button-look.md).
 */

import { buttonColorOf, buttonStyleOf } from "@/components/canvas/renderers/render-software-button"
import { describeDeviceAction } from "@/lib/device-actions"
import type { ScreenObject, ProjectAsset, ProjectFont, HardwareButtonAction } from "../project-editor"
import {
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  IconField,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  frameSummary,
} from "./fields"

const STYLES = [
  { value: "filled", label: "Filled" },
  { value: "tonal", label: "Tonal" },
  { value: "outlined", label: "Outlined" },
] as const

interface SoftwareButtonPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  projectAssets: ProjectAsset[]
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector?: () => void
  onManageFonts?: () => void
  // Action ids the loaded device declared in its DDF - see
  // lib/device-actions.ts. Empty/undefined hides the "Device action" option
  // entirely, since there would be nothing to pick.
  deviceActions?: string[]
  allScreens?: Array<{
    id: string
    name: string
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
    isMaster?: boolean
  }>
}

export function SoftwareButtonProperties({
  selectedObject,
  onUpdateObject,
  projectAssets,
  fonts,
  colorDepth,
  onOpenIconSelector,
  onManageFonts,
  allScreens,
  deviceActions = [],
}: SoftwareButtonPropertiesProps) {
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

  const action = selectedObject.properties.action as HardwareButtonAction | undefined
  const updateAction = (next: HardwareButtonAction | null) => updateProperty("action", next)

  const ACTIONS = [
    { value: "next-screen", label: "Next screen" },
    { value: "previous-screen", label: "Previous screen" },
    { value: "goto-screen", label: "Go to a screen" },
    { value: "send-mqtt", label: "Send an MQTT message" },
    { value: "goto-setup-mode", label: "Enter setup mode" },
    ...(deviceActions.length > 0 ? [{ value: "device-action", label: "Device action" }] : []),
  ]

  const chooseAction = (type: HardwareButtonAction["type"]) => {
    if (type === "goto-screen") {
      updateAction({ type, targetScreenId: action?.targetScreenId || "" })
    } else if (type === "send-mqtt") {
      updateAction({ type, mqttTopic: action?.mqttTopic || "", mqttMessage: action?.mqttMessage || "" })
    } else if (type === "device-action") {
      // The same "never useful unset" default as the hardware-button panel's
      // own device-action branch.
      updateAction({ type, deviceActionId: action?.deviceActionId || deviceActions[0] || "" })
    } else {
      updateAction({ type })
    }
  }

  const screens = (allScreens ?? []).filter((screen) => !screen.isMaster)

  return (
    <PropertySections>
      <PropertySection title="Content">
        <TextField
          id="text"
          label="Text"
          value={selectedObject.properties.text}
          onChange={(value) => updateProperty("text", value)}
          placeholder="Button"
        />
        <IconField
          label="Icon"
          assetId={selectedObject.properties.iconAssetId}
          projectAssets={projectAssets}
          onSelect={onOpenIconSelector}
          onClear={() => updateProperty("iconAssetId", null)}
        />
      </PropertySection>

      <PropertySection title="Action">
        <SelectField
          id="actionType"
          label="Does"
          value={action?.type || "next-screen"}
          options={ACTIONS}
          onChange={(value) => chooseAction(value as HardwareButtonAction["type"])}
        />

        {action?.type === "goto-screen" ? (
          <SelectField
            id="targetScreenId"
            label="Screen"
            value={action.targetScreenId || ""}
            placeholder="Select screen..."
            options={screens.map((screen) => ({ value: screen.id, label: screen.name }))}
            onChange={(value) => updateAction({ ...action, targetScreenId: value })}
          />
        ) : null}

        {action?.type === "device-action" ? (
          /* The device's own declared ids, unknown ones offered raw - see
             describeDeviceAction. */
          <SelectField
            id="deviceActionId"
            label="Device action"
            value={action.deviceActionId || ""}
            options={deviceActions.map((id) => ({ value: id, label: describeDeviceAction(id) }))}
            onChange={(value) => updateAction({ ...action, deviceActionId: value })}
            hint="What the device itself does. The designer only names it; the firmware decides what it means."
          />
        ) : null}

        {action?.type === "send-mqtt" ? (
          <>
            <TextField
              id="mqttTopic"
              label="Topic"
              value={action.mqttTopic}
              onChange={(value) => updateAction({ ...action, mqttTopic: value })}
              placeholder="e.g. home/button/click"
            />
            <TextField
              id="mqttMessage"
              label="Message"
              value={action.mqttMessage}
              onChange={(value) => updateAction({ ...action, mqttMessage: value })}
              placeholder="e.g. ON"
            />
          </>
        ) : null}

        {action?.type === "goto-setup-mode" ? (
          <FieldNote>Puts the device into its own setup screen, where the WiFi and broker are entered.</FieldNote>
        ) : null}
      </PropertySection>

      <PropertySection title="Shape">
        <SelectField
          id="buttonStyle"
          label="Style"
          value={buttonStyleOf(selectedObject)}
          options={STYLES}
          onChange={(value) => updateProperty("buttonStyle", value)}
        />
      </PropertySection>

      <PropertySection title="Text">
        <FontField
          value={selectedObject.properties.fontId}
          fonts={fonts}
          onChange={(value) => updateProperty("fontId", value)}
          onManageFonts={onManageFonts}
        />
      </PropertySection>

      <PropertySection title="Colour">
        <ColorField
          label="Button"
          value={buttonColorOf(selectedObject, colorDepth)}
          onChange={(value) => updateProperty("buttonColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
          screens={allScreens}
          hint="The one colour a button has. The tint, the label's white-or-black and the pressed state are all worked out from it and from the screen behind it."
        />
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}
      >
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={updatePosition}
        />
      </PropertySection>
    </PropertySections>
  )
}
