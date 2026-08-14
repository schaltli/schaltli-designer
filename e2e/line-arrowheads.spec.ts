import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint } from "./helpers"

// Verifies the arrowStart/arrowEnd properties (2026-07-31) actually persist
// on the line object, not just the property panel's own transient Select
// state - deselecting and reselecting forces a fresh read from the object
// model. Pixel-level correctness (the arrowhead itself renders as a clean,
// fully-aliased filled triangle via fillTriangle, oriented along the
// correct end's tangent) was verified once via the headless designer-
// preview render at exact pixel dimensions - not re-asserted here, since
// this suite doesn't do pixel comparison (see object-creation-preview.spec.ts's
// header comment for why).
test("setting arrowheads on a line persists on the object, independently per end", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByText("tab-control-tests", { exact: true }).click()
  await page.waitForTimeout(800)

  const { box } = await getMainCanvas(page)

  // exact: true - "MQTT Data Line" also contains the substring "Line" and
  // sits earlier in the toolbar (MQTT group before Graphics group), so a
  // loose name match picks the wrong tool since that type was added
  // (2026-07-31).
  await page.getByRole("button", { name: "Line", exact: true }).first().click()
  await page.waitForTimeout(150)
  // Device pixels, not canvas-box fractions - see helpers.ts's devicePoint.
  const lineStart = devicePoint(box, 120, 140)
  const lineEnd = devicePoint(box, 260, 190)
  await page.mouse.move(lineStart.x, lineStart.y)
  await page.mouse.down()
  await page.mouse.move(lineEnd.x, lineEnd.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  const startSelect = page.locator("label", { hasText: "Arrow at Start" }).locator("..").getByRole("combobox")
  const endSelect = page.locator("label", { hasText: "Arrow at End" }).locator("..").getByRole("combobox")

  await expect(startSelect).toHaveText("None")
  await expect(endSelect).toHaveText("None")

  await startSelect.click()
  await page.getByRole("option", { name: "Arrow", exact: true }).click()
  await page.waitForTimeout(150)

  // End stays "None" - the two flags are independent, not a single toggle.
  await expect(startSelect).toHaveText("Arrow")
  await expect(endSelect).toHaveText("None")

  // Deselect (click empty canvas) then reselect the line via the object
  // tree, forcing the panel to re-read from the object model rather than
  // just keeping whatever the Select last rendered.
  // Outside the screen rect is guaranteed-empty canvas; then the line's own
  // midpoint to reselect it.
  const empty = devicePoint(box, -40, -40)
  const mid = devicePoint(box, 190, 165)
  await page.mouse.click(empty.x, empty.y)
  await page.waitForTimeout(150)
  await page.mouse.click(mid.x, mid.y)
  await page.waitForTimeout(150)

  await expect(startSelect).toHaveText("Arrow")
  await expect(endSelect).toHaveText("None")
})
