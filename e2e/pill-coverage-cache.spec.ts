import { test, expect } from "@playwright/test"
import {
  PILL_COVERAGE_CACHE_SIZE,
  pillBandsBounds,
  pillCoverage,
  pillCoverageCacheSize,
  pillPixelBands,
  type PillBand,
} from "../lib/pill-raster"

// The pills' coverage, cached (#58, docs/2026-10-09-preview-performance.md):
// the counts the cache hands back are the ones pillPixelBands gives pixel by
// pixel - the rasterizer every device copies - for every kind of shape, and
// wherever on the screen it lies. The cache is only allowed to be faster.

function direct(bands: PillBand[], box: { x: number; y: number; w: number; h: number }): number[] {
  const out: number[] = []
  for (let py = 0; py < box.h; py++) {
    for (let px = 0; px < box.w; px++) out.push(...pillPixelBands(bands, box.x + px, box.y + py))
  }
  return out
}

const SHAPES: Record<string, PillBand[]> = {
  pill: [{ x: 10, y: 10, w: 100, h: 16, rLow: 8, rHigh: 8 }],
  "ends of different radii": [{ x: 3, y: 7, w: 61, h: 21, rLow: 10, rHigh: 2 }],
  "an oversized radius": [{ x: 0, y: 0, w: 30, h: 9, rLow: 40, rHigh: 40 }],
  vertical: [{ x: 5, y: 2, w: 16, h: 70, rLow: 8, rHigh: 0, vertical: true }],
  "a tip": [{ x: 4, y: 4, w: 13, h: 9, rLow: 0, rHigh: 0, tip: "down" }],
  // A handle before the run it lies on, a hole before the ring it cuts: the
  // first band that holds a sub-sample keeps it.
  "bands by priority": [
    { x: 40, y: 5, w: 20, h: 20, rLow: 10, rHigh: 10 },
    { x: 12, y: 13, w: 30, h: 4, rLow: 2, rHigh: 0 },
    { x: 10, y: 10, w: 80, h: 10, rLow: 5, rHigh: 5 },
  ],
}

for (const [name, bands] of Object.entries(SHAPES)) {
  test(`the cached coverage of ${name} is pillPixelBands' pixel for pixel, here and moved`, () => {
    expect(bands.length).toBeGreaterThan(0)
    const box = pillBandsBounds(bands)
    // A box larger than the shape, as a glow asks for.
    const wide = { x: box.x - 3, y: box.y - 2, w: box.w + 6, h: box.h + 5 }
    for (const b of [box, wide]) {
      expect(Array.from(pillCoverage(bands, b))).toEqual(direct(bands, b))
    }
    // Moved by whole pixels: the same counts, from the same entry.
    const moved = bands.map((b) => ({ ...b, x: b.x + 137, y: b.y + 59 }))
    const movedBox = { ...box, x: box.x + 137, y: box.y + 59 }
    expect(pillCoverage(moved, movedBox)).toBe(pillCoverage(bands, box))
    expect(Array.from(pillCoverage(moved, movedBox))).toEqual(direct(moved, movedBox))
  })
}

test("a shape that differs in any one field is a different entry", () => {
  const base: PillBand = { x: 0, y: 0, w: 50, h: 12, rLow: 6, rHigh: 6 }
  const box = { x: 0, y: 0, w: 50, h: 12 }
  const first = pillCoverage([base], box)
  for (const variant of [{ rLow: 5 }, { rHigh: 0 }, { vertical: true }, { tip: "up" as const }]) {
    const other = pillCoverage([{ ...base, ...variant }], box)
    expect(other).not.toBe(first)
    expect(Array.from(other)).toEqual(direct([{ ...base, ...variant }], box))
  }
})

test(`the cache keeps at most ${PILL_COVERAGE_CACHE_SIZE} shapes, dropping the one used longest ago`, () => {
  const keep: PillBand = { x: 0, y: 0, w: 9, h: 9, rLow: 4, rHigh: 4 }
  const keepBox = { x: 0, y: 0, w: 9, h: 9 }
  const kept = pillCoverage([keep], keepBox)
  for (let i = 0; i < PILL_COVERAGE_CACHE_SIZE + 50; i++) {
    pillCoverage([{ x: 0, y: 0, w: 3 + (i % 40), h: 2 + Math.floor(i / 40), rLow: 1, rHigh: 1 }], { x: 0, y: 0, w: 3 + (i % 40), h: 2 + Math.floor(i / 40) })
    // Used now and then, so it stays.
    if (i % 100 === 0) expect(pillCoverage([keep], keepBox)).toBe(kept)
  }
  expect(pillCoverageCacheSize()).toBe(PILL_COVERAGE_CACHE_SIZE)
  expect(pillCoverage([keep], keepBox)).toBe(kept)
})
