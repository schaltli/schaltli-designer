import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"

// Covers the designer side of the MQTT self-deploy flow (2026-08-01
// grilling session) against the local broker (hil/local-broker.js's
// WebSocket listener, `npm run hil:broker`) - no real device involved,
// since a "device" here is just this test's own MQTT client publishing
// the same hello/status/deploy-status messages a real one would. The
// firmware side (actually downloading/verifying/applying) is covered
// separately by the HIL suite against real hardware.
//
// combined-test-project.zip already has settings.deviceId =
// "mqtt-epaper-display-2" baked in (see test-projects/), matching what
// this spec's simulated devices announce.
//
// Instance IDs are derived from testInfo.testId (unique per test, stable
// across retries) rather than a fixed string - these tests run in
// parallel workers against the SAME broker, so a shared hardcoded id
// would let one test's retained messages/uploads collide with another's
// (this bit the first version of this spec: both tests raced on
// "e2e-epaper-1" and failed unpredictably).

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const TOPIC_PREFIX = "screensmith"

test.describe("Deploy to Device dialog", () => {
  let deviceClient: mqtt.MqttClient
  let epaperId: string
  let androidId: string

  test.beforeEach(async ({}, testInfo) => {
    epaperId = `e2e-epaper-${testInfo.testId}`
    androidId = `e2e-android-${testInfo.testId}`
    deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })
  })

  test.afterEach(async () => {
    // Clear every retained message this test published, so a later run
    // doesn't see a stale device/trigger left over from this one.
    for (const id of [epaperId, androidId]) {
      deviceClient.publish(`${TOPIC_PREFIX}/${id}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${id}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${id}/deploy`, "", { retain: true })
    }
    await new Promise((r) => setTimeout(r, 200))
    deviceClient.end()
  })

  async function openDeployDialog(page: import("@playwright/test").Page) {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
    await page.getByLabel("MQTT WebSocket URL").fill(BROKER_URL)
    await page.getByRole("button", { name: "Connect" }).click()
  }

  // Scoped to this test's own device row, not a page-wide text search -
  // the shared local broker can (and during this feature's own live
  // debugging, did) also have a real physical device's retained hello/
  // status sitting on it at the same time, with the same "will apply on
  // reconnect" badge text - a page-wide getByText("will apply on
  // reconnect") is a strict-mode violation whenever that happens to be
  // true, which has nothing to do with whether *this* test's own fake
  // device is behaving correctly.
  function deviceRow(page: import("@playwright/test").Page, name: string) {
    return page.getByRole("button").filter({ hasText: name })
  }

  test("filters by device type, shows offline devices, and reacts to live deploy-status", async ({ page }) => {
    // A compatible device (matches the project's mqtt-epaper-display-2)
    // and an incompatible one (Android) - only the first should ever show.
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    deviceClient.publish(
      `${TOPIC_PREFIX}/${androidId}/hello`,
      JSON.stringify({ deviceId: "android-phone-1", name: "My Phone" }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${androidId}/status`, "online", { retain: true })

    await openDeployDialog(page)

    await expect(page.getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
    await expect(page.getByText("My Phone")).not.toBeVisible()

    // Take it offline - the row should stay visible but relabel, not
    // disappear (a currently-offline device is still a valid deploy
    // target, per the retained-trigger design: it applies automatically
    // next time it reconnects).
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "offline", { retain: true })
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("will apply on reconnect")).toBeVisible()

    // Back online, select it, and deploy.
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("will apply on reconnect")).not.toBeVisible()
    await page.getByText(`Camper Dashboard ${epaperId}`).click()

    // Capture the retained trigger the dialog publishes, so this test's
    // fake device can echo status against the real deployId - proves the
    // browser actually uploaded a zip (app/api/deploy) and published a
    // trigger with a url/crc32, not just flipped UI state.
    const triggerPromise = new Promise<{ deployId: string; url: string; crc32: number }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })

    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    const trigger = await triggerPromise

    expect(trigger.deployId).toBeTruthy()
    expect(trigger.url).toContain(`/api/deploy/${epaperId}`)
    expect(typeof trigger.crc32).toBe("number")

    // The uploaded zip must actually be fetchable at that URL - this is
    // exactly what the real device would GET.
    const uploadedZip = await page.request.get(trigger.url)
    expect(uploadedZip.status()).toBe(200)

    // Walk the dialog through the full status sequence a real device
    // publishes, exactly as DeployManager (firmware) will.
    const publishStatus = (state: string, extra: Record<string, unknown> = {}) =>
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/deploy-status`,
        JSON.stringify({ deployId: trigger.deployId, state, ...extra }),
      )

    publishStatus("downloading", { percent: 40 })
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Downloading`)).toBeVisible()

    publishStatus("verifying")
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Verifying`)).toBeVisible()

    publishStatus("applying")
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Applying`)).toBeVisible()

    publishStatus("rebooting")
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Rebooting`)).toBeVisible()
  })

  test("shows a clear error and lets the user go back on a failed deploy", async ({ page }) => {
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await expect(page.getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
    await page.getByText(`Camper Dashboard ${epaperId}`).click()

    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    const trigger = await triggerPromise

    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/deploy-status`,
      JSON.stringify({ deployId: trigger.deployId, state: "error", error: "checksum mismatch" }),
    )

    await expect(page.getByText("checksum mismatch")).toBeVisible()
    await page.getByRole("button", { name: "Back" }).click()
    await expect(page.getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
  })

  test("deploying to an offline device shows queued, not a stuck fake progress bar", async ({ page }) => {
    // Reported live (2026-08-01): the dialog set state to "downloading"
    // unconditionally the moment the (retained) trigger was published,
    // regardless of whether the device was actually there to receive it.
    // With the device powered off, nothing ever corrects that guess - the
    // UI just sat on a fake "Downloading" forever, since only the device
    // itself would ever publish a real deploy-status update.
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "offline", { retain: true })

    await openDeployDialog(page)
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("will apply on reconnect")).toBeVisible()
    await page.getByText(`Camper Dashboard ${epaperId}`).click()
    await page.getByRole("button", { name: "Deploy", exact: true }).click()

    await expect(page.getByText(/Offline - will apply automatically when the device reconnects/)).toBeVisible()
    // Never claims active progress for a device that was never asked to do
    // anything yet, and never silently gets stuck with no way out.
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Downloading`)).not.toBeVisible()
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible()

    // If the device comes online and actually starts processing the
    // (still-retained) trigger later in the same session, real progress
    // should still replace the queued placeholder.
    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    const trigger = await triggerPromise
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy-status`, JSON.stringify({ deployId: trigger.deployId, state: "downloading", percent: 50 }))
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Downloading`)).toBeVisible()
  })
})
