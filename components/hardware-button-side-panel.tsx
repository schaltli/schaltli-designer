"use client"

/**
 * A hardware button: the one thing in the panel that is not on the screen.
 *
 * Round 16 of the rebuild (docs/2026-09-20-property-panel.md) and the last
 * of the nineteen. It is the Button's Action section without the button -
 * the same rows, the same order, the same names - which is the whole point:
 * a person who has set up a software button already knows this panel.
 *
 * What it has that the software button does not is the inherited state. A
 * screen can take its buttons from its master, and "Inherit" is a real
 * choice in the same list rather than a separate control, because to a
 * person it is one question with one more answer.
 */

import { useState, useEffect, useCallback } from "react"
import { ButtonIcon } from "@/components/icons/button-icon"
import {
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  TopicField,
} from "@/components/property-panel/fields"
import type { HardwareButton, HardwareButtonAction, ProjectScreen, Topic } from "./project-editor"
import { describeHardwareButtonAction } from "./project-editor"
import { resolveButtonAction, resolveMasterScreen } from "@/lib/hardware-button-actions"
import { describeDeviceAction } from "@/lib/device-actions"

interface HardwareButtonSidePanelProps {
  isOpen: boolean
  onClose: () => void
  button: HardwareButton | null
  currentScreen: ProjectScreen
  allScreens: ProjectScreen[]
  onSaveScreenAction: (buttonId: string, action: HardwareButtonAction | null) => void
  topics: Topic[]
  onManageTopics: () => void
  // Action ids the loaded device declared in its DDF (ProjectSettings
  // .deviceActions). Empty for every device that offers none, which is why
  // the "Device Action" type below is conditional rather than always shown:
  // an action type with nothing to pick would be a dead end.
  deviceActions: string[]
}

// The dropdown's own value space is one wider than HardwareButtonAction["type"]:
// "inherit" is a pure UI state (clear the local override, fall back to the
// assigned master - see lib/hardware-button-actions.ts) that never gets
// written to screen.buttonActions itself. It's passed to onSaveScreenAction
// as `null`, exactly like the old "Use Default Action" button did.
type DropdownValue = HardwareButtonAction["type"] | "inherit"

// The same five the software button offers, in the same words
// (software-button-properties.tsx).
const CONCRETE_ACTION_TYPES: { value: HardwareButtonAction["type"]; label: string }[] = [
  { value: "next-screen", label: "Next screen" },
  { value: "previous-screen", label: "Previous screen" },
  { value: "goto-screen", label: "Go to a screen" },
  { value: "send-mqtt", label: "Send an MQTT message" },
  { value: "goto-setup-mode", label: "Enter setup mode" },
]

