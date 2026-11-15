// What the value search offers, and the problems a text's braces have
// (docs/2026-09-25-placeholder-picker.md; since 2026-10-07 the search inserts
// chips, components/property-panel/fields/live-text-field.tsx). Pure, like
// lib/placeholders.ts beside it, so the rules can be tested without a browser.

import type { Topic } from "@/components/project-editor"
import { extractJsonField } from "@/lib/json-path"
import { FIELDS, parse } from "@/lib/placeholders"

export interface ReferenceEntry {
  section: "topic" | "combined" | "device" | "project" | "screen"
  /** What is written between the braces: `topic:a/b#temp`, `device:model`. */
  reference: string
  /** The type for a topic, a short description for a field. */
  detail: string
  /**
   * A topic's latest value heard on the broker, else its first example (a
   * JSON field's value in it), if any.
   */
  example?: string
  /** A topic: whether the project has it - picking one it lacks adds it. */
  inProject?: boolean
  /** A topic: whether the designer heard it on the broker. */
  heard?: boolean
  /** A topic the display keeps itself (lib/local-topics.ts): never heard, and none missed. */
  local?: boolean
}

const FIELD_DETAILS: Record<string, string> = {
  "device:model": "the device's model",
  "device:id": "the device's id",
  "project:name": "the project's name",
  "screen:name": "the name of the screen it shows on",
}

/** A topic heard on the broker, as the completion offers it. */
export interface HeardReference {
  topic: string
  type: string
  /** The latest payload heard. */
  latest?: string
}

// A topic reference's path, `a/b#temp` of `topic:a/b#temp`.
const pathOf = (reference: string) => reference.slice(reference.indexOf(":") + 1)

// Where in `path` a segment starts: its beginning and after every «/».
function segmentStarts(path: string): number[] {
  const starts = [0]
  for (let i = path.indexOf("/"); i >= 0; i = path.indexOf("/", i + 1)) starts.push(i + 1)
  return starts
}

// How well a path matches the search, best first: the path itself, its
// beginning, the beginning of one of its segments, anywhere.
function rank(path: string, term: string): number {
  const lower = path.toLowerCase()
  if (lower === term) return 0
  if (lower.startsWith(term)) return 1
  if (segmentStarts(lower).some((at) => lower.startsWith(term, at))) return 2
  return 3
}

/**
 * What the value search offers for a query, in section order: the topics -
 * the project's and those heard on the broker in one list (the user,
 * 2026-11-15; until then the heard ones were a section of their own) - then
 * combined topics, then device, project and screen fields. The query
 * matches the path only, ignoring case: a topic whose value holds «hello»
 * is not found by typing it, which surprised (2026-11-15; until then the
 * example was searched too, so a name held in a value found its topic).
 * A namespace typed in front (`topic:kitchen`) keeps to
 * that section. Without a query the project's topics come first, in their
 * order, then the heard ones by path - a van's broker carries hundreds; with
 * one, the topics by how well they match, then by path.
 */
