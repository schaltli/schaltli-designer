import { test, expect, type Page } from "@playwright/test"

// The fill primitive's styles in the designer (tasks/instrument-styles-todo.md
// I11): the rally gauge's orange needle, the night cluster's ring of light
// that grows to the value, and both as bars, whose fill grows the way the
// bar runs. Probes from the faces' geometry: pivot (100, 100) of the 200-unit
// box; rally sweep -135°..135°, night -130°..130° with its ring on radius
// 84; the bars' scale between 10 % and 90 % of the length, the rally fill
// at depth 0.53..0.73, the night strip at 0.58..0.62.

type Obj = Record<string, any>

test.beforeEach(async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

async function render(page: Page, objects: Obj[], value: string) {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: {
      name: "fill",
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
/** A gauge pixel at `r` units from the pivot at `deg`, for a gauge of `size` at (20, 20). */
const gaugeRgb = (page: Page, size: number, r: number, deg: number) =>
  rgb(page, 20 + ((100 + r * Math.sin((deg * Math.PI) / 180)) * size) / 200, 20 + ((100 - r * Math.cos((deg * Math.PI) / 180)) * size) / 200)

const orange = ([r, g, b]: number[]) => r > 200 && g > 60 && g < 160 && b < 80
const lit = ([r, g, b]: number[]) => r > 170 && b < 120
const dark = (c: number[]) => c.every((v) => v < 90)

for (const size of [400, 150]) {
  test(`the rally needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("rally", size)], "50")
    expect(orange(await gaugeRgb(page, size, 50, 0)), "at half it stands up").toBe(true)
    expect(orange(await gaugeRgb(page, size, 50, 90)), "nothing at 90°").toBe(false)
    await render(page, [gauge("rally", size)], "100")
    expect(orange(await gaugeRgb(page, size, 50, 135)), "at full it lies at 135°").toBe(true)
  })

  test(`the night ring lights up to the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("night", size)], "50")
    expect(lit(await gaugeRgb(page, size, 84, -100)), "lit near the start").toBe(true)
    expect(lit(await gaugeRgb(page, size, 84, -30)), "lit just before the value").toBe(true)
    expect(dark(await gaugeRgb(page, size, 84, 40)), "dark beyond it").toBe(true)
    await render(page, [gauge("night", size)], "0")
    expect(dark(await gaugeRgb(page, size, 84, -100)), "dark everywhere at 0").toBe(true)
  })
}

test("the night ring runs red to orange", async ({ page }) => {
  await render(page, [gauge("night", 400)], "100")
  const start = await gaugeRgb(page, 400, 84, -120)
  const end = await gaugeRgb(page, 400, 84, 120)
  expect(end[1], "more green - more orange - at the end").toBeGreaterThan(start[1] + 40)
})

const BARS = [
  { direction: "left-to-right", w: 300, h: 100 },
  { direction: "right-to-left", w: 300, h: 100 },
  { direction: "bottom-to-top", w: 100, h: 300 },
  { direction: "top-to-bottom", w: 100, h: 300 },
] as const

function barXY(c: (typeof BARS)[number], at: number, d: number): [number, number] {
  const vertical = c.direction === "bottom-to-top" || c.direction === "top-to-bottom"
  const length = vertical ? c.h : c.w
  const thickness = vertical ? c.w : c.h
  const along = length * 0.1 + length * 0.8 * at
  const p: [number, number] =
    c.direction === "left-to-right"
      ? [along, d * thickness]
      : c.direction === "right-to-left"
        ? [length - along, d * thickness]
        : c.direction === "top-to-bottom"
          ? [d * thickness, along]
          : [d * thickness, length - along]
  return [20 + p[0], 20 + p[1]]
}

for (const c of BARS) {
  const bar = (style: string): Obj => ({ id: "b", type: "bar", zIndex: 1, x: 20, y: 20, width: c.w, height: c.h, properties: props(style, { direction: c.direction }) })

  test(`the rally bar fills ${c.direction}`, async ({ page }) => {
    await render(page, [bar("rally")], "50")
    expect(orange(await rgb(page, ...barXY(c, 0.27, 0.63))), "filled before the value").toBe(true)
    expect(orange(await rgb(page, ...barXY(c, 0.77, 0.63))), "empty after it").toBe(false)
    // The stripes stand over the fill: between two segments it is dark.
    expect(dark(await rgb(page, ...barXY(c, 0.25, 0.63))), "a stripe at a twentieth").toBe(true)
  })

  test(`the night strip lights ${c.direction}`, async ({ page }) => {
    await render(page, [bar("night")], "50")
    expect(lit(await rgb(page, ...barXY(c, 0.25, 0.6))), "lit before the value").toBe(true)
    expect(dark(await rgb(page, ...barXY(c, 0.75, 0.6))), "dark after it").toBe(true)
  })
}

// The VFD's segments (I12): lit up to the value, faint beyond it.
const cyanLit = ([r, g, b]: number[]) => g > 200 && b > 160 && r < 120
for (const size of [400, 150]) {
  test(`the VFD ring lights its segments up to the value, ${size} px`, async ({ page }) => {
    await render(page, [gauge("vfd", size)], "50")
    // Segment middles at radius 75: the one around a quarter, and three quarters.
    expect(cyanLit(await gaugeRgb(page, size, 75, -135 + 270 * (7.5 / 32)))).toBe(true)
    expect(cyanLit(await gaugeRgb(page, size, 75, -135 + 270 * (24.5 / 32)))).toBe(false)
  })
}
