// Placeholders in texts: `Tank {topic:schaltli/state/tank/1/level:F0} %`
// (docs/2026-09-25-text-placeholders.md).
//
// The rules live here once for the designer, and again in the firmware
// (src/project/Placeholders.cpp) and the Android app (data/Placeholders.kt).
// All three are held to the same cases in lib/placeholders/vectors.json, so
// this file is written to be ported line by line: no regular expression does
// anything a plain loop could not, no locale API, no floating point.

export type Namespace = "topic" | "device" | "project"

export interface Reference {
  namespace: Namespace
  /** A topic path (JSON path after `#` included), or a device/project field. */
  path: string
}

export interface Separators {
  decimal: string
  thousands: string
}

/** Schweiz: the project default (docs/2026-09-25-text-placeholders.md). */
export const DEFAULT_SEPARATORS: Separators = { decimal: ".", thousands: "'" }

/**
 * The presets behind Settings › Number format. A project stores only the two
 * characters; a preset is a way of choosing them, and the dropdown shows one
 * whenever the characters happen to match it.
 */
export const NUMBER_FORMATS: { id: string; label: string; separators: Separators }[] = [
  { id: "en", label: "English", separators: { decimal: ".", thousands: "," } },
  { id: "de", label: "Germany", separators: { decimal: ",", thousands: "." } },
  { id: "at", label: "Austria", separators: { decimal: ",", thousands: " " } },
  { id: "ch", label: "Switzerland", separators: DEFAULT_SEPARATORS },
]

/** The preset these separators match, or "custom". */
export function numberFormatOf(separators: Separators): string {
  const match = NUMBER_FORMATS.find(
    (f) => f.separators.decimal === separators.decimal && f.separators.thousands === separators.thousands,
  )
  return match ? match.id : "custom"
}

/**
 * Why two separators cannot be used, or undefined if they can. The same
 * character twice would make 1.234.5 unreadable, and a number needs a
 * decimal separator; the thousands one may be left empty.
 */
export function separatorProblem(separators: Separators): string | undefined {
  if (separators.decimal.length !== 1) return "The decimal separator is one character."
  if (separators.thousands.length > 1) return "The thousands separator is one character, or none."
  if (separators.decimal === separators.thousands) return "Decimal and thousands separator must differ."
  return undefined
}

/** A project's separators; one saved before 2026-09-25 has none and gets the default. */
export function projectSeparators(settings: { decimalSeparator?: string; thousandsSeparator?: string }): Separators {
  return {
    decimal: settings.decimalSeparator ?? DEFAULT_SEPARATORS.decimal,
    thousands: settings.thousandsSeparator ?? DEFAULT_SEPARATORS.thousands,
  }
}

export interface NumberFormat {
  kind: "F" | "N"
  digits: number
}

export type Segment =
  | { kind: "literal"; text: string }
  | {
      kind: "placeholder"
      source: string
      reference: Reference
      fallback?: string
      format?: NumberFormat
    }
  /** Unknown, reserved or broken: shown exactly as written, braces included. */
  | { kind: "raw"; source: string; reason: string }

// The fields v1 resolves. device:name and project:version are reserved
// (issues #19, #18) and, like any unknown field, shown as written.
export const FIELDS: Record<"device" | "project", string[]> = {
  device: ["model", "id"],
  project: ["name"],
}

const NAMESPACES: Namespace[] = ["topic", "device", "project"]

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r"
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9"
}

/** `F0`-`F9` or `N0`-`N9`, nothing else. */
function asFormat(text: string): NumberFormat | undefined {
  if (text.length !== 2) return undefined
  if ((text[0] !== "F" && text[0] !== "N") || !isDigit(text[1])) return undefined
  return { kind: text[0], digits: Number(text[1]) }
}

/**
 * The body between `{` and `}` - `topic:a/bc ?? 0:F2` - as a placeholder, or
 * why it is not one. Anything v1 does not do (an operator, parentheses, a
 * function) is reserved: it comes back raw rather than guessed at.
 */
function parseBody(body: string, source: string): Segment {
  const raw = (reason: string): Segment => ({ kind: "raw", source, reason })

  if (body.startsWith("(")) return raw("expressions are reserved for later")

  const colon = body.indexOf(":")
  const namespace = colon > 0 ? (body.slice(0, colon) as Namespace) : undefined
  if (!namespace || !NAMESPACES.includes(namespace)) return raw("unknown namespace")

  // The reference runs to the first whitespace; a path cannot contain any.
  let end = colon + 1
  while (end < body.length && !isWhitespace(body[end])) end++
  let path = body.slice(colon + 1, end)
  let rest = body.slice(end)

  let fallback: string | undefined
  let format: NumberFormat | undefined

  if (rest.length > 0) {
    // Whitespace after the reference: only `?? fallback[:format]` is v1.
    let i = 0
    while (i < rest.length && isWhitespace(rest[i])) i++
    if (rest.slice(i, i + 2) !== "??" || i + 2 >= rest.length || !isWhitespace(rest[i + 2])) {
      return raw("operators are reserved for later")
    }
    i += 2
    while (i < rest.length && isWhitespace(rest[i])) i++
    if (rest[i] === '"') {
      const close = rest.indexOf('"', i + 1)
      if (close < 0) return raw("unterminated text")
      fallback = rest.slice(i + 1, close)
      i = close + 1
    } else {
      const start = i
      if (rest[i] === "-") i++
      while (i < rest.length && (isDigit(rest[i]) || rest[i] === ".")) i++
      fallback = rest.slice(start, i)
      if (fallback === "" || fallback === "-") return raw("a fallback is a number or quoted text")
    }
    const tail = rest.slice(i)
    if (tail !== "") {
      if (tail[0] !== ":") return raw("operators are reserved for later")
      format = asFormat(tail.slice(1))
      if (!format) return raw("unknown format")
    }
  } else {
    // No fallback: a format can only be the part after the path's last `:`,
    // and only if it is one; otherwise that `:` belongs to the topic (MQTT
    // allows it).
    const last = path.lastIndexOf(":")
    if (last > 0) {
      const candidate = asFormat(path.slice(last + 1))
      if (candidate) {
        format = candidate
        path = path.slice(0, last)
      }
    }
  }

  if (path === "") return raw("nothing after the namespace")
  if (namespace !== "topic" && !FIELDS[namespace].includes(path)) return raw("unknown field")

  return { kind: "placeholder", source, reference: { namespace, path }, fallback, format }
}

