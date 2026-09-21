import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint } from "./helpers"

// MqttDataLine (2026-07-31 /grill-me session): a data-bound flow-
// visualization line, a distinct object type from plain "line" (mirroring
// MqttDataField vs Label) rather than a toggle on it. This test covers the
// functional/persistence side - that the tool creates the right object type
// with its own property panel, and that its calibration points and arrow
// conditions persist on the object. The actual value-driven rendering
// (stroke width scaling with magnitude, arrow flipping ends with sign) was
// verified once via the headless designer-preview render at exact pixel
// dimensions - this suite doesn't do pixel comparison (see
// object-creation-preview.spec.ts's header comment for why).
test("MQTT Data Line tool creates a distinct object type with its own calibration/arrow properties", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByText("tab-control-tests", { exact: true }).click()
  await page.waitForTimeout(800)

  const { box } = await getMainCanvas(page)
  // Device pixels, not canvas-box fractions - see helpers.ts's devicePoint.
  const lineStart = devicePoint(box, 100, 100)
  const lineEnd = devicePoint(box, 260, 130)

  await page.getByRole("button", { name: "Live Line" }).first().click()
  await page.waitForTimeout(150)
  await page.mouse.move(lineStart.x, lineStart.y)
  await page.mouse.down()
  await page.mouse.move(lineEnd.x, lineEnd.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  await expect(page.locator("h3").first()).toContainText("Live Line")

  // Default calibration points (0 -> 1px, 100 -> 6px) are pre-populated -
  // one line each since the panel rebuild, saying what they map
  // (docs/2026-09-20-property-panel.md).
  await expect(page.getByRole("button", { name: /^Width by value/ })).toContainText("2 points")
  await expect(page.getByRole("button", { name: "0 1 px" })).toBeVisible()
  await expect(page.getByRole("button", { name: "100 6 px" })).toBeVisible()

  // Arrow conditions default to "< 0" (start) / "> 0" (end) - edit the end
  // condition's value and confirm it persists across a deselect/reselect.
  // A condition row's name IS a <label for> - it points at the operator -
  // so this one is found the way it always was.
  const endValueInput = page.locator("label", { hasText: "End when" }).locator("..").locator('input[type="text"]')
  await endValueInput.fill("10")
  await page.waitForTimeout(150)

  // Deselect on empty device area, then click the line's own midpoint.
  const empty = devicePoint(box, 370, 280)
  const mid = devicePoint(box, 180, 115)
  await page.mouse.click(empty.x, empty.y)
  await page.waitForTimeout(150)
  await page.mouse.click(mid.x, mid.y)
  await page.waitForTimeout(150)

  await expect(page.locator("h3").first()).toContainText("Live Line")
  await expect(endValueInput).toHaveValue("10")
})
