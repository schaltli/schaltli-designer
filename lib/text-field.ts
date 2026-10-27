// A text field: a topic's text in a field, and a new one typed and sent to
// its write topic (tasks/ha-text-plan.md, an MQTT `text` of Home Assistant).
//
// What every device must agree on is here, written to be ported line by
// line: how long a text is, what a hidden one shows, where the text sits.
// The 4.3B, the Knob and the PaperS3 draw it in ColorScreenRenderer, the app
// in its own renderer, the designer in render-text-field.ts.

/** Home Assistant's own bounds for an MQTT text: `min` 0, `max` 255. */
export const TEXT_FIELD_MAX_LENGTH = 255

/** Unset: Home Assistant's defaults. */
export const TEXT_FIELD_DEFAULTS = { minLength: 0, maxLength: TEXT_FIELD_MAX_LENGTH } as const

/**
 * A text's length in characters - code points, as Python's `len()` counts
 * them, which is what Home Assistant checks `min` and `max` against. Not
 * UTF-16 units (`"😀".length` is 2) and not UTF-8 bytes (`"ü"` is 2).
 */
export function textLength(text: string): number {
  let n = 0
  for (const _ of text) n++
  return n
}

/** The first `max` characters of `text`, never half a surrogate pair. */
export function clampText(text: string, max: number): string {
  if (textLength(text) <= max) return text
  let out = ""
  let n = 0
  for (const ch of text) {
    if (n === max) break
    out += ch
    n++
  }
  return out
}

/** A field's own bounds, its properties read leniently and kept inside 0-255, min never above max. */
export function textFieldBounds(properties: Record<string, any> | undefined): { minLength: number; maxLength: number } {
  const whole = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(TEXT_FIELD_MAX_LENGTH, Math.trunc(value))) : fallback
  const maxLength = Math.max(1, whole(properties?.maxLength, TEXT_FIELD_DEFAULTS.maxLength))
  const minLength = Math.min(maxLength, whole(properties?.minLength, TEXT_FIELD_DEFAULTS.minLength))
  return { minLength, maxLength }
}

/** Whether «OK» sends: the text is within the field's bounds. */
export function canSendText(text: string, bounds: { minLength: number; maxLength: number }): boolean {
  const n = textLength(text)
  return n >= bounds.minLength && n <= bounds.maxLength
}

/** What a hidden text is drawn as, character for character. */
export const HIDDEN_CHAR = "•"
/** For a font without the bullet: the number fonts (logisoso, fub, fur) have none. */
export const HIDDEN_CHAR_FALLBACK = "*"

/** What the field draws for `text`: as it is, or one dot per character where it is hidden. */
export function shownText(text: string, hidden: boolean, fontHasBullet: boolean): string {
  if (!hidden) return text
  return (fontHasBullet ? HIDDEN_CHAR : HIDDEN_CHAR_FALLBACK).repeat(textLength(text))
}

/**
 * Where the field's parts go, in whole pixels:
 * - the container: a rounded rectangle over the whole object, the corner a
 *   fifth of the height (the pressed button's);
 * - the line under it: 2 px across the bottom between the corners, in the
 *   accent - what says «you can type here» (Material's filled text field);
 * - the text: from `pad` in, cut at `pad` before the right edge, its line
 *   centred in the height as the button's label is.
 */
export interface TextFieldGeometry {
  radius: number
  pad: number
  /** The line's top edge, relative to the object's top. */
  lineY: number
  lineHeight: number
}

export const TEXT_FIELD_LINE = 2

export function textFieldGeometry(width: number, height: number): TextFieldGeometry {
  const w = Math.max(1, Math.trunc(width))
  const h = Math.max(1, Math.trunc(height))
  const radius = Math.min(Math.trunc(h / 5), Math.trunc(w / 2))
  const pad = Math.max(radius, Math.trunc(h / 4))
  const lineHeight = Math.min(TEXT_FIELD_LINE, h)
  return { radius, pad, lineY: h - lineHeight, lineHeight }
}

/** The baseline of the text, relative to the object's top: its line centred in the height. */
export function textFieldBaseline(height: number, ascent: number, descent: number): number {
  const h = Math.max(1, Math.trunc(height))
  return Math.trunc((h - (ascent + descent)) / 2) + ascent
}
