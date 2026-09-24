import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, saveProjectAs } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// Covers version-history-dialog.tsx and the versions of a saved project
// (docs/2026-09-23-explicit-save.md, "Versions"). Since 2026-09-24 every
// save is a version, and a deploy only marks the version it sent. Restore
// opens a version as unsaved changes on top of the newest - like a checkout
// in git: no version is removed.
const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e versions ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

async function openVersionHistory(page: Page) {
  await page.getByRole("button", { name: "File" }).click()
  await page.getByRole("menuitem", { name: "Version History" }).click()
  await expect(page.getByRole("heading", { name: "Version History" })).toBeVisible()
}

async function drawBox(page: Page) {
  await page.getByRole("button", { name: "Box", exact: true }).first().click()
  const { box } = await getMainCanvas(page)
  // Device pixels, not canvas-box fractions - see helpers.ts's devicePoint.
  const from = devicePoint(box, 60, 40)
  const to = devicePoint(box, 180, 140)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

test.describe("Version History", () => {
  test("a project that was never saved has no versions yet, and says how to start", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openVersionHistory(page)
    await expect(page.getByText("Save the project to start its version history.")).toBeVisible()
  })

  test("every save is a version; restoring one opens it unsaved and keeps them all", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "restore")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    const objectCountBefore = await page.locator("[data-object-id]").count()

    await drawBox(page)
    await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore + 1)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByTestId("project-title")).toHaveText(name)

    // Longer than the 5 s default: the first request may find `next dev`
    // still compiling the versions route (2026-09-22, one failure in 391).
    await openVersionHistory(page)
    const entries = page.getByRole("list", { name: "Versions" }).getByRole("listitem")
    await expect(entries).toHaveCount(2, { timeout: 20_000 })
    await expect(entries.first()).toContainText("MQTT ePaper Display (GDEY042T81)")

    // The older one, from before the box.
    await entries.nth(1).getByRole("button", { name: "Restore" }).click()
    await expect(page.getByRole("heading", { name: "Version History" })).not.toBeVisible({ timeout: 20_000 })
    // The File menu that opened the dialog is still open underneath (see the
    // deploy test below for why).
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore)
    await expect(page.getByTestId("project-title")).toHaveText(`• ${name}`)
    // A restore is a load: nothing to undo across it.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore)

    const versions = async () =>
      (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}/versions`)).json()).versions.length
    expect(await versions()).toBe(2)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByTestId("project-title")).toHaveText(name)
    expect(await versions()).toBe(3)

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  // Parked 2026-09-24: deploy no longer takes a checkpoint of its own; it
  // saves first and marks that version. Rewritten with Task 7
  // (tasks/explicit-save-todo.md), which makes deploy save.
  test.fixme("a successful deploy takes a checkpoint, listed in Version History and restorable", async ({
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
      // No manual URL/Connect step (2026-08-03) - the dialog auto-connects
      // using the broker URL derived from the page's own host, which is
      // ws://localhost:9001 here, same as BROKER_URL.
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
      await drawBox(page)
      await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore + 1)

      await openVersionHistory(page)
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
