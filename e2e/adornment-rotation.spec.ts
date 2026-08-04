import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, clickButton0 } from "./helpers"

// Covers device rotation (2026-08-04): a DDF can declare
// screen.allowedRotations (lib/device-description.ts), and Project Settings
// lets the user pick 0/90/180/270 for how the device is physically mounted.
// 90/270 swap screenWidth/screenHeight. adornmentDrawingArea/hardwareButtons
// positions stay native (0deg) in project state always - the rotation is
// applied live at render time (canvas.tsx) and in the interactive adornment
// view (project-settings-dialog.tsx's hardware-buttons tab), both via
// lib/adornment-rotation.ts's shared 90-degree-multiple rotation geometry.
//
// public/ddf/mqtt-epaper-display.ddf.zip (used by COMBINED_TEST_PROJECT)
// declares allowedRotations: [90, 180, 270], native screen 400x300.

test.describe("Device rotation", () => {
  test("rotation picker shows allowed rotations, swaps screen dimensions, and persists", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Device", { exact: true }).click()

    for (const deg of ["0°", "90°", "180°", "270°"]) {
      await expect(page.getByRole("button", { name: deg, exact: true })).toBeVisible()
    }

    await page.getByRole("button", { name: "90°", exact: true }).click()
    // A valid rotation change must not show the "unsupported, reset" toast.
    await expect(page.getByText(/no longer support/)).not.toBeVisible()

    await page.getByText("Project Properties", { exact: true }).click()
    await expect(page.locator("#screenWidth")).toHaveValue("300")
    await expect(page.locator("#screenHeight")).toHaveValue("400")

    // Persists across closing/reopening the dialog (it's project state, not
    // local UI state) - re-check via the same Properties fields rather than
    // the rotation button's own selected-state styling, which is more
    // resilient to unrelated visual changes.
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Project Properties", { exact: true }).click()
    await expect(page.locator("#screenWidth")).toHaveValue("300")
    await expect(page.locator("#screenHeight")).toHaveValue("400")
  })

  test("rotating changes where hardware buttons hit-test on the canvas, but the Settings adornment view still resolves them by id", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // Before rotating: clicking button-0's native position opens Button 10
    // (see the 2026-08-03 BUTTON_PIN_MAP fix - button-0's physical slot is
    // hardware id 10, not 0).
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Hardware Buttons", { exact: true }).click()
    await page.locator("#button-0").click()
    await expect(page.getByRole("dialog")).toContainText('Configure Default Action for "Button 10"')
    await page.getByRole("button", { name: "Cancel" }).click()

    await page.getByText("Device", { exact: true }).click()
    await page.getByRole("button", { name: "90°", exact: true }).click()

    // After rotating: the same DOM element (svgElementId "button-0") still
    // resolves to Button 10 - a real SVG transform, not recomputed
    // coordinates, so clicking by id is unaffected by the rotation angle.
    await page.getByText("Hardware Buttons", { exact: true }).click()
    await page.locator("#button-0").click()
    await expect(page.getByRole("dialog")).toContainText('Configure Default Action for "Button 10"')
    await page.getByRole("button", { name: "Cancel" }).click()
    await page.keyboard.press("Escape")

    // On the main canvas, though, button-0's *visual* position has now
    // moved (90-degree rotation around the screen cutout's center) - the
    // fixed pixel offset that used to land on it before rotating must no
    // longer resolve to Button 10.
    await clickButton0(page)
    await expect(page.locator("div.font-medium", { hasText: "Button 10" })).toHaveCount(0)
  })
})
