import { test, expect, type Page } from "@playwright/test"
import { chooseDevice, M5DIAL_DEVICE_ID, getMainCanvas } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// The adornment SVG's <rect id="screen"> (lib/device-description.ts's
// extractScreenRect) is a pure position marker - DEVICE_GUIDE.md's own
// authoring convention says it should carry no fill/stroke. A device author
// can still give it a real color anyway (the M5 Dial's own adornment.svg
// does: style="fill:#606060;...", added so the Startup Gate's device picker
// - which renders the raw SVG untouched, see startup-device-gate.tsx's
// AdornmentThumbnail - shows something more device-like than a transparent
// hole while nothing's selected). Everywhere the *live* project is drawn
// (the interactive canvas, screen thumbnails - both via
// hooks/use-adornment-image.ts), that fill must not sit on top of the
// screen's own real background/objects (2026-08-16).

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

const SCREEN_WIDTH_M5 = 240
const SCREEN_HEIGHT_M5 = 240
// A fresh project's default screen background - dead center of the screen
// rect, far from any button/bezel artwork.
const WHITE = { r: 255, g: 255, b: 255 }
// The M5 Dial adornment.svg's own #screen fill (style="fill:#606060;...") -
// what a pixel there would be if the designer failed to strip it.
const AUTHORED_GRAY = { r: 96, g: 96, b: 96 }

test.describe("Adornment screen-cutout marker invisibility", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("the Startup Gate's device picker still shows the DDF's own screen fill untouched", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible({ timeout: 30000 })

    const screenEl = page.locator('[data-device-id="m5stack-m5dial-v1-1"] #screen').first()
    await expect(screenEl).toBeVisible()
    await expect(screenEl).toHaveAttribute("style", /fill:\s*#606060/)
  })

  test("the live canvas and its thumbnail show the real screen background, not the DDF's gray fill", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible({ timeout: 30000 })
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    const { canvas: mainCanvas } = await getMainCanvas(page)
    await expect(mainCanvas).toBeVisible()

    const mainPixel = await readCanvasPixel(page, "canvas", 0, SCREEN_WIDTH_M5 / 2, SCREEN_HEIGHT_M5 / 2, true)
    expect(mainPixel).not.toEqual(AUTHORED_GRAY)
    expect(mainPixel).toEqual(WHITE)

    // Thumbnail: whichever <canvas> isn't the (largest, interactive) main
    // one - screens-panel.tsx renders one per screen at native screen size,
    // no centering offset needed.
    const thumbPixel = await page.evaluate(
      ({ mainCanvasEl }) => {
        const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"))
        const thumb = canvases.find((c) => c !== mainCanvasEl)
        if (!thumb) throw new Error("No thumbnail canvas found")
        const ctx = thumb.getContext("2d")!
        const d = ctx.getImageData(120, 120, 1, 1).data
        return { r: d[0], g: d[1], b: d[2] }
      },
      { mainCanvasEl: await mainCanvas.evaluateHandle((el) => el) },
    )
    expect(thumbPixel).not.toEqual(AUTHORED_GRAY)
    expect(thumbPixel).toEqual(WHITE)
  })
})
