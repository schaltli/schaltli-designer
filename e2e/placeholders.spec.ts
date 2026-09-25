import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { DEFAULT_SEPARATORS, parse, referencedTopics, resolve } from "../lib/placeholders"

// Placeholders in texts (docs/2026-09-25-text-placeholders.md). The cases are
// data in lib/placeholders/vectors.json, shared with the firmware and the
// Android app, which must turn every text into the same result - so a case
// belongs there, not here.

interface Vector {
  name: string
  text: string
  values?: Record<string, string>
  decimal?: string
  thousands?: string
  expected: string
}

const { cases } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "lib", "placeholders", "vectors.json"), "utf8"),
) as { cases: Vector[] }

test.describe("placeholder vectors", () => {
  for (const vector of cases) {
    test(vector.name, () => {
      const values = vector.values ?? {}
      const lookup = (ref: { namespace: string; path: string }) => {
        const key = `${ref.namespace}:${ref.path}`
        return key in values ? values[key] : undefined
      }
      const separators = {
        decimal: vector.decimal ?? DEFAULT_SEPARATORS.decimal,
        thousands: vector.thousands ?? DEFAULT_SEPARATORS.thousands,
      }
      expect(resolve(vector.text, lookup, separators)).toBe(vector.expected)
    })
  }
})

test.describe("placeholders beyond the shared vectors", () => {
  test("the vectors are many and their names unique", () => {
    expect(cases.length).toBeGreaterThan(50)
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length)
  })

  test("the topics a text refers to, each once, for subscribing and declaring", () => {
    expect(referencedTopics("{topic:a/b:F1} {topic:c ?? 0} {topic:a/b} {device:id} {screen} {topic:van/data#temp}")).toEqual([
      "a/b",
      "c",
      "van/data#temp",
    ])
  })

  test("an unknown or reserved placeholder says why, for the editor to show", () => {
    const [segment] = parse("{(topic:a < 0 ? \"x\" : \"y\")}")
    expect(segment).toMatchObject({ kind: "raw", reason: "expressions are reserved for later" })
    expect(parse("{device:name}")[0]).toMatchObject({ kind: "raw", reason: "unknown field" })
  })
})
