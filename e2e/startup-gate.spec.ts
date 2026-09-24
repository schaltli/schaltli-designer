import { test, expect } from "@playwright/test"
import { WAVESHARE_DEVICE_ID, createProject, getMainCanvas, revealDevice, waitForDeviceGate } from "./helpers"

// Choosing the device a project is made for. Since 2026-09-24 that is step 1
// of the New Project dialog, which the start page opens
// (docs/2026-09-23-explicit-save.md); its own behaviour, rather than the
// setup step every other spec uses it as.
test.describe("Startup device gate", () => {
  test("the start page offers New Project, not a device list of its own", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("button", { name: "New Project...", exact: true })).toBeVisible()
    await expect(page.getByText("Server DDFs", { exact: true })).toHaveCount(0)
  })

  test("a double click on a device goes straight on to the name", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)

    const card = await revealDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await card.dblclick()

    // One gesture instead of "choose a device, then press the button below
    // it" - for anyone who already knows which device they want.
    await expect(page.locator("#new-project-name")).toBeVisible()
    const name = await createProject(page)
    const { canvas } = await getMainCanvas(page)
    await expect(canvas).toBeVisible()
    await expect(page.getByTestId("project-title")).toHaveText(name)

    // On the device that was double clicked, not on whichever one happened
    // to be selected before.
    await page.getByRole("button", { name: "File" }).click()
    await expect(page.getByRole("menuitem", { name: "Deploy to Device" })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("the Next button is still there, because a double click is a mouse gesture", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)

    // Nothing chosen yet: the button is present and refuses.
    const next = page.getByRole("button", { name: "Next", exact: true })
    await expect(next).toBeVisible()
    await expect(next).toBeDisabled()

    // One click chooses, and then it lets you through - the route a keyboard
    // has, which is why the double click cannot be the only way in.
    const card = await revealDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await card.click()
    await expect(next).toBeEnabled()
  })
})
