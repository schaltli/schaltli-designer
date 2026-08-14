import { test, expect } from "@playwright/test"
import { loadProject, COMBINED_TEST_PROJECT } from "./helpers"

// Covers the right panel (Objects/Property/Topic-values, or MQTT Topic
// Values in preview mode) resize handle added 2026-08-15 - previously a
// fixed w-80 (320px), now a draggable-width panel defaulting to 480px
// (that same 320px, 50% wider, per request).
test.describe("Right panel resize", () => {
  test("defaults to 480px and is resizable by dragging its left edge", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // Structural selector (border-l + bg-card), same fingerprint as the
    // drag handle right before it - no dedicated test id exists yet for
    // either, and this is the only element in the layout matching both.
    const panel = page.locator("div.border-l.border-border.bg-card")
    const handle = page.locator("div.cursor-col-resize")

    const before = await panel.boundingBox()
    expect(before).not.toBeNull()
    expect(Math.round(before!.width)).toBe(480)

    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()

    // Drag the handle 150px to the left - since it's the *right* panel's
    // left edge, dragging left grows it (less horizontal space given to
    // the canvas, more to the panel).
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x - 150, handleBox!.y + handleBox!.height / 2, { steps: 10 })
    await page.mouse.up()

    const after = await panel.boundingBox()
    expect(after).not.toBeNull()
    expect(Math.round(after!.width)).toBeGreaterThan(600)
    expect(Math.round(after!.width)).toBeLessThan(660)
  })

  test("resize is clamped to a sane min/max width", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    const panel = page.locator("div.border-l.border-border.bg-card")
    const handle = page.locator("div.cursor-col-resize")
    const handleBox = (await handle.boundingBox())!

    // Drag far past the viewport's left edge - width must clamp to the
    // configured minimum (280px, RIGHT_PANEL_MIN_WIDTH in project-editor.tsx)
    // rather than shrinking to nothing or going negative.
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 2000, handleBox.y + handleBox.height / 2, { steps: 10 })
    await page.mouse.up()

    const minWidthResult = await panel.boundingBox()
    expect(Math.round(minWidthResult!.width)).toBe(280)

    // Now the handle has moved with the panel - drag far past the
    // viewport's right edge instead, width must clamp to the configured
    // maximum (900px, RIGHT_PANEL_MAX_WIDTH).
    const newHandleBox = (await handle.boundingBox())!
    await page.mouse.move(newHandleBox.x + newHandleBox.width / 2, newHandleBox.y + newHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(newHandleBox.x - 2000, newHandleBox.y + newHandleBox.height / 2, { steps: 10 })
    await page.mouse.up()

    const maxWidthResult = await panel.boundingBox()
    expect(Math.round(maxWidthResult!.width)).toBe(900)
  })
})
