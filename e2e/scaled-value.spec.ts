import { test, expect } from "@playwright/test"
import vectors from "../lib/scaled-value/vectors.json"
import { formatWrite, scaleValue, type WriteFormat } from "../lib/scaled-value"
import { combinedReadableFrom, combinedUsage, computeCombined, dependentsOf, evaluationOrder, renameCombined, type CombinedTopic } from "../lib/combined-topics"
import { placeholderScope, previewHeardTopics, projectSubscriptionTopics, withCombinedBindings } from "../lib/render-screen"
import { referenceEntries } from "../lib/placeholder-completion"
import { mergeNeeds, packClipboard, unpackClipboard } from "../lib/clipboard-transfer"

// A number scaled by a fraction and an offset, as a scaled topic reads it and
// a write format sends it (tasks/ha-templates-stage2-plan.md, decisions 1 and
// 3). The expected results are exact fractions computed by
// scripts/scaled-value-vectors.py, not by lib/scaled-value.ts; the firmware
// and the app run the same file. Pure: no browser.

test.describe("a scaled value", () => {
  for (const c of vectors.scale) {
    test(`${JSON.stringify(c.value)} × ${c.numerator}/${c.denominator} + ${c.offset}, ${c.decimals} decimals`, () => {
      const result = scaleValue(c.value, { numerator: c.numerator, denominator: c.denominator, offset: c.offset, decimals: c.decimals })
      expect(result ?? null).toBe(c.result)
    })
  }
})

test.describe("a write format", () => {
  for (const c of vectors.write) {
    test(`${JSON.stringify(c.value)} as ${JSON.stringify(c.format)}`, () => {
      expect(formatWrite(c.value, c.format as WriteFormat) ?? null).toBe(c.result)
    })
  }

  test("none: the value as it is", () => {
    expect(formatWrite("21.5", undefined)).toBe("21.5")
  })
})

// Scaled topics in a project (decision 2): the third kind of combined topic,
// computed in the evaluation order, read by conditions, renamed and found in
// use as the other two are, and computed in the preview's scope.
interface CombinedVector {
  name: string
  combinedTopics: CombinedTopic[]
  values: Record<string, string>
  expected?: Record<string, string | null>
  circular?: string[]
}
const combinedVectors = (vectors as unknown as { combined: CombinedVector[] }).combined

test.describe("a scaled topic", () => {
  for (const vector of combinedVectors) {
    test(vector.name, () => {
      const order = evaluationOrder(vector.combinedTopics)
      if (vector.circular) {
        expect(order.circular).toEqual(vector.circular)
        return
      }
      expect(order.circular).toBeUndefined()
      const computed = computeCombined(vector.combinedTopics, (path) => vector.values[path])
      const result: Record<string, string | null> = {}
      for (const ct of vector.combinedTopics) result[ct.name] = computed.get(ct.name) ?? null
      expect(result).toEqual(vector.expected)
    })
  }

  const [fahrenheit, celsius] = combinedVectors.find((v) => v.name.startsWith("a scaled topic reading another"))!.combinedTopics

  test("is computed after the one it reads, and recomputed with it", () => {
    expect(evaluationOrder([fahrenheit, celsius]).order.map((ct) => ct.name)).toEqual(["celsius", "fahrenheit"])
    expect(dependentsOf([fahrenheit, celsius], "kelvin", "topic")).toEqual(["celsius", "fahrenheit"])
    expect(combinedReadableFrom([fahrenheit, celsius], "celsius")).toEqual([])
  })

  test("is in use while another reads it, and renamed along", () => {
    const project = { combinedTopics: [fahrenheit, celsius], screens: [] }
    expect(combinedUsage(project, "celsius")).toEqual(["combined fahrenheit"])
    const renamed = renameCombined(project, "celsius", "temperature")
    expect(renamed.combinedTopics.map((ct) => ct.name)).toEqual(["fahrenheit", "temperature"])
    expect(renamed.combinedTopics[0].scale!.source).toEqual({ namespace: "combined", path: "temperature" })
  })

  test("the preview computes it from the source's example and from a test value", () => {
    const topics = [{ id: "1", topic: "kelvin", type: "numeric" as const, examples: ["300"] }]
    const separators = { decimal: ".", thousands: "'" }
    const scope = placeholderScope({ topics, combinedTopics: [fahrenheit, celsius], separators })
    expect([scope.combined?.("celsius"), scope.combined?.("fahrenheit")]).toEqual(["26.85", "80.3"])
    const tested = placeholderScope({ topics, combinedTopics: [fahrenheit, celsius], separators, test: { source: { namespace: "topic", path: "kelvin" }, value: "273.15" } })
    expect([tested.combined?.("celsius"), tested.combined?.("fahrenheit")]).toEqual(["0.00", "32.0"])
    expect(previewHeardTopics([], [], [celsius])).toEqual(new Set(["kelvin"]))
  })

  test("is offered to a text as a number", () => {
    const entries = referenceEntries("", [], [celsius, { name: "glaette", mode: "all" }])
    expect(entries.filter((e) => e.section === "combined").map((e) => [e.reference, e.detail])).toEqual([
      ["combined:celsius", "number"],
      ["combined:glaette", "yes / no"],
    ])
  })
})

