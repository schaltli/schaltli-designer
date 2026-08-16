import { test, expect, type Page } from "@playwright/test"
import { chooseDevice, M5DIAL_DEVICE_ID, getMainCanvas } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// Off-screen covers (2026-08-14). The M5 Dial's panel is physically round
// but its framebuffer is cartesian 240x240, so the square's corners reach
// r~170 from the center while the case ends at 140 - they used to stick out
// past the whole device as bare white canvas. The adornment SVG now marks
// that region with id^="offscreen" and fill="none", and the designer fills
// it at raster time with its own --canvas-container-bg (see
// hooks/use-adornment-image.ts), so it vanishes into the backdrop exactly.
//
// Deliberately verified by reading real pixels rather than asserting on DOM:
// the whole mechanism only exists in what gets painted, and the failure mode
// this guards against (a cover that draws in the wrong color, or not at all)
// is invisible to any structural assertion.

const OFFSCREEN = { r: 192, g: 192, b: 192 }
const WHITE = { r: 255, g: 255, b: 255 }

// Reads one pixel out of a canvas, in that canvas's own device-pixel
// coordinates. The main canvas is sized to its container and centers the
// device block inside it (see helpers.ts's devicePoint for the same mapping
// in client coordinates); thumbnails are exactly screen-sized, so their
// origin is the device origin.
async function readCanvasPixel(
  page: Page,
  selector: string,
  index: number,
  x: number,
  y: number,
  centered: boolean,
): Promise<{ r: number; g: number; b: number }> {
  return page.evaluate(
    ({ selector, index, x, y, centered, screenWidth, screenHeight }) => {
      const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>(selector))
      const canvas = canvases[index]
      if (!canvas) throw new Error(`No canvas at index ${index} for ${selector}`)
      const ctx = canvas.getContext("2d")!
      const px = centered ? Math.round((canvas.width - screenWidth) / 2) + x : x
      const py = centered ? Math.round((canvas.height - screenHeight) / 2) + y : y
      const d = ctx.getImageData(px, py, 1, 1).data
      return { r: d[0], g: d[1], b: d[2] }
    },
    { selector, index, x, y, centered, screenWidth: SCREEN_WIDTH_M5, screenHeight: SCREEN_HEIGHT_M5 },
  )
}

// The M5 Dial's own screen, not COMBINED_TEST_PROJECT's e-paper one that
// helpers.ts's SCREEN_WIDTH/SCREEN_HEIGHT describe.
const SCREEN_WIDTH_M5 = 240
const SCREEN_HEIGHT_M5 = 240

test.describe("Round-device off-screen covers", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // Generous: the gate shows "Loading available devices..." until
    // /api/ddf/list has read and parsed every DDF zip on disk, which on a
    // cold dev server is well past the default 5s expect timeout.
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible({ timeout: 30000 })
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)
  })

  test("a round device's dead corners are covered in the backdrop color, and the toggle exposes them again", async ({
    page,
  }) => {
    // Force a layout read so the canvas has been sized and drawn.
    await getMainCanvas(page)

    // Device pixel (4,4) is deep in a corner the round panel never shows -
    // it is r~166 from the center, well outside even the case ring at 140.
    const covered = await readCanvasPixel(page, "canvas", 0, 4, 4, true)
    expect(covered).toEqual(OFFSCREEN)

    // The screen's own center must still be the screen, not the cover -
    // guards against a cover path whose fill-rule inverts and swallows
    // everything instead of just the corners.
    const center = await readCanvasPixel(page, "canvas", 0, SCREEN_WIDTH_M5 / 2, SCREEN_HEIGHT_M5 / 2, true)
    expect(center).toEqual(WHITE)

    // Hiding the adornment is the honest "show me the raw framebuffer" view:
    // the corner is back to being screen, because on the device that pixel
    // really does exist - it just isn't visible through the glass.
    await page.getByLabel("Adornment").click()
    await page.waitForTimeout(300)
    const exposed = await readCanvasPixel(page, "canvas", 0, 4, 4, true)
    expect(exposed).toEqual(WHITE)
  })

  test("screen thumbnails get the same treatment, following the same toggle", async ({ page }) => {
    // The thumbnails are every canvas except the largest one (the
    // interactive canvas) - they render at exactly screenWidth x
    // screenHeight, so their own origin is the device origin.
    const thumbIndex = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"))
      let largest = 0
      canvases.forEach((c, i) => {
        const b = c.getBoundingClientRect()
        const lb = canvases[largest].getBoundingClientRect()
        if (b.width * b.height > lb.width * lb.height) largest = i
      })
      return canvases.findIndex((_, i) => i !== largest)
    })
    expect(thumbIndex).toBeGreaterThanOrEqual(0)

    const covered = await readCanvasPixel(page, "canvas", thumbIndex, 4, 4, false)
    expect(covered).toEqual(OFFSCREEN)

    await page.getByLabel("Adornment").click()
    await page.waitForTimeout(300)
    const exposed = await readCanvasPixel(page, "canvas", thumbIndex, 4, 4, false)
    expect(exposed).toEqual(WHITE)
  })
})
