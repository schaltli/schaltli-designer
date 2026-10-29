// What a raw message says, read as the designer reads it - the recorder's
// own copy, since it runs without the designer's TypeScript
// (tasks/charts-recorder-plan.md decision 6). `matches` is
// lib/live-value.ts's, `fieldOf` lib/json-path.ts's extractJsonField;
// e2e/recorder-history.spec.ts feeds both copies the same vectors so they
// cannot drift.

"use strict"

const isWhitespace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r"
const isDigit = (c) => c >= "0" && c <= "9"

function trimmed(value) {
  let start = 0
  let end = value.length
  while (start < end && isWhitespace(value[start])) start++
  while (end > start && isWhitespace(value[end - 1])) end--
  return value.slice(start, end)
}

function lowerAscii(value) {
  let out = ""
  for (const c of value) out += c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 32) : c
  return out
}

/** A plain decimal number, nothing else once trimmed; undefined otherwise. */
function asNumber(value) {
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

function isYes(value) {
  const word = lowerAscii(trimmed(value))
  if (word === "true" || word === "on" || word === "yes") return true
  const number = asNumber(word)
  return number !== undefined && number !== 0
}

function isNo(value) {
  const word = lowerAscii(trimmed(value))
  if (word === "" || word === "false" || word === "off" || word === "no") return true
  return asNumber(word) === 0
}

/** Whether a value matches a condition: `==`/`!=` compare text, the order operators numbers. */
function matches(value, op, operand = "") {
  switch (op) {
    case "yes":
      return isYes(value)
    case "no":
      return isNo(value)
    case "=":
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

function tokenizePath(path) {
  let s = path.trim()
  if (s.startsWith("$")) s = s.slice(1)
  const segments = []
  let i = 0
  while (i < s.length) {
    if (s[i] === "[") {
      const close = s.indexOf("]", i)
      if (close === -1) break
      const inner = s.slice(i + 1, close).trim()
      const quoted = (inner.startsWith("'") && inner.endsWith("'")) || (inner.startsWith('"') && inner.endsWith('"'))
      segments.push(quoted ? { type: "member", name: inner.slice(1, -1) } : { type: "index", index: Number.parseInt(inner, 10) })
      i = close + 1
    } else {
      if (s[i] === ".") i++
      let name = ""
      while (i < s.length && s[i] !== "." && s[i] !== "[") name += s[i++]
      if (name) segments.push({ type: "member", name })
    }
  }
  return segments
}

/** The field at `path` of a JSON message as text, undefined where there is none. */
function fieldOf(jsonText, path) {
  let current
  try {
    current = JSON.parse(jsonText)
  } catch {
    return undefined
  }
  for (const segment of tokenizePath(path)) {
    if (current === null || current === undefined) return undefined
    if (segment.type === "member") {
      if (typeof current !== "object" || Array.isArray(current)) return undefined
      current = current[segment.name]
    } else {
      if (!Array.isArray(current)) return undefined
      current = current[segment.index]
    }
  }
  if (current === undefined) return undefined
  if (typeof current === "string") return current
  if (typeof current === "object") return JSON.stringify(current)
  return String(current)
}

/** A message for a wanted topic, `#path` resolved: the text it says, or undefined. */
function valueOf(wantedTopic, payload) {
  const hash = wantedTopic.indexOf("#")
  return hash === -1 ? payload : fieldOf(payload, wantedTopic.slice(hash + 1))
}

module.exports = { asNumber, matches, fieldOf, valueOf }
