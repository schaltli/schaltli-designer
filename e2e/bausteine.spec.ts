import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint } from "./helpers"
import { STATE_PREFIX } from "../lib/bausteine"

// Building blocks (lib/bausteine.ts): pick a block, drag its rectangle, answer
// which instance it is for, and a finished control appears - bound to a topic
// the user never typed. The first block is Tank.
//
// The instances come from the broker, so this runs against the local one
// (`npm run hil:broker`) with retained tank values published first, the way
// the VanPi bridge publishes them.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-block-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) =>
    client.publish(topic, payload, { qos: 1, retain: true }, (err) => (err ? reject(err) : resolve())),
  )
}

async function insertBlock(page: Page, block: string): Promise<void> {
  await page.getByRole("button", { name: "Block", exact: true }).click()
  await page.getByRole("menuitem", { name: new RegExp(`^${block}`) }).click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, 40, 40)
  const to = devicePoint(box, 240, 100)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test.describe("building blocks", () => {
  test("a Tank block draws a level indicator bound to the tank the wizard offered", async ({ page }) => {
    const broker = await connectBroker()
    try {
      // What the bridge publishes for a van with two calibrated tanks.
      await publish(broker, `${STATE_PREFIX}tank/1/level`, "40")
      await publish(broker, `${STATE_PREFIX}tank/1/name`, "Frischwasser")
      await publish(broker, `${STATE_PREFIX}tank/3/level`, "5")
      await publish(broker, `${STATE_PREFIX}tank/3/name`, "Abwasser")

      await loadProject(page, COMBINED_TEST_PROJECT)
      await insertBlock(page, "Tank")

      // The wizard asks which tank, with the van's own names - nobody types
      // a topic.
      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-1")).toContainText("Frischwasser")
      await page.getByTestId("baustein-instance-3").click()

      // A level indicator, selected, bound to tank 3.
      await expect(page.locator("h3").first()).toContainText("Level Indicator")
      await expect(page.getByText(`${STATE_PREFIX}tank/3/level`).first()).toBeVisible()
    } finally {
      broker.end(true)
    }
  })

  test("without a broker it offers the standard topics", async ({ page }) => {
    // Nothing listens on port 9 - the same stored setting the Deploy dialog
    // and the live preview use.
    await page.addInitScript(() => {
      window.localStorage.setItem("screenbee-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")

    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await expect(page.getByTestId("baustein-instance-2")).toContainText(`${STATE_PREFIX}tank/2/level`)
    await page.getByTestId("baustein-instance-2").click()

    await expect(page.locator("h3").first()).toContainText("Level Indicator")
    await expect(page.getByText(`${STATE_PREFIX}tank/2/level`).first()).toBeVisible()
  })

  test("cancelling the wizard places nothing", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const before = await page.getByText("Level Indicator").count()
    await insertBlock(page, "Tank")
    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByTestId("baustein-source")).toHaveCount(0)
    expect(await page.getByText("Level Indicator").count()).toBe(before)
  })
})
