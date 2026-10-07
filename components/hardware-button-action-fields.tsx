"use client"

/**
 * What one hardware button or swipe does on a screen: its list of actions and
 * whatever the chosen action needs below it - a screen, a popup, a control,
 * a topic and message.
 *
 * One row of the screen's own panel, which lists every button and swipe with
 * its list right there (the user, 2026-10-07: a button, then «Does», then the
 * action was a click too many, and the screen panel was gone after it). A
 * click on a button in the device's frame no longer opens a panel of its
 * own: it brings this row into view and puts the focus on its list.
 *
 * "Inherit" is a real choice in the same list rather than a separate
 * control, because to a person it is one question with one more answer.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { FieldNote, SelectField, TextField, TopicField } from "@/components/property-panel/fields"
import type { HardwareButton, HardwareButtonAction, ProjectScreen, Topic } from "./project-editor"
import { describeHardwareButtonAction } from "./project-editor"
import { BUTTON_STATUS_COLOR, resolveButtonAction, resolveMasterScreen } from "@/lib/hardware-button-actions"
import { describeDeviceAction } from "@/lib/device-actions"
import { isMainScreen, isPopup } from "@/lib/popup"
import { adjustTargetLabel, adjustTargets, suggestedDirection } from "@/lib/adjust-level"
import { cn } from "@/lib/utils"

export interface HardwareButtonActionFieldsProps {
  button: HardwareButton
  // The list's label: the button's name.
  label: string
  // Prefixed to every field's id, so a list of buttons has no two alike.
  idPrefix: string
  // Changes each time the button is clicked in the device's frame: the row
  // scrolls into view, its list takes the focus, and the row lights up.
  focusKey?: number
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
// (software-button-properties.tsx), and one it does not: a press - a detent
// of the Knob's ring - moving a slider or dial (lib/adjust-level.ts).
const CONCRETE_ACTION_TYPES: { value: HardwareButtonAction["type"]; label: string }[] = [
  { value: "next-screen", label: "Next screen" },
  { value: "previous-screen", label: "Previous screen" },
  { value: "goto-screen", label: "Go to a screen" },
  { value: "send-mqtt", label: "Send an MQTT message" },
  { value: "goto-setup-mode", label: "Enter setup mode" },
  { value: "adjust-level", label: "Adjust a slider or dial" },
  { value: "open-popup", label: "Open a popup" },
]

const DIRECTION_OPTIONS = [
  { value: "up", label: "One step up" },
  { value: "down", label: "One step down" },
]

// The fields of a local action, one set for every type; saveAction picks
// the ones its type uses.
interface ActionFields {
  targetScreenId: string
  mqttTopic: string
  mqttMessage: string
  deviceActionId: string
  targetObjectId: string
  direction: "up" | "down"
}

export function HardwareButtonActionFields({
  button,
  label,
  idPrefix,
  focusKey,
  currentScreen,
  allScreens,
  onSaveScreenAction,
  topics,
  onManageTopics,
  deviceActions,
}: HardwareButtonActionFieldsProps) {
  const masterScreen = resolveMasterScreen(currentScreen, allScreens)
  const resolved = resolveButtonAction(currentScreen, masterScreen, button.id)

  const [actionType, setActionType] = useState<DropdownValue>("none")
  const [targetScreenId, setTargetScreenId] = useState<string>("")
  const [mqttTopic, setMqttTopic] = useState<string>("")
  const [mqttMessage, setMqttMessage] = useState<string>("")
  const [deviceActionId, setDeviceActionId] = useState<string>("")
  const [targetObjectId, setTargetObjectId] = useState<string>("")
  const [direction, setDirection] = useState<"up" | "down">("up")
  const rowRef = useRef<HTMLDivElement>(null)
  const [lit, setLit] = useState(false)

  // A click on this button in the device's frame: here it is. The focus a
  // moment later - the click's own default focuses the canvas, after this
  // effect has run, and took the focus back.
  useEffect(() => {
    if (!focusKey) return
    const row = rowRef.current
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    const focus = setTimeout(() => row?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true }), 0)
    setLit(true)
    const off = setTimeout(() => setLit(false), 1500)
    return () => {
      clearTimeout(focus)
      clearTimeout(off)
    }
  }, [focusKey])

  // "Device Action" only exists for a device that declared any - see the
  // deviceActions prop.
  // «Close this popup» only where there is one to close (lib/popup.ts).
  const actionTypeOptions = [
    ...CONCRETE_ACTION_TYPES,
    ...(isPopup(currentScreen) ? [{ value: "close-popup" as const, label: "Close this popup" }] : []),
    ...(deviceActions.length ? [{ value: "device-action" as const, label: "Device Action" }] : []),
  ]
  // The popups a button here can open: any but the one it is on. A target
  // that is gone reads as none chosen; the button keeps its look and does
  // nothing (the export drops the action).
  const popups = allScreens.filter((screen) => isPopup(screen) && screen.id !== currentScreen.id)

  // Re-derive the form from the resolved action every time the selected
  // button or screen changes - mirrors HardwareButtonActionDialog's own
  // resync effect (2026-08-11 fix for the same class of bug: without this,
  // switching to a different button left the previous one's fields showing).
  useEffect(() => {
    if (resolved.source === "inherited") {
      setActionType("inherit")
    } else if (resolved.source === "local" && resolved.action) {
      setActionType(resolved.action.type)
      setTargetScreenId(resolved.action.targetScreenId || "")
      setMqttTopic(resolved.action.mqttTopic || "")
      setMqttMessage(resolved.action.mqttMessage || "")
      setDeviceActionId(resolved.action.deviceActionId || "")
      setTargetObjectId(resolved.action.targetObjectId || "")
      setDirection(resolved.action.direction ?? "up")
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
      setTargetObjectId("")
      setDirection(suggestedDirection(button.name))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [button.id, currentScreen.id, resolved.source, resolved.action?.type])

  const fields: ActionFields = { targetScreenId, mqttTopic, mqttMessage, deviceActionId, targetObjectId, direction }

  const saveAction = useCallback(
    (newActionType: DropdownValue, f: ActionFields) => {
      if (newActionType === "inherit") {
        onSaveScreenAction(button.id, null)
        return
      }

      let action: HardwareButtonAction
      switch (newActionType) {
        case "goto-screen":
        case "open-popup":
          action = { type: newActionType, targetScreenId: f.targetScreenId }
          break
        case "send-mqtt":
          action = { type: newActionType, mqttTopic: f.mqttTopic, mqttMessage: f.mqttMessage }
          break
        case "device-action":
          action = { type: newActionType, deviceActionId: f.deviceActionId }
          break
        case "adjust-level":
          action = { type: newActionType, targetObjectId: f.targetObjectId, direction: f.direction }
          break
        default:
          action = { type: newActionType }
      }
      onSaveScreenAction(button.id, action)
    },
    [button.id, onSaveScreenAction],
  )

  const targets = adjustTargets(currentScreen, allScreens)

  const handleActionTypeChange = (newActionType: DropdownValue) => {
    setActionType(newActionType)
    // Unlike goto-screen (where "which screen" is a real choice with no
    // sensible default), a device action is never useful unset - the device
    // declared its list, so picking the type picks the first entry too, and
    // the second dropdown is only there to change it.
    const nextDeviceActionId =
      newActionType === "device-action" ? deviceActionId || deviceActions[0] || "" : deviceActionId
    if (nextDeviceActionId !== deviceActionId) setDeviceActionId(nextDeviceActionId)
    // The same for a slider or dial: with only one on the screen, picking the
    // type picks it.
    const nextTargetObjectId =
      newActionType === "adjust-level" && !targetObjectId && targets.length === 1 ? targets[0].id : targetObjectId
    if (nextTargetObjectId !== targetObjectId) setTargetObjectId(nextTargetObjectId)
    saveAction(newActionType, { ...fields, deviceActionId: nextDeviceActionId, targetObjectId: nextTargetObjectId })
  }

  const handleTargetScreenChange = (newTargetScreenId: string) => {
    setTargetScreenId(newTargetScreenId)
    saveAction(actionType, { ...fields, targetScreenId: newTargetScreenId })
  }

  const handleMqttTopicChange = (newMqttTopic: string | undefined) => {
    setMqttTopic(newMqttTopic || "")
    saveAction(actionType, { ...fields, mqttTopic: newMqttTopic || "" })
  }

  const handleMqttMessageChange = (newMqttMessage: string) => {
    setMqttMessage(newMqttMessage)
    saveAction(actionType, { ...fields, mqttMessage: newMqttMessage })
  }

  const handleDeviceActionChange = (newDeviceActionId: string) => {
    setDeviceActionId(newDeviceActionId)
    saveAction(actionType, { ...fields, deviceActionId: newDeviceActionId })
  }

  const handleTargetObjectChange = (newTargetObjectId: string) => {
    setTargetObjectId(newTargetObjectId)
    saveAction(actionType, { ...fields, targetObjectId: newTargetObjectId })
  }

  const handleDirectionChange = (newDirection: string) => {
    const next = newDirection === "down" ? "down" : "up"
    setDirection(next)
    saveAction(actionType, { ...fields, direction: next })
  }

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

  const details = (
    <>
      {actionType === "goto-screen" ? (
        <SelectField
          id={`${idPrefix}targetScreen`}
          label="Screen"
          value={targetScreenId}
          placeholder="Select a screen"
          options={allScreens
            .filter((screen) => screen.id !== currentScreen.id && isMainScreen(screen))
            .map((screen) => ({ value: screen.id, label: screen.name }))}
          onChange={handleTargetScreenChange}
        />
      ) : null}

      {actionType === "open-popup" ? (
        <SelectField
          id={`${idPrefix}targetPopupId`}
          label="Popup"
          value={popups.some((p) => p.id === targetScreenId) ? targetScreenId : ""}
          placeholder="Select a popup..."
          options={popups.map((screen) => ({ value: screen.id, label: screen.name }))}
          onChange={handleTargetScreenChange}
        />
      ) : null}

      {/* Exactly the ids this device declared, in its own order. An id
          the designer has no label for is offered raw rather than hidden
          (describeDeviceAction) - a device that ships a new action must
          not have to wait for a designer release. */}
      {actionType === "device-action" ? (
        <SelectField
          id={`${idPrefix}deviceAction`}
          label="Device action"
          value={deviceActionId}
          placeholder="Select an action"
          options={deviceActions.map((id) => ({ value: id, label: describeDeviceAction(id) }))}
          onChange={handleDeviceActionChange}
        />
      ) : null}

      {/* Objects have no names; the picker names each by its type and
          topic (adjustTargetLabel). A target that is gone stays chosen,
          so the panel can say so - the export leaves the action out. */}
      {actionType === "adjust-level" ? (
        <>
          {targetObjectId && !targets.some((obj) => obj.id === targetObjectId) ? (
            <FieldNote>Target missing: the object was deleted. The button does nothing until you pick another.</FieldNote>
          ) : null}
          {targets.length === 0 ? (
            <FieldNote>This screen has no slider, dial or switcher to adjust.</FieldNote>
          ) : (
            <>
              <SelectField
                id={`${idPrefix}targetObject`}
                label="Control"
                value={targetObjectId}
                placeholder="Select a slider or dial"
                options={targets.map((obj) => ({ value: obj.id, label: adjustTargetLabel(obj) }))}
                onChange={handleTargetObjectChange}
                hint="A switcher: the slider or dial in the panel it shows."
              />
              <SelectField
                id={`${idPrefix}adjustDirection`}
                label="Direction"
                value={direction}
                options={DIRECTION_OPTIONS}
                onChange={handleDirectionChange}
              />
            </>
          )}
        </>
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
            id={`${idPrefix}mqttMessage`}
            label="Message"
            value={mqttMessage}
            onChange={handleMqttMessageChange}
            placeholder="e.g. button_pressed"
          />
        </>
      ) : null}
    </>
  )
  const hasDetails = ["goto-screen", "open-popup", "device-action", "adjust-level", "send-mqtt"].includes(actionType)

  return (
    <div
      ref={rowRef}
      data-button-row={button.id}
      className={cn(
        "-mx-1.5 flex flex-col gap-2 rounded-md px-1.5 transition-colors duration-500",
        lit && "bg-primary/15 ring-2 ring-primary/50",
      )}
    >
      <SelectField
        id={`${idPrefix}actionType`}
        label={label}
        value={actionType}
        options={options}
        onChange={(value) => handleActionTypeChange(value as DropdownValue)}
        // Where the action comes from: the screen's own, its master's, or
        // none - the dot the canvas's button outlines use too.
        leading={
          <span
            aria-hidden
            className="block size-2 rounded-full"
            style={{ backgroundColor: BUTTON_STATUS_COLOR[resolved.source] }}
          />
        }
      />
      {/* What the action needs sits under its button, set in. */}
      {hasDetails ? <div className="flex flex-col gap-2 border-l-2 border-border pl-3">{details}</div> : null}
    </div>
  )
}
