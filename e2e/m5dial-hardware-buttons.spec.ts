import { test, expect } from "@playwright/test"
import { getMainCanvas } from "./helpers"

// Covers public/ddf/m5stack-m5dial.ddf.zip's rotary-encoder hardware buttons
// (2026-08-04): "Rotate Left"/"Rotate Right" are drawn as classic curved
// arrows (round-capped shaft + triangular tip, one closed path each) sitting
// just outside the case ring instead of the small round placeholder buttons
// the DDF shipped with before, and "Click" was renamed to "Push" to match
// the actual physical control.
test.describe("M5 Dial hardware buttons", () => {
  test("creating a project with the M5 Dial loads its 3 rotary-encoder buttons under their new names", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()

    // Card's accessible name concatenates its version badge + device name -
    // see components/startup-device-gate.tsx's DdfCard.
    await page.getByRole("button", { name: "v1.3 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Hardware Buttons", { exact: true }).click()

    const cases: Array<{ svgId: string; name: string }> = [
      { svgId: "button-0", name: "Rotate Left" },
      { svgId: "button-1", name: "Rotate Right" },
      { svgId: "button-2", name: "Push" },
    ]
    for (const { svgId, name } of cases) {
      await page.locator(`#${svgId}`).click()
      await expect(page.getByRole("dialog")).toContainText(`Configure Default Action for "${name}"`)
      await page.getByRole("button", { name: "Cancel" }).click()
    }
  })

  // detectSvgButtonAtPoint (components/canvas/canvas.tsx) does its own
  // hand-rolled hit-testing for clicking hardware buttons directly on the
  // canvas overlay (distinct from the Settings dialog above, which gets
  // native browser SVG hit-testing for free) - until 2026-08-11 it only
  // ever queried `rect[id^="button"]`, so button-2 ("Push", a real <rect>)
  // worked while button-0/button-1 (the curved-arrow <path> elements this
  // very DDF switched to on 2026-08-04) were silently never clickable at
  // all - found live. Fixed with Path2D + CanvasRenderingContext2D.
  // isPointInPath(), a pure geometry query that doesn't care what shape the
  // element actually is. This test drives real pixel clicks on the canvas,
  // not the DOM SVG in Settings, so it actually exercises that code path.
  test("clicking each hardware button directly on the canvas opens its side panel, arrows included", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "v1.3 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    const { box } = await getMainCanvas(page)

    // Points computed from adornment.svg's own path data for button-0
    // (an annular arc band, radius 148-168, centered on the 380x380
    // viewBox's case-center (190,190)) - picked well inside the fill, not
    // just within its bounding box, since a thin arc has plenty of bbox
    // area that isn't actually part of the path. button-1 is the exact
    // horizontal mirror (x' = 380-x, same y - verified against the DDF's
    // own d attribute). button-2 ("Push") is a plain rect, centered at its
    // own DDF-declared x/y/width/height.
    //
    // svg-space -> canvas client-space: this canvas draws the device's
    // screenWidth x screenHeight (240x240) region of the adornment's
    // drawingArea (DDF: x=70,y=70,w=240,h=240) centered in the canvas
    // element at 100% zoom with no pan offset (true for a freshly created
    // project) - see canvas.tsx's own getCanvasCoordinates()/
    // detectSvgButtonAtPoint() for the (identical, inverse) real
    // implementation this mirrors.
    const drawingAreaOrigin = { x: 70, y: 70 }
    const toClientPoint = (svg: { x: number; y: number }) => ({
      x: box.x + (box.width - 240) / 2 + (svg.x - drawingAreaOrigin.x),
      y: box.y + (box.height - 240) / 2 + (svg.y - drawingAreaOrigin.y),
    })

    const cases: Array<{ svg: { x: number; y: number }; name: string }> = [
      { svg: { x: 38.68, y: 176.655 }, name: "Rotate Left" },
      { svg: { x: 380 - 38.68, y: 176.655 }, name: "Rotate Right" },
      { svg: { x: 190, y: 348 }, name: "Push" },
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
