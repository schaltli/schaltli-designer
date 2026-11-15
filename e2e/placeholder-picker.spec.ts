import { test, expect } from "@playwright/test"
import type { Topic } from "../components/project-editor"
import { completionChoices, placeholderProblems, referenceEntries, tabGhost, tabStep, topicExample } from "../lib/placeholder-completion"

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
  test("every topic, a JSON topic's fields, and the device, project and screen fields are offered", () => {
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
      "screen:name",
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

  // The path only, since 2026-11-15: a topic whose value holds what was
  // typed surprised in a list of topics (the user).
  test("the query matches the path only, ignoring case - not the example", () => {
    expect(references("tank")).toEqual(["topic:schaltli/state/tank/1/level", "topic:schaltli/state/tank/1/name"])
    expect(references("frisch")).toEqual([])
    expect(references("HUMID")).toEqual(["topic:sensors/cabin#humid"])
    expect(references("nothing like it")).toEqual([])
  })

  test("the topics heard on the broker are in the same list, marked: the project's first without a query, by how well they match with one", () => {
    const heard = [
      { topic: "pkw/tele/temp", type: "numeric", latest: "19" },
      { topic: "schaltli/state/tank/1/level", type: "numeric", latest: "50" },
      { topic: "acme/tank", type: "text", latest: "x" },
    ]
    const all = referenceEntries("", TOPICS, [], heard).filter((e) => e.section === "topic")
    // The project's in its order, then the rest heard, by path.
    expect(all.map((e) => e.reference).slice(-2)).toEqual(["topic:acme/tank", "topic:pkw/tele/temp"])
    const level = all.find((e) => e.reference === "topic:schaltli/state/tank/1/level")!
    // Heard: its latest value instead of the example.
    expect(level).toMatchObject({ inProject: true, heard: true, example: "50" })
    expect(all.find((e) => e.reference === "topic:schaltli/state/tank/1/name")).toMatchObject({ inProject: true, heard: false })
    expect(all.find((e) => e.reference === "topic:acme/tank")).toMatchObject({ inProject: false, heard: true })
    // «tank»: where a segment starts with it before where it is anywhere, then by path.
    expect(referenceEntries("tank", TOPICS, [], heard).map((e) => e.reference)).toEqual([
      "topic:acme/tank",
      "topic:schaltli/state/tank/1/level",
      "topic:schaltli/state/tank/1/name",
    ])
  })

  // Tab completes as a shell completes a path (the user, 2026-11-15).
  test("Tab: as far as the paths agree, then round the choices where they part; from where a segment starts with what is typed", () => {
    const paths = ["schaltli/state/heat/status", "schaltli/state/heat/status_line", "schaltli2/x", "pkw/tele/heat"]
    expect(completionChoices("sch", paths)).toEqual(["schaltli/", "schaltli2/"])
    expect(tabStep("sch", paths)).toEqual({ next: "schaltli" })
    expect(tabGhost("sch", paths)).toBe("altli")
    expect(tabStep("schaltli", paths)).toEqual({ cycle: ["schaltli/", "schaltli2/"], start: 0 })
    expect(tabGhost("schaltli", paths)).toBe("/")
    expect(tabStep("schaltli/", paths)).toEqual({ next: "schaltli/state/" })
    // Mid-path: «heat» starts a segment in two topics' paths.
    expect(completionChoices("heat", paths)).toEqual(["heat", "heat/"])
    expect(tabStep("heat/st", paths)).toEqual({ next: "heat/status" })
    // A whole path and a longer one: round them, from the one that adds something.
    expect(tabStep("heat/status", paths)).toEqual({ cycle: ["heat/status", "heat/status_line"], start: 1 })
    // Inside a word, or nothing like it: nothing to add.
    expect(tabStep("eat", paths)).toBeNull()
    expect(tabGhost("eat", paths)).toBe("")
    expect(tabStep("", paths)).toBeNull()
    // One path whole: nothing more.
    expect(tabStep("pkw/tele/heat", paths)).toBeNull()
  })

  test("a namespace narrows to its section", () => {
    expect(references("topic:")).toHaveLength(6)
    expect(references("topic:name")).toEqual(["topic:schaltli/state/tank/1/name"])
    expect(references("device:")).toEqual(["device:model", "device:id"])
    expect(references("project:")).toEqual(["project:name"])
    expect(references("screen:")).toEqual(["screen:name"])
    // "name" alone also finds the project's and the screen's name.
    expect(references("name")).toEqual(["topic:schaltli/state/tank/1/name", "project:name", "screen:name"])
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
