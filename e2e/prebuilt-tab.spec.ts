import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import { readFileSync } from "node:fs"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { entryRendered } from "../lib/bausteine"
import { expandConfig, toCatalogEntry, type CatalogEntry } from "../lib/ha-discovery"

// The ribbon's two tabs (docs/2026-11-05-quick-blocks.md, decision 1, plan
// task T4): «Parts» the tools, «Prebuilt» what the broker's devices
// announce, as tiles grouped by device; the tab last open remembered. Needs
// `npm run hil:broker` for the catalog cases, as e2e/bausteine.spec.ts.

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

const ribbon = (page: Page) => page.getByTestId("tools-ribbon")
const tab = (page: Page, name: "Parts" | "Prebuilt") => page.getByRole("tab", { name, exact: true })

test("Parts first; Prebuilt in its place, and the tab last open is the one shown after a reload", async ({ page }) => {
  await useBroker(page, "e2e-prebuilt-none")
  await loadProject(page, COMBINED_TEST_PROJECT)
  await expect(tab(page, "Parts")).toHaveAttribute("aria-selected", "true")
  await expect(ribbon(page).getByRole("button", { name: "Text", exact: true })).toBeVisible()
  // No Block button any more: the prebuilts are a tab.
  await expect(ribbon(page).getByRole("button", { name: "Block", exact: true })).toHaveCount(0)

  await tab(page, "Prebuilt").click()
  await expect(tab(page, "Prebuilt")).toHaveAttribute("aria-selected", "true")
  await expect(ribbon(page).getByRole("button", { name: "Text", exact: true })).toHaveCount(0)
  await expect(page.getByTestId("block-catalog-status")).toBeVisible()

  await loadProject(page, COMBINED_TEST_PROJECT)
  await expect(tab(page, "Prebuilt")).toHaveAttribute("aria-selected", "true")
  await tab(page, "Parts").click()
  await loadProject(page, COMBINED_TEST_PROJECT)
  await expect(tab(page, "Parts")).toHaveAttribute("aria-selected", "true")
})

test("the Prebuilt tab: a group per device captioned with its name, a thing of its own name uncaptioned, a tile takes its prebuilt in hand", async ({ page }, testInfo) => {
  const prefix = `e2e-prebuilt-${testInfo.testId}`
  const client = await connectBroker()
  const configs: [string, unknown][] = [
    [`${prefix}/switch/0xa4c138d2c1e0e5f1/switch/config`, fixturePayload("z2m-switch-plug")],
    [`${prefix}/sensor/van-sensors/cabin_temperature/config`, fixturePayload("esphome-sensor-temperature")],
    [
      `${prefix}/sensor/van-sensors/interval/config`,
      { name: "Interval", stat_t: "van-sensors/interval", val_tpl: "{{ value_json.ms / 1000 }}", dev: { ids: "a8032ab4c5d6", name: "van-sensors" } },
    ],
  ]
  try {
    for (const [topic, payload] of configs) await publish(client, topic, JSON.stringify(payload))
    await useBroker(page, prefix)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await tab(page, "Prebuilt").click()

    const sensors = page.locator('[data-testid="block-catalog-device"][data-device="van-sensors"]')
    await expect(sensors.getByRole("button", { name: "Cabin temperature" })).toBeEnabled({ timeout: 10_000 })
    await expect(sensors).toContainText("van-sensors")
    // What cannot be placed: a greyed tile, the reason for the tooltip.
    await expect(sensors.locator('[data-entry-id="sensor van-sensors interval"]')).toHaveAttribute("aria-disabled", "true")
    // The plug announces one thing of its own name: no caption repeating it.
    // Greyed, since this project's e-paper draws neither a switch nor buttons.
    const plug = page.locator('[data-testid="block-catalog-device"][data-device="Kitchen plug"]')
    const plugTile = plug.locator('[data-entry-id="switch 0xa4c138d2c1e0e5f1 switch"]')
    await expect(plugTile).toHaveAttribute("aria-disabled", "true")
    await expect(plugTile).toContainText("Not rendered by the loaded device's firmware")
    expect(await plug.getByText("Kitchen plug", { exact: true }).count()).toBe(1)
    // A greyed tile opens nothing.
    await plugTile.click({ force: true })
    await expect(page.getByRole("dialog")).toHaveCount(0)

    // A tile pressed: no options asked, the prebuilt in hand, its tile
    // shown pressed (plan task T6).
    const cabin = sensors.getByRole("button", { name: "Cabin temperature" })
    await cabin.click()
    await expect(cabin).toHaveAttribute("data-armed", "true")
    await expect(page.getByRole("dialog")).toHaveCount(0)
  } finally {
    for (const [topic] of configs) await publish(client, topic, "")
    client.end()
  }
})

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
