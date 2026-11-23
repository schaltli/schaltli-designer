import { test, expect, type Page } from "@playwright/test"

// A styled gauge in the designer (docs/2026-11-23-instrument-styles.md,
// tasks/instrument-styles-todo.md I3): the baked face with the needle at
// the value, drawn by the reference render every device is compared with.
// Probes are worked out from the fuel gauge's geometry: pivot at (100, 150)
// of its 200-unit box, sweep -55° to +55°, zones on radius 80, labels on 61
// (the needle is probed at 40, inside them).

function project(size: number, properties: Record<string, any>) {
  return {
    name: "instrument",
    screenWidth: size + 40,
    screenHeight: size + 40,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    screens: [
      {
        id: "s1",
        name: "One",
        backgroundColor: "#ffffff",
        objects: [
          {
            id: "g",
            type: "gauge",
            zIndex: 1,
            x: 20,
            y: 20,
            width: size,
            height: size,
            properties: {
              topic: "t/level",
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
              style: "fuel",
              scale: { labels: [{ value: 0, text: "E" }, { value: 50, text: "½" }, { value: 100, text: "F" }] },
              zones: [
                { from: 0, to: 12, kind: "danger" },
                { from: 12, to: 25, kind: "warning" },
              ],
              ...properties,
            },
          },
        ],
      },
    ],
  }
}

async function render(page: Page, size: number, value: string, properties: Record<string, any> = {}) {
  await page.evaluate(
    (req) => (window as any).__renderScreenForTest(req),
    { project: project(size, properties), screenIndex: 0, topicOverrides: { "t/level": value } },
  )
}

/** Pixel at a point given in the face's 200-unit box, for a gauge of `size` at (20, 20). */
async function rgbAt(page: Page, size: number, ux: number, uy: number) {
  const x = Math.floor(20 + (ux * size) / 200)
  const y = Math.floor(20 + (uy * size) / 200)
  return page.evaluate(
    ([x, y]) => {
      const ctx = (document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!
      return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
    },
    [x, y],
  )
}

/** A point at `r` units from the pivot at `deg` (0 = up, clockwise). */
const fromPivot = (r: number, deg: number): [number, number] => [
  100 + r * Math.sin((deg * Math.PI) / 180),
  150 - r * Math.cos((deg * Math.PI) / 180),
]
const white = (c: number[]) => c.every((v) => v > 225)

test.beforeEach(async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

for (const size of [200, 400]) {
  test(`the fuel gauge's needle follows the value, ${size} px`, async ({ page }) => {
    await render(page, size, "0")
    expect(white(await rgbAt(page, size, ...fromPivot(40, -55))), "at E the needle lies at -55°").toBe(true)
    expect(white(await rgbAt(page, size, ...fromPivot(40, 55))), "nothing at F").toBe(false)

    await render(page, size, "100")
    expect(white(await rgbAt(page, size, ...fromPivot(40, 55))), "at F it lies at +55°").toBe(true)
    expect(white(await rgbAt(page, size, ...fromPivot(40, -55))), "and has left E").toBe(false)

    await render(page, size, "50")
    expect(white(await rgbAt(page, size, ...fromPivot(40, 0))), "at half it stands up").toBe(true)
  })

  test(`the reserve zones are drawn in red and yellow, ${size} px`, async ({ page }) => {
    await render(page, size, "50")
    const red = await rgbAt(page, size, ...fromPivot(80, -55 + 110 * 0.06))
    expect(red[0], "red: strong red").toBeGreaterThan(180)
    expect(red[1], "red: little green").toBeLessThan(90)
    const yellow = await rgbAt(page, size, ...fromPivot(80, -55 + 110 * 0.185))
    // Under the glass's crescent, so lifted a little towards white.
    expect(yellow[0]).toBeGreaterThan(180)
    expect(yellow[1]).toBeGreaterThan(140)
    expect(yellow[2]).toBeLessThan(yellow[1] - 50)
  })
}

test("a value change reuses the baked face, a range change bakes anew", async ({ page }) => {
  const count = () => page.evaluate(() => (window as any).__instrumentBakeCountForTest())
  await render(page, 200, "10")
  const first = await count()
  await render(page, 200, "70")
  expect(await count(), "the value moved, the face stayed").toBe(first)
  await render(page, 200, "70", { zones: [{ from: 0, to: 30, kind: "danger" }] })
  expect(await count(), "other zones, another face").toBe(first + 1)
  await render(page, 200, "70", { caption: "FRESH WATER" })
  expect(await count(), "a caption, another face").toBe(first + 2)
})

test("without a value the needle rests on its stop", async ({ page }) => {
  await render(page, 200, "")
  expect(white(await rgbAt(page, 200, ...fromPivot(40, -55)))).toBe(true)
})

test("the face as a picture, for a look (attached to the report)", async ({ page }, info) => {
  await render(page, 400, "37", { caption: "FRESH WATER" })
  const png = await page.locator("canvas").first().screenshot()
  await info.attach("fuel-gauge-400.png", { body: png, contentType: "image/png" })
})
