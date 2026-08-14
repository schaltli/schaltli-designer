import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { getMainCanvas, getSelectedHeader, chooseDevice, M5DIAL_DEVICE_ID } from "./helpers"
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
      await chooseDevice(page, M5DIAL_DEVICE_ID)
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

  // Regression test for a 2026-08-13 finding (found while fixing the same
  // issue on the new Switch object): render-software-button.ts drew label
  // text with a generic fallback canvas font whose numeric size was the
  // only thing that ever changed on font selection - the glyph shape never
  // did, because BDF fonts (the only kind firmware devices offer) have no
  // browser-registered equivalent to fall back to. Fixed by routing through
  // the same real BDF glyph rendering render-text-box.ts uses for labels
  // (loadBdfFont, now shared - see render-switch.ts's identical fix).
  // Deliberately doesn't need the MQTT broker/deploy flow above - this only
  // exercises the live canvas preview, not the export bake. The export
  // bake's own text drawing (lib/asset-export.ts's private
  // renderSoftwareButton) was fixed identically in the same commit, but
  // isn't covered by a per-font-pixel assertion here - the deploy test
  // above only checks the baked bitmap is a real, non-trivial BMP, not its
  // exact pixel content per font (known gap, same class of test the deploy
  // test's own header comment already flags as hard to build without real
  // canvas rendering).
  test("selecting a different (real BDF) font changes the button's rendered pixels", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await chooseDevice(page, M5DIAL_DEVICE_ID)
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.locator("#software-buttons").check()
    await page.keyboard.press("Escape")

    const { box } = await getMainCanvas(page)
    await page.getByRole("button", { name: "Button", exact: true }).first().click()
    await page.waitForTimeout(150)
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    expect(await getSelectedHeader(page)).toContain("Software Button")

    const fontSelect = page.locator("select").filter({ has: page.getByText("System Default") })
    // Default is "System Default" (no fontId) - the generic-fallback branch
    // in both the old and new code, so it isn't itself proof of anything.
    // Selecting a real BDF font first, then a much bigger one, is what
    // isolates the BDF branch specifically.
    await fontSelect.selectOption("font-helvR08")
    await page.waitForTimeout(200)

    const hashCanvas = () =>
      page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll("canvas"))
        let best = canvases[0]
        let bestArea = 0
        for (const c of canvases) {
          const r = c.getBoundingClientRect()
          if (r.width * r.height > bestArea) {
            bestArea = r.width * r.height
            best = c
          }
        }
        const ctx = best.getContext("2d")!
        const data = ctx.getImageData(0, 0, best.width, best.height).data
        let hash = 0
        for (let i = 0; i < data.length; i += 4) {
          hash = (hash * 31 + data[i] + data[i + 1] * 7 + data[i + 2] * 13) >>> 0
        }
        return hash
      })

    const beforeHash = await hashCanvas()

    await fontSelect.selectOption("font-helvR24")
    await page.waitForTimeout(200)

    const afterHash = await hashCanvas()
    expect(afterHash, "canvas pixels should change when a differently-sized BDF font is selected").not.toBe(
      beforeHash,
    )
  })
})
