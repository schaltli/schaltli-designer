"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { HardwareButton, HardwareButtonAction, ProjectScreen } from "./project-editor"

// "none" is a real, selectable choice here (not just the absence of a
// selection) - a button with no default action does nothing unless a
// screen overrides it (components/hardware-button-side-panel.tsx). Kept
// as a separate local type rather than added to HardwareButtonAction
// itself, since "none" isn't a real action a screen override or the
// firmware ever needs to represent - only this picker's own UI state.
type ActionTypeChoice = HardwareButtonAction["type"] | "none"

interface HardwareButtonActionDialogProps {
  isOpen: boolean
  onClose: () => void
  button: HardwareButton | null
  screens: ProjectScreen[]
  onSaveAction: (buttonId: string, action: HardwareButtonAction | null) => void
}

export function HardwareButtonActionDialog({
  isOpen,
  onClose,
  button,
  screens,
  onSaveAction,
}: HardwareButtonActionDialogProps) {
  const [actionType, setActionType] = useState<ActionTypeChoice>(button?.defaultAction?.type ?? "none")
  const [targetScreenId, setTargetScreenId] = useState<string>(button?.defaultAction?.targetScreenId || "")
  const [mqttTopic, setMqttTopic] = useState<string>(button?.defaultAction?.mqttTopic || "")
  const [mqttMessage, setMqttMessage] = useState<string>(button?.defaultAction?.mqttMessage || "")

  const handleSave = () => {
    if (!button) return

    if (actionType === "none") {
      onSaveAction(button.id, null)
      onClose()
      return
    }

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

    onSaveAction(button.id, action)
    onClose()
  }

  const handleClose = () => {
    // Reset form when closing
    setActionType("none")
    setTargetScreenId("")
    setMqttTopic("")
    setMqttMessage("")
    onClose()
  }

  if (!button) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Default Action for "{button.name}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="actionType" className="text-sm font-medium">
              Action Type
            </Label>
            <Select value={actionType} onValueChange={(value: ActionTypeChoice) => setActionType(value)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
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
                  {screens
                    .filter((screen) => !screen.isMaster)
                    .map((screen) => (
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
            {actionType === "none" && "This button does nothing by default - a screen can still override it individually."}
            {actionType === "next-screen" && "Advances to the next screen in the project."}
            {actionType === "previous-screen" && "Goes back to the previous screen."}
            {actionType === "goto-screen" && "Jumps directly to the selected screen."}
            {actionType === "send-mqtt" && "Sends a message to the specified MQTT topic when pressed."}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              (actionType === "goto-screen" && !targetScreenId) ||
              (actionType === "send-mqtt" && (!mqttTopic || !mqttMessage))
            }
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
