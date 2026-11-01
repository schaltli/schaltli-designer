import { test, expect } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// Pins the worked values of the 4-bit font blend (docs/device-contract.md,
// «Font depth»; docs/2026-11-01-4bit-fonts.md, decision 7).
//
// The table is what both sides check their own blend against: the designer's
// renderer and the firmware's native tests (schaltli-firmware test/). This
// spec only makes sure the table itself says what the contract says, so a
// hand edit of one number cannot quietly move both implementations at once.

type Rgb565 = { r: number; g: number; b: number }
type Case = { under: Rgb565; ink: Rgb565; coverage: number; out: Rgb565; note?: string }

const cases: Case[] = JSON.parse(
  readFileSync(path.join(__dirname, "..", "lib", "fixtures", "blend565-cases.json"), "utf8"),
)

// The contract's arithmetic, written out here a second time on purpose.
function contract(under: Rgb565, ink: Rgb565, coverage: number): Rgb565 {
  const alpha = Math.floor((coverage * 256 + 7) / 15)
  const mix = (u: number, i: number) => (u * (256 - alpha) + i * alpha + 128) >> 8
  return { r: mix(under.r, ink.r), g: mix(under.g, ink.g), b: mix(under.b, ink.b) }
}

const inRange = (c: Rgb565) => c.r >= 0 && c.r <= 31 && c.g >= 0 && c.g <= 63 && c.b >= 0 && c.b <= 31

test("the table has the edge cases and enough between them", () => {
  expect(cases.length).toBeGreaterThanOrEqual(10)
  const coverages = new Set(cases.map((c) => c.coverage))
  for (const needed of [0, 1, 7, 8, 14, 15]) expect(coverages.has(needed)).toBe(true)
})

test("every case is in RGB565 range and follows the contract", () => {
  for (const c of cases) {
    expect(inRange(c.under) && inRange(c.ink) && inRange(c.out), JSON.stringify(c)).toBe(true)
    expect(c.out, JSON.stringify(c)).toEqual(contract(c.under, c.ink, c.coverage))
  }
})

// The firmware's native test reads a copy of the table, embedded in a header
// (schaltli-firmware test/test_glyph_pixels/blend565_cases.h). Checked here
// when the firmware sits next to this repo, as test:all expects it to.
test("the firmware's copy of the table is this table", () => {
  const header = path.join(__dirname, "..", "..", "schaltli-firmware", "test", "test_glyph_pixels", "blend565_cases.h")
  test.skip(!existsSync(header), `schaltli-firmware not next to this repo (${header})`)
  const embedded = /R"JSON\(([\s\S]*?)\)JSON"/.exec(readFileSync(header, "utf8"))
  expect(embedded, "a raw JSON string in the header").not.toBeNull()
  expect(JSON.parse(embedded![1])).toEqual(cases)
})

test("coverage 0 leaves the pixel, 15 writes the ink", () => {
  for (const c of cases) {
    if (c.coverage === 0) expect(c.out).toEqual(c.under)
    if (c.coverage === 15) expect(c.out).toEqual(c.ink)
  }
})
