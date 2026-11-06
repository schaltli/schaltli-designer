import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import { readFileSync } from "node:fs"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { entryRendered } from "../lib/bausteine"
import { expandConfig, toCatalogEntry, type CatalogEntry } from "../lib/ha-discovery"

// The Prebuilt tab's catalog (docs/2026-11-05-quick-blocks.md, plan task
// T5): what the broker's devices announce, followed while listening, read
// once and with Refresh when not; now in the palette
// (docs/2026-11-06-palette.md). Needs `npm run hil:broker`, as
// e2e/bausteine.spec.ts.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

function fixturePayload(name: string) {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ha-discovery", `${name}.json`), "utf8")).payload
}

async function useBroker(page: Page, discoveryPrefix: string) {
  await page.addInitScript(
    ([url, prefix]) =>
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url, discoveryPrefix: prefix, blocksPrefix: `${prefix}-blocks` })),
    [BROKER_URL, discoveryPrefix],
  )
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-prebuilt-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => client.publish(topic, payload, { retain: true, qos: 1 }, (err) => (err ? reject(err) : resolve())))
}

// The palette's (docs/2026-11-06-palette.md); the tab and the groups were
// tested here while they were the ribbon's - e2e/palette.spec.ts has them now.
const ribbon = (page: Page) => page.getByTestId("palette")
const tab = (page: Page, name: "Parts" | "Prebuilt") => page.getByTestId(`palette-tab-${name.toLowerCase()}`)

test("a prebuilt whose parts the loaded device does not render is not placeable", () => {
  const topic = "homeassistant/switch/0xa4c138d2c1e0e5f1/switch/config"
  const [config] = expandConfig(topic, JSON.stringify(fixturePayload("z2m-switch-plug")), "homeassistant")
  const result = toCatalogEntry(config)
  if (!("entry" in result)) throw new Error("the plug is placeable")
  const entry: CatalogEntry = result.entry
  expect(entryRendered(entry, undefined)).toBe(true)
  expect(entryRendered(entry, ["text", "icon", "switch", "button", "button-group"])).toBe(true)
  // Neither a switch nor buttons: no look of the on/off part is drawn.
  expect(entryRendered(entry, ["text", "icon", "bar"])).toBe(false)
})

// The catalog from what the designer hears (plan task T5, decision 4): with
// «Listening» on, the open tab follows the broker - a device announcing
// itself appears, one taking its announcement back (an empty retained
// config) goes; with it off, read once, and again with Refresh.
test("listening: an announcement made while the tab is open appears, an empty retained one takes it away", async ({ page }, testInfo) => {
  const prefix = `e2e-prebuilt-live-${testInfo.testId}`
  const topic = `${prefix}/sensor/van-sensors/cabin_temperature/config`
  const client = await connectBroker()
  try {
    await useBroker(page, prefix)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await tab(page, "Prebuilt").click()
    await expect(page.getByTestId("block-catalog-status")).toContainText("Nothing announces itself", { timeout: 10_000 })
    // Listening: no Refresh, it follows by itself.
    await expect(page.getByTestId("prebuilt-refresh")).toHaveCount(0)

    await publish(client, topic, JSON.stringify(fixturePayload("esphome-sensor-temperature")))
    const tile = ribbon(page).getByRole("button", { name: "Cabin temperature" })
    await expect(tile).toBeVisible({ timeout: 10_000 })

    await publish(client, topic, "")
    await expect(tile).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByTestId("block-catalog-status")).toContainText("Nothing announces itself")
  } finally {
    await publish(client, topic, "")
    client.end()
  }
})

test("not listening: read when the tab opens, a new announcement shows after Refresh", async ({ page }, testInfo) => {
  const prefix = `e2e-prebuilt-once-${testInfo.testId}`
  const topic = `${prefix}/sensor/van-sensors/cabin_temperature/config`
  const client = await connectBroker()
  try {
    await page.addInitScript(() => window.localStorage.setItem("schaltli.listening", "false"))
    await useBroker(page, prefix)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await tab(page, "Prebuilt").click()
    await expect(page.getByTestId("block-catalog-status")).toContainText("Nothing announces itself", { timeout: 10_000 })

    await publish(client, topic, JSON.stringify(fixturePayload("esphome-sensor-temperature")))
    const tile = ribbon(page).getByRole("button", { name: "Cabin temperature" })
    // Not read again on its own.
    await page.waitForTimeout(1500)
    await expect(tile).toHaveCount(0)
    await page.getByTestId("prebuilt-refresh").click()
    await expect(tile).toBeVisible({ timeout: 10_000 })
  } finally {
    await publish(client, topic, "")
    client.end()
  }
})
