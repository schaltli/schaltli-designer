import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"

// Covers the 2026-08-02 fix: discovery used to only show a topic if it
// happened to publish again *during* the listening window, with no way to
// tell "this is the broker's actual current value" apart from "this just
// happened to fire while I was watching" - on a busy broker (a real
// Pekaway system, not a quiet test broker) that meant a rarely-changing
// but genuinely-retained topic (e.g. pkw/tele/doorman) could look
// undiscoverable even though its value was sitting right there the whole
// time. Fixed by reading the MQTT retain flag mosquitto sets on messages
// it delivers immediately on subscribe, and badging topics accordingly.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

test.describe("MQTT topic discovery", () => {
  let testClient: mqtt.MqttClient
  let retainedTopic: string
  let liveTopic: string

  test.beforeEach(async ({}, testInfo) => {
    retainedTopic = `test/discovery-${testInfo.testId}/retained-value`
    liveTopic = `test/discovery-${testInfo.testId}/live-value`
    testClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-discovery-publisher-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })
    // Published *before* the discovery dialog ever subscribes - this is
    // exactly the "value was already sitting there" scenario the fix
    // targets, as opposed to a value that happens to publish while
    // discovery is actively listening.
    await new Promise<void>((resolve, reject) => {
      testClient.publish(retainedTopic, "42", { retain: true }, (err) => (err ? reject(err) : resolve()))
    })
  })

  test.afterEach(async () => {
    testClient.publish(retainedTopic, "", { retain: true })
    await new Promise((r) => setTimeout(r, 200))
    testClient.end()
  })

  test("badges a pre-existing retained topic as retained, and a topic only seen live as live", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()

    await page.getByLabel("WebSocket URL").fill(BROKER_URL)
    await page.getByRole("button", { name: "Connect" }).click()
    await page.getByRole("button", { name: "Start Discovery" }).click()

    // The retained topic must show up (and be badged "retained") purely
    // from the guaranteed on-subscribe delivery - no live publish for it
    // happens anywhere in this test.
    const retainedRow = page.locator("text=" + retainedTopic).locator("..").locator("..")
    await expect(retainedRow.getByText("retained", { exact: true })).toBeVisible()

    // A topic that only ever publishes live (no retain flag) while
    // discovery is running must be badged "live", not "retained".
    testClient.publish(liveTopic, "hello", { retain: false })
    const liveRow = page.locator("text=" + liveTopic).locator("..").locator("..")
    await expect(liveRow.getByText("live", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Stop Discovery" }).click()
  })
})
