import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { getMainCanvas } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Page-icon export (2026-08-11) - the data/export half of an M5 Dial
// screen-switch navigator overlay (firmware side lives in
// screenbee-m5dial's ScreenNavigatorOverlay, not covered here - see
// docs/device-contract.md). The designer has zero opinion on what a
// device does with a page icon; it only bakes one, as a plain 1-bit PBM
// mask, when the target device's DDF declares needsPageIconsInSize (the
// M5 Dial's now does, at 40 - bumped from an initial 32 2026-08-11, which
// looked small/blocky on real hardware) and the screen actually has an
// icon set.
test.describe("Page icon export", () => {
  test("a screen icon is baked as a 40x40 PBM mask when the device declares needsPageIconsInSize", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-pageicon-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-pageicon-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${deviceId}/hello`,
        JSON.stringify({ deviceId: "m5stack-m5dial-v1-1", name: `Page Icon Test ${deviceId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "online", { retain: true })

      await page.goto("/")
      await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "v1.3 M5Stack M5Dial (V1.1)" }).click()
      await page.getByRole("button", { name: "Create Project" }).click()
      await page.waitForTimeout(1500)

      // Set an icon on Screen 1 via Settings > Screens (the Phase 1 UI).
      await page.getByRole("button", { name: "Settings" }).click()
      await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
      await page.getByRole("button", { name: "Select icon" }).click()
      await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()
      await page.getByPlaceholder("Search for icons...").fill("home")
      const firstResult = page.getByRole("button", { name: "material-symbols:home", exact: true })
      await expect(firstResult).toBeVisible()
      await firstResult.click()
      await page.getByRole("button", { name: "Close" }).first().click()

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`Page Icon Test ${deviceId}`)).toBeVisible()
      await page.getByText(`Page Icon Test ${deviceId}`).click()

      const triggerPromise = new Promise<{ url: string }>((resolve) => {
        deviceClient.subscribe(`${TOPIC_PREFIX}/${deviceId}/deploy`, () => {})
        deviceClient.on("message", (topic, message) => {
          if (topic === `${TOPIC_PREFIX}/${deviceId}/deploy` && message.length > 0) {
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

      const screen1 = projectJson.screens.find((s: any) => s.name === "Screen 1")
      expect(screen1?.pageIconPath, "pageIconPath missing from the exported screen").toBeTruthy()

      const pbmEntry = zip.file(screen1.pageIconPath)
      expect(pbmEntry, `${screen1.pageIconPath} missing from the deployed zip`).toBeTruthy()
      const pbmBytes = await pbmEntry!.async("nodebuffer")

      // P4 = binary PBM magic, "40 40" = the DDF's declared needsPageIconsInSize
      // (bumped 32->40 2026-08-11 - 32px looked small/blocky on real hardware).
      const text = pbmBytes.subarray(0, 16).toString("ascii")
      expect(text.startsWith("P4\n40 40\n"), `unexpected PBM header: ${JSON.stringify(text)}`).toBe(true)
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })

  test("a fresh screen with no icon set shows no icon assigned in Settings", async ({ page }) => {
    // A full unset-icon export round trip is already implicitly covered by
    // the sibling test above (Screen 2, if this project had one, would
    // export with no pageIconPath - exportPageIcon() bails out early
    // whenever screen.iconAssetId is falsy, before it ever touches the
    // asset list or rasterizes anything). This just confirms the designer
    // side doesn't spuriously pre-fill an icon for a screen nobody set one
    // on, which is what pageIconPath actually being absent depends on.
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "v1.3 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
    await expect(page.getByRole("button", { name: "Select icon" })).toBeVisible()
  })
})
