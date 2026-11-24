import { test, expect, type Page } from "@playwright/test"

// A styled face's caption and unit keep clear of the scale's labels, however
// long the caption (fitLine/roomBetweenLabels in
// components/canvas/instrument-faces/common.ts), and the pressure gauge's unit
// stays out of its needle's counterweight. Found making the cockpit video
// (docs/video/cockpit-drehbuch.md): «Frischwasser» ran into the 0, «°C» hid
// under the counterweight.

type Obj = Record<string, any>
const SIZE = 400
const STYLES = ["pressure", "deco", "coil", "roadster", "cockpit", "rally", "vfd", "fuel", "bluered", "night", "engraving"]

test.beforeEach(async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

/** The canvas after rendering one gauge of `SIZE` at (20, 20), as RGBA. */
async function pixels(page: Page, properties: Obj, value: string): Promise<Uint8ClampedArray> {
  const req = {
    project: {
      name: "captions",
      screenWidth: SIZE + 40,
      screenHeight: SIZE + 40,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: [],
      screens: [{ id: "s1", name: "One", backgroundColor: "#000000", objects: [{ id: "g", type: "gauge", zIndex: 1, x: 20, y: 20, width: SIZE, height: SIZE, properties }] }],
    },
    screenIndex: 0,
    topicOverrides: { "t/v": value },
  }
  const data = await page.evaluate(async (r) => {
    const w = window as any
    // A face is baked once its fonts are there (instrumentFontsReady): render
    // until two renders a moment apart agree, the first at least three times.
    let last = ""
    let url = ""
    for (let i = 0; i < 30; i++) {
      url = await w.__renderScreenForTest(r)
      if (i >= 2 && url === last) break
      last = url
      await new Promise((ok) => setTimeout(ok, 150))
    }
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data)
  }, req)
  return new Uint8ClampedArray(data)
}

/** Pixels where a and b differ visibly, as a mask (one byte per pixel). */
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): Uint8Array {
  const m = new Uint8Array(a.length / 4)
  for (let i = 0; i < m.length; i++) {
    const d = Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2])
    m[i] = d > 40 ? 1 : 0
  }
  return m
}

const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0)

/** Pixels set in both masks, `b` grown by `grow` pixels first. */
function touching(a: Uint8Array, b: Uint8Array, width: number, grow: number): number {
  const height = a.length / width
  let n = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!a[y * width + x]) continue
      let hit = false
      for (let dy = -grow; dy <= grow && !hit; dy++)
        for (let dx = -grow; dx <= grow && !hit; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy >= 0 && yy < height && xx >= 0 && xx < width && b[yy * width + xx]) hit = true
        }
      if (hit) n++
    }
  return n
}

const CASES = [
  { caption: "Frischwasser", unit: "Liter", min: 0, max: 110, value: "76" },
  { caption: "Abwassertank hinten", unit: "°C", min: -10, max: 40, value: "15" },
]

for (const style of STYLES)
  for (const c of CASES) {
    test(`${style}: the caption «${c.caption}» keeps clear of the labels`, async ({ page }) => {
      const base = { topic: "t/v", style, motion: "direct", calibrationPoints: [{ value: c.min, barSizePercent: 0 }, { value: c.max, barSizePercent: 100 }] }
      // The labels' ink: the face as it is, against the same face with blank labels.
      const plain = await pixels(page, base, c.value)
      const blank = await pixels(page, { ...base, scale: { labels: [{ value: c.min, text: " " }, { value: c.max, text: " " }] } }, c.value)
      const labels = diff(plain, blank)
      // The caption's and unit's ink: with them, against without.
      const written = await pixels(page, { ...base, caption: c.caption, unit: c.unit }, c.value)
      const text = diff(written, plain)
      expect(count(labels), "the labels leave ink").toBeGreaterThan(100)
      expect(count(text), "the caption leaves ink").toBeGreaterThan(50)
      expect(touching(text, labels, SIZE + 40, 2), "caption pixels on or next to a label").toBe(0)
    })
  }

test("the pressure gauge's unit is not hidden under the counterweight", async ({ page }) => {
  const base = { topic: "t/v", style: "pressure", motion: "direct", calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }] }
  // At 50 the needle stands up and its counterweight hangs straight down, over
  // where the unit used to be; at 0 it is up and to the right.
  const ink = async (value: string) => count(diff(await pixels(page, { ...base, unit: "°C" }, value), await pixels(page, base, value)))
  const down = await ink("50")
  const away = await ink("0")
  expect(away, "the unit leaves ink").toBeGreaterThan(100)
  expect(down / away, "share of the unit visible with the counterweight below the pivot").toBeGreaterThan(0.97)
})
