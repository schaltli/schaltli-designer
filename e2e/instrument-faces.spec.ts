import { test, expect, type Page } from "@playwright/test"

// The faces after the primitives (tasks/instrument-styles-todo.md phase 5):
// each style's gauge and bar in the designer, its needle where the value
// puts it, at 400 and 150 px. Probes from each face's geometry in its
// 200-unit box (components/canvas/instrument-faces/).

type Obj = Record<string, any>

test.beforeEach(async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

async function render(page: Page, objects: Obj[], value: string) {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: {
      name: "faces",
      screenWidth: 460,
      screenHeight: 460,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: [],
      screens: [{ id: "s1", name: "One", backgroundColor: "#ffffff", objects }],
    },
    screenIndex: 0,
    topicOverrides: { "t/v": value },
  })
}

const props = (style: string, extra: Obj = {}) => ({
  topic: "t/v",
  calibrationPoints: [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ],
  style,
  ...extra,
})
const gauge = (style: string, size: number): Obj => ({ id: "g", type: "gauge", zIndex: 1, x: 20, y: 20, width: size, height: size, properties: props(style) })

async function rgb(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => Array.from((document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!.getImageData(x, y, 1, 1).data.slice(0, 3)),
    [Math.floor(x), Math.floor(y)],
  )
}
/** A gauge pixel at `r` units from (px, py) at `deg`, for a gauge of `size` at (20, 20). */
const at = (page: Page, size: number, px: number, py: number, r: number, deg: number) =>
  rgb(page, 20 + ((px + r * Math.sin((deg * Math.PI) / 180)) * size) / 200, 20 + ((py - r * Math.cos((deg * Math.PI) / 180)) * size) / 200)
/** The brightest of the pixel and its two neighbours in the row. */
async function brightestNear(page: Page, size: number, px: number, py: number, r: number, deg: number) {
  const x = 20 + ((px + r * Math.sin((deg * Math.PI) / 180)) * size) / 200
  const y = 20 + ((py - r * Math.cos((deg * Math.PI) / 180)) * size) / 200
  const all = await Promise.all([-1, 0, 1].map((d) => rgb(page, x + d, y)))
  return all.reduce((a, b) => (a[0] + a[1] + a[2] >= b[0] + b[1] + b[2] ? a : b))
}
/** The darkest of the pixel and its two neighbours in the row: a thin needle hits one of them. */
async function darkestNear(page: Page, size: number, px: number, py: number, r: number, deg: number) {
  const x = 20 + ((px + r * Math.sin((deg * Math.PI) / 180)) * size) / 200
  const y = 20 + ((py - r * Math.cos((deg * Math.PI) / 180)) * size) / 200
  const all = await Promise.all([-1, 0, 1].map((d) => rgb(page, x + d, y)))
  return all.reduce((a, b) => (a[0] + a[1] + a[2] <= b[0] + b[1] + b[2] ? a : b))
}

const dark = (c: number[]) => c.every((v) => v < 70)
/** The moving-coil needle is a pixel or two wide, split over two at small sizes: darker than the cream face is enough. */
const inked = (c: number[]) => c.every((v) => v < 170)
const teal = ([r, g, b]: number[]) => g > r + 40 && b > r + 30
const red = ([r, g, b]: number[]) => r > 140 && g < 80 && b < 80

