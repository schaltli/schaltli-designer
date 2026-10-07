// What the value search offers, and the problems a text's braces have
// (docs/2026-09-25-placeholder-picker.md; since 2026-10-07 the search inserts
// chips, components/property-panel/fields/live-text-field.tsx). Pure, like
// lib/placeholders.ts beside it, so the rules can be tested without a browser.

import type { Topic } from "@/components/project-editor"
import { extractJsonField } from "@/lib/json-path"
import { FIELDS, parse } from "@/lib/placeholders"

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
 * `küch` finds the topic whose example is «Küche» - and a namespace
 * typed in front (`topic:kitchen`) keeps to that section.
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

/**
 * The first example of a topic path - a JSON field's value when the path has
 * `#field` - which is what a chip reads in the designer.
 */
export function topicExample(path: string, topics: Topic[]): string | undefined {
  const hash = path.indexOf("#")
  const topicPath = hash < 0 ? path : path.slice(0, hash)
  const first = topics.find((t) => t.topic === topicPath)?.examples?.[0]
  if (first === undefined || hash < 0) return first
  return extractJsonField(first, path.slice(hash + 1))
}

export interface PlaceholderProblem {
  /**
   * "error": a device shows it as written, braces and all. "warning": fine
   * on a device, but it names a topic the project does not have yet.
   */
  severity: "error" | "warning"
  text: string
  /** The placeholder's own source - `{device:name}` - to point at. */
  source: string
}

// device:name and project:version are known and planned (issues #41, #40),
// so "unknown field" would send the author looking for a typo.
const RESERVED_FIELDS = ["device:name", "project:version"]

/**
 * What is wrong with a text's placeholders, one entry per placeholder, in
 * order - the lines under the field (a single-line input cannot underline
 * part of its text). Empty when all is well.
 */
export function placeholderProblems(text: string, topics: Topic[]): PlaceholderProblem[] {
  const problems: PlaceholderProblem[] = []
  const declared = new Set(topics.map((t) => t.topic))
  const seen = new Set<string>()
  for (const segment of parse(text)) {
    if (segment.kind === "raw") {
      // A live value's reference is no placeholder, and no problem
      // (docs/2026-10-07-live-values.md, decision 17).
      if (segment.source.startsWith("{live:") && segment.source.endsWith("}")) continue
      const body = segment.source.slice(1, segment.source.endsWith("}") ? -1 : undefined)
      const reason = RESERVED_FIELDS.includes(body) ? "reserved for later" : segment.reason
      problems.push({
        severity: "error",
        text: `${segment.source} is shown as written: ${reason}`,
        source: segment.source,
      })
    } else if (segment.kind === "placeholder" && segment.reference.namespace === "topic") {
      const topic = segment.reference.path.split("#")[0]
      if (declared.has(topic) || seen.has(topic)) continue
      seen.add(topic)
      problems.push({
        severity: "warning",
        text: `${topic} is not in the project yet - added when you leave the field`,
        source: segment.source,
      })
    }
  }
  return problems
}
