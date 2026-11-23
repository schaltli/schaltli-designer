import { test, expect } from "@playwright/test"
import vectors from "../lib/needle-raster/vectors.json"
import { angle64Of, drawNeedle, isqrt, rgb565Picture, type NeedleDescription, type NeedlePose } from "../lib/needle-raster"
import { gaugeNeedle, hex565 } from "../lib/instrument-needles"

// lib/needle-raster.ts against lib/needle-raster/vectors.json - the
// pictures the firmware and the app must draw too
// (tasks/instrument-styles-todo.md I2). The file is written by
// scripts/needle-raster-vectors.ts; the properties below are checked by
// hand so the file cannot simply record a wrong picture.

const hexOf = (pixels: Uint16Array) => Array.from(pixels, (c) => c.toString(16).padStart(4, "0")).join("")

function draw(desc: NeedleDescription, pose: NeedlePose, w: number, h: number, ground: number) {
  const pic = rgb565Picture(w, h, ground)
  drawNeedle(pic, desc, pose)
  return pic
}

test.describe("needle raster (shared vectors)", () => {
  test("enough cases that a truncated copy cannot pass", () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(9)
  })

  for (const c of vectors.cases) {
    test(`vector: ${c.name}`, () => {
      const pic = draw(c.desc as NeedleDescription, c.pose, c.width, c.height, c.ground)
      expect(hexOf(pic.pixels)).toBe(c.expected)
    })
  }

  test("isqrt is the floor of the root", () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 1 << 20, 123456789]) expect(isqrt(n)).toBe(Math.floor(Math.sqrt(n)))
  })

  const ground = hex565("#203040")
  const red = hex565("#ff3010")
  const tri: NeedleDescription = {
    pivot: { x: 96, y: 96 },
    layers: [{ motion: "rotate", shapes: [{ poly: [[88, 100], [104, 100], [97, 20]] }], color: red, alpha: 256 }],
  }

  test("a body is solid inside and leaves the rest alone", () => {
    const pic = draw(tri, { angle64: 0, shiftX: 0, shiftY: 0 }, 24, 24, ground)
    // Row 11's sub-sample rows (eighths 89-95) cross the edges at x = 89 and
    // 103: pixel 11 (sub-samples at 89, 91, 93, 95) is wholly inside, pixel
    // 12 loses its sample at 103.
    expect(pic.get(11, 11)).toBe(red)
    expect(pic.get(12, 11)).not.toBe(red)
    expect(pic.get(2, 2)).toBe(ground)
    expect(pic.get(20, 12)).toBe(ground)
  })

  test("90 degrees turns up into right", () => {
    const pic = draw(tri, { angle64: angle64Of(90), shiftX: 0, shiftY: 0 }, 24, 24, ground)
    // Turned to point right along rows 11-12, tapering to the tip at x = 21.
    expect(pic.get(14, 11)).not.toBe(ground)
    expect(pic.get(19, 12)).not.toBe(ground)
    expect(pic.get(12, 6)).toBe(ground) // where it pointed before
  })

  test("a shadow falls below the needle, whatever the angle", () => {
    const needle: [number, number][] = [[92, 96], [100, 96], [97, 24], [95, 24]]
    const desc: NeedleDescription = {
      pivot: { x: 96, y: 96 },
      layers: [{ motion: "rotate", shapes: [{ poly: needle }], color: 0, alpha: 256, soft: [160, 100, 40], dy: 24 }],
    }
    const pic = draw(desc, { angle64: angle64Of(90), shiftX: 0, shiftY: 0 }, 24, 24, ground)
    // Pointing right along row 12: the shadow lies three pixels lower.
    expect(pic.get(17, 15)).not.toBe(ground)
    expect(pic.get(17, 9)).toBe(ground)
  })

  test("the fuel gauge's needle stands where its angle says", () => {
    const size = 64
    const pic = draw(gaugeNeedle("fuel", size), { angle64: angle64Of(0), shiftX: 0, shiftY: 0 }, size, size, ground)
    // Straight up from the pivot at (32, 48): the needle covers column 32
    // at row 30 (about 1.3 px wide there), the ground well beside it stays.
    expect(pic.get(32, 30)).not.toBe(ground)
    expect(pic.get(20, 30)).toBe(ground)
    // and the black cap sits on the pivot
    expect(pic.get(32, 48)).toBe(hex565("#1c1c1c"))
  })
})
