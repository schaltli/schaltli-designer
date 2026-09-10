import { test, expect } from "@playwright/test"
import { getMainCanvas, chooseDevice, ROUND_FIXTURE_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// detectSvgButtonAtPoint (components/canvas/canvas.tsx) does its own
// hand-rolled hit-testing for clicking hardware buttons directly on the
// canvas overlay - distinct from the Settings dialog, which gets native
// browser SVG hit-testing for free. Until 2026-08-11 it only ever queried
// `rect[id^="button"]`, so <rect> buttons worked while <path> ones were
// silently never clickable at all - found live, on curved-arrow buttons a
// DDF had just switched to. Fixed with Path2D + CanvasRenderingContext2D.
// isPointInPath(), a pure geometry query that doesn't care what shape the
// element actually is. This test drives real pixel clicks on the canvas, not
// the DOM SVG in Settings, so it actually exercises that code path.
//
// It ran against the M5 Dial until that device was dropped (2026-09-10). It
// moved here rather than going with it because it is the only test of the
// <path> case anywhere: every other adornment this repo can reach draws its
// buttons as <rect> (the e-paper's are, and hardware-button-master-
// inheritance.spec.ts clicks one of those), so deleting this would have
// taken the regression guard with it and left the bug free to come back.
test.describe("Hardware button canvas clicks", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-waveshare-1v8 not checked out alongside this repo")
  })

  test("clicking a <path> hardware button directly on the canvas opens its side panel", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    const { box } = await getMainCanvas(page)

    // svg-space -> canvas client-space: this canvas draws the device's
    // screenWidth x screenHeight (360x360) region of the adornment's
    // drawingArea (the <rect id="screen"> at x=90,y=90) centered in the
    // canvas element at 100% zoom with no pan offset (true for a freshly
    // created project) - see canvas.tsx's own getCanvasCoordinates() /
    // detectSvgButtonAtPoint() for the (identical, inverse) real
    // implementation this mirrors. The buttons sit below the screen rect, in
    // the surrounding bezel artwork, which is why the mapped y is larger
    // than the screen height.
    const drawingAreaOrigin = { x: 90, y: 90 }
    const SCREEN = 360
    const toClientPoint = (svg: { x: number; y: number }) => ({
      x: box.x + (box.width - SCREEN) / 2 + (svg.x - drawingAreaOrigin.x),
      y: box.y + (box.height - SCREEN) / 2 + (svg.y - drawingAreaOrigin.y),
    })

    // Points inside each button's actual fill, found the same way the M5
    // Dial's were: a grid search over the element's own getBBox() using the
    // browser-native SVGGeometryElement.isPointInFill(), then a Chebyshev
    // distance transform to pick the point deepest inside the shape rather
    // than merely somewhere inside it. Both sit 15px clear of any edge and
    // each is inside exactly one button, so a small artwork tweak will not
    // silently start clicking the wrong thing. Re-run that search if the
    // adornment's button shapes move.
    const cases = [
      { svg: { x: 191.53, y: 492.72 }, name: "Rotate Left" },
      { svg: { x: 348.14, y: 492.72 }, name: "Rotate Right" },
    ]

    for (const { svg, name } of cases) {
      const { x, y } = toClientPoint(svg)
      await page.mouse.click(x, y)
      await expect(page.getByText(name, { exact: true })).toBeVisible()
      // Closes the side panel before the next click - clicking empty canvas
      // space does that same as it would for any other selection.
      await page.mouse.click(box.x + 10, box.y + 10)
    }
  })
})
