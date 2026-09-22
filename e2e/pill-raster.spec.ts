import { test, expect, type Page } from "@playwright/test"
import { switchKnob, switchTrack } from "../lib/switch-shape"
import { levelTrackRect } from "../lib/level-shape"
import type { PillBand } from "../lib/pill-raster"

// Pins the pill rasterizer - the bar's runs and handle, the switch's track,
// knob and buttons (lib/pill-raster.ts, 2026-09-22).
//
// The sibling of e2e/arc-raster.spec.ts, and there for the same reason: this
// is rendering that deliberately exists more than once - here and in every
// firmware - because "draw a rounded rectangle" cannot be made to agree
// across four platforms by itself. The assertions come in the same two kinds:
//
//   - geometric ones, an independent oracle. A pixel in the middle of a run
//     must be all sixteen sub-samples; one outside it, none; one in a corner
//     a radius has taken away, none either. Those follow from the shape.
//   - pinned edge values, a change detector rather than a proof, read off the
//     implementation once the geometric ones held. They give a port exact
//     numbers to compare against and make any later drift visible.
//
// And two promises about the picture that only the whole pipeline can make:
// that nothing below 24 bit is ever softened, and that a soft pixel where two
// runs meet is a mixture of THOSE TWO and never of one of them with the
// screen behind - which is the entire reason the runs are counted in one pass
// instead of painted one over the other.

const BAND: PillBand = { x: 10, y: 10, w: 100, h: 16, rLow: 8, rHigh: 8 }
const VBAND: PillBand = { x: 10, y: 10, w: 16, h: 100, rLow: 8, rHigh: 0, vertical: true }

async function counts(
  page: Page,
  bands: PillBand[],
  pixels: [number, number][],
): Promise<number[][]> {
  return page.evaluate(
    ([b, px]) => (window as any).__pillRasterForTest({ bands: b, pixels: px }),
    [bands, pixels] as const,
  )
}

test.describe("the pill rasterizer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("inside is whole, outside is nothing", async ({ page }) => {
    const [middle, above, before, after] = await counts(page, [BAND], [
      [50, 17],
      [50, 5],
      [5, 17],
      [115, 17],
    ])
    expect(middle, "a pixel in the middle of the run").toEqual([16])
    expect(above, "a pixel above it").toEqual([0])
    expect(before, "a pixel before its start").toEqual([0])
    expect(after, "a pixel past its end").toEqual([0])
  })

  test("a rounded end takes its corners away, a square one does not", async ({ page }) => {
    const [rounded] = await counts(page, [BAND], [[10, 10]])
    const [square] = await counts(page, [{ ...BAND, rLow: 0 }], [[10, 10]])
    expect(rounded[0], "the corner of a rounded end").toBe(0)
    expect(square[0], "the same corner, squared off").toBe(16)
  })

  test("a radius bigger than the run clamps to half its short side", async ({ page }) => {
    // fillRoundRect clamps the same way, so an oversized radius self-corrects
    // identically on both sides of the port rather than drawing a wedge.
    const asked = await counts(page, [{ ...BAND, rLow: 99, rHigh: 99 }], [[10, 10], [50, 17], [18, 17]])
    const clamped = await counts(page, [BAND], [[10, 10], [50, 17], [18, 17]])
    expect(asked).toEqual(clamped)
  })

  test("a vertical run rounds its top and its bottom, not its sides", async ({ page }) => {
    const [topLeft, bottomLeft, middle] = await counts(page, [VBAND], [
      [10, 10],
      [10, 109],
      [17, 60],
    ])
    expect(topLeft[0], "the top end is the rounded one").toBe(0)
    expect(bottomLeft[0], "the bottom end was cut square").toBe(16)
    expect(middle[0], "and the middle is whole").toBe(16)
  })

  test("a sub-sample counts into exactly one run - the first that holds it", async ({ page }) => {
    // The handle over the track, in miniature. Painted one over the other,
    // the overlap would be mixed twice and leave a seam of the lower run's
    // colour; counted once, there is nothing to leave.
    const handle: PillBand = { x: 40, y: 12, w: 20, h: 12, rLow: 6, rHigh: 6 }
    const [inside, beside] = await counts(page, [handle, BAND], [
      [50, 17],
      [80, 17],
    ])
    expect(inside, "where both hold the pixel, the first takes it").toEqual([16, 0])
    expect(beside, "and elsewhere the second still has it").toEqual([0, 16])
    for (const pixel of [inside, beside]) {
      expect(pixel[0] + pixel[1], "no pixel is counted twice").toBeLessThanOrEqual(16)
    }
  })

  test("the soft pixels along a cap are these ones", async ({ page }) => {
    // A change detector, and the numbers a port compares against. Read off
    // the implementation on 2026-09-22 with the geometric assertions above
    // already holding. The column is the left cap's own, top to bottom.
    const column: [number, number][] = [
      [10, 11],
      [10, 12],
      [10, 13],
      [10, 14],
      [10, 15],
      [10, 16],
      [10, 17],
    ]
    expect((await counts(page, [BAND], column)).map((c) => c[0])).toEqual([0, 0, 0, 3, 10, 14, 16])
  })
})

const W = 320
const H = 120

function project(depth: "1bit" | "24bit", background: string, obj: any) {
  return {
    name: "pill-raster",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: depth },
    fonts: [],
    assets: [],
    topics: [{ topic: "v/level", examples: ["40"] }],
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: background, objects: [obj] }],
  }
}

