import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { getMainCanvas } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Covers the SoftwareButton object's base (unpressed) rendering only - not
// touch/action dispatch, which is firmware-side runtime behavior with no
// automated coverage yet (2026-08-10 decision: HIL can't simulate a real
// touch, and building a touch-simulation endpoint was explicitly out of
// scope for now - see docs/device-contract.md and this session's own
// design discussion). What IS testable without real M5 Dial hardware: does
// the real export pipeline (lib/asset-export.ts's exportSoftwareButton,
// driven through the same "Deploy to Device" flow master-screen.spec.ts
// uses) actually bake a real pathNormal bitmap for a SoftwareButton, since
// hil/m5dial/fixtures/build-comprehensive-test.js's own header comment
// flags this as a known gap a hand-built fixture can't reproduce (the
// bitmap needs real canvas rendering, not just JSON). Drives the real
// "Deploy to Device" flow (not a mocked export call in isolation) for the
// same reason master-screen.spec.ts does - it's the actual code path a
// user/device relies on.
test.describe("SoftwareButton base-state rendering", () => {
  test("deploying a project with a SoftwareButton bakes a real pathNormal bitmap", async ({ page }, testInfo) => {
    const deviceId = `e2e-m5dial-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-m5dial-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      // "m5stack-m5dial-v1-1" - public/ddf/m5stack-m5dial.ddf.zip's own
      // device.id, matched against project.settings.deviceId by
      // deploy-dialog.tsx's compatibleDevices filter.
      deviceClient.publish(
        `${TOPIC_PREFIX}/${deviceId}/hello`,
        JSON.stringify({ deviceId: "m5stack-m5dial-v1-1", name: `SoftwareButton Test ${deviceId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "online", { retain: true })

      await page.goto("/")
      await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "v1.2 M5Stack M5Dial (V1.1)" }).click()
      await page.getByRole("button", { name: "Create Project" }).click()
      await page.waitForTimeout(1500)

      // SoftwareButton tool is hidden until this project-level flag is on
      // (project-settings-dialog.tsx's "software-buttons" checkbox) -
      // unrelated to the DDF's own supportedObjectTypes, which only
      // controls whether an already-visible tool is enabled/disabled.
      await page.getByRole("button", { name: "Settings" }).click()
      await page.locator("#software-buttons").check()
      await page.keyboard.press("Escape")

      const { box } = await getMainCanvas(page)
      await page.getByRole("button", { name: "Button", exact: true }).first().click()
      await page.waitForTimeout(150)
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(200)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`SoftwareButton Test ${deviceId}`)).toBeVisible()
      await page.getByText(`SoftwareButton Test ${deviceId}`).click()

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

      const allObjects = projectJson.screens.flatMap((s: any) => s.objects)
      const button = allObjects.find((o: any) => o.type === "SoftwareButton")
      expect(button, "SoftwareButton object missing from exported project.json").toBeTruthy()
      expect(button.pathNormal, "pathNormal not set on the exported SoftwareButton").toBeTruthy()

      // pathNormal is zip-root-relative (e.g. "assets/<id>-button-normal.bmp") -
      // see ProjectLoader.cpp's resolveAssetPath comment for the convention
      // this mirrors on the firmware side.
      const bitmapEntry = zip.file(button.pathNormal)
      expect(bitmapEntry, `${button.pathNormal} missing from the deployed zip`).toBeTruthy()
      const bitmapBytes = await bitmapEntry!.async("nodebuffer")

      // "BM" magic bytes = a real BMP file header, not an empty/placeholder
      // stub - proves exportSoftwareButton() actually rendered something,
      // not just wrote an empty file. colorDepth 24bit -> .bmp (see
      // AssetExporter.getFileExtension()).
      expect(bitmapBytes.length).toBeGreaterThan(100)
      expect(bitmapBytes.subarray(0, 2).toString("ascii")).toBe("BM")
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
