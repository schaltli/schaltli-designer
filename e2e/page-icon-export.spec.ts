import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { getMainCanvas, chooseDevice, M5DIAL_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Page-icon export (2026-08-11) - the data/export half of an M5 Dial
// screen-switch navigator overlay (firmware side lives in
// screenbee-m5dial's ScreenNavigatorOverlay, not covered here - see
// docs/device-contract.md). The designer has zero opinion on what a
// device does with a page icon; it only bakes one, as an 8-bit grayscale
// PGM mask (originally a hard 1-bit PBM mask, switched the same day - a
// hard threshold looked visibly blocky at the small sizes a navigator's
// tablets actually use, throwing away antialiasing rasterizeSVG() already
// produces), when the target device's DDF declares needsPageIconsInSize
// (the M5 Dial's now does, at 40 - bumped from an initial 32, which
// looked small/blocky on real hardware) and the screen actually has an
// icon set.
test.describe("Page icon export", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("a screen icon is baked as a 40x40 grayscale PGM mask when the device declares needsPageIconsInSize", async ({
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
      await waitForDeviceGate(page)
      await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
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

      // Two dialogs are open at this point, and the icon picker is the one
      // closing itself. Waiting for it to actually be gone before clicking
      // "Close" is what makes this deterministic: a bare .first() raced the
      // picker's own close, hit *its* Close button instead of Settings',
      // and left the Settings dialog open - whose modal overlay then
      // swallowed every later click until the test timed out. That only
      // showed up under parallel workers, where the close is slower.
      await expect(page.getByRole("dialog", { name: "Select Icon" })).not.toBeVisible()
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
      await expect(page.getByRole("dialog")).not.toBeVisible()

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

      // Regression check (found live 2026-08-11): buildDeviceProjectZip()
      // never set a compression option, so JSZip silently defaulted to
      // STORE (no compression at all) - a 568KB export shrank to 78KB when
      // simply re-zipped with real compression. That mattered beyond
      // transfer time: the M5 Dial's deploy flow needs the old installed
      // project and the new download to both fit in LittleFS at once (see
      // DeployManager.cpp), and that space is tight enough that an
      // uncompressed zip could exhaust it mid-download, surfacing as a
      // confusing CRC32 "checksum mismatch" instead of an honest
      // out-of-space error. Compares compressed vs uncompressed size on the
      // loaded entry's internal CompressedObject (JSZip doesn't surface a
      // clean public "was this actually compressed" API) rather than
      // trusting a magic-byte/options field, since real DEFLATE output on
      // highly-compressible JSON is reliably and substantially smaller -
      // STORE's compressedSize always equals uncompressedSize exactly.
      const projectJsonEntry = zip.file("project.json") as any
      expect(projectJsonEntry._data.compressedSize).toBeLessThan(projectJsonEntry._data.uncompressedSize)

      const projectJson = JSON.parse(await zip.file("project.json")!.async("string"))

      const screen1 = projectJson.screens.find((s: any) => s.name === "Screen 1")
      expect(screen1?.pageIconPath, "pageIconPath missing from the exported screen").toBeTruthy()

      const pgmEntry = zip.file(screen1.pageIconPath)
      expect(pgmEntry, `${screen1.pageIconPath} missing from the deployed zip`).toBeTruthy()
      const pgmBytes = await pgmEntry!.async("nodebuffer")

      // P5 = binary PGM (grayscale) magic, "40 40" = the DDF's declared
      // needsPageIconsInSize, "255" = the maxval line every real PGM has
      // (PBM/P4 doesn't - no maxval on a 1-bit format).
      const text = pgmBytes.subarray(0, 20).toString("ascii")
      expect(text.startsWith("P5\n40 40\n255\n"), `unexpected PGM header: ${JSON.stringify(text)}`).toBe(true)

      // Total size = header + one raw grayscale byte per pixel (no packing,
      // unlike PBM's 8-pixels-per-byte).
      const headerLength = text.indexOf("255\n") + 4
      expect(pgmBytes.length).toBe(headerLength + 40 * 40)
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
    await waitForDeviceGate(page)
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
    await expect(page.getByRole("button", { name: "Select icon" })).toBeVisible()
  })
})
