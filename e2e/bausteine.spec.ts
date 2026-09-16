import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { COMMAND_PREFIX, STATE_PREFIX } from "../lib/bausteine"

// The e-paper fixture every other test here uses renders no Switch, so the
// Switch block is tested on the round device, which does.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

// Building blocks (lib/bausteine.ts): pick a block, drag its rectangle, answer
// which instance it is for, and a finished control appears beside its label -
// bound to topics the user never typed.
//
// The instances come from the broker, so this runs against the local one
// (`npm run hil:broker`) with retained values published first, exactly as the
// VanPi bridge publishes them.

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

// The block is selected as a whole once placed, so inspecting one of its
// objects means picking it out of the object tree first.
async function selectInTree(page: Page, name: string): Promise<void> {
  await page.getByTitle(new RegExp(`^${name} `)).first().click()
}

async function insertBlock(page: Page, block: string, screen?: { width: number; height: number }): Promise<void> {
  await page.getByRole("button", { name: "Block", exact: true }).click()
  await page.getByRole("menuitem", { name: new RegExp(`^${block}`) }).click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, 40, 40, screen)
  const to = devicePoint(box, 300, 100, screen)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test.describe("building blocks", () => {
  test("a Tank block draws a level indicator beside its name, bound to that tank", async ({ page }) => {
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

      // Two objects, placed and selected as one block: the tank's own name,
      // and a level indicator bound to tank 3.
      await expect(page.locator("h3").first()).toContainText("Multiple Objects Selected (2 items)")
      await expect(page.getByTitle(/^label /).first()).toContainText("Abwasser")
      await selectInTree(page, "level-indicator")
      await expect(page.locator("h3").first()).toContainText("Level Indicator")
      await expect(page.getByText(`${STATE_PREFIX}tank/3/level`).first()).toBeVisible()
    } finally {
      broker.end(true)
    }
  })

  test("a Battery block binds to the state of charge, which has no number", async ({ page }) => {
    const broker = await connectBroker()
    try {
      await publish(broker, `${STATE_PREFIX}battery/soc`, "99")

      await loadProject(page, COMBINED_TEST_PROJECT)
      await insertBlock(page, "Battery")

      // One battery, so one entry - and it is still shown, so what is about
      // to be placed is visible before it is.
      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-soc")).toContainText(`${STATE_PREFIX}battery/soc`)
      await page.getByTestId("baustein-instance-soc").click()

      await selectInTree(page, "level-indicator")
      await expect(page.locator("h3").first()).toContainText("Level Indicator")
      await expect(page.getByText(`${STATE_PREFIX}battery/soc`).first()).toBeVisible()
    } finally {
      broker.end(true)
    }
  })

  test("a Switch block reads a relay and writes its command topic", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-firmware not checked out alongside this repo")
    const broker = await connectBroker()
    try {
      await publish(broker, `${STATE_PREFIX}relay/3/power`, "off")
      await publish(broker, `${STATE_PREFIX}relay/3/name`, "Frischwasserpumpe")

      await loadProject(page, SWITCH_TEST_PROJECT)
      await insertBlock(page, "Switch", ROUND_FIXTURE_SCREEN)

      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-3")).toContainText("Frischwasserpumpe")
      await page.getByTestId("baustein-instance-3").click()

      // Reads the relay's state, writes the command topic beside it - the two
      // halves a hand-built Switch gets wrong most often.
      await expect(page.getByTitle(/^label /).first()).toContainText("Frischwasserpumpe")
      await selectInTree(page, "Switch")
      await expect(page.locator("h3").first()).toContainText("Switch")
      await expect(page.getByText(`${STATE_PREFIX}relay/3/power`).first()).toBeVisible()
      await expect(page.getByText(`${COMMAND_PREFIX}relay/3`).first()).toBeVisible()
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

    await selectInTree(page, "level-indicator")
    await expect(page.locator("h3").first()).toContainText("Level Indicator")
    await expect(page.getByText(`${STATE_PREFIX}tank/2/level`).first()).toBeVisible()
  })

  // The same rule a tool has: a block whose objects this device cannot draw
  // is offered, but not placeable - the e-paper fixture renders no Switch.
  test("a block the device cannot render is disabled", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Block", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: /^Switch/ })).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByRole("menuitem", { name: /^Tank/ })).not.toHaveAttribute("aria-disabled", "true")
  })

  test("cancelling the wizard places nothing", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const before = await page.getByTitle(/^level-indicator /).count()
    await insertBlock(page, "Tank")
    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByTestId("baustein-source")).toHaveCount(0)
    expect(await page.getByTitle(/^level-indicator /).count()).toBe(before)
  })
})