/** A text as literals and placeholders, in order. */
export function parse(text: string): Segment[] {
  const segments: Segment[] = []
  let literal = ""
  const flush = () => {
    if (literal !== "") segments.push({ kind: "literal", text: literal })
    literal = ""
  }

  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === "{" && text[i + 1] === "{") {
      literal += "{"
      i += 2
      continue
    }
    if (c === "}" && text[i + 1] === "}") {
      literal += "}"
      i += 2
      continue
    }
    if (c !== "{") {
      // A lone `}` is not a placeholder of anything; it stays as written.
      literal += c
      i++
      continue
    }
    // Find the closing brace, skipping any inside a quoted fallback.
    let j = i + 1
    let quoted = false
    while (j < text.length && (quoted || text[j] !== "}")) {
      if (text[j] === '"') quoted = !quoted
      j++
    }
    if (j >= text.length) {
      // Unterminated: the rest of the text, as written.
      flush()
      segments.push({ kind: "raw", source: text.slice(i), reason: "no closing }" })
      return segments
    }
    flush()
    const source = text.slice(i, j + 1)
    segments.push(parseBody(text.slice(i + 1, j), source))
    i = j + 1
  }
  flush()
  return segments
}

/**
 * A decimal payload rounded and written with the project's separators, or
 * undefined if it is not a plain decimal number (then it is shown as it is).
 *
 * Rounded on the digits as written, half away from zero, never through a
 * float: 75.195 is 75.19499… as a double, and three platforms rounding
 * doubles would not agree on it.
 */
export function formatNumber(value: string, format: NumberFormat, separators: Separators): string | undefined {
  const text = value.trim()
  let i = 0
  let negative = false
  if (text[i] === "+" || text[i] === "-") {
    negative = text[i] === "-"
    i++
  }
  let whole = ""
  while (i < text.length && isDigit(text[i])) whole += text[i++]
  let fraction = ""
  if (text[i] === ".") {
    i++
    while (i < text.length && isDigit(text[i])) fraction += text[i++]
  }
  if (i !== text.length || (whole === "" && fraction === "")) return undefined

  // All the kept digits as one string, then +1 on it if the first dropped
  // digit is 5 or more.
  const kept = fraction.padEnd(format.digits, "0").slice(0, format.digits)
  let digits = (whole === "" ? "0" : whole) + kept
  if ((fraction[format.digits] ?? "0") >= "5") {
    const out = digits.split("")
    let k = out.length - 1
    while (k >= 0) {
      if (out[k] === "9") {
        out[k] = "0"
        k--
      } else {
        out[k] = String(Number(out[k]) + 1)
        break
      }
    }
    digits = (k < 0 ? "1" : "") + out.join("")
  }

  let intPart = digits.slice(0, digits.length - format.digits).replace(/^0+(?=\d)/, "")
  if (intPart === "") intPart = "0"
  const fracPart = digits.slice(digits.length - format.digits)

  if (format.kind === "N" && separators.thousands !== "") {
    let grouped = ""
    for (let k = 0; k < intPart.length; k++) {
      if (k > 0 && (intPart.length - k) % 3 === 0) grouped += separators.thousands
      grouped += intPart[k]
    }
    intPart = grouped
  }

  const isZero = /^[0]*$/.test(digits)
  // -0.001 at F2 is 0.00, not -0.00: a sign on nothing reads like a fault.
  const sign = negative && !isZero ? "-" : ""
  return sign + intPart + (format.digits > 0 ? separators.decimal + fracPart : "")
}

/**
 * The text as it reads. `lookup` answers undefined for a value that never
 * arrived - C#'s null, the only case `??` applies to - and "" for an empty
 * message that did.
 */
export function resolve(
  text: string,
  lookup: (reference: Reference) => string | undefined,
  separators: Separators = DEFAULT_SEPARATORS,
): string {
  let out = ""
  for (const segment of parse(text)) {
    if (segment.kind === "literal") {
      out += segment.text
      continue
    }
    if (segment.kind === "raw") {
      out += segment.source
      continue
    }
    const value = lookup(segment.reference) ?? segment.fallback ?? ""
    const formatted = segment.format ? formatNumber(value, segment.format, separators) : undefined
    out += formatted ?? value
  }
  return out
}

/** Every topic a text refers to, for subscribing and declaring. */
export function referencedTopics(text: string): string[] {
  const topics: string[] = []
  for (const segment of parse(text)) {
    if (segment.kind === "placeholder" && segment.reference.namespace === "topic" && !topics.includes(segment.reference.path)) {
      topics.push(segment.reference.path)
    }
  }
  return topics
}
