// What the placeholder picker offers and writes (docs/2026-09-25-placeholder-
// picker.md). Pure, like lib/placeholders.ts beside it: the component in
// components/property-panel/fields/placeholder-text-field.tsx only wires these
// to keys and a list, so the rules can be tested without a browser.

import type { Topic } from "@/components/project-editor"
import { extractJsonField } from "@/lib/json-path"
import { FIELDS, formatNumber, type Separators } from "@/lib/placeholders"

export interface CompletionContext {
  /** "reference": choosing what the placeholder names; "format": after `topic:…:`. */
  stage: "reference" | "format"
  /** Index of the `{` that opened the placeholder. */
  start: number
  /** Where the typed query begins and ends (the caret). */
  queryStart: number
  end: number
  /**
   * Where what a pick replaces ends: past the caret too, when it sits inside
   * a reference or format that goes on (`{topic:ta|nk/1:F1}` replaces
   * `topic:tank/1` and keeps `:F1`).
   */
  replaceEnd: number
  /** What has been typed so far for this stage. */
  query: string
  /** In the format stage, the topic path the format is for. */
  topicPath?: string
  /** Index of the `}` that already closes this placeholder, or -1. */
  closeAt: number
}

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r"
}

// A format typed so far: nothing yet, a letter, or a letter and a digit.
function isPartialFormat(text: string): boolean {
  if (text === "") return true
  if (text[0] !== "F" && text[0] !== "N") return false
  return text.length === 1 || (text.length === 2 && text[1] >= "0" && text[1] <= "9")
}

/**
 * Where the caret is relative to placeholders: inside an unclosed `{`, and at
 * which stage - or undefined when there is nothing to offer (outside any
 * placeholder, right after `{{`, inside a quoted fallback, or once the
 * reference is followed by whitespace, which is where `??` is typed).
 */
export function completionContext(text: string, caret: number): CompletionContext | undefined {
  let open = -1
  let quoted = false
  for (let i = 0; i < caret; i++) {
    const c = text[i]
    if (open < 0) {
      if (c === "{") {
        // `{{` wholly before the caret is a literal brace.
        if (text[i + 1] === "{" && i + 1 < caret) {
          i++
          continue
        }
        open = i
        quoted = false
      } else if (c === "}" && text[i + 1] === "}") {
        i++
      }
    } else if (c === '"') {
      quoted = !quoted
    } else if (c === "}" && !quoted) {
      open = -1
    }
  }
  if (open < 0 || quoted) return undefined

  const body = text.slice(open + 1, caret)
  for (const c of body) if (isWhitespace(c)) return undefined

  // The closing brace of this placeholder, if one follows before the next.
  let closeAt = -1
  let inQuote = false
  for (let i = caret; i < text.length; i++) {
    const c = text[i]
    if (c === '"') inQuote = !inQuote
    else if (!inQuote && c === "{") break
    else if (!inQuote && c === "}") {
      closeAt = i
      break
    }
  }

  // The rest of the token the caret sits in: up to whitespace or a brace.
  let tokenEnd = caret
  while (tokenEnd < text.length && !isWhitespace(text[tokenEnd]) && text[tokenEnd] !== "}" && text[tokenEnd] !== "{") {
    tokenEnd++
  }

  if (body.startsWith("topic:")) {
    const lastColon = body.lastIndexOf(":")
    const after = body.slice(lastColon + 1)
    if (lastColon > "topic".length && isPartialFormat(after)) {
      return {
        stage: "format",
        start: open,
        queryStart: open + 1 + lastColon + 1,
        end: caret,
        replaceEnd: tokenEnd,
        query: after,
        topicPath: body.slice("topic:".length, lastColon),
        closeAt,
      }
    }
  }

  // A format after the caret stays; the reference up to it is replaced.
  let replaceEnd = tokenEnd
  const formatColon = text.lastIndexOf(":", tokenEnd - 1)
  if (formatColon >= caret && isPartialFormat(text.slice(formatColon + 1, tokenEnd))) {
    replaceEnd = formatColon
  }
  return { stage: "reference", start: open, queryStart: open + 1, end: caret, replaceEnd, query: body, closeAt }
}

