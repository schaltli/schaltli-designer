import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// Covers version-history-dialog.tsx + app/api/projects/[projectId]/versions
// (added 2026-08-02): a checkpoint is taken on every successful "Deploy to
// Device" (deploy-dialog.tsx), not on every edit, so the list stays a
// meaningful set of "what did this look like right before I sent it to
// device X" moments. Runs against the local broker (hil/local-broker.js's
// WebSocket listener, `npm run hil:broker`) the same way deploy-dialog.spec.ts
// does - no real device involved, this test's own MQTT client stands in for
// one.
const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

test.describe("Version History", () => {
  test("shows an empty state until any checkpoint exists", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Version History" }).click()
    await expect(page.getByRole("heading", { name: "Version History" })).toBeVisible()
    await expect(page.getByText("No checkpoints yet")).toBeVisible()
  })

  test("a successful deploy takes a checkpoint, listed in Version History and restorable", async ({
    page,
  }, testInfo) => {
    const epaperId = `e2e-vh-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-vh-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Checkpoint Test ${epaperId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await loadProject(page, COMBINED_TEST_PROJECT)
      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await page.getByLabel("MQTT WebSocket URL").fill(BROKER_URL)
      await page.getByRole("button", { name: "Connect" }).click()
      await expect(page.getByText(`Checkpoint Test ${epaperId}`)).toBeVisible()
      await page.getByText(`Checkpoint Test ${epaperId}`).click()

      // deploy-dialog.tsx fires the checkpoint POST right after publishing
      // the retained trigger - it doesn't wait on the device's own
      // deploy-status updates, so this test doesn't need to simulate those.
      const versionPostPromise = page.waitForRequest(
        (req) => /\/api\/projects\/.+\/versions$/.test(req.url()) && req.method() === "POST",
      )
      await page.getByRole("button", { name: "Deploy", exact: true }).click()
      await versionPostPromise
      // Two Escapes: the first closes the Deploy dialog itself: the File
      // DropdownMenuItem that opened it calls e.preventDefault() on select
      // (deploy-dialog.tsx/version-history-dialog.tsx both do this, so the
      // click that opens their own Dialog isn't also swallowed by Radix's
      // default "close the menu on select" behavior) - which means the File
      // menu was never actually closed, just visually covered by the modal
      // overlay, and reappears on top once that overlay is gone.
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")

      // Make a change *after* the checkpoint was taken, so restoring it is
      // actually observable rather than a no-op.
      const objectCountBefore = await page.locator("[data-object-id]").count()
      await page.getByRole("button", { name: "Box", exact: true }).first().click()
      const { box } = await getMainCanvas(page)
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore + 1)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Version History" }).click()
      await expect(page.getByRole("heading", { name: "Version History" })).toBeVisible()
      await expect(page.getByText("Combined Test Project")).toBeVisible()

      await page.getByRole("button", { name: "Restore" }).click()
      await expect(page.getByRole("heading", { name: "Version History" })).not.toBeVisible()

      // The box added after the checkpoint is gone - the restored state came
      // from the server snapshot, not just a dialog close no-op.
      await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore)
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
