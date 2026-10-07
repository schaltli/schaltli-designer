// Live values: whatever changes with one value from the van, set as rules
// rather than written as an expression (docs/2026-10-07-live-values.md).
//
// Written to be ported line by line to the firmware and the Android app, as
// lib/placeholders.ts is: no regular expression does what a plain loop could,
// no locale API. The cases all three must agree on are lib/live-value/
// vectors.json.

import type { RuleOperator } from "@/lib/comparison-operators"
import { formatNumber, parse, type Separators } from "@/lib/placeholders"

export type { RuleOperator }

/** Where a live value's one value comes from (spec decision 3). */
export interface Source {
  namespace: "topic" | "device" | "project" | "combined"
  /** A topic path (a JSON field after `#` included), a device/project field, a combined topic's name. */
  path: string
}

/** What a rule, Otherwise or No value yet gives. */
export type Result =
  /** Text, with `{ value: true }` where the value goes, in the live value's format. */
  | { kind: "text"; parts: (string | { value: true })[] }
  /** An icon: an asset id of the project. */
  | { kind: "icon"; icon: string }

export interface Rule {
  op: RuleOperator
  /** What the value is compared with; none for «is yes» and «is no». */
  operand?: string
  result: Result
}

/** How the value is written where a result asks for it, or where there is no result. */
export type ValueFormat =
  | { kind: "asIs" }
  /** Rounded to `decimals`, half away from zero, the project's separators; `grouped` adds thousands. */
  | { kind: "number"; decimals: number; grouped: boolean }
  /** Seconds as a duration; the first unit is not wrapped, so 34 hours stay 34. */
  | { kind: "duration"; pattern: DurationPattern }

export type DurationPattern = "h:mm:ss" | "h:mm" | "m:ss"

export const DURATION_PATTERNS: readonly DurationPattern[] = ["h:mm:ss", "h:mm", "m:ss"]

export interface LiveValue {
  /** Unique within its object; a text refers to it as `{live:<id>}`. */
  id: string
  source: Source
  /** Absent: as it came. */
  format?: ValueFormat
  rules: Rule[]
  /** No rule matched. Absent: the value, in its format. */
  otherwise?: Result
  /** Nothing has arrived yet. Absent: nothing (an empty text). */
  noValueYet?: Result
}

/** Which branch gave the result: a rule's index, Otherwise, or No value yet. */
export type Applies = number | "otherwise" | "noValueYet"

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r"
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9"
}

/** The text without whitespace at either end. */
function trimmed(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && isWhitespace(value[start])) start++
  while (end > start && isWhitespace(value[end - 1])) end--
  return value.slice(start, end)
}

/** Lower case for ASCII letters only - no locale. */
function lowerAscii(value: string): string {
  let out = ""
  for (const c of value) out += c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 32) : c
  return out
}

/**
 * A plain decimal number - an optional sign, digits, an optional point and
 * digits, nothing else once trimmed - as a number; undefined otherwise. `1e3`,
 * `0x10`, `12 V` and `` are not numbers.
 */
export function asNumber(value: string): number | undefined {
  const text = trimmed(value)
  let i = 0
  if (text[i] === "+" || text[i] === "-") i++
  let digits = 0
  while (i < text.length && isDigit(text[i])) {
    i++
    digits++
  }
  if (text[i] === ".") {
    i++
    while (i < text.length && isDigit(text[i])) {
      i++
      digits++
    }
  }
  if (i !== text.length || digits === 0) return undefined
  return Number(text)
}

/** «is yes»: `true`, `on`, `yes`, `1` in any case, and any number other than 0. */
export function isYes(value: string): boolean {
  const word = lowerAscii(trimmed(value))
  if (word === "true" || word === "on" || word === "yes") return true
  const number = asNumber(word)
  return number !== undefined && number !== 0
}

/** «is no»: `false`, `off`, `no`, `0` in any case, an empty message, and any number equal to 0. */
export function isNo(value: string): boolean {
  const word = lowerAscii(trimmed(value))
  if (word === "" || word === "false" || word === "off" || word === "no") return true
  return asNumber(word) === 0
}

/**
 * Whether a value matches a rule (spec decision 5). `==` and `!=` compare
 * trimmed text. The four order operators compare numbers, and a value or an
 * operand that is not a number matches none of them - unlike
 * `evaluateCondition` in lib/render-screen.ts, which reads it as 0 and stays
 * so for the objects not yet on live values.
 */
export function matches(value: string, op: RuleOperator, operand = ""): boolean {
  switch (op) {
    case "yes":
      return isYes(value)
    case "no":
      return isNo(value)
    case "==":
      return trimmed(value) === trimmed(operand)
    case "!=":
      return trimmed(value) !== trimmed(operand)
  }
  const a = asNumber(value)
  const b = asNumber(operand)
  if (a === undefined || b === undefined) return false
  switch (op) {
    case "<":
      return a < b
    case "<=":
      return a <= b
    case ">":
      return a > b
    case ">=":
      return a >= b
  }
  return false
}

/**
 * Which branch applies to a value: undefined when nothing has arrived (No
 * value yet - never «is no»), else the first rule that matches, else
 * Otherwise. `result` is that branch's result, undefined where the live value
 * leaves it to the default (the value for Otherwise, nothing for No value yet).
 */
