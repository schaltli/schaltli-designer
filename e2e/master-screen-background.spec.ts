import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { pressDeploy, COMBINED_TEST_PROJECT, loadProject, createScreen, getMainCanvas } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// Master screens inherit their background color the same way they already
// inherit objects and hardware-button actions - a screen with no local
// backgroundColor of its own picks up its assigned master's, unless it opts
// out (showMaster:false, same gate as everything else; see
// lib/master-screen.ts). A background image was inherited the same way until
// 2026-09-28, when it went: a picture is an icon at the bottom now (#16).
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

// The row is called "Background" since the panel rebuild, and its name is
// a span rather than a <label>, because the picker it names cannot be
// reached with `for` (docs/2026-09-20-property-panel.md).
const backgroundColorSelect = (page: Page) =>
  page.locator("[data-row-label]", { hasText: "Background" }).first().locator("..").getByRole("combobox")

test.describe("Master screen background inheritance", () => {
  test("a screen inherits its master's background color, can override it locally, and can switch back to inheriting", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // COMBINED_TEST_PROJECT's device is 1-bit (mqtt-epaper-display-2), so
    // the theme's roles come out black or white: Text is black and Surface
    // white in Lavender - two values clearly distinct from each other, and
    // the black one distinct from the white a screen with no colour shows.
    await createScreen(page, "E2E BG Color Master", true)
    await backgroundColorSelect(page).click()
    await page.getByRole("option", { name: "Text", exact: true }).click()
    expect(await readScreenCenterPixel(page)).toEqual({ r: 0, g: 0, b: 0 })

    // A new normal screen auto-inherits the (only) existing master.
    await createScreen(page, "E2E BG Color Screen", false)
    expect(await readScreenCenterPixel(page)).toEqual({ r: 0, g: 0, b: 0 })
    await expect(backgroundColorSelect(page)).toHaveText("Inherited from Master")

    // Override locally.
    await backgroundColorSelect(page).click()
    await page.getByRole("option", { name: "Surface", exact: true }).click()
    expect(await readScreenCenterPixel(page)).toEqual({ r: 255, g: 255, b: 255 })
    await expect(backgroundColorSelect(page)).toHaveText("Surface")

    // Switch back to inheriting via the dropdown entry itself.
    await backgroundColorSelect(page).click()
    await page.getByRole("option", { name: "Inherit from Master", exact: true }).click()
    await expect(backgroundColorSelect(page)).toHaveText("Inherited from Master")
    expect(await readScreenCenterPixel(page)).toEqual({ r: 0, g: 0, b: 0 })
  })

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
      await page.getByRole("option", { name: "Text", exact: true }).click()
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
      await pressDeploy(page)
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
