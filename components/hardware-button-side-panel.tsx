"use client"

import { useState, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ButtonIcon } from "@/components/icons/button-icon"
import { TopicSelector } from "@/components/property-panel/topic-selector"
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

const CONCRETE_ACTION_TYPES: { value: HardwareButtonAction["type"]; label: string }[] = [
  { value: "next-screen", label: "Next Screen" },
  { value: "previous-screen", label: "Previous Screen" },
  { value: "goto-screen", label: "Go to Screen" },
  { value: "send-mqtt", label: "Send MQTT Message" },
  { value: "goto-setup-mode", label: "Enter Setup Mode" },
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

  return (
    <div className="space-y-6">
      {/* Button Info - same icon as the toolbar's own hardware-button tool,
          then the button's display name, then its adornment SVG id (smaller,
          not bold) underneath - the id is what firmware actually keys off of
          (see docs/device-contract.md §5), so it stays visible alongside the
          friendlier name. */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 flex items-center justify-center shrink-0">
          <ButtonIcon className="w-6 h-6" />
        </div>
        <div>
          <div className="font-medium leading-tight">{button.name}</div>
          <div className="text-xs text-muted-foreground leading-tight">{button.id}</div>
        </div>
      </div>

      {/* Action Configuration */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="actionType" className="text-sm font-medium">
            Action Type
          </Label>
          <Select value={actionType} onValueChange={handleActionTypeChange}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolved.masterAction && (
                <SelectItem value="inherit">
                  Inherit from Master: {describeHardwareButtonAction(resolved.masterAction, allScreens)}
                </SelectItem>
              )}
              <SelectItem value="none">No Action</SelectItem>
              {actionTypeOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {actionType === "goto-screen" && (
          <div>
            <Label htmlFor="targetScreen" className="text-sm font-medium">
              Target Screen
            </Label>
            <Select value={targetScreenId} onValueChange={handleTargetScreenChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a screen" />
              </SelectTrigger>
              <SelectContent>
                {allScreens.filter((s) => s.id !== currentScreen.id && !s.isMaster).map((screen) => (
                  <SelectItem key={screen.id} value={screen.id}>
                    {screen.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {actionType === "device-action" && (
          <div>
            <Label htmlFor="deviceAction" className="text-sm font-medium">
              Device Action
            </Label>
            {/* Exactly the ids this device declared, in its own order. An id
                the designer has no label for is offered raw rather than
                hidden (describeDeviceAction) - a device that ships a new
                action must not have to wait for a designer release. */}
            <Select value={deviceActionId} onValueChange={handleDeviceActionChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select an action" />
              </SelectTrigger>
              <SelectContent>
                {deviceActions.map((id) => (
                  <SelectItem key={id} value={id}>
                    {describeDeviceAction(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {actionType === "send-mqtt" && (
          <>
            <TopicSelector
              selectedTopicId={mqttTopic}
              topics={topics}
              onTopicChange={handleMqttTopicChange}
              onManageTopics={onManageTopics}
              label="Write Topic"
              allowSubtopics={false}
              className="w-full"
            />
            <div>
              <Label htmlFor="mqttMessage" className="text-sm font-medium">
                Payload
              </Label>
              <Input
                id="mqttMessage"
                value={mqttMessage}
                onChange={(e) => handleMqttMessageChange(e.target.value)}
                placeholder="e.g., button_pressed"
                className="mt-1"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