export function referenceEntries(
  query: string,
  topics: Topic[],
  combined: readonly { name: string; mode?: string }[] = [],
  heard: readonly HeardReference[] = [],
): ReferenceEntry[] {
  const latest = new Map(heard.map((h) => [h.topic, h.latest]))
  const project: ReferenceEntry[] = []
  for (const topic of topics) {
    const wasHeard = latest.has(topic.topic)
    const value = wasHeard ? latest.get(topic.topic) : topic.examples?.[0]
    const marks = { inProject: true, heard: wasHeard, ...(topic.local ? { local: true } : {}) }
    project.push({ section: "topic", reference: `topic:${topic.topic}`, detail: topic.type, example: value, ...marks })
    for (const field of topic.subtopics ?? []) {
      project.push({
        section: "topic",
        reference: `topic:${topic.topic}#${field.path}`,
        detail: field.type,
        example: value !== undefined ? extractJsonField(value, field.path) : undefined,
        ...marks,
      })
    }
  }
  const declared = new Set(topics.map((t) => t.topic))
  const fromBroker = heard
    .filter((h) => !declared.has(h.topic))
    .map((h): ReferenceEntry => ({ section: "topic", reference: `topic:${h.topic}`, detail: h.type, example: h.latest, inProject: false, heard: true }))
    .sort((a, b) => a.reference.localeCompare(b.reference))
  const others: ReferenceEntry[] = []
  // Combined topics after the topics they are made of (lib/combined-topics.ts).
  for (const ct of combined) others.push({ section: "combined", reference: `combined:${ct.name}`, detail: ct.mode === "scale" ? "number" : "yes / no" })
  for (const namespace of ["device", "project", "screen"] as const) {
    for (const field of FIELDS[namespace]) {
      const reference = `${namespace}:${field}`
      others.push({ section: namespace, reference, detail: FIELD_DETAILS[reference] ?? "" })
    }
  }

  let term = query.toLowerCase()
  let section: ReferenceEntry["section"] | undefined
  for (const namespace of ["topic", "combined", "device", "project", "screen"] as const) {
    if (term.startsWith(`${namespace}:`)) {
      section = namespace
      term = term.slice(namespace.length + 1)
    }
  }
  const keep = (entry: ReferenceEntry) => (!section || entry.section === section) && (term === "" || entry.reference.toLowerCase().includes(term))
  const topicEntries = [...project, ...fromBroker].filter(keep)
  if (term !== "") {
    topicEntries.sort((a, b) => rank(pathOf(a.reference), term) - rank(pathOf(b.reference), term) || pathOf(a.reference).localeCompare(pathOf(b.reference)))
  }
  return [...topicEntries, ...others.filter(keep)]
}

/**
 * What Tab may make of a search (the user, 2026-11-15), as a shell does
 * with a path: wherever the query starts a segment of a path - at its
 * beginning or after a «/» - what follows it up to the next «/», added to the
 * query. The choices, sorted; none where no path has a segment starting so.
 * «sch» with schaltli/a and schaltli2/b: «schaltli/» and «schaltli2/».
 */
export function completionChoices(query: string, paths: readonly string[]): string[] {
  if (query === "") return []
  const term = query.toLowerCase()
  const found = new Set<string>()
  for (const path of paths) {
    const lower = path.toLowerCase()
    for (const at of segmentStarts(lower)) {
      if (!lower.startsWith(term, at)) continue
      const rest = path.slice(at + term.length)
      const slash = rest.indexOf("/")
      found.add(query + (slash < 0 ? rest : rest.slice(0, slash + 1)))
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b))
}

/**
 * One press of Tab: the query made longer as far as all choices agree, or -
 * where they part at once - the choices to go through, one per press, from
 * the first that differs from the query and round again (the user,
 * 2026-11-15: like `cd` in a shell). Null: nothing to add.
 */
export function tabStep(query: string, paths: readonly string[]): { next: string } | { cycle: string[]; start: number } | null {
  const choices = completionChoices(query, paths)
  if (choices.length === 0) return null
  if (choices.length === 1) return choices[0] === query ? null : { next: choices[0] }
  const tails = choices.map((c) => c.slice(query.length))
  let common = tails[0]
  for (const t of tails) while (!t.startsWith(common)) common = common.slice(0, -1)
  if (common !== "") return { next: query + common }
  const start = choices.findIndex((c) => c !== query)
  return { cycle: choices, start: start < 0 ? 0 : start }
}

/** What Tab would add, shown grey after the query: the part all choices agree on, or the first choice's. */
export function tabGhost(query: string, paths: readonly string[]): string {
  const step = tabStep(query, paths)
  if (!step) return ""
  const next = "next" in step ? step.next : step.cycle[step.start]
  return next.toLowerCase().startsWith(query.toLowerCase()) ? next.slice(query.length) : ""
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