async function render(page: Page, p: any, overrides: Record<string, string>): Promise<(x: number, y: number) => number[]> {
  // Deliberately without the harness's `quantize` option: what is measured is
  // what the designer's own canvas holds, not the picture a 1-bit panel would
  // make of it afterwards.
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: p,
    screenIndex: 0,
    topicOverrides: overrides,
  })
  const data: number[] = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)
  })
  return (x: number, y: number) => {
    const i = (y * W + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
}

/** A bar with nothing written on it, so its box holds the track and nothing else. */
function bareBar(depth: "1bit" | "24bit"): any {
  return {
    id: "bar",
    type: "bar",
    zIndex: 1,
    x: 20,
    y: 40,
    width: 240,
    height: 40,
    properties: {
      topic: "v/level",
      fillColor: depth === "1bit" ? "#000000" : "#4CAF50",
      barThickness: 16,
      name: "",
      displayValue: "none",
    },
  }
}

test.describe("what the rasterizer puts on the canvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("a cap is soft on 24 bit", async ({ page }) => {
    const obj = bareBar("24bit")
    const at = await render(page, project("24bit", "#ffffff", obj), { "v/level": "40" })
    const track = levelTrackRect(obj, [])
    const soft: number[][] = []
    for (let y = track.y; y < track.y + track.h; y++) {
      for (let x = track.x; x < track.x + 10; x++) {
        const c = at(x, y)
        const pure =
          (c[0] === 0x4c && c[1] === 0xaf && c[2] === 0x50) || (c[0] === 255 && c[1] === 255 && c[2] === 255)
        if (!pure) soft.push(c)
      }
    }
    expect(soft.length, "the left cap has no half-covered pixels at all").toBeGreaterThan(4)
    for (const c of soft) {
      // Every one of them between the fill and the background, never outside
      // the two - a washed-out cap was measured as *lighter* than both
      // ("die farben an den enden laufen auseinander", 2026-09-19).
      expect(c[0], `${c} is not between the fill and the background`).toBeGreaterThanOrEqual(0x4c)
      expect(c[1]).toBeGreaterThanOrEqual(0xaf)
      expect(c[2]).toBeGreaterThanOrEqual(0x50)
      expect(Math.min(...c)).toBeLessThanOrEqual(255)
    }
  })

  test("nothing is softened below 24 bit", async ({ page }) => {
    // The whole promise of the hard path: a panel that has two colours gets
    // two colours. Every device draws these shapes with whole pixels, and a
    // designer that softened them would disagree with all of them at once.
    const obj = bareBar("1bit")
    const at = await render(page, project("1bit", "#ffffff", obj), { "v/level": "40" })
    const strangers = new Set<string>()
    for (let y = obj.y; y < obj.y + obj.height; y++) {
      for (let x = obj.x; x < obj.x + obj.width; x++) {
        const c = at(x, y)
        const pure = c.every((v) => v === 0) || c.every((v) => v === 255)
        if (!pure) strangers.add(c.join(","))
      }
    }
    expect([...strangers], "colours that are neither black nor white").toEqual([])
  })

  test("where the knob meets the track, the mixture is of those two", async ({ page }) => {
    // The one thing a second pass of painting cannot do. The knob is white,
    // the track is the switch's colour, and the screen behind both is nearly
    // black: a knob blended with the SCREEN instead of with the track would
    // leave a dark rim around it, and on any other background a rim of that
    // background's colour.
    const obj = {
      id: "sw",
      type: "switch",
      zIndex: 1,
      x: 20,
      y: 30,
      width: 200,
      height: 48,
      properties: {
        topic: "t/mode",
        switchColor: "#6750A4",
        states: [
          { id: "s0", label: "", readValue: "0", writeValue: "0" },
          { id: "s1", label: "", readValue: "1", writeValue: "1", showAsOn: true },
        ],
      },
    }
    const p = project("24bit", "#101010", obj)
    p.topics = [{ topic: "t/mode", examples: ["1"] }]
    const at = await render(page, p, { "t/mode": "1" })

    const track = switchTrack(obj as any, 2)
    const knob = switchKnob(obj as any, 2, 1, { on: true })
    // The track's straight middle only, so every pixel looked at is one the
    // track really covers - its own rounded ends are where it meets the
    // screen, and those are allowed to be dark.
    const half = Math.trunc(track.h / 2)
    let mixed = 0
    for (let y = track.y + 1; y < track.y + track.h - 1; y++) {
      for (let x = track.x + half; x < track.x + track.w - half; x++) {
        const c = at(x, y)
        expect(c[0], `(${x},${y}) is darker than the track: ${c}`).toBeGreaterThanOrEqual(0x67)
        expect(c[1], `(${x},${y}) is darker than the track: ${c}`).toBeGreaterThanOrEqual(0x50)
        expect(c[2], `(${x},${y}) is darker than the track: ${c}`).toBeGreaterThanOrEqual(0xa4)
        const white = c.every((v) => v === 255)
        const purple = c[0] === 0x67 && c[1] === 0x50 && c[2] === 0xa4
        if (!white && !purple) mixed++
      }
    }
    expect(mixed, "the knob's edge is not soft at all").toBeGreaterThan(8)
    expect(knob.r, "the knob is three quarters of an on track").toBe(Math.trunc(track.h * 12) / 16 / 2)
  })
})
