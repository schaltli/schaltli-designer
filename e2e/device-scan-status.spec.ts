import { test, expect } from "@playwright/test"
import { waitForDeviceGate } from "./helpers"

// The device scan's status line in the New Project dialog
// (components/device-scan-section.tsx): it names the broker it scans, and
// when it cannot reach it, why. A device that does not show up is first a
// question of which broker the designer is on - asked in the forum
// (rajiva, 2026-10-15) with nothing on the screen to answer it.

test("the scan names the broker it listens on", async ({ page }) => {
  await page.goto("/")
  await waitForDeviceGate(page)
  // Scanning, or - while other specs' fake devices announce on the suite's
  // broker - loading one of them: either way the broker is named.
  await expect(page.getByTestId("device-scan")).toContainText(
    /(Scanning for new devices on|new devices? from) wss?:\/\/\S+/,
    { timeout: 15_000 },
  )
})

test("a broker the scan cannot reach is named, with the reason", async ({ page }) => {
  // A port nothing listens on.
  const deadBroker = "ws://127.0.0.1:9"
  await page.addInitScript((url) => {
    window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url }))
  }, deadBroker)
  await page.goto("/")
  await waitForDeviceGate(page)
  const status = page.getByTestId("device-scan")
  await expect(status).toContainText(`Not connected to ${deadBroker} - new devices won't be detected.`, { timeout: 15_000 })
  // The reason follows: refused, or the timeout.
  await expect(status).toContainText(/Connection (failed|timeout)/)
})
