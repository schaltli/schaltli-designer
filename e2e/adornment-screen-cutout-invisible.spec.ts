import { test, expect, type Page } from "@playwright/test"
import { chooseDevice, M5DIAL_DEVICE_ID, getMainCanvas, revealDevice, waitForDeviceGate } from "./helpers"
import { seedM5DialDdf, seedWaveshareDdf } from "./ddf-seed"

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

// Every device whose adornment this repo can reach. The check below is the
// same for all of them and deliberately not M5-Dial-specific: it is the one
// assertion that catches *any* artwork painted over the screen, which is
// DEVICE_GUIDE.md's first authoring rule ("the screen area must be a real
// punched-out hole, not just an unfilled shape drawn on top") and the only
// one nothing verified until 2026-08-21 - when the Waveshare's adornment was
// found drawing its bezel as two stacked filled discs, leaving the whole
// drawing area under an opaque black one.
// The Waveshare is seeded under its own device id rather than its real one,
// the same reason device-actions.spec.ts does it: a *live* device on the
// broker republishes its retained hello, and the Startup Gate this test opens
// auto-fetches from it - overwriting .data/ddf/waveshare-knob-1v8.ddf.zip
// with whatever that device currently serves, mid-test. Seeding under a
// separate id means this checks the DDF in the firmware repo's ddf-source/,
// which is the thing a human edits and the thing this test exists to guard,
// rather than whichever build happens to be flashed right now.
const CUTOUT_WAVESHARE_DEVICE_ID = "e2e-cutout-waveshare"
const DEVICES = [
  { name: "M5 Dial", deviceId: M5DIAL_DEVICE_ID, screen: { width: 240, height: 240 }, seed: seedM5DialDdf },
  {
    name: "Waveshare Knob 1.8",
    deviceId: CUTOUT_WAVESHARE_DEVICE_ID,
    screen: { width: 360, height: 360 },
    seed: () => seedWaveshareDdf({ deviceId: CUTOUT_WAVESHARE_DEVICE_ID }),
  },
]
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

  // The generic half: nothing in a device's adornment may paint over the
  // screen. A device author reads DEVICE_GUIDE.md and still gets this wrong
  // (twice now), and the symptom - a canvas that is simply a black disc -
  // looks so much like "the editor is broken" that it costs a debugging
  // session rather than reading as a DDF mistake. Checking the dead centre
  // of the screen rect is enough: it is the one point every device's panel
  // certainly displays, and it is far from every bezel and button.
  for (const device of DEVICES) {
    test(`${device.name}: no adornment artwork covers the screen`, async ({ page }) => {
      test.skip(!(await device.seed()), `firmware repo for ${device.name} not checked out alongside this repo`)

      await page.goto("/")
      await waitForDeviceGate(page)
      await chooseDevice(page, device.deviceId, "auto-discovered")
      await page.getByRole("button", { name: "Create Project" }).click()
      await page.waitForTimeout(1500)

      const { canvas } = await getMainCanvas(page)
      await expect(canvas).toBeVisible()

      const centre = await page.evaluate(
        ({ width, height }) => {
          const canvasEl = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas")).sort(
            (a, b) => b.width * b.height - a.width * a.height,
          )[0]
          const ctx = canvasEl.getContext("2d")!
          const d = ctx.getImageData(
            Math.round((canvasEl.width - width) / 2) + Math.round(width / 2),
            Math.round((canvasEl.height - height) / 2) + Math.round(height / 2),
            1,
            1,
          ).data
          return { r: d[0], g: d[1], b: d[2] }
        },
        device.screen,
      )
      // A fresh project's screen background. Anything else here means the
      // adornment is on top of it.
      expect(centre).toEqual(WHITE)
    })
  }

  test("the Startup Gate's device picker still shows the DDF's own screen fill untouched", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    // Nothing is announcing an M5 Dial here, so its card lives in the folded
    // "cached" group rather than under "Announced Devices".
    await revealDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")

    const screenEl = page.locator('[data-device-id="m5stack-m5dial-v1-1"] #screen').first()
    await expect(screenEl).toBeVisible()
    await expect(screenEl).toHaveAttribute("style", /fill:\s*#606060/)
  })

  test("the live canvas and its thumbnail show the real screen background, not the DDF's gray fill", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
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