export function evaluate(liveValue: LiveValue, value: string | undefined): { applies: Applies; result: Result | undefined } {
  if (value === undefined) return { applies: "noValueYet", result: liveValue.noValueYet }
  for (let i = 0; i < liveValue.rules.length; i++) {
    const rule = liveValue.rules[i]
    if (matches(value, rule.op, rule.operand)) return { applies: i, result: rule.result }
  }
  return { applies: "otherwise", result: liveValue.otherwise }
}

/** Two digits, a leading zero where needed. */
function twoDigits(n: number): string {
  return n < 10 ? "0" + String(n) : String(n)
}

/**
 * Whole seconds as a duration, or undefined for anything but a plain number
 * of zero or more. A fraction is cut off, not rounded: a countdown at 59.9
 * has not reached the minute.
 */
function formatDuration(value: string, pattern: DurationPattern): string | undefined {
  const text = trimmed(value)
  if (asNumber(text) === undefined) return undefined
  let i = text[0] === "+" ? 1 : 0
  if (text[i] === "-") return undefined
  let seconds = 0
  while (i < text.length && isDigit(text[i])) seconds = seconds * 10 + (text.charCodeAt(i++) - 48)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (pattern === "h:mm:ss") return String(h) + ":" + twoDigits(m) + ":" + twoDigits(s)
  if (pattern === "h:mm") return String(h) + ":" + twoDigits(m)
  return String(Math.floor(seconds / 60)) + ":" + twoDigits(s)
}

/** The value in a format; as it came where the format does not fit it. */
export function formatValue(value: string, format: ValueFormat | undefined, separators: Separators): string {
  if (!format || format.kind === "asIs") return value
  if (format.kind === "number") {
    return formatNumber(value, { kind: format.grouped ? "N" : "F", digits: format.decimals }, separators) ?? value
  }
  return formatDuration(value, format.pattern) ?? value
}

/**
 * What a live value reads as text: the result that applies, its value token
 * written in the format; Otherwise absent is the value in its format, No
 * value yet absent is nothing. An icon result reads as nothing - a text
 * cannot show one.
 */
export function textOf(liveValue: LiveValue, value: string | undefined, separators: Separators): string {
  const { applies, result } = evaluate(liveValue, value)
  const formatted = value === undefined ? "" : formatValue(value, liveValue.format, separators)
  if (!result) return applies === "otherwise" ? formatted : ""
  if (result.kind !== "text") return ""
  let out = ""
  for (const part of result.parts) out += typeof part === "string" ? part : formatted
  return out
}

/** The `<id>` of a `{live:<id>}` that starts at `at`, and where it ends; undefined if none does. */
function liveReferenceAt(text: string, at: number): { id: string; end: number } | undefined {
  const head = "{live:"
  if (text.slice(at, at + head.length) !== head) return undefined
  const close = text.indexOf("}", at + head.length)
  if (close < 0) return undefined
  const id = text.slice(at + head.length, close)
  for (const c of id) if (c === "{" || isWhitespace(c)) return undefined
  return id === "" ? undefined : { id, end: close + 1 }
}

/**
 * A text as it reads: each `{live:<id>}` replaced by its live value's text,
 * `{{` and `}}` as single braces. A reference to an id the object does not
 * have, and any other brace, stays as written.
 */
export function resolveLiveText(
  text: string,
  liveValues: readonly LiveValue[] | undefined,
  lookup: (source: Source) => string | undefined,
  separators: Separators,
): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if ((c === "{" || c === "}") && text[i + 1] === c) {
      out += c
      i += 2
      continue
    }
    const reference = c === "{" ? liveReferenceAt(text, i) : undefined
    const liveValue = reference ? liveValues?.find((lv) => lv.id === reference.id) : undefined
    if (reference && liveValue) {
      out += textOf(liveValue, lookup(liveValue.source), separators)
      i = reference.end
      continue
    }
    out += c
    i++
  }
  return out
}

/** The next free `lv<n>` among an object's live values. */
export function nextLiveValueId(liveValues: readonly LiveValue[]): string {
  let n = 1
  while (liveValues.some((lv) => lv.id === "lv" + String(n))) n++
  return "lv" + String(n)
}

/**
 * A text with `{topic:…}`, `{device:…}`, `{project:…}` placeholders as one
 * with live values (spec decision 17): each placeholder becomes a live value
 * - `:F<n>` / `:N<n>` its number format, `?? x` its No value yet, written in
 * that format with these separators as the placeholder wrote it - and
 * `{live:<id>}` stands where it stood. Literal braces stay doubled; a
 * placeholder a device would show as written stays as written. Ids go on
 * from the object's own. Applied twice, the second pass changes nothing.
 */
export function placeholdersToLiveValues(
  text: string,
  liveValues: readonly LiveValue[],
  separators: Separators,
): { text: string; liveValues: LiveValue[] } {
  const all = [...liveValues]
  let out = ""
  for (const segment of parse(text)) {
    if (segment.kind === "literal") {
      for (const c of segment.text) out += c === "{" || c === "}" ? c + c : c
      continue
    }
    if (segment.kind === "raw") {
      out += segment.source
      continue
    }
    const liveValue: LiveValue = { id: nextLiveValueId(all), source: { ...segment.reference }, rules: [] }
    if (segment.format) liveValue.format = { kind: "number", decimals: segment.format.digits, grouped: segment.format.kind === "N" }
    if (segment.fallback !== undefined) {
      liveValue.noValueYet = { kind: "text", parts: [formatValue(segment.fallback, liveValue.format, separators)] }
    }
    all.push(liveValue)
    out += "{live:" + liveValue.id + "}"
  }
  return { text: out, liveValues: all }
}
