import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, getSelectedHeader } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Master screen mechanism (2026-08-04): a screen flagged isMaster
// (ProjectScreen.isMaster) can be referenced by any number of normal
// screens via masterScreenId - its objects are drawn merged onto every
// screen that references it (lib/object-order.ts's
// mergeMasterAndScreenObjects, used by canvas.tsx, screen-thumbnail.tsx and
// lib/project-zip.ts's device-export flatten step) but stay editable only
// on the master screen itself - hit-testing/selection on a normal screen
// always operates on that screen's own `objects` array, never the merged
// list. New normal screens auto-inherit the first existing master
// (screens-panel.tsx's addScreen). Masters are excluded from "Go to
// Screen"/next-previous-screen navigation and from the flattened device
// export - see project-editor.tsx's ProjectScreen doc comment for the full
// contract agreed during grilling.

async function createScreen(page: Page, name: string, isMaster: boolean): Promise<void> {
  await page.getByRole("button", { name: "Add screen" }).click()
  await page.getByRole("menuitem", { name: isMaster ? "Add Master Screen" : "Add Screen", exact: true }).click()
  await page.locator("#screenName").fill(name)
  await page.getByRole("button", { name: "Create Screen" }).click()
  await page.waitForTimeout(300)
}

// Draws a small box at a fixed fraction of the canvas's bounding box - the
// same spot is reused across screens in this file to prove a master's
// object lands in the same place wherever it's merged in.
async function drawBoxAt(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page.getByRole("button", { name: "Box", exact: true }).first().click()
  await page.waitForTimeout(150)
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

test.describe("Master screen mechanism", () => {
  test("a normal screen auto-inherits the first master, renders its content, but can't select it there", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    await createScreen(page, "E2E Master", true)
    const { box } = await getMainCanvas(page)
    await drawBoxAt(page, box)
    expect(await getSelectedHeader(page)).toContain("Box")

    await createScreen(page, "E2E Screen With Master", false)

    // Auto-inherited the only (therefore "first") existing master.
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("button", { name: "Screens", exact: true }).click()
    const row = page.locator('[data-screen-name="E2E Screen With Master"]')
    await expect(row.getByRole("combobox")).toHaveText("E2E Master")
    await page.keyboard.press("Escape")

    // The master's box is visible (merged in, same fixed position) but
    // clicking it on this normal screen must not select it - only the
    // master screen itself can edit it.
    await page.mouse.click(box.x + box.width * 0.375, box.y + box.height * 0.375)
    expect(await getSelectedHeader(page)).not.toContain("Box")

    // Masters never appear as a "Go to Screen" target.
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Hardware Buttons", { exact: true }).click()
    await page.locator("#button-0").click()
    await page.locator("label", { hasText: "Action Type" }).locator("..").getByRole("combobox").click()
    await page.getByRole("option", { name: "Go to Screen" }).click()
    await page.locator("label", { hasText: "Target Screen" }).locator("..").getByRole("combobox").click()
    await expect(page.getByRole("option", { name: "E2E Master", exact: true })).toHaveCount(0)
    await expect(page.getByRole("option", { name: "E2E Screen With Master", exact: true })).toBeVisible()
  })

  // Deploy is the only real path that serializes a project for a device to
  // read (lib/project-zip.ts's buildDeviceProjectZip, shared by "Export
  // Project" and this MQTT self-deploy flow) - drives the actual flatten
  // step instead of just asserting against the function in isolation.
  test("device export flattens the master into each assigned screen and omits the master itself", async ({
    page,
  }, testInfo) => {
    const epaperId = `e2e-master-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-master-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Master Test ${epaperId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await loadProject(page, COMBINED_TEST_PROJECT)
      await createScreen(page, "E2E Master", true)
      const { box } = await getMainCanvas(page)
      await drawBoxAt(page, box)
      await createScreen(page, "E2E Screen With Master", false)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`Master Test ${epaperId}`)).toBeVisible()
      await page.getByText(`Master Test ${epaperId}`).click()

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

      expect(projectJson.screens.some((s: any) => s.name === "E2E Master")).toBe(false)
      const targetScreen = projectJson.screens.find((s: any) => s.name === "E2E Screen With Master")
      expect(targetScreen).toBeTruthy()
      expect(targetScreen.objects.some((o: any) => o.type === "box")).toBe(true)
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
