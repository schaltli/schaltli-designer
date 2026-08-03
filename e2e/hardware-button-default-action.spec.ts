import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, clickButton0 } from "./helpers"

// Covers a bug reported live (2026-08-03): the "Configure Action" dialog in
// Project Settings > Hardware Buttons wrote to HardwareButton.action, but
// the list (and the real firmware export path - lib/project-zip.ts +
// ProjectLoader.cpp, which only ever parses a "defaultAction" JSON key)
// both read defaultAction - so a configured default action was silently
// inert on a real device, and the list always showed "None" regardless of
// what was configured. Fixed by writing straight to defaultAction, removing
// the dead `action` field entirely, adding an explicit "None" choice (there
// was previously no way to say "this button does nothing by default"), and
// replacing the button list with a clickable adornment diagram - clearer
// which physical button is meant, especially now that button IDs are no
// longer simple reading order (see the same day's BUTTON_PIN_MAP DDF fix).
const actionTypeSelect = (page: import("@playwright/test").Page) =>
  page.locator("label", { hasText: "Action Type" }).locator("..").getByRole("combobox")

test.describe("Hardware button default action", () => {
  test("configuring a default action persists it, shown correctly on reopen; None clears it", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Hardware Buttons", { exact: true }).click()

    // Click a physical button on the adornment diagram - a real SVG
    // element (not a canvas pixel), so a plain CSS id selector finds it.
    // Note svgElementId "button-0" (the top-left physical slot) is *not*
    // hardware id 0 - it's "Button 1" per the corrected BUTTON_PIN_MAP
    // mapping (top row is 1,3,5,7,9,11 left-to-right) - proof this test
    // exercises the real corrected id, not the naive reading-order one.
    await page.locator("#button-0").click()
    await expect(page.getByRole("dialog")).toContainText('Configure Default Action for "Button 1"')

    // Starts on "None" for a button with no default action yet - not a
    // pre-selected real action that was never actually configured (the
    // second half of the original bug: no way to represent "no action").
    await expect(actionTypeSelect(page)).toHaveText("None")

    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Next Screen" }).click()
    await page.getByRole("button", { name: "Save", exact: true }).click()

    // Reopen the same button - must reflect what was actually saved, not
    // "None" (the original bug).
    await page.locator("#button-0").click()
    await expect(actionTypeSelect(page)).toHaveText("Next Screen")
    await page.getByRole("button", { name: "Cancel" }).click()

    // A different button must not show button-0's just-configured state -
    // each button's default is independent.
    await page.locator("#button-1").click()
    await expect(actionTypeSelect(page)).toHaveText("None")
    await page.getByRole("button", { name: "Cancel" }).click()

    // Clear button-0 back to None.
    await page.locator("#button-0").click()
    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "None" }).click()
    await page.getByRole("button", { name: "Save", exact: true }).click()

    await page.locator("#button-0").click()
    await expect(actionTypeSelect(page)).toHaveText("None")
  })

  test("a screen override clearly shows what default it's overriding", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // Give button-0 a real default action first.
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Hardware Buttons", { exact: true }).click()
    await page.locator("#button-0").click()
    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Next Screen" }).click()
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")

    // Click the same physical button on the main canvas to open the
    // per-screen override panel (components/hardware-button-side-panel.tsx).
    // hardware-button-side-panel.tsx is mounted twice in the DOM (desktop/
    // mobile layout variants) regardless of which is actually visible -
    // .first() throughout matches preview-mode.spec.ts's existing pattern
    // for this same component.
    await clickButton0(page)
    await expect(page.getByText(/Configure Action for/).first()).toBeVisible()
    await expect(page.getByText("Using Default").first()).toBeVisible()
    await expect(page.getByText("Next Screen").first()).toBeVisible()

    // Override it for this screen.
    await actionTypeSelect(page).first().click()
    await page.getByRole("option", { name: "Previous Screen" }).first().click()

    // Both the default being overridden AND what it's overridden by must
    // be clearly visible together - not just "Screen Override" + the new
    // action with no trace of what the default even was.
    await expect(page.getByText("Screen Override").first()).toBeVisible()
    await expect(page.getByText("Default Action:").first()).toBeVisible()
    await expect(page.getByText("Overridden by:").first()).toBeVisible()
    const statusText = await page.locator("text=Default Action:").first().locator("..").textContent()
    expect(statusText).toContain("Next Screen")
    expect(statusText).toContain("Previous Screen")
  })
})