for (const size of [400, 150]) {
  test(`the pressure gauge's needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("pressure", size)], "50")
    expect(dark(await at(page, size, 100, 100, 50, 0)), "at half it stands up").toBe(true)
    expect(dark(await at(page, size, 100, 100, 50, 90)), "nothing at 90°").toBe(false)
    await render(page, [gauge("pressure", size)], "100")
    expect(dark(await at(page, size, 100, 100, 50, 135)), "at full it lies at 135°").toBe(true)
  })

  test(`the moving-coil needle swings about its low pivot and stays in its window, ${size} px`, async ({ page }) => {
    await render(page, [gauge("coil", size)], "100")
    expect(inked(await darkestNear(page, size, 100, 182, 90, 40)), "at full it leans to 40°").toBe(true)
    expect(inked(await darkestNear(page, size, 100, 182, 90, -40)), "and not to -40°").toBe(false)
    // Below the window, on the case, the needle at 0° would pass (100, 168): nothing changes there.
    await render(page, [gauge("coil", size)], "50")
    const upright = await at(page, size, 100, 168, 0, 0)
    expect(inked(await darkestNear(page, size, 100, 182, 60, 0)), "upright in the window").toBe(true)
    await render(page, [gauge("coil", size)], "0")
    expect(await at(page, size, 100, 168, 0, 0), "cut off at the window's edge").toEqual(upright)
  })
}

const blue = ([r, g, b]: number[]) => b > r + 30 && b > g + 20 && r < 90

for (const size of [400, 150]) {
  test(`the art deco needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("deco", size)], "100")
    expect(blue(await darkestNear(page, size, 100, 100, 50, 135)), "at full it lies at 135°").toBe(true)
    expect(blue(await darkestNear(page, size, 100, 100, 50, -135)), "and not at -135°").toBe(false)
  })

  test(`the engraving needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("engraving", size)], "0")
    expect(dark(await darkestNear(page, size, 100, 100, 50, -135)), "at nought it lies at -135°").toBe(true)
    expect(dark(await darkestNear(page, size, 100, 100, 50, 0)), "nothing upright").toBe(false)
  })
}

const cream = (c: number[]) => c.every((v) => v > 190)
const lume = ([r, g, b]: number[]) => g > 200 && r > 150 && b > 120

for (const size of [400, 150]) {
  test(`the roadster needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("roadster", size)], "100")
    expect(cream(await brightestNear(page, size, 100, 100, 50, 125)), "at full it lies at 125°").toBe(true)
    expect(cream(await brightestNear(page, size, 100, 100, 50, -125)), "and not at -125°").toBe(false)
  })

  test(`the cockpit needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("cockpit", size)], "0")
    expect(lume(await brightestNear(page, size, 100, 100, 45, -150)), "at nought it lies at -150°").toBe(true)
    expect(lume(await brightestNear(page, size, 100, 100, 45, 30)), "nothing at 30°").toBe(false)
  })
}

const BARS = [
  { direction: "left-to-right", w: 300, h: 100 },
  { direction: "bottom-to-top", w: 100, h: 300 },
] as const

function barXY(c: (typeof BARS)[number], pos: number, d: number, track = 0.8): [number, number] {
  const vertical = c.direction === "bottom-to-top"
  const length = vertical ? c.h : c.w
  const thickness = vertical ? c.w : c.h
  const along = (length * (1 - track)) / 2 + length * track * pos
  return vertical ? [20 + d * thickness, 20 + length - along] : [20 + along, 20 + d * thickness]
}

for (const c of BARS) {
  const bar = (style: string): Obj => ({ id: "b", type: "bar", zIndex: 1, x: 20, y: 20, width: c.w, height: c.h, properties: props(style, { direction: c.direction }) })

  test(`the sight glass fills ${c.direction}`, async ({ page }) => {
    await render(page, [bar("pressure")], "50")
    expect(teal(await rgb(page, ...barXY(c, 0.25, 0.48))), "water below the value").toBe(true)
    expect(teal(await rgb(page, ...barXY(c, 0.75, 0.48))), "glass above it").toBe(false)
  })

  test(`the art deco band rises ${c.direction}`, async ({ page }) => {
    await render(page, [bar("deco")], "50")
    expect(red(await rgb(page, ...barXY(c, 0.25, 0.5, 0.7))), "red below the value").toBe(true)
    expect(red(await rgb(page, ...barXY(c, 0.75, 0.5, 0.7))), "not above it").toBe(false)
  })

  test(`the engraving's hatched fill grows ${c.direction}`, async ({ page }) => {
    await render(page, [bar("engraving")], "50")
    const inkAt = async (pos: number) => {
      const [x, y] = barXY(c, pos, 0.5)
      const near = await Promise.all([-3, -2, -1, 0, 1, 2, 3].map((d) => (c.direction === "left-to-right" ? rgb(page, x + d, y) : rgb(page, x, y + d))))
      return near.filter((p) => p.every((v) => v < 150)).length
    }
    expect(await inkAt(0.25), "hatching below the value").toBeGreaterThan(0)
    expect(await inkAt(0.25), "and paper between its lines").toBeLessThan(7)
    expect(await inkAt(0.75), "paper above it").toBe(0)
  })

  test(`the cockpit bar's pointer runs ${c.direction}`, async ({ page }) => {
    await render(page, [bar("cockpit")], "50")
    expect(lume(await rgb(page, ...barXY(c, 0.5, 0.48))), "the pointer at the value").toBe(true)
    await render(page, [bar("cockpit")], "0")
    expect(lume(await rgb(page, ...barXY(c, 0.5, 0.48))), "gone from there at 0").toBe(false)
  })

  test(`the profile meter's pointer runs ${c.direction}`, async ({ page }) => {
    await render(page, [bar("coil")], "50")
    expect(red(await rgb(page, ...barXY(c, 0.5, 0.735))), "its red tip at the value").toBe(true)
    await render(page, [bar("coil")], "0")
    expect(red(await rgb(page, ...barXY(c, 0.5, 0.735))), "gone from there at 0").toBe(false)
  })
}
