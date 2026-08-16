import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, createScreen, getMainCanvas } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// Master screens inherit their background color/image the same way they
// already inherit objects and hardware-button actions - a screen with no
// local backgroundColor/backgroundImageAssetId of its own picks up its
// assigned master's, unless it opts out (showMaster:false, same gate as
// everything else) or, for the image specifically, explicitly says "no
// image here" via backgroundImageOverrideNone (see lib/master-screen.ts).
// Grid color deliberately does NOT inherit (2026-08-16 grilling decision) -
// not covered here.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

async function readScreenCenterPixel(page: Page): Promise<{ r: number; g: number; b: number }> {
  const { canvas, box } = await getMainCanvas(page)
  return canvas.evaluate((el: HTMLCanvasElement, { px, py }: { px: number; py: number }) => {
    const ctx = el.getContext("2d")!
    const d = ctx.getImageData(px, py, 1, 1).data
    return { r: d[0], g: d[1], b: d[2] }
  }, { px: Math.round(box.width / 2), py: Math.round(box.height / 2) })
}

const backgroundColorSelect = (page: Page) =>
  page.locator("label", { hasText: "Background Color" }).locator("..").getByRole("combobox")

// A tiny (1x1, transparent) PNG - real bytes, not a placeholder string, so
// AssetExporter's <img> decode path (and the designer's own upload
// handling) sees a genuinely valid image file. Content doesn't matter here;
// only its identity (filename/asset id) is ever asserted.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
)
// Genuinely different bytes from TINY_PNG (a solid red 1x1 pixel, not
// transparent) - onAddOrFindAsset dedupes by content hash, so re-uploading
// the exact same bytes under a different filename would just reuse the
// first asset (found live writing this test - "Current:" kept showing the
// first upload's name).
const TINY_PNG_2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

test.describe("Master screen background inheritance", () => {
  test("a screen inherits its master's background color, can override it locally, and can switch back to inheriting", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // COMBINED_TEST_PROJECT's device is 1-bit (mqtt-epaper-display-2), so
    // its color palette is only black/white - not enough named colors to
    // pick something like "Blue", but black vs. white is exactly what's
    // needed here: two values clearly distinct from each other AND from
    // the default-white fallback a screen with no color at all would show.
    await createScreen(page, "E2E BG Color Master", true)
    await backgroundColorSelect(page).click()
    await page.getByRole("option", { name: /^black\b/ }).click()
    expect(await readScreenCenterPixel(page)).toEqual({ r: 0, g: 0, b: 0 })

    // A new normal screen auto-inherits the (only) existing master.
    await createScreen(page, "E2E BG Color Screen", false)
    expect(await readScreenCenterPixel(page)).toEqual({ r: 0, g: 0, b: 0 })
    await expect(backgroundColorSelect(page)).toHaveText("Inherited from Master")

    // Override locally.
    await backgroundColorSelect(page).click()
    await page.getByRole("option", { name: /^white\b/ }).click()
    expect(await readScreenCenterPixel(page)).toEqual({ r: 255, g: 255, b: 255 })
    await expect(backgroundColorSelect(page)).toHaveText("white")

    // Switch back to inheriting via the dropdown entry itself.
    await backgroundColorSelect(page).click()
    await page.getByRole("option", { name: "Inherit from Master", exact: true }).click()
    await expect(backgroundColorSelect(page)).toHaveText("Inherited from Master")
    expect(await readScreenCenterPixel(page)).toEqual({ r: 0, g: 0, b: 0 })
  })

  test("a screen inherits its master's background image, can say it wants none, and can use its own instead", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    await createScreen(page, "E2E BG Image Master", true)
    const uploadInput = page.getByTestId("screen-background-upload")
    await uploadInput.setInputFiles({ name: "master-bg.png", mimeType: "image/png", buffer: TINY_PNG })
    await expect(page.getByText("Current: master-bg.png")).toBeVisible()

    await createScreen(page, "E2E BG Image Screen", false)
    await expect(page.getByText("Inherited from Master")).toBeVisible()
    await expect(page.getByText("Current: master-bg.png")).toBeVisible()
    await expect(page.getByRole("button", { name: "Use own image instead" })).toBeVisible()

    // Explicitly say "no image", even though the master has one.
    await page.getByRole("button", { name: "Remove" }).click()
    await expect(page.getByText(/No image on this screen/)).toBeVisible()
    await expect(page.getByText(/master-bg\.png/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Add Background" })).toBeVisible()

    // Go back to inheriting.
    await page.getByRole("button", { name: "Use it instead" }).click()
    await expect(page.getByText("Inherited from Master")).toBeVisible()

    // Use its own image instead of the inherited one.
    await uploadInput.setInputFiles({ name: "local-bg.png", mimeType: "image/png", buffer: TINY_PNG_2 })
    await expect(page.getByText("Current: local-bg.png")).toBeVisible()
    await expect(page.getByText("Inherited from Master")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Change Background" })).toBeVisible()
  })

  // Deploy is the only real path that serializes a project for a device to
  // read (lib/project-zip.ts's buildDeviceProjectZip) - drives the actual
  // export-time flatten step (a screen's exported backgroundColor must be
  // the already-resolved value, since firmware's own fallback for an absent
  // key is always white, not the master's color - see project-zip.ts's own
  // comment on projectWithResolvedBackgrounds) instead of just asserting
  // against the library function in isolation.
  test("the exported project.json carries the master's background color for an inheriting screen", async ({
    page,
  }, testInfo) => {
    const epaperId = `e2e-bg-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-bg-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `BG Test ${epaperId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await loadProject(page, COMBINED_TEST_PROJECT)
      await createScreen(page, "E2E BG Export Master", true)
      await backgroundColorSelect(page).click()
      await page.getByRole("option", { name: /^black\b/ }).click()
      await createScreen(page, "E2E BG Export Screen", false)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`BG Test ${epaperId}`)).toBeVisible()
      await page.getByText(`BG Test ${epaperId}`).click()

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

      const targetScreen = projectJson.screens.find((s: any) => s.name === "E2E BG Export Screen")
      expect(targetScreen).toBeTruthy()
      expect(targetScreen.backgroundColor.toLowerCase()).toBe("#000000")
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
