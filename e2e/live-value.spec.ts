import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { parse } from "../lib/placeholders"
import { evaluate, isNo, isYes, placeholdersToLiveValues, resolveLiveText, textOf, type LiveValue, type Rule, type Source } from "../lib/live-value"

// Live values (docs/2026-10-07-live-values.md). The cases are data in
// lib/live-value/vectors.json, to be shared with the firmware and the Android
// app as lib/placeholders/vectors.json is - so a case belongs there, not here.

interface EvaluateVector {
  name: string
  rules: Omit<Rule, "result">[]
  value?: string
  applies: number | "otherwise" | "noValueYet"
}

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lib", "live-value", "vectors.json"), "utf8")) as {
  evaluate: EvaluateVector[]
}

test.describe("live value vectors: which rule applies", () => {
  for (const vector of vectors.evaluate) {
    test(vector.name, () => {
      const rules = vector.rules.map((rule, i) => ({ ...rule, result: { kind: "text" as const, parts: [`rule ${i}`] } }))
      expect(evaluate({ id: "lv1", source: { namespace: "topic", path: "t" }, rules }, vector.value).applies).toEqual(vector.applies)
    })
  }
})

interface TextVector {
  name: string
  liveValue: LiveValue
  value?: string
  decimal?: string
  thousands?: string
  expected: string
}

interface ResolveVector {
  name: string
  text: string
  liveValues: LiveValue[]
  values: Record<string, string>
  expected: string
}

const textVectors = vectors as unknown as { text: TextVector[]; resolve: ResolveVector[] }

test.describe("live value vectors: as text", () => {
  for (const vector of textVectors.text) {
    test(vector.name, () => {
      const separators = { decimal: vector.decimal ?? ".", thousands: vector.thousands ?? "'" }
      expect(textOf(vector.liveValue, vector.value, separators)).toBe(vector.expected)
    })
  }
})

test.describe("live value vectors: a whole text", () => {
  for (const vector of textVectors.resolve) {
    test(vector.name, () => {
      const lookup = (source: Source) => vector.values[`${source.namespace}:${source.path}`]
      expect(resolveLiveText(vector.text, vector.liveValues, lookup, { decimal: ".", thousands: "'" })).toBe(vector.expected)
    })
  }
})

// Every placeholder case (lib/placeholders/vectors.json), its text turned into
// live values, reads exactly as the placeholder did: the migration loses
// nothing a text could say (Task 3).
test.describe("placeholders become live values and read the same", () => {
  const placeholderCases = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "lib", "placeholders", "vectors.json"), "utf8"),
  ).cases as { name: string; text: string; values?: Record<string, string>; decimal?: string; thousands?: string; expected: string }[]
  for (const vector of placeholderCases) {
    test(vector.name, () => {
      const separators = { decimal: vector.decimal ?? ".", thousands: vector.thousands ?? "'" }
      const { text, liveValues } = placeholdersToLiveValues(vector.text, [], separators)
      // No placeholder a device would resolve is left; one it shows as
      // written (reserved, broken) stays as written.
      expect(parse(text).filter((segment) => segment.kind === "placeholder")).toEqual([])
      const values = vector.values ?? {}
      const lookup = (source: Source) => values[`${source.namespace}:${source.path}`]
      expect(resolveLiveText(text, liveValues, lookup, separators)).toBe(vector.expected)
    })
  }

  test("ids go on from the ones the object has, and a second pass changes nothing", () => {
    const first = placeholdersToLiveValues("A {topic:a} B {topic:b ?? 0:F1}", [{ id: "lv1", source: { namespace: "topic", path: "x" }, rules: [] }], {
      decimal: ".",
      thousands: "'",
    })
    expect(first.text).toBe("A {live:lv2} B {live:lv3}")
    expect(first.liveValues.map((lv) => lv.id)).toEqual(["lv1", "lv2", "lv3"])
    expect(first.liveValues[2]).toMatchObject({
      source: { namespace: "topic", path: "b" },
      format: { kind: "number", decimals: 1, grouped: false },
      noValueYet: { kind: "text", parts: ["0.0"] },
    })
    const again = placeholdersToLiveValues(first.text, first.liveValues, { decimal: ".", thousands: "'" })
    expect(again).toEqual(first)
  })
})

test.describe("is yes / is no", () => {
  test("a value is never both", () => {
    for (const value of ["true", "on", "yes", "1", "-3", "false", "off", "no", "0", "", "fan_only", "  "]) {
      expect(isYes(value) && isNo(value), value).toBe(false)
    }
  })
})
