import { test, expect } from "@playwright/test"
import vectors from "../lib/scaled-value/vectors.json"
import { formatWrite, scaleValue, type WriteFormat } from "../lib/scaled-value"

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