export interface ReferenceEntry {
  section: "topic" | "device" | "project"
  /** What is written between the braces: `topic:a/b#temp`, `device:model`. */
  reference: string
  /** The type for a topic, a short description for a field. */
  detail: string
  /** A topic's first example (a JSON field's value in it), if any. */
  example?: string
}

const FIELD_DETAILS: Record<string, string> = {
  "device:model": "the device's model",
  "device:id": "the device's id",
  "project:name": "the project's name",
}

/**
 * What stage one offers for a query, in section order: the project's topics
 * (a JSON topic also once per declared field), then device and project
 * fields. The query matches anywhere in the reference or in the example -
 * `frisch` finds the topic whose example is «Frischwasser» - and a namespace
 * typed in front (`topic:tank`) keeps to that section.
 */
export function referenceEntries(query: string, topics: Topic[]): ReferenceEntry[] {
  const all: ReferenceEntry[] = []
  for (const topic of topics) {
    const first = topic.examples?.[0]
    all.push({ section: "topic", reference: `topic:${topic.topic}`, detail: topic.type, example: first })
    for (const field of topic.subtopics ?? []) {
      all.push({
        section: "topic",
        reference: `topic:${topic.topic}#${field.path}`,
        detail: field.type,
        example: first !== undefined ? extractJsonField(first, field.path) : undefined,
      })
    }
  }
  for (const namespace of ["device", "project"] as const) {
    for (const field of FIELDS[namespace]) {
      const reference = `${namespace}:${field}`
      all.push({ section: namespace, reference, detail: FIELD_DETAILS[reference] ?? "" })
    }
  }

  let term = query.toLowerCase()
  let section: ReferenceEntry["section"] | undefined
  for (const namespace of ["topic", "device", "project"] as const) {
    if (term.startsWith(`${namespace}:`)) {
      section = namespace
      term = term.slice(namespace.length + 1)
    }
  }
  return all.filter(
    (entry) =>
      (!section || entry.section === section) &&
      (term === "" ||
        entry.reference.toLowerCase().includes(term) ||
        (entry.example !== undefined && entry.example.toLowerCase().includes(term))),
  )
}

export interface FormatEntry {
  format: string
  /** The example formatted this way, when there is a numeric one. */
  preview?: string
}

// The ones a van screen uses (settled 2026-09-25); every other F0-F9 / N0-N9
// is accepted when typed in full.
export const OFFERED_FORMATS = ["F0", "F1", "F2", "N0", "N2"]

export function formatEntries(query: string, example: string | undefined, separators: Separators): FormatEntry[] {
  const typed = query.toUpperCase()
  const formats = OFFERED_FORMATS.filter((f) => f.startsWith(typed))
  if (typed.length === 2 && isPartialFormat(typed) && !formats.includes(typed)) formats.push(typed)
  return formats.map((format) => ({
    format,
    preview:
      example !== undefined
        ? formatNumber(example, { kind: format[0] as "F" | "N", digits: Number(format[1]) }, separators)
        : undefined,
  }))
}

/**
 * The text and caret after picking. A reference replaces what was typed and
 * is closed if nothing closes it yet, with the caret before the `}` - so a
 * `:` can follow for a format. A format completes the `}` if missing, with
 * the caret after it.
 */
export function applyCompletion(text: string, context: CompletionContext, choice: string): { text: string; caret: number } {
  const before = text.slice(0, context.queryStart)
  const after = text.slice(context.replaceEnd)
  const needsClose = context.closeAt < 0
  if (context.stage === "reference") {
    return { text: before + choice + (needsClose ? "}" : "") + after, caret: before.length + choice.length }
  }
  // The closing brace sits right after the format, or is added there.
  const rest = needsClose ? "}" + after : after
  const caret = before.length + choice.length + (rest.startsWith("}") ? 1 : 0)
  return { text: before + choice + rest, caret }
}
