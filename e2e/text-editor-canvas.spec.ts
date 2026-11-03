import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"

// A 4-bit text on the editor's canvas, which zooms, pans and centres the
// screen - often half a pixel off: matrix(1, 0, 0, 1, 454.5, 373.5). Each
// glyph goes down as one picture (lib/bdffont.ts drawCoverageImage); drawn
// there without smoothing it came apart column by column, a caption in a
// card unreadable (the user, 2026-11-03).

const FONT = path.join(__dirname, "..", "..", "schaltli-firmware", "ddf-source-waveshare4", "fonts", "roboto-c9.bdf")
type Tf = [number, number, number, number, number, number]

// Within a few steps: at 1:1 on whole pixels an edge is mixed in RGB565 as
// the board mixes it, anywhere else drawn at its coverage's opacity.
function near(a: number[][], b: number[][], what: string) {
  expect(a.length).toBe(b.length)
  for (let y = 0; y < a.length; y++) for (let x = 0; x < a[y].length; x++) expect(Math.abs(a[y][x] - b[y][x]), `${what} ${x},${y}`).toBeLessThanOrEqual(12)
}

async function drawn(page: Page, transform: Tf, width = 60, height = 30): Promise<{ rows: number[][]; glyphs: { x: number; y: number; smoothed: boolean }[] }> {
  return page.evaluate((req) => (window as any).__textOnCanvasForTest(req), { bdf: fs.readFileSync(FONT, "utf8"), text: "Label", transform, width, height })
}
const draw = async (page: Page, transform: Tf, width = 60, height = 30) => (await drawn(page, transform, width, height)).rows

test.beforeEach(async ({ page }) => {
  test.skip(!fs.existsSync(FONT), "schaltli-firmware not checked out alongside this repo")
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

test("half a pixel off, a text is drawn on whole pixels: exactly as at the next whole position", async ({ page }) => {
  const whole = await draw(page, [1, 0, 0, 1, 11, 6])
  expect(whole.flat().some((v) => v > 200), "the text is there").toBe(true)
  const half = await drawn(page, [1, 0, 0, 1, 10.5, 5.5])
  // Every glyph on whole canvas pixels, unsmoothed: the GPU's rounding of a
  // half pixel is what tore the strokes, and only this shows it here.
  expect(half.glyphs.length).toBe(5)
  for (const g of half.glyphs) expect(g).toEqual({ x: Math.round(g.x), y: Math.round(g.y), smoothed: false })
  near(half.rows, whole, "at 10.5")
  near(await draw(page, [1, 0, 0, 1, 10.6, 5.6]), whole, "at 10.6")
})

test("zoomed by a whole factor each pixel is a sharp square; by another, no stroke falls apart", async ({ page }) => {
  const one = await draw(page, [1, 0, 0, 1, 2, 2], 40, 20)
  const two = await draw(page, [2, 0, 0, 2, 4, 4], 80, 40)
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 40; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) expect(two[2 * y + dy][2 * x + dx], `square ${x},${y}`).toBe(two[2 * y][2 * x])
      expect(Math.abs(two[2 * y][2 * x] - one[y][x]), `${x},${y}`).toBeLessThanOrEqual(12)
    }
  // At 1.6 (a 480 px screen fitted into 768) the ink is the ink at 1:1 times
  // 1.6², within a tenth: a dropped or doubled column would be off by more.
  const inkOf = (rows: number[][]) => rows.flat().reduce((a, v) => a + v, 0)
  const fit = await drawn(page, [1.6, 0, 0, 1.6, 3.2, 3.2], 64, 32)
  expect(fit.glyphs.every((g) => g.smoothed), "smoothed where the scale is not whole").toBe(true)
  const fitted = fit.rows
  expect(inkOf(fitted) / (inkOf(one) * 1.6 * 1.6)).toBeGreaterThan(0.9)
  expect(inkOf(fitted) / (inkOf(one) * 1.6 * 1.6)).toBeLessThan(1.1)
})
