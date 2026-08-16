import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { getMainCanvas, chooseDevice, M5DIAL_DEVICE_ID } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// Covers the M5 Dial DDF's rotary-encoder hardware buttons
// (2026-08-04): "Rotate Left"/"Rotate Right" are drawn as classic curved
// arrows (round-capped shaft + triangular tip, one closed path each) sitting
// just outside the case ring instead of the small round placeholder buttons
// the DDF shipped with before, and "Click" was renamed to "Push" (itself
// later renamed "Push Bezel", 2026-08-17's physically-accurate artwork
// replacement) to match the actual physical control.
test.describe("M5 Dial hardware buttons", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("creating a project with the M5 Dial loads its 3 rotary-encoder buttons under their new names", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()

    // Card's accessible name concatenates its version badge + device name -
    // see components/startup-device-gate.tsx's DdfCard.
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    // Verified via the downloaded editable project.json (id-based, not
    // pixel-position-based) rather than Project Settings > Hardware Buttons
    // - that page was deleted 2026-08-16 (superseded by master-screen
    // button-action inheritance, configured per-button from the canvas
    // itself - see the pixel-click test below for that surface). This is
    // deliberately the more failure-resistant of the two: it doesn't need
    // recalibrating every time the adornment artwork's button shapes change,
    // unlike the canvas click-coordinates below.
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const zip = await JSZip.loadAsync(Buffer.concat(chunks))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))

    const cases: Array<{ id: string; name: string }> = [
      { id: "button-0", name: "Rotate Left" },
      { id: "button-1", name: "Rotate Right" },
      { id: "button-2", name: "Push Bezel" },
    ]
    for (const { id, name } of cases) {
      expect(project.hardwareButtons.find((b: { id: string; name: string }) => b.id === id)).toEqual({ id, name })
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
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    const { box } = await getMainCanvas(page)

    // Points empirically found to fall inside each button's actual fill -
    // re-picked 2026-08-17 after the user replaced adornment.svg again with
    // physically-accurate M5 Dial artwork (button-2's label also changed,
    // "Push" -> "Push Bezel", in that same replacement). Found by computing
    // each button's real local bounding box (a throwaway live SVG element's
    // getBBox() - detached-doc parsing can't do this itself, see
    // canvas.tsx's localPointForElement comment on the same limitation) and
    // grid-searching it with Path2D.isPointInPath() for the point deepest
    // inside the shape, then forward-transforming through its own composed
    // ancestor matrix - the same hit-test canvas.tsx's own
    // localPointForElement/detectSvgButtonAtPoint uses, just run as a
    // one-shot in-browser search instead of via real mouse clicks.
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
      { svg: { x: 48.99, y: 329.78 }, name: "Rotate Left" },
      { svg: { x: 331.01, y: 329.78 }, name: "Rotate Right" },
      { svg: { x: 190, y: 358.82 }, name: "Push Bezel" },
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