export function HardwareButtonSidePanel({
  isOpen,
  onClose,
  button,
  currentScreen,
  allScreens,
  onSaveScreenAction,
  topics,
  onManageTopics,
  deviceActions,
}: HardwareButtonSidePanelProps) {
  const masterScreen = resolveMasterScreen(currentScreen, allScreens)
  const resolved = button ? resolveButtonAction(currentScreen, masterScreen, button.id) : null

  const [actionType, setActionType] = useState<DropdownValue>("none")
  const [targetScreenId, setTargetScreenId] = useState<string>("")
  const [mqttTopic, setMqttTopic] = useState<string>("")
  const [mqttMessage, setMqttMessage] = useState<string>("")
  const [deviceActionId, setDeviceActionId] = useState<string>("")

  // "Device Action" only exists for a device that declared any - see the
  // deviceActions prop.
  const actionTypeOptions = deviceActions.length
    ? [...CONCRETE_ACTION_TYPES, { value: "device-action" as const, label: "Device Action" }]
    : CONCRETE_ACTION_TYPES

  // Re-derive the form from the resolved action every time the selected
  // button or screen changes - mirrors HardwareButtonActionDialog's own
  // resync effect (2026-08-11 fix for the same class of bug: without this,
  // switching to a different button left the previous one's fields showing).
  useEffect(() => {
    if (!resolved) return
    if (resolved.source === "inherited") {
      setActionType("inherit")
    } else if (resolved.source === "local" && resolved.action) {
      setActionType(resolved.action.type)
      setTargetScreenId(resolved.action.targetScreenId || "")
      setMqttTopic(resolved.action.mqttTopic || "")
      setMqttMessage(resolved.action.mqttMessage || "")
      setDeviceActionId(resolved.action.deviceActionId || "")
    } else {
      setActionType("none")
    }
    // Local override sub-fields only matter for the "local" branch above;
    // reset them going into "inherit"/"none" so a stale value isn't lurking
    // if the user picks a concrete type fresh from either state.
    if (resolved.source !== "local") {
      setTargetScreenId("")
      setMqttTopic("")
      setMqttMessage("")
      setDeviceActionId("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [button?.id, currentScreen.id, resolved?.source, resolved?.action?.type])

  const saveAction = useCallback(
    (
      newActionType: DropdownValue,
      newTargetScreenId?: string,
      newMqttTopic?: string,
      newMqttMessage?: string,
      newDeviceActionId?: string,
    ) => {
      if (!button) return

      if (newActionType === "inherit") {
        onSaveScreenAction(button.id, null)
        return
      }

      let action: HardwareButtonAction
      switch (newActionType) {
        case "goto-screen":
          action = { type: newActionType, targetScreenId: newTargetScreenId || "" }
          break
        case "send-mqtt":
          action = { type: newActionType, mqttTopic: newMqttTopic || "", mqttMessage: newMqttMessage || "" }
          break
        case "device-action":
          action = { type: newActionType, deviceActionId: newDeviceActionId || "" }
          break
        default:
          action = { type: newActionType }
      }
      onSaveScreenAction(button.id, action)
    },
    [button, onSaveScreenAction],
  )

  const handleActionTypeChange = (newActionType: DropdownValue) => {
    setActionType(newActionType)
    // Unlike goto-screen (where "which screen" is a real choice with no
    // sensible default), a device action is never useful unset - the device
    // declared its list, so picking the type picks the first entry too, and
    // the second dropdown is only there to change it.
    const nextDeviceActionId =
      newActionType === "device-action" ? deviceActionId || deviceActions[0] || "" : deviceActionId
    if (nextDeviceActionId !== deviceActionId) setDeviceActionId(nextDeviceActionId)
    saveAction(newActionType, targetScreenId, mqttTopic, mqttMessage, nextDeviceActionId)
  }

  const handleTargetScreenChange = (newTargetScreenId: string) => {
    setTargetScreenId(newTargetScreenId)
    saveAction(actionType, newTargetScreenId, mqttTopic, mqttMessage, deviceActionId)
  }

  const handleMqttTopicChange = (newMqttTopic: string | undefined) => {
    setMqttTopic(newMqttTopic || "")
    saveAction(actionType, targetScreenId, newMqttTopic, mqttMessage, deviceActionId)
  }

  const handleMqttMessageChange = (newMqttMessage: string) => {
    setMqttMessage(newMqttMessage)
    saveAction(actionType, targetScreenId, mqttTopic, newMqttMessage, deviceActionId)
  }

  const handleDeviceActionChange = (newDeviceActionId: string) => {
    setDeviceActionId(newDeviceActionId)
    saveAction(actionType, targetScreenId, mqttTopic, mqttMessage, newDeviceActionId)
  }

  if (!button || !resolved) return null

  const options = [
    // Only where there is something to inherit. It says what would be
    // inherited, because "Inherit" alone answers the wrong question.
    ...(resolved.masterAction
      ? [
          {
            value: "inherit",
            label: `Inherit: ${describeHardwareButtonAction(resolved.masterAction, allScreens)}`,
          },
        ]
      : []),
    { value: "none", label: "Nothing" },
    ...actionTypeOptions,
  ]

  return (
    <div className="space-y-4">
      {/* The same header line every other panel has: what this is, and the
          id underneath. The id is what the firmware keys off
          (docs/device-contract.md SS5), so it stays visible beside the
          friendlier name. */}
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center">
          <ButtonIcon className="size-6" />
        </div>
        <div>
          <div className="text-sm font-medium leading-tight">{button.name}</div>
          <div className="text-xs leading-tight text-muted-foreground">{button.id}</div>
        </div>
      </div>

      <PropertySections>
        <PropertySection title="Action">
          <SelectField
            id="actionType"
            label="Does"
            value={actionType}
            options={options}
            onChange={(value) => handleActionTypeChange(value as DropdownValue)}
          />

          {actionType === "goto-screen" ? (
            <SelectField
              id="targetScreen"
              label="Screen"
              value={targetScreenId}
              placeholder="Select a screen"
              options={allScreens
                .filter((screen) => screen.id !== currentScreen.id && !screen.isMaster)
                .map((screen) => ({ value: screen.id, label: screen.name }))}
              onChange={handleTargetScreenChange}
            />
          ) : null}

          {/* Exactly the ids this device declared, in its own order. An id
              the designer has no label for is offered raw rather than hidden
              (describeDeviceAction) - a device that ships a new action must
              not have to wait for a designer release. */}
          {actionType === "device-action" ? (
            <SelectField
              id="deviceAction"
              label="Device action"
              value={deviceActionId}
              placeholder="Select an action"
              options={deviceActions.map((id) => ({ value: id, label: describeDeviceAction(id) }))}
              onChange={handleDeviceActionChange}
            />
          ) : null}

          {actionType === "send-mqtt" ? (
            <>
              <TopicField
                label="Topic"
                selectedTopicId={mqttTopic}
                topics={topics}
                onTopicChange={handleMqttTopicChange}
                onManageTopics={onManageTopics}
                allowSubtopics={false}
              />
              <TextField
                id="mqttMessage"
                label="Message"
                value={mqttMessage}
                onChange={handleMqttMessageChange}
                placeholder="e.g. button_pressed"
              />
            </>
          ) : null}
        </PropertySection>
      </PropertySections>
    </div>
  )
}
