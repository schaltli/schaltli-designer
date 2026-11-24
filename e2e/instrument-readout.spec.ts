import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import vectors from "../lib/instrument-readout/vectors.json"
import { drawReadout, formatReadout, unlitPattern } from "../lib/instrument-readout"
import { rgb565Picture } from "../lib/needle-raster"

// The digital readout (tasks/instrument-styles-todo.md I12): lib/instrument-
// readout.ts against lib/instrument-readout/vectors.json - the text and the
// pixels the firmware and the app must arrive at too - and the readout on a
// night cluster in the designer, in the style's typeface from its strip.

test.describe("readout (shared vectors)", () => {
  for (const f of vectors.formats) {
    test(`format ${JSON.stringify(f.raw)} to ${f.decimals} places`, () => {
      expect(formatReadout(f.raw, f.decimals)).toBe(f.expected)
    })
  }
  test("the formats are rounded half away from nought, by hand", () => {
    expect(formatReadout("22.45", 1)).toBe("22.5")
    expect(formatReadout("-0.05", 1)).toBe("-0.1")
    expect(formatReadout("-0.04", 1), "no minus before a nought").toBe("0.0")
    expect(formatReadout("12abc", 0), "not a number: nothing").toBe("")
  })
  for (const d of vectors.draws) {
    test(`draw: ${d.name}`, () => {
      const pic = rgb565Picture(d.w, d.h, d.ground)
      const s = vectors.strip
      drawReadout(pic, { chars: s.chars, cells: s.cells as [number, number, number][], pad: s.pad, height: s.height, x: d.x, y: d.y, align: d.align as "right" | "center", color: d.color }, { width: s.width, alpha: Uint8Array.from(s.alpha) }, d.text, d.opacity)
      expect(Array.from(pic.pixels, (c) => c.toString(16).padStart(4, "0")).join("")).toBe(d.expected)
    })
  }
  test("the unlit pattern has the range's digits", () => {
    expect(unlitPattern(-20, 40, 1)).toBe("88.8")
    expect(unlitPattern(0, 1500, 0)).toBe("8888")
    expect(unlitPattern(0, 5, 2)).toBe("8.88")
  })
})

async function render(page: Page, value: string, readout?: boolean) {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: {
      name: "readout",
      screenWidth: 440,
      screenHeight: 440,
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
              width: 400,
              height: 400,
              properties: {
                topic: "t/v",
                calibrationPoints: [
                  { value: -20, barSizePercent: 0 },
                  { value: 40, barSizePercent: 100 },
                ],
                style: "night",
                ...(readout === undefined ? {} : { readout }),
              },
            },
          ],
        },
      ],
    },
    screenIndex: 0,
    topicOverrides: { "t/v": value },
  })
}

/** How many bright pixels the hub of a 400 px night cluster at (20, 20) holds - its digits. */
async function brightInHub(page: Page) {
  return page.evaluate(() => {
    const ctx = (document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!
    // The hub: radius 31 of 200 about the middle; the digits on its upper half.
    const d = ctx.getImageData(20 + 150, 20 + 160, 100, 60).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++
    return n
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

test("the night cluster writes its value in the hub, and nothing without one", async ({ page }) => {
  await render(page, "22.4")
  const lit = await brightInHub(page)
  expect(lit, "digits in the hub").toBeGreaterThan(150)
  await render(page, "")
  expect(await brightInHub(page), "no value, no digits").toBeLessThan(10)
  await render(page, "22.4", false)
  expect(await brightInHub(page), "Readout off, no digits").toBeLessThan(10)
  await render(page, "-8.0")
  expect(await brightInHub(page), "other digits, another picture").not.toBe(lit)
})

function nightProject() {
  return {
    name: "readout-export",
    screenWidth: 480,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [],
    screens: [
      {
        id: "s1",
        name: "One",
        backgroundColor: "#ffffff",
        objects: [
          {
            id: "n1",
            type: "gauge",
            zIndex: 1,
            x: 20,
            y: 20,
            width: 200,
            height: 200,
            properties: { topic: "t/v", calibrationPoints: [{ value: -20, barSizePercent: 0 }, { value: 40, barSizePercent: 100 }], style: "night" },
          },
        ],
      },
    ],
  }
}

test("the export carries the readout and its strip, for a board and for the app", async ({ page }) => {
  const board = await JSZip.loadAsync(Buffer.from(await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), nightProject()), "base64"))
  const n1 = JSON.parse(await board.file("project.json")!.async("string")).screens[0].objects.find((o: any) => o.id === "n1")
  const r = n1.instrument.readout
  expect(r.glyphs).toMatch(/^assets\/glyphs-[0-9a-f]{8}\.a8$/)
  expect(r.chars).toBe("0123456789.-")
  expect(r.cells).toHaveLength(12)
  expect(r.align).toBe("center")
  expect(r.decimals).toBe(1)
  // The hub's middle of a 200 px gauge: x 100.
  expect(r.x).toBe(100)
  const strip = await board.file(r.glyphs)!.async("uint8array")
  expect(Array.from(strip.slice(0, 5))).toEqual([0x53, 0x41, 0x30, 0x38, 1])
  const w = strip[5] | (strip[6] << 8)
  const h = strip[7] | (strip[8] << 8)
  expect(h).toBe(r.height)
  expect(strip.length).toBe(9 + w * h)
  const [sx, cw] = r.cells[8] // the 8: something drawn in its cell
  let ink = 0
  for (let y = 0; y < h; y++) for (let x = sx; x < sx + cw; x++) ink += strip[9 + y * w + x] > 128 ? 1 : 0
  expect(ink).toBeGreaterThan(10)

  const app = await JSZip.loadAsync(Buffer.from(await page.evaluate((p) => (window as any).__buildAndroidZipForTest(p), nightProject()), "base64"))
  const a1 = JSON.parse(await app.file("project.json")!.async("string")).screens[0].objects.find((o: any) => o.id === "n1")
  expect(a1.instrument.readout.glyphs).toMatch(/^assets\/faces\/glyphs-[0-9a-f]{8}\.png$/)
  expect(app.file(a1.instrument.readout.glyphs)).toBeTruthy()
})
