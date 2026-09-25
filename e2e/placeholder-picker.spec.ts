import { test, expect } from "@playwright/test"
import type { Topic } from "../components/project-editor"
import { DEFAULT_SEPARATORS } from "../lib/placeholders"
import {
  applyCompletion,
  completionContext,
  formatEntries,
  referenceEntries,
} from "../lib/placeholder-completion"

// The placeholder picker (docs/2026-09-25-placeholder-picker.md). "completion"
// tests the pure logic in lib/placeholder-completion.ts without a browser;
// the field itself is tested in the browser below it.

// `|` marks the caret in these texts.
function at(marked: string): { text: string; caret: number } {
  const caret = marked.indexOf("|")
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), caret }
}

function contextAt(marked: string) {
  const { text, caret } = at(marked)
  return completionContext(text, caret)
}

function pick(marked: string, choice: string): string {
  const { text, caret } = at(marked)
  const context = completionContext(text, caret)
  if (!context) throw new Error(`no completion at ${marked}`)
  const result = applyCompletion(text, context, choice)
  return result.text.slice(0, result.caret) + "|" + result.text.slice(result.caret)
}

const TOPICS: Topic[] = [
  { id: "1", topic: "schaltli/state/tank/1/level", type: "numeric", examples: ["72.4", "35", "8"] },
  { id: "2", topic: "schaltli/state/tank/1/name", type: "text", examples: ["Frischwasser"] },
  {
    id: "3",
    topic: "sensors/cabin",
    type: "json",
    examples: ['{"temp":21.5,"humid":56}'],
    subtopics: [
      { id: "3a", path: "temp", type: "numeric" },
      { id: "3b", path: "humid", type: "numeric" },
    ],
  },
  { id: "4", topic: "schaltli/state/power/1", type: "text", examples: [] },
]

const references = (query: string) => referenceEntries(query, TOPICS).map((e) => e.reference)

