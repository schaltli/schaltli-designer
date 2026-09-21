import { test, expect } from "@playwright/test"
import { WAVESHARE_DEVICE_ID, getMainCanvas, revealDevice, waitForDeviceGate } from "./helpers"

// The screen every project starts on: pick the device, and the project is
// made for it. Its own behaviour, rather than the setup step every other
// spec uses it as.
test.describe("Startup device gate", () => {
  test("a double click on a device starts the project on it", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)

    const card = await revealDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await card.dblclick()

    // The gate is gone and the editor is up - one gesture instead of "choose
    // a device, then press the button two inches below it", which is the
    // whole of this screen for anyone who already knows which device they
    // want.
    await expect(page.getByRole("button", { name: "Create Project" })).toHaveCount(0, { timeout: 20000 })
    const { canvas } = await getMainCanvas(page)
    await expect(canvas).toBeVisible()

    // On the device that was double clicked, not on whichever one happened
    // to be selected before.
    await page.getByRole("button", { name: "File" }).click()
    await expect(page.getByRole("menuitem", { name: "Deploy to Device" })).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("the button is still there, because a double click is a mouse gesture", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)

    // Nothing chosen yet: the button is present and refuses.
    const create = page.getByRole("button", { name: "Create Project" })
    await expect(create).toBeVisible()
    await expect(create).toBeDisabled()

    // One click chooses, and then it lets you through - the route a keyboard
    // has, which is why the double click cannot be the only way in.
    const card = await revealDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await card.click()
    await expect(create).toBeEnabled()
  })
})
