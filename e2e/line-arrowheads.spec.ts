import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas } from "./helpers"

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

  await page.getByRole("button", { name: "Line" }).first().click()
  await page.waitForTimeout(150)
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.65, { steps: 5 })
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
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9)
  await page.waitForTimeout(150)
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.575)
  await page.waitForTimeout(150)

  await expect(startSelect).toHaveText("Arrow")
  await expect(endSelect).toHaveText("None")
})
