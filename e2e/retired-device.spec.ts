import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, revealDevice, waitForDeviceGate, WAVESHARE_DEVICE_ID } from "./helpers"

// A device no longer made for (DDF `device.retired`, 2026-10-12): the XIAO
// e-paper. Its projects still open as before; no picker offers it for a new
// one. Its DDF stays in public/ddf/ for exactly that, and as the suite's
// device without touch (COMBINED_TEST_PROJECT).

const RETIRED_ID = "mqtt-epaper-display-2"

test("the device list says which device is retired", async ({ request }) => {
  const { devices } = await (await request.get("/api/ddf/list")).json()
  const retired = devices.filter((d: { retired: boolean }) => d.retired).map((d: { deviceId: string }) => d.deviceId)
  expect(retired).toEqual([RETIRED_ID])
  expect(devices.find((d: { deviceId: string }) => d.deviceId === WAVESHARE_DEVICE_ID).retired).toBe(false)
})

test("a new project is not offered the retired device; the others are", async ({ page }) => {
  await page.goto("/")
  await waitForDeviceGate(page)
  await revealDevice(page, WAVESHARE_DEVICE_ID, "curated")
  await expect(page.locator(`[data-device-id="${RETIRED_ID}"]`)).toHaveCount(0)
})

test("a project made for it opens as before, without a word about the device", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await expect(page.getByText(/is not available on this instance/)).toHaveCount(0)
  // Settings › Device still lists it - for this project, which is on it.
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Device", exact: true }).click()
  await dialog.locator("#ddf-select").click()
  await expect(page.getByRole("option", { name: /MQTT ePaper Display/ })).toHaveCount(1)
})
