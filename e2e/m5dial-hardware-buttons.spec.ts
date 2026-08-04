import { test, expect } from "@playwright/test"

// Covers public/ddf/m5stack-m5dial.ddf.zip's rotary-encoder hardware buttons
// (2026-08-04): "Rotate Left"/"Rotate Right" are drawn as classic curved
// arrows (round-capped shaft + triangular tip, one closed path each) sitting
// just outside the case ring instead of the small round placeholder buttons
// the DDF shipped with before, and "Click" was renamed to "Push" to match
// the actual physical control. No firmware exists for this device yet - this
// only exercises the designer-side DDF (parses, creates a project, and each
// button's svgElementId still resolves to the right name), not real hit-zone
// pixel positions on a live canvas.
test.describe("M5 Dial hardware buttons", () => {
  test("creating a project with the M5 Dial loads its 3 rotary-encoder buttons under their new names", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()

    // Card's accessible name concatenates its version badge + device name -
    // see components/startup-device-gate.tsx's DdfCard.
    await page.getByRole("button", { name: "v1.1 M5Stack M5Dial (V1.1)" }).click()
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
})
