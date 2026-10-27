// A time field: a topic's time of day in a field, and a new one set on a
// picker and sent to the write topic (tasks/ha-time-plan.md, an MQTT `time`
// of Home Assistant).
//
// What every device must agree on is here, written to be ported line by
// line: what is read as a time, how it is shown, what is sent, how a minute
// lands on the step. The boards port it as TimeField.h, the app as
// TimeField.kt. The field itself is drawn as a text field's
// (lib/text-field.ts, render-text-field.ts).

/** The minute steps a field offers; 5 unless set (the user, 2026-10-27). */
export const TIME_FIELD_STEPS = [1, 5, 10, 15, 30] as const
export const TIME_FIELD_DEFAULT_STEP = 5

/** What a field shows before a time has arrived, or for one it cannot read. */
export const NO_TIME = "--:--"

export interface TimeOfDay {
  hour: number
  minute: number
}

/** A field's step, read leniently: one of TIME_FIELD_STEPS, else the default. */
export function timeFieldStep(properties: Record<string, any> | undefined): number {
  const step = properties?.minuteStep
  return (TIME_FIELD_STEPS as readonly number[]).includes(step) ? step : TIME_FIELD_DEFAULT_STEP
}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9"

/** The digits at `text[i]`, at most `max` of them, and where they end. */
function digitsAt(text: string, i: number, max: number): { value: number; end: number } | null {
  let end = i
  while (end < text.length && end - i < max && isDigit(text[end])) end++
  if (end === i) return null
  return { value: Number(text.slice(i, end)), end }
}

/**
 * The time of day in a reported value, or null. Taken: `H:MM` and `HH:MM`,
 * either with `:SS` and a fraction after it, and an ISO date and time
 * (`2026-10-27T06:45:00+01:00`, a space for the `T` too), of which the time
 * is kept as written - no time zone is converted, as Home Assistant keeps
 * it. Surrounding blanks are ignored; anything else is not a time.
 */
export function parseTime(value: string | undefined): TimeOfDay | null {
  if (value === undefined) return null
  let text = value.trim()
  // An ISO date in front: YYYY-MM-DD, then T or a space.
  if (text.length > 11 && text[4] === "-" && text[7] === "-" && (text[10] === "T" || text[10] === "t" || text[10] === " ")) {
    for (const i of [0, 1, 2, 3, 5, 6, 8, 9]) if (!isDigit(text[i])) return null
    text = text.slice(11)
    // An offset or a Z after the time: cut off, the time is as written.
    let cut = text.length
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "Z" || text[i] === "z" || text[i] === "+" || text[i] === "-") {
        cut = i
        break
      }
    }
    text = text.slice(0, cut)
  }
  const hour = digitsAt(text, 0, 2)
  if (!hour || text[hour.end] !== ":") return null
  const minute = digitsAt(text, hour.end + 1, 2)
  if (!minute || minute.end - hour.end - 1 !== 2) return null
  let end = minute.end
  if (text[end] === ":") {
    const second = digitsAt(text, end + 1, 2)
    if (!second || second.end - end - 1 !== 2 || second.value > 59) return null
    end = second.end
    if (text[end] === ".") {
      const fraction = digitsAt(text, end + 1, 9)
      if (!fraction) return null
      end = fraction.end
    }
  }
  if (end !== text.length) return null
  if (hour.value > 23 || minute.value > 59) return null
  return { hour: hour.value, minute: minute.value }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The field's text: `06:45`, always 24 hours; «--:--» for no time. */
export function formatTime(time: TimeOfDay | null): string {
  return time ? `${pad(time.hour)}:${pad(time.minute)}` : NO_TIME
}

/**
 * A time put on the step, to the nearest: 06:58 on 5 is 07:00, 23:58 is
 * 00:00. What the picker opens on and what is sent, on every device - the
 * phone's own picker knows no step, so it rounds what it took (decision 3).
 */
export function onStep(time: TimeOfDay, step: number): TimeOfDay {
  const total = time.hour * 60 + time.minute
  // Half a step rounds up, in whole numbers, as the ports do it.
  const rounded = (Math.floor((2 * total + step) / (2 * step)) * step) % 1440
  return { hour: Math.trunc(rounded / 60), minute: rounded % 60 }
}

/** What OK publishes: `HH:MM:00`, as Home Assistant's `time.isoformat()` writes it. */
export function timePayload(time: TimeOfDay): string {
  return `${pad(time.hour)}:${pad(time.minute)}:00`
}
