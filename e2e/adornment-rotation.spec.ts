import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, clickButton0 } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Covers device rotation (2026-08-04): a DDF can declare
// screen.allowedRotations (lib/device-description.ts), and Project Settings
// lets the user pick 0/90/180/270 for how the device is physically mounted.
// 90/270 swap screenWidth/screenHeight. adornmentDrawingArea/hardwareButtons
// positions stay native (0deg) in project state always - the rotation is
// applied live at render time, both for the canvas itself and its hardware-
// button hit-testing (canvas.tsx), via lib/adornment-rotation.ts's shared
// 90-degree-multiple rotation geometry.
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

  test("rotating changes where hardware buttons hit-test on the canvas", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // Before rotating: the top-left physical slot's fixed offset lands on
    // Button 10 - its SVG element id is "button-10" directly (2026-08-16:
    // the adornment SVG's own element id is the firmware's button
    // identifier, no separate device.json indirection - see
    // docs/device-contract.md §5). Before that, this same physical slot's
    // SVG id was "button-0" while the 2026-08-03 BUTTON_PIN_MAP fix meant
    // its real hardware id was "btn-10" - the SVG was renumbered to match
    // instead of keeping that indirection.
    await clickButton0(page)
    await expect(page.locator("div.font-medium", { hasText: "Button 10" })).toBeVisible()

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Device", { exact: true }).click()
    await page.getByRole("button", { name: "90°", exact: true }).click()
    await page.keyboard.press("Escape")

    // After rotating: button-10's *visual* position has moved (90-degree
    // rotation around the screen cutout's center) - the fixed pixel offset
    // that used to land on it before rotating must no longer resolve to
    // Button 10.
    await clickButton0(page)
    await expect(page.locator("div.font-medium", { hasText: "Button 10" })).toHaveCount(0)
  })

  // Deploy is the only real path that serializes rotation for a device to
  // read (lib/project-zip.ts's buildDeviceProjectZip, shared by "Export
  // Project" and this MQTT self-deploy flow) - drives the same real flow
  // deploy-dialog.spec.ts does, to catch the actual gap found while
  // implementing this: screenWidth/Height were already exported, but
  // "rotation" itself wasn't in project.json at all until this feature.
  test("the exported project.json carries the chosen rotation", async ({ page }, testInfo) => {
    const epaperId = `e2e-rotation-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-rotation-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Rotation Test ${epaperId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await loadProject(page, COMBINED_TEST_PROJECT)
      await page.getByRole("button", { name: "Settings" }).click()
      await page.getByText("Device", { exact: true }).click()
      await page.getByRole("button", { name: "180°", exact: true }).click()
      await page.keyboard.press("Escape")

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`Rotation Test ${epaperId}`)).toBeVisible()
      await page.getByText(`Rotation Test ${epaperId}`).click()

      const triggerPromise = new Promise<{ url: string }>((resolve) => {
        deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
        deviceClient.on("message", (topic, message) => {
          if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
            resolve(JSON.parse(message.toString()))
          }
        })
      })
      await page.getByRole("button", { name: "Deploy", exact: true }).click()
      const trigger = await triggerPromise

      const zipResponse = await page.request.get(trigger.url)
      expect(zipResponse.ok()).toBe(true)
      const zip = await JSZip.loadAsync(await zipResponse.body())
      const projectJson = JSON.parse(await zip.file("project.json")!.async("string"))
      expect(projectJson.rotation).toBe(180)
      // 180deg doesn't swap width/height, unlike 90/270 (covered by the
      // first test in this file) - confirms both are exported independently.
      expect(projectJson.screenWidth).toBe(400)
      expect(projectJson.screenHeight).toBe(300)
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
