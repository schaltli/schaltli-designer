// Live values: whatever changes with one value from the van, set as rules
// rather than written as an expression (docs/2026-10-07-live-values.md).
//
// Written to be ported line by line to the firmware and the Android app, as
// lib/placeholders.ts is: no regular expression does what a plain loop could,
// no locale API. The cases all three must agree on are lib/live-value/
// vectors.json.

import type { RuleOperator } from "@/lib/comparison-operators"

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

export interface LiveValue {
  /** Unique within its object; a text refers to it as `{live:<id>}`. */
  id: string
  source: Source
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
