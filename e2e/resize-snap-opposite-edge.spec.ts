import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas } from "./helpers"

// Regression test for a bug reported 2026-07-26: with a snap grid enabled,
// resizing a large object (e.g. a level indicator) by dragging one corner
// so it snaps to a grid line moved the OPPOSITE corner too - the two
// corners should be independent; only the dragged one should move.
//
// Root cause (canvas.tsx, resize-handle snap logic for "nw"/"sw"): the
// snapped width was computed as `width - (guide.position - newX)`, using
// `newX` - the corner's position mid-drag, already offset from the drag's
// start - instead of the drag-start `x`. That injected an error equal to
// whatever distance had already been dragged into the opposite edge's
// position the moment a snap engaged. The identical pattern for the
// "baseline-left" text-resize handle already used the correct anchor (a
// comment there says so explicitly) - the same fix just hadn't been
// applied to the box/level-indicator/icon resize handles.
test("resizing one corner with snap-to-grid keeps the opposite corner fixed", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)

  // Configure a single vertical snap guide at x=100.
  await page.getByRole("button", { name: "Settings" }).click()
  await page.getByText("Snap Grid", { exact: true }).click()
  const snapGridTextarea = page.locator("#snapGrid")
  await snapGridTextarea.fill('{"horizontal": [], "vertical": [100]}')
  await snapGridTextarea.blur()
  await page.getByRole("button", { name: "Close" }).click()
  await page.waitForTimeout(300)

  // Draw a level indicator, then set exact geometry via the property panel:
  // x=50, width=300 -> right edge=350, comfortably clear of the x=100 guide.
  await page.getByRole("button", { name: "Level" }).first().click()
  const { box } = await getMainCanvas(page)
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 260, box.y + 260, { steps: 5 })
  await page.mouse.up()

  await page.locator("#x").fill("50")
  await page.locator("#y").fill("50")
  await page.locator("#width").fill("300")
  await page.locator("#height").fill("100")
  await page.waitForTimeout(200)

  // The device rendering is a fixed 400x300px block centered in the (much
  // larger, letterboxed) canvas element at this suite's 100% default zoom.
  const deviceScreenLeft = box.x + (box.width - 400) / 2
  const deviceScreenTop = box.y + (box.height - 300) / 2
  const handleX = deviceScreenLeft + 50
  const handleY = deviceScreenTop + 50

  await page.mouse.move(handleX, handleY)
  await page.mouse.down()
  // Sweep rightward, watching the live property-panel value, until the
  // snap to x=100 actually engages - this is what guarantees the test
  // exercises the snapped path (the raw/unsnapped drag was never buggy).
  let snapped = false
  for (let dx = 1; dx <= 70; dx++) {
    await page.mouse.move(handleX + dx, handleY)
    if ((await page.locator("#x").inputValue()) === "100") {
      snapped = true
      break
    }
  }
  expect(snapped).toBe(true)
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await page.locator("#x").inputValue()).toBe("100")
  expect(await page.locator("#width").inputValue()).toBe("250")
})
