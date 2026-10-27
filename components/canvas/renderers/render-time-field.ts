/**
 * Time field renderer - a topic's time of day in a field a finger sets on a
 * picker (lib/time-field.ts, tasks/ha-time-plan.md). Drawn exactly as a
 * text field (render-text-field.ts): the same container, line and text,
 * the text being the time - «--:--» while there is none it can read.
 */

import type { ScreenObject } from "@/components/project-editor"
import { formatTime, parseTime } from "@/lib/time-field"
import { drawField, textFieldValue, type RenderTextFieldOptions } from "./render-text-field"

/** The time the field shows: what was sent until the topic answers, then what it reports. */
export function timeFieldText(
  obj: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
  getAskedValueFromTopic: (topicName: string | undefined) => string,
): string {
  return formatTime(parseTime(textFieldValue(obj, getPreviewValueFromTopic, getAskedValueFromTopic)))
}

export function renderTimeField(options: RenderTextFieldOptions): void {
  drawField(options, timeFieldText(options.obj, options.getPreviewValueFromTopic, options.getAskedValueFromTopic ?? (() => "")), false)
}
