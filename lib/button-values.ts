// A message sent with values, only when, then clearing (tasks/ha-alarm-plan.md,
// decision 4): what «Send an MQTT message» does since the alarm panel - a
// code typed in a text field put into the command, sent only where it
// matches, and not left standing in the field.
//
// Three optional parts of a send-mqtt action, general rather than the
// alarm's:
// - `mqttMessage` may hold `{topic:…}`, replaced at the press by what that
//   topic holds (nothing yet: empty). Only that is special: every other
//   brace stands as written, since a command is JSON so often - as a write
//   format has only `{value}` (lib/scaled-value.ts);
// - `onlyWhen`: a combined topic's name; the press sends nothing unless it
//   is yes;
// - `clears`: a local topic set empty after sending.
//
// What a device does with them is gated by the DDF feature below; the text
// field's «Keyboard» (digits) goes with it.

import type { HardwareButtonAction } from "@/components/project-editor"
import type { PlaceholderScope } from "@/lib/placeholders"

export const BUTTON_VALUES_FEATURE = "button-values"

const OPEN = "{topic:"

/** Whether a message holds a `{topic:…}` a device must fill in. */
export function hasPlaceholder(message: string | undefined): boolean {
  if (!message) return false
  const at = message.indexOf(OPEN)
  return at >= 0 && message.indexOf("}", at) > at
}

/**
 * The message with each `{topic:path}` replaced by `valueOf(path)` - empty
 * where it has none - and everything else as written. An opening without
 * its closing brace stays as written too. Written to be ported line by line.
 */
export function fillMessage(message: string, valueOf: (path: string) => string | undefined): string {
  let out = ""
  let i = 0
  for (;;) {
    const at = message.indexOf(OPEN, i)
    if (at < 0) break
    const close = message.indexOf("}", at)
    if (close < 0) break
    out += message.slice(i, at) + (valueOf(message.slice(at + OPEN.length, close)) ?? "")
    i = close + 1
  }
  return out + message.slice(i)
}

/** Whether an action uses any of the three. */
export function usesButtonValues(action: HardwareButtonAction | undefined): boolean {
  if (!action || action.type !== "send-mqtt") return false
  return !!action.onlyWhen || !!action.clears || hasPlaceholder(action.mqttMessage)
}

/**
 * What a press of a send-mqtt action does now: the message filled in from
 * the current values, or nothing where its «Only when» is not yes - and the
 * local topic to clear after it was sent.
 */
export function pressedMessage(
  action: HardwareButtonAction,
  scope: PlaceholderScope,
): { send: { topic: string; message: string } | null; clear?: string } {
  const topic = action.mqttTopic
  if (!topic) return { send: null }
  if (action.onlyWhen && scope.combined?.(action.onlyWhen) !== "true") return { send: null }
  const message = fillMessage(action.mqttMessage ?? "", (path) => scope.lookup({ namespace: "topic", path }))
  return { send: { topic, message }, ...(action.clears ? { clear: action.clears } : {}) }
}

interface ObjectLike {
  type: string
  properties?: Record<string, any>
  children?: ObjectLike[]
}

/**
 * What Deploy asks of a device for a project using any of it: the feature,
 * and what needs it named - each button and screen whose action uses one of
 * the three, each text field asking for digits.
 */
export function buttonValuesFeature(project: {
  screens?: readonly { name: string; objects?: ObjectLike[]; buttonActions?: Record<string, HardwareButtonAction | undefined> }[]
}): { feature: string; label: string } | null {
  const names: string[] = []
  const add = (name: string) => {
    if (!names.includes(name)) names.push(name)
  }
  for (const screen of project.screens ?? []) {
    const walk = (objects: ObjectLike[]) => {
      for (const obj of objects) {
        if (obj.type === "button" && usesButtonValues(obj.properties?.action)) add(`a button on ${screen.name}`)
        if (obj.type === "text-field" && obj.properties?.keyboard === "digits") add(`a text field for digits on ${screen.name}`)
        if (obj.children?.length) walk(obj.children)
      }
    }
    walk(screen.objects ?? [])
    for (const action of Object.values(screen.buttonActions ?? {})) if (usesButtonValues(action)) add(`a hardware button on ${screen.name}`)
  }
  return names.length > 0 ? { feature: BUTTON_VALUES_FEATURE, label: `values in button messages (${names.join(", ")})` } : null
}
