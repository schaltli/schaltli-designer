"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ButtonIcon } from "@/components/icons/button-icon"
import type { HardwareButton, HardwareButtonAction, ProjectScreen } from "./project-editor"
import { describeHardwareButtonAction } from "./project-editor"

interface HardwareButtonSidePanelProps {
  isOpen: boolean
  onClose: () => void
  button: HardwareButton | null
  currentScreen: ProjectScreen
  allScreens: ProjectScreen[]
  onSaveScreenAction: (buttonId: string, action: HardwareButtonAction | null) => void
}

export function HardwareButtonSidePanel({
  isOpen,
  onClose,
  button,
  currentScreen,
  allScreens,
  onSaveScreenAction,
}: HardwareButtonSidePanelProps) {
  const [actionType, setActionType] = useState<HardwareButtonAction["type"]>("next-screen")
  const [targetScreenId, setTargetScreenId] = useState<string>("")
  const [mqttTopic, setMqttTopic] = useState<string>("")
  const [mqttMessage, setMqttMessage] = useState<string>("")

  // Initialize form with current screen action or default action
  useEffect(() => {
    if (!button) return

    const screenAction = currentScreen.buttonActions?.[button.id]
    const action = screenAction || button.defaultAction

    if (action) {
      setActionType(action.type)
      setTargetScreenId(action.targetScreenId || "")
      setMqttTopic(action.mqttTopic || "")
      setMqttMessage(action.mqttMessage || "")
    } else {
      // Reset to defaults
      setActionType("next-screen")
      setTargetScreenId("")
      setMqttTopic("")
      setMqttMessage("")
    }
  }, [button, currentScreen])

  // Auto-save when form values change
  const saveAction = useCallback((newActionType: HardwareButtonAction["type"], newTargetScreenId?: string, newMqttTopic?: string, newMqttMessage?: string) => {
    if (!button) return

    let action: HardwareButtonAction | null

    switch (newActionType) {
      case "next-screen":
      case "previous-screen":
        action = { type: newActionType }
        break
      case "goto-screen":
        action = { type: newActionType, targetScreenId: newTargetScreenId || "" }
        break
      case "send-mqtt":
        action = { type: newActionType, mqttTopic: newMqttTopic || "", mqttMessage: newMqttMessage || "" }
        break
      default:
        return
    }

    onSaveScreenAction(button.id, action)
  }, [button, onSaveScreenAction])

  const handleActionTypeChange = (newActionType: HardwareButtonAction["type"]) => {
    setActionType(newActionType)
    saveAction(newActionType, targetScreenId, mqttTopic, mqttMessage)
  }

  const handleTargetScreenChange = (newTargetScreenId: string) => {
    setTargetScreenId(newTargetScreenId)
    saveAction(actionType, newTargetScreenId, mqttTopic, mqttMessage)
  }

  const handleMqttTopicChange = (newMqttTopic: string) => {
    setMqttTopic(newMqttTopic)
    saveAction(actionType, targetScreenId, newMqttTopic, mqttMessage)
  }

  const handleMqttMessageChange = (newMqttMessage: string) => {
    setMqttMessage(newMqttMessage)
    saveAction(actionType, targetScreenId, mqttTopic, newMqttMessage)
  }

  const handleUseDefault = () => {
    if (!button) return
    onSaveScreenAction(button.id, null) // null means use default action
  }

  const currentScreenAction = currentScreen.buttonActions?.[button?.id || ""]
  const hasDefaultAction = button?.defaultAction !== undefined
  const isUsingDefault = !currentScreenAction && hasDefaultAction

  if (!button) return null

  return (
    <div className="space-y-6">
          {/* Button Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 flex items-center justify-center">
                <ButtonIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="font-medium">{button.name}</div>
                <div className="text-sm text-muted-foreground">
                  {button.width}×{button.height}
                </div>
              </div>
            </div>
          </div>

          {/* Current Action Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Action</Label>
            {isUsingDefault ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Using Default</Badge>
                <span className="text-sm text-muted-foreground">
                  {button.defaultAction ? describeHardwareButtonAction(button.defaultAction, allScreens) : "No default action"}
                </span>
              </div>
            ) : currentScreenAction ? (
              // Overriding a real default is worth spelling out explicitly
              // (not just "Screen Override" + the new action) - otherwise
              // it's easy to forget a default even exists once a screen
              // overrides it (reported live, 2026-08-03).
              <div className="space-y-1">
                <Badge variant="default">Screen Override</Badge>
                <div className="text-sm">
                  <span className="text-muted-foreground">Default Action: </span>
                  <span>{button.defaultAction ? describeHardwareButtonAction(button.defaultAction, allScreens) : "None"}</span>
                  <span className="text-muted-foreground"> — Overridden by: </span>
                  <span className="font-medium">{describeHardwareButtonAction(currentScreenAction, allScreens)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline">No Action</Badge>
                <span className="text-sm text-muted-foreground">Button has no action</span>
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
                  <SelectItem value="next-screen">Next Screen</SelectItem>
                  <SelectItem value="previous-screen">Previous Screen</SelectItem>
                  <SelectItem value="goto-screen">Go to Screen</SelectItem>
                  <SelectItem value="send-mqtt">Send MQTT Message</SelectItem>
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
                    {allScreens.filter(s => s.id !== currentScreen.id).map((screen) => (
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
                <div>
                  <Label htmlFor="mqttTopic" className="text-sm font-medium">
                    MQTT Topic
                  </Label>
                  <Input
                    id="mqttTopic"
                    value={mqttTopic}
                    onChange={(e) => handleMqttTopicChange(e.target.value)}
                    placeholder="e.g., device/button/click"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mqttMessage" className="text-sm font-medium">
                    MQTT Message
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
              {actionType === "next-screen" && "Advances to the next screen in the project."}
              {actionType === "previous-screen" && "Goes back to the previous screen."}
              {actionType === "goto-screen" && "Jumps directly to the selected screen."}
              {actionType === "send-mqtt" && "Sends a message to the specified MQTT topic when pressed."}
            </div>
          </div>

          {/* Already shown above (with what it's overridden by, if
              applicable) in "Current Action Status" - this button just
              lets you drop the override and go back to it. */}
          {hasDefaultAction && (
            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={handleUseDefault}
                className="w-full"
                disabled={isUsingDefault}
              >
                Use Default Action
              </Button>
            </div>
          )}
        </div>
  )
}
