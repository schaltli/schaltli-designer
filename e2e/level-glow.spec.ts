import { test, expect, type Page } from "@playwright/test"
import { applyTheme, themeById } from "../lib/themes"
import { blend565, gradient565, GLOW_ALPHA } from "../lib/level-glow"

// A level whose fill is the theme's accent runs from the accent to the
// theme's second accent (accentEnd) along its scale, with a weak glow around
// it - the user's choice on 2026-09-28, after a mockup. The glow is mixed into
// what already stands under it, not into the screen's colour.

const THEME = themeById("garden")

test.describe("what the theme gives a level", () => {
  const level = (type: string, properties: Record<string, unknown> = {}) => ({ type, properties })

  test("a level whose fill is the accent gets the second accent, and no glow, at 24 bit", () => {
    // The glow went on the evening it was built: cleaner without, and a sixth
    // of the 4.3B's render. The renderers below still draw one where a
    // `glow` is set explicitly; the theme no longer sets it.
    for (const type of ["bar", "slider", "gauge", "dial"]) {
      const [out] = applyTheme([level(type)], THEME, "dark", "24bit")
      expect(out.properties.fillColor, type).toBe(THEME.dark.accent)
      expect(out.properties.fillEndColor, type).toBe(THEME.dark.accentEnd)
      expect(out.properties.glow, type).toBeUndefined()
    }
  })

  test("a grey or 1-bit panel stays flat, and so does a fill the author coloured", () => {
    for (const depth of ["4bit", "1bit"]) {
      const [out] = applyTheme([level("dial")], THEME, "light", depth)
      expect(out.properties.fillEndColor, depth).toBeUndefined()
      expect(out.properties.glow, depth).toBeUndefined()
    }
    const [own] = applyTheme([level("slider", { fillColor: "#ff0000" })], THEME, "light", "24bit")
    expect(own.properties.fillEndColor).toBeUndefined()
    expect(own.properties.glow).toBeUndefined()
  })

  test("every theme has a second accent in light and dark", async () => {
    const { THEMES } = await import("../lib/themes")
    for (const t of THEMES) {
      expect(t.light.accentEnd, t.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t.dark.accentEnd, t.id).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

test.describe("the arithmetic every device copies", () => {
  test("a gradient step is taken at its middle, and the ends are the two colours' own neighbours", () => {
    const a = { r: 0, g: 0, b: 0 }
    const b = { r: 31, g: 63, b: 31 }
    expect(gradient565(a, b, 0, 2)).toEqual({ r: 8, g: 16, b: 8 })
    expect(gradient565(a, b, 1, 2)).toEqual({ r: 23, g: 47, b: 23 })
  })

  test("the glow is mixed at alpha/256, rounded", () => {
    expect(blend565({ r: 0, g: 0, b: 0 }, { r: 31, g: 63, b: 31 }, 128)).toEqual({ r: 16, g: 32, b: 16 })
    expect(GLOW_ALPHA[1]).toBeGreaterThan(GLOW_ALPHA[8])
  })
})

async function renderPixels(page: Page, objects: unknown[], at: [number, number][]): Promise<number[][]> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: {
      name: "glow",
      screenWidth: 300,
      screenHeight: 300,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: [],
      screens: [{ id: "s1", name: "One", backgroundColor: "#000000", objects }],
    },
    screenIndex: 0,
    topicOverrides: { "t/v": "100" },
  })
  return page.evaluate((points) => {
    const ctx = (document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!
    return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)))
  }, at)
}

// A full gauge 200 px across at (50, 50), 16 thick: with the glow's 8 px of
// inset its band's outer edge is 92 px from the centre (150, 150).
const gauge = {
  id: "g",
  type: "gauge",
  zIndex: 2,
  x: 50,
  y: 50,
  width: 200,
  height: 200,
  properties: {
    topic: "t/v",
    minAngle: 0,
    maxAngle: 0,
    direction: "cw",
    thickness: 16,
    fillColor: "#ff0000",
    fillEndColor: "#0000ff",
    glow: 8,
    displayValue: "none",
  },
}

test.describe("what the canvas paints", () => {
  test("a full ring runs from one colour to the other, clockwise from twelve", async ({ page }) => {
    // Just past twelve (start), at six (half way) and just before twelve (end).
    const [start, half, end] = await renderPixels(page, [gauge], [
      [153, 66],
      [150, 234],
      [147, 66],
    ])
    expect(start[0], "red at the start").toBeGreaterThan(200)
    expect(start[2], "no blue yet").toBeLessThan(40)
    expect(Math.abs(half[0] - half[2]), "half way, half of each").toBeLessThan(30)
    expect(end[2], "blue at the end").toBeGreaterThan(200)
  })

  test("the glow is mixed into what lies under it, not into the screen's colour", async ({ page }) => {
    // Three pixels outside the band, at three o'clock, where the fill is a
    // quarter of the way round - once over the black screen, once over a
    // white box lying under the ring.
    const box = { id: "under", type: "box", zIndex: 1, x: 236, y: 140, width: 14, height: 20, properties: { fillColor: "#ffffff", strokeColor: "transparent" } }
    const [overScreen] = await renderPixels(page, [gauge], [[245, 150]])
    const [overBox] = await renderPixels(page, [box, gauge], [[245, 150]])
    expect(overScreen[0] + overScreen[1] + overScreen[2], "a glow over black").toBeGreaterThan(20)
    expect(overBox[1], "over white, the white shows through").toBeGreaterThan(150)
    expect(overBox[0], "and the glow's red is mixed in").toBeGreaterThanOrEqual(overBox[1])
  })
})
