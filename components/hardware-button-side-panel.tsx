"use client"

import { useState, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ButtonIcon } from "@/components/icons/button-icon"
import { TopicSelector } from "@/components/property-panel/topic-selector"
import type { HardwareButton, HardwareButtonAction, ProjectScreen, Topic } from "./project-editor"
import { describeHardwareButtonAction } from "./project-editor"
import { resolveButtonAction, resolveMasterScreen } from "@/lib/hardware-button-actions"

interface HardwareButtonSidePanelProps {
  isOpen: boolean
  onClose: () => void
  button: HardwareButton | null
  currentScreen: ProjectScreen
  allScreens: ProjectScreen[]
  onSaveScreenAction: (buttonId: string, action: HardwareButtonAction | null) => void
  topics: Topic[]
  onManageTopics: () => void
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
}: HardwareButtonSidePanelProps) {
  const masterScreen = resolveMasterScreen(currentScreen, allScreens)
  const resolved = button ? resolveButtonAction(currentScreen, masterScreen, button.id) : null

  const [actionType, setActionType] = useState<DropdownValue>("none")
  const [targetScreenId, setTargetScreenId] = useState<string>("")
  const [mqttTopic, setMqttTopic] = useState<string>("")
  const [mqttMessage, setMqttMessage] = useState<string>("")

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [button?.id, currentScreen.id, resolved?.source, resolved?.action?.type])

  const saveAction = useCallback(
    (newActionType: DropdownValue, newTargetScreenId?: string, newMqttTopic?: string, newMqttMessage?: string) => {
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
        default:
          action = { type: newActionType }
      }
      onSaveScreenAction(button.id, action)
    },
    [button, onSaveScreenAction],
  )

  const handleActionTypeChange = (newActionType: DropdownValue) => {
    setActionType(newActionType)
    saveAction(newActionType, targetScreenId, mqttTopic, mqttMessage)
  }

  const handleTargetScreenChange = (newTargetScreenId: string) => {
    setTargetScreenId(newTargetScreenId)
    saveAction(actionType, newTargetScreenId, mqttTopic, mqttMessage)
  }

  const handleMqttTopicChange = (newMqttTopic: string | undefined) => {
    setMqttTopic(newMqttTopic || "")
    saveAction(actionType, targetScreenId, newMqttTopic, mqttMessage)
  }

  const handleMqttMessageChange = (newMqttMessage: string) => {
    setMqttMessage(newMqttMessage)
    saveAction(actionType, targetScreenId, mqttTopic, newMqttMessage)
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

      {/* Current Action Status */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Current Action</Label>
        {resolved.source === "inherited" && resolved.action ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Inherited from Master</Badge>
            <span className="text-sm text-muted-foreground">
              {describeHardwareButtonAction(resolved.action, allScreens)}
            </span>
          </div>
        ) : resolved.source === "local" && resolved.action ? (
          // Overriding a real inherited action is worth spelling out
          // explicitly (not just "Local Override" + the new action) -
          // otherwise it's easy to forget the master's own action even
          // exists once a screen overrides it (reported live, 2026-08-03,
          // about the project-wide default this replaced).
          <div className="space-y-1">
            <Badge variant="default">Local Override</Badge>
            {resolved.masterAction ? (
              <div className="text-sm">
                <span className="text-muted-foreground">Master Action: </span>
                <span>{describeHardwareButtonAction(resolved.masterAction, allScreens)}</span>
                <span className="text-muted-foreground"> — Overridden by: </span>
                <span className="font-medium">{describeHardwareButtonAction(resolved.action, allScreens)}</span>
              </div>
            ) : (
              <div className="text-sm">{describeHardwareButtonAction(resolved.action, allScreens)}</div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="outline">No Action</Badge>
            <span className="text-sm text-muted-foreground">Button does nothing on this screen</span>
          </div>
        )}
      </div>

      {/* Action Configuration */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">Configure Action for "{currentScreen.name}"</Label>

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
              {CONCRETE_ACTION_TYPES.map(({ value, label }) => (
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

        <div className="text-xs text-muted-foreground">
          {actionType === "inherit" && "Uses whatever this button does on the assigned master screen."}
          {actionType === "none" && "Button does nothing when pressed."}
          {actionType === "next-screen" && "Advances to the next screen in the project."}
          {actionType === "previous-screen" && "Goes back to the previous screen."}
          {actionType === "goto-screen" && "Jumps directly to the selected screen."}
          {actionType === "send-mqtt" && "Sends a message to the specified MQTT topic when pressed."}
          {actionType === "goto-setup-mode" && "Puts the device into WiFi setup mode when pressed."}
        </div>
      </div>
    </div>
  )
}