test.describe("completion", () => {
  test("a { opens the reference stage with nothing typed yet", () => {
    expect(contextAt("Tank {|")).toMatchObject({ stage: "reference", query: "", start: 5 })
    expect(contextAt("{|}")).toMatchObject({ stage: "reference", query: "" })
  })

  test("{{ is a literal brace and offers nothing", () => {
    expect(contextAt("{{|")).toBeUndefined()
    expect(contextAt("a {{ b|")).toBeUndefined()
  })

  test("what is typed after the { is the query", () => {
    expect(contextAt("{topic:ta|")).toMatchObject({ stage: "reference", query: "topic:ta" })
    expect(contextAt("{frisch|")).toMatchObject({ stage: "reference", query: "frisch" })
    expect(contextAt("{device:|}")).toMatchObject({ stage: "reference", query: "device:" })
  })

  test("a : after a topic reference is the format stage", () => {
    expect(contextAt("{topic:a/b:|")).toMatchObject({ stage: "format", query: "", topicPath: "a/b" })
    expect(contextAt("{topic:a/b:F|")).toMatchObject({ stage: "format", query: "F", topicPath: "a/b" })
    expect(contextAt("{topic:a/b#temp:N2|}")).toMatchObject({ stage: "format", query: "N2", topicPath: "a/b#temp" })
  })

  test("the namespace's own : is not a format", () => {
    expect(contextAt("{topic:|")).toMatchObject({ stage: "reference", query: "topic:" })
    expect(contextAt("{device:model:|")).toMatchObject({ stage: "reference" })
  })

  test("outside a placeholder there is nothing to offer", () => {
    expect(contextAt("|")).toBeUndefined()
    expect(contextAt("{topic:a/b} |")).toBeUndefined()
    expect(contextAt("{topic:a/b}|")).toBeUndefined()
    expect(contextAt("}} {{ |")).toBeUndefined()
  })

  test("inside a quoted fallback or after whitespace there is nothing to offer", () => {
    expect(contextAt('{topic:a/b ?? "no {|')).toBeUndefined()
    expect(contextAt("{topic:a/b ?|")).toBeUndefined()
  })

  test("the closing brace after the caret is found", () => {
    expect(contextAt("{ta|}")!.closeAt).toBe(3)
    expect(contextAt("{ta| {b}")!.closeAt).toBe(-1)
  })

  test("every topic, a JSON topic's fields, and the device and project fields are offered", () => {
    expect(references("")).toEqual([
      "topic:schaltli/state/tank/1/level",
      "topic:schaltli/state/tank/1/name",
      "topic:sensors/cabin",
      "topic:sensors/cabin#temp",
      "topic:sensors/cabin#humid",
      "topic:schaltli/state/power/1",
      "device:model",
      "device:id",
      "project:name",
    ])
  })

  test("an entry shows its type and first example", () => {
    const [level] = referenceEntries("tank/1/level", TOPICS)
    expect(level).toMatchObject({ section: "topic", detail: "numeric", example: "72.4" })
    const [temp] = referenceEntries("#temp", TOPICS)
    expect(temp).toMatchObject({ detail: "numeric", example: "21.5" })
    const [model] = referenceEntries("device:model", TOPICS)
    expect(model).toMatchObject({ section: "device", detail: "the device's model", example: undefined })
  })

  test("the query matches the path and the example, ignoring case", () => {
    expect(references("tank")).toEqual(["topic:schaltli/state/tank/1/level", "topic:schaltli/state/tank/1/name"])
    expect(references("frisch")).toEqual(["topic:schaltli/state/tank/1/name"])
    // The JSON topic itself matches too: its example contains "humid".
    expect(references("HUMID")).toEqual(["topic:sensors/cabin", "topic:sensors/cabin#humid"])
    expect(references("nothing like it")).toEqual([])
  })

  test("a namespace narrows to its section", () => {
    expect(references("topic:")).toHaveLength(6)
    expect(references("topic:name")).toEqual(["topic:schaltli/state/tank/1/name"])
    expect(references("device:")).toEqual(["device:model", "device:id"])
    expect(references("project:")).toEqual(["project:name"])
    // "name" alone also finds the project's name.
    expect(references("name")).toEqual(["topic:schaltli/state/tank/1/name", "project:name"])
  })

  test("the offered formats preview the example in the given separators", () => {
    expect(formatEntries("", "12345.678", DEFAULT_SEPARATORS)).toEqual([
      { format: "F0", preview: "12346" },
      { format: "F1", preview: "12345.7" },
      { format: "F2", preview: "12345.68" },
      { format: "N0", preview: "12'346" },
      { format: "N2", preview: "12'345.68" },
    ])
    expect(formatEntries("N2", "12345.678", { decimal: ",", thousands: "." })).toEqual([
      { format: "N2", preview: "12.345,68" },
    ])
  })

  test("typing narrows the formats; one typed in full is kept", () => {
    expect(formatEntries("N", "1", DEFAULT_SEPARATORS).map((e) => e.format)).toEqual(["N0", "N2"])
    expect(formatEntries("F2", "1", DEFAULT_SEPARATORS).map((e) => e.format)).toEqual(["F2"])
    expect(formatEntries("f", "1", DEFAULT_SEPARATORS).map((e) => e.format)).toEqual(["F0", "F1", "F2"])
    expect(formatEntries("N5", "1", DEFAULT_SEPARATORS)).toEqual([{ format: "N5", preview: "1.00000" }])
    expect(formatEntries("X", "1", DEFAULT_SEPARATORS)).toEqual([])
  })

  test("without a numeric example the formats have no preview", () => {
    for (const example of ["Frischwasser", undefined]) {
      const entries = formatEntries("", example, DEFAULT_SEPARATORS)
      expect(entries.map((e) => e.format)).toEqual(["F0", "F1", "F2", "N0", "N2"])
      expect(entries.every((e) => e.preview === undefined)).toBe(true)
    }
  })

  test("picking a reference writes it closed, the caret before the }", () => {
    expect(pick("Tank {ta|", "topic:schaltli/state/tank/1/level")).toBe("Tank {topic:schaltli/state/tank/1/level|}")
    expect(pick("{|} %", "device:model")).toBe("{device:model|} %")
    expect(pick("{ta| and more", "topic:x")).toBe("{topic:x|} and more")
  })

  test("picking a reference inside one replaces it and keeps its format", () => {
    expect(pick("{topic:ta|nk/1:F1}", "topic:schaltli/state/tank/1/level")).toBe(
      "{topic:schaltli/state/tank/1/level|:F1}",
    )
    expect(pick("{ta|nk/1}", "topic:tank/2")).toBe("{topic:tank/2|}")
  })

  test("picking a format completes it and the }, the caret after it", () => {
    expect(pick("{topic:a/b:|", "F2")).toBe("{topic:a/b:F2}|")
    expect(pick("{topic:a/b:|} %", "F0")).toBe("{topic:a/b:F0}| %")
    expect(pick("{topic:a/b:N|} %", "N2")).toBe("{topic:a/b:N2}| %")
    expect(pick("{topic:a/b:F|1}", "F2")).toBe("{topic:a/b:F2}|")
  })

  test("the whole key sequence of the success criterion", () => {
    // {, tank, Enter on the level topic, :, F0, Enter.
    let text = pick("{tank|", "topic:schaltli/state/tank/1/level")
    text = text.replace("|", ":F0|")
    expect(contextAt(text)).toMatchObject({ stage: "format", query: "F0", topicPath: "schaltli/state/tank/1/level" })
    expect(pick(text, "F0")).toBe("{topic:schaltli/state/tank/1/level:F0}|")
  })
})
