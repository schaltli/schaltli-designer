import { test, expect } from "@playwright/test"
import type { Topic } from "../components/project-editor"
import { placeholderProblems, referenceEntries, topicExample } from "../lib/placeholder-completion"

// What the value search offers and the problems a text's braces have
// (lib/placeholder-completion.ts), without a browser. Since 2026-10-07 the
// search inserts chips; the field is tested in e2e/live-value-chips.spec.ts.

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

test.describe("the value search and its problems", () => {
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
    expect(model).toMatchObject({ section: "device", detail: "the device's model" })
    expect(model.example).toBeUndefined()
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

  test("a placeholder a device shows as written is an error, saying why", () => {
    const problems = (text: string) => placeholderProblems(text, TOPICS).map((p) => [p.severity, p.text])
    expect(problems("{device:name}")).toEqual([["error", "{device:name} is shown as written: reserved for later"]])
    expect(problems("{project:version}")).toEqual([["error", "{project:version} is shown as written: reserved for later"]])
    expect(problems("{device:colour}")).toEqual([["error", "{device:colour} is shown as written: unknown field"]])
    expect(problems("{screen}")).toEqual([["error", "{screen} is shown as written: unknown namespace"]])
    expect(problems("a {topic:x")).toEqual([["error", "{topic:x is shown as written: no closing }"]])
  })

  test("a topic the project does not have is a warning, once", () => {
    const problems = (text: string) => placeholderProblems(text, TOPICS).map((p) => [p.severity, p.text])
    expect(problems("{topic:new/one} {topic:new/one:F1} {topic:sensors/cabin#temp}")).toEqual([
      ["warning", "new/one is not in the project yet - added when you leave the field"],
    ])
  })

  test("a clean text has no problems", () => {
    expect(placeholderProblems("Tank {topic:schaltli/state/tank/1/level:F0} % {{x}} {device:id}", TOPICS)).toEqual([])
  })

})
