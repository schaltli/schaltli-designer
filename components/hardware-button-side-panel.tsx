"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import type { HardwareButton, HardwareButtonAction, ScreenmanScreen } from "./screenman-editor"

interface HardwareButtonSidePanelProps {
  isOpen: boolean
  onClose: () => void
  button: HardwareButton | null
  currentScreen: ScreenmanScreen
  allScreens: ScreenmanScreen[]
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

  const handleSave = () => {
    if (!button) return

    let action: HardwareButtonAction

    switch (actionType) {
      case "next-screen":
      case "previous-screen":
        action = { type: actionType }
        break
      case "goto-screen":
        action = { type: actionType, targetScreenId }
        break
      case "send-mqtt":
        action = { type: actionType, mqttTopic, mqttMessage }
        break
      default:
        return
    }

    onSaveScreenAction(button.id, action)
    onClose()
  }

  const handleUseDefault = () => {
    if (!button) return
    onSaveScreenAction(button.id, null) // null means use default action
    onClose()
  }

  const handleClear = () => {
    setActionType("next-screen")
    setTargetScreenId("")
    setMqttTopic("")
    setMqttMessage("")
  }

  const currentScreenAction = currentScreen.buttonActions?.[button?.id || ""]
  const hasDefaultAction = button?.defaultAction !== undefined
  const isUsingDefault = !currentScreenAction && hasDefaultAction

  if (!button) return null

  return (
    <div className={`fixed top-0 right-0 h-full w-80 bg-card border-l border-border shadow-lg transform transition-transform duration-200 z-50 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">Button Action</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            ×
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Button Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 border-2 border-primary bg-primary/10 flex items-center justify-center text-xs font-medium ${
                  button.shape === "round" ? "rounded-full" : "rounded"
                }`}
              >
                {button.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-medium">{button.name}</div>
                <div className="text-sm text-muted-foreground">
                  {button.shape} • {button.width}×{button.height}
                </div>
              </div>
            </div>
          </div>

          {/* Current Action Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Action</Label>
            <div className="flex items-center gap-2">
              {isUsingDefault ? (
                <>
                  <Badge variant="secondary">Using Default</Badge>
                  <span className="text-sm text-muted-foreground">
                    {button.defaultAction?.type || "No default action"}
                  </span>
                </>
              ) : currentScreenAction ? (
                <>
                  <Badge variant="default">Screen Override</Badge>
                  <span className="text-sm text-muted-foreground">
                    {currentScreenAction.type}
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="outline">No Action</Badge>
                  <span className="text-sm text-muted-foreground">
                    Button has no action
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Action Configuration */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Configure Action for "{currentScreen.name}"</Label>
            
            <div>
              <Label htmlFor="actionType" className="text-sm font-medium">
                Action Type
              </Label>
              <Select value={actionType} onValueChange={(value: HardwareButtonAction["type"]) => setActionType(value)}>
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
                <Select value={targetScreenId} onValueChange={setTargetScreenId}>
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
                    onChange={(e) => setMqttTopic(e.target.value)}
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
                    onChange={(e) => setMqttMessage(e.target.value)}
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

          {/* Default Action Info */}
          {hasDefaultAction && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Default Action</Label>
              <div className="p-3 bg-muted/50 rounded-md">
                <div className="text-sm">
                  <strong>{button.defaultAction?.type}</strong>
                  {button.defaultAction?.type === "goto-screen" && button.defaultAction.targetScreenId && (
                    <div className="text-muted-foreground">
                      Target: {allScreens.find(s => s.id === button.defaultAction?.targetScreenId)?.name}
                    </div>
                  )}
                  {button.defaultAction?.type === "send-mqtt" && button.defaultAction.mqttTopic && (
                    <div className="text-muted-foreground">
                      Topic: {button.defaultAction.mqttTopic}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              className="flex-1"
              disabled={
                (actionType === "goto-screen" && !targetScreenId) ||
                (actionType === "send-mqtt" && (!mqttTopic || !mqttMessage))
              }
            >
              Save Action
            </Button>
            <Button variant="outline" onClick={handleClear}>
              Clear
            </Button>
          </div>
          
          {hasDefaultAction && (
            <Button 
              variant="secondary" 
              onClick={handleUseDefault} 
              className="w-full"
              disabled={isUsingDefault}
            >
              Use Default Action
            </Button>
          )}
          
          <Button variant="outline" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