test.describe("a scaled topic on the clipboard", () => {
  test("comes along with a text that reads it, its source too, renamed where the name is taken", () => {
    const [fahrenheit, celsius] = combinedVectors.find((v) => v.name.startsWith("a scaled topic reading another"))!.combinedTopics
    const text = { id: "t", type: "text", x: 0, y: 0, width: 50, height: 20, zIndex: 0, properties: { text: "{live:0}", liveValues: [{ source: { namespace: "combined", path: "fahrenheit" }, rules: [] }] } }
    const from = { assets: [], fonts: [], topics: [{ id: "k", topic: "kelvin", type: "numeric", examples: ["300"] }], combinedTopics: [fahrenheit, celsius], screens: [] } as any
    const payload = unpackClipboard(packClipboard(from, { objects: [text as any] }, "x"))!
    expect(payload.topics.map((t) => t.topic)).toEqual(["kelvin"])
    expect(payload.combinedTopics.map((c) => c.name).sort()).toEqual(["celsius", "fahrenheit"])

    const other = { ...celsius, scale: { ...celsius.scale!, offset: "0" } }
    const into = { assets: [], fonts: [], topics: [], combinedTopics: [other], screens: [] } as any
    const merged = mergeNeeds(into, payload).project.combinedTopics!
    expect(merged.map((c) => c.name).sort()).toEqual(["celsius", "celsius_2", "fahrenheit"])
    expect(merged.find((c) => c.name === "fahrenheit")!.scale!.source).toEqual({ namespace: "combined", path: "celsius_2" })
  })
})

// A bar or a gauge reads a scaled topic as `combined:<name>`, as a device
// does through ProjectLoader::getTopicValue (S6): the preview computes it,
// "" before its source has a value, and nothing subscribes the name.
test.describe("an object bound to a scaled topic", () => {
  const [fahrenheit, celsius] = combinedVectors.find((v) => v.name.startsWith("a scaled topic reading another"))!.combinedTopics
  const topics = [{ id: "1", topic: "kelvin", type: "numeric" as const, examples: ["300"] }]
  const separators = { decimal: ".", thousands: "'" }

  test("reads it in the preview, from the examples and from what arrived", () => {
    const fromTopic = (t: string | undefined) => `topic ${t}`
    const examples = withCombinedBindings(fromTopic, placeholderScope({ topics, combinedTopics: [fahrenheit, celsius], separators }))
    expect(examples("combined:fahrenheit")).toBe("80.3")
    expect(examples("kelvin")).toBe("topic kelvin")
    const arrived = withCombinedBindings(fromTopic, placeholderScope({ topics, liveValues: {}, combinedTopics: [fahrenheit, celsius], separators }))
    expect(arrived("combined:celsius")).toBe("")
  })

  test("is not subscribed as a topic", () => {
    const bar = { id: "b", type: "bar", x: 0, y: 0, width: 100, height: 20, zIndex: 0, properties: { topic: "combined:celsius" } }
    expect(projectSubscriptionTopics({ topics: [], screens: [{ objects: [bar as any] }] })).toEqual([])
  })
})
