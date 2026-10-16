import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { discoveryPrefixOf } from "../hooks/use-mqtt-connection"
import { ownBroker, useOwnBroker, heardOn, type OwnBroker } from "./own-broker"

// «Listen to Broker», a window for looking at the broker
// (docs/2026-10-14-topic-discovery.md, module listen-viewer): what the
// background listener heard as a tree, the topic in focus beside it. On a
// broker of this spec's own (e2e/own-broker.ts). It replaces the flat list
// to tick (e2e/mqtt-discovery.spec.ts until 2026-10-14), whose findings
// hold here too: retained told apart from live (2026-08-02), nothing taken
// into the project unasked (2026-10-09), a local topic's name warned about.

const viewer = (page: Page) => page.getByRole("dialog", { name: "Listen to Broker" })
const row = (page: Page, path: string) => viewer(page).locator(`[data-path="${path}"]`)

async function openViewer(page: Page) {
  await page.getByTestId("listen-to-broker").click()
  await expect(viewer(page)).toBeVisible()
}

test.describe("Listen to Broker", () => {
  let own: OwnBroker
  test.beforeEach(async ({ page }) => {
    own = await ownBroker()
    await own.publish("pkw/tele/battery/soc", "87", true)
    await own.publish("pkw/tele/battery/voltage", "13.31", true)
    await own.publish("pkw/tele/heater/state", '{"power":"on","target":21,"mode":"auto"}', true)
    await own.publish("tasmota/stat/boiler/POWER", "OFF", true)
    await own.publish("zigbee2mqtt/bath_heating", '{"state":"OFF"}', true)
    await useOwnBroker(page, own.url)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect.poll(() => heardOn(page, "zigbee2mqtt/bath_heating"), { timeout: 5000 }).not.toBeNull()
  })
  test.afterEach(async () => {
    await own.close()
  })

  test("opens folded, each branch counting the topics and messages below it; no checkbox, nothing to add", async ({ page }) => {
    await openViewer(page)
    for (const root of ["pkw", "tasmota", "zigbee2mqtt"]) await expect(row(page, root)).toBeVisible()
    await expect(row(page, "pkw/tele")).toHaveCount(0)
    await expect(row(page, "pkw").getByTestId("branch-counts")).toHaveAttribute("aria-label", "3 topics, 3 messages")
    await expect(viewer(page).getByTestId("listen-totals")).toHaveText("5 topics · 5 messages")
    await expect(viewer(page).getByRole("checkbox")).toHaveCount(0)
    await expect(viewer(page).getByRole("button", { name: "Add Selected Topics" })).toHaveCount(0)

    await row(page, "pkw").click()
    await row(page, "pkw/tele").click()
    await row(page, "pkw/tele/battery").click()
    await expect(row(page, "pkw/tele/battery/soc")).toContainText("87")
    await expect(row(page, "pkw/tele/battery/soc")).toContainText("retained")
    await expect(row(page, "pkw/tele/battery/soc")).toContainText("numeric")
    await expect(viewer(page).getByRole("button", { name: "Collapse all" })).toBeVisible()
    await viewer(page).getByRole("button", { name: "Collapse all" }).click()
    await expect(row(page, "pkw/tele")).toHaveCount(0)
  })

  test("a message lights its row and every row above it; a live one is live", async ({ page }) => {
    await openViewer(page)
    await row(page, "pkw").click()
    await row(page, "pkw/tele").click()
    await own.publish("pkw/tele/battery/current", "-4.6")
    for (const path of ["pkw", "pkw/tele", "pkw/tele/battery"]) await expect(row(page, path)).toHaveAttribute("data-lit", "true")
    await expect(row(page, "tasmota")).not.toHaveAttribute("data-lit", "true")
    await row(page, "pkw/tele/battery").click()
    await expect(row(page, "pkw/tele/battery/current")).toContainText("live")
    // And fades.
    await expect(row(page, "pkw")).not.toHaveAttribute("data-lit", "true", { timeout: 5000 })
  })

  test("the filter finds a fragment in the path or the payload and opens the tree to it", async ({ page }) => {
    await openViewer(page)
    await viewer(page).getByPlaceholder("Filter topic or payload").fill("heat")
    await expect(row(page, "pkw/tele/heater/state")).toBeVisible()
    await expect(row(page, "zigbee2mqtt/bath_heating")).toBeVisible()
    await expect(row(page, "tasmota")).toHaveCount(0)
    // In the payload only: «auto» is the heater's mode.
    await viewer(page).getByPlaceholder("Filter topic or payload").fill("auto")
    await expect(row(page, "pkw/tele/heater/state")).toBeVisible()
    await expect(row(page, "zigbee2mqtt")).toHaveCount(0)
  })

  test("a topic in focus: its path, its value - JSON indented - and its messages to step through", async ({ page }) => {
    await own.publish("pkw/tele/battery/soc", "86")
    await own.publish("pkw/tele/battery/soc", "85")
    await expect.poll(async () => (await heardOn(page, "pkw/tele/battery/soc"))?.count).toBe(3)
    await openViewer(page)
    await viewer(page).getByPlaceholder("Filter topic or payload").fill("soc")
    await row(page, "pkw/tele/battery/soc").click()
    const pane = viewer(page).getByTestId("listen-pane")
    await expect(pane).toContainText("pkw/tele/battery/soc")
    await expect(pane.getByTestId("listen-value")).toHaveText("85")
    await expect(pane).toContainText("last 3 of 3")
    await pane.getByRole("button", { name: "Older message" }).click()
    await expect(pane.getByTestId("listen-value")).toHaveText("86")
    await pane.getByRole("listitem").nth(2).click()
    await expect(pane.getByTestId("listen-value")).toHaveText("87")

    await viewer(page).getByPlaceholder("Filter topic or payload").fill("heater")
    await row(page, "pkw/tele/heater/state").click()
    await expect(pane.getByTestId("listen-value")).toHaveText('{\n  "power": "on",\n  "target": 21,\n  "mode": "auto"\n}')
  })

  test("«Use as examples» replaces a project topic's examples with what was heard; undo puts them back", async ({ page }) => {
    // Freshwater/Level is the combined fixture's, with examples 0…100.
    await own.publish("Freshwater/Level", "64")
    await own.publish("Freshwater/Level", "63")
    await expect.poll(async () => (await heardOn(page, "Freshwater/Level"))?.count).toBe(2)
    await openViewer(page)
    await viewer(page).getByPlaceholder("Filter topic or payload").fill("Freshwater")
    await expect(row(page, "Freshwater/Level").getByTestId("in-project")).toBeVisible()
    await row(page, "Freshwater/Level").click()
    const pane = viewer(page).getByTestId("listen-pane")
    await expect(pane.getByTestId("listen-examples")).toHaveText("0, 25, 50, 75, 100")
    await pane.getByRole("button", { name: "Use as examples" }).click()
    await expect(pane.getByTestId("listen-examples")).toHaveText("63, 64")
    await page.keyboard.press("Escape")
    await page.keyboard.press("ControlOrMeta+z")
    await openViewer(page)
    await viewer(page).getByPlaceholder("Filter topic or payload").fill("Freshwater")
    await row(page, "Freshwater/Level").click()
    await expect(viewer(page).getByTestId("listen-examples")).toHaveText("0, 25, 50, 75, 100")
  })

  test("a real topic under a local topic's name is warned about, and marked", async ({ page }, testInfo) => {
    const name = `local/viewer-${testInfo.testId}/view`
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    await page.getByText("Topics", { exact: true }).click()
    const settings = page.getByRole("dialog")
    await settings.getByRole("button", { name: "Add local topic" }).click()
    await settings.getByLabel("Local topic name").fill(name)
    await settings.getByLabel("Local topic name").press("Enter")
    await page.keyboard.press("Escape")
    await own.publish(name, "sankey")
    await expect.poll(() => heardOn(page, name)).not.toBeNull()
    await openViewer(page)
    await expect(viewer(page).getByTestId("local-collision")).toContainText(`«${name}», the name of a local topic here`)
    await viewer(page).getByPlaceholder("Filter topic or payload").fill("sankey")
    await expect(row(page, name)).toContainText("local topic")
    await expect(row(page, name).getByTestId("in-project")).toHaveCount(0)
  })

  test("devices announced via discovery are counted, and the pointer opens the Block menu", async ({ page }) => {
    await own.publish("homeassistant/sensor/CamperServiceID_BiberTest/config", JSON.stringify({ name: "Service ID", state_topic: "CamperServiceID/state", device: { identifiers: ["BiberTest"], name: "BiberTest" } }), true)
    await own.publish("homeassistant/light/CamperLightKitchen_BiberTest/config", JSON.stringify({ name: "Kitchen", command_topic: "k/set", device: { identifiers: ["BiberTest"] } }), true)
    await own.publish("homeassistant/switch/pump/config", JSON.stringify({ name: "Pump", command_topic: "p/set" }), true)
    await expect.poll(() => heardOn(page, "homeassistant/switch/pump/config")).not.toBeNull()
    await openViewer(page)
    const pointer = viewer(page).getByTestId("announced-pointer")
    await expect(pointer).toContainText("2 devices are announced via Home Assistant discovery.")
    await pointer.getByRole("button", { name: "Open the Block menu ›" }).click()
    await expect(viewer(page)).toHaveCount(0)
    await expect(page.getByRole("menu")).toBeVisible()
  })

  test("Connect in the connection settings listens on that broker instead", async ({ page }) => {
    const other = await ownBroker()
    try {
      await other.publish("other/broker/topic", "here", true)
      await openViewer(page)
      await viewer(page).getByRole("button", { name: "Connection settings" }).click()
      await viewer(page).locator("#websocketUrl").fill(other.url)
      await viewer(page).getByRole("button", { name: "Connect", exact: true }).click()
      await expect.poll(() => heardOn(page, "other/broker/topic"), { timeout: 10_000 }).not.toBeNull()
      expect(await heardOn(page, "pkw/tele/battery/soc")).toBeNull()
      await expect(row(page, "other")).toBeVisible()
    } finally {
      await other.close()
    }
  })

  // #39: a broker chosen while things are connected to the old one is
  // followed by them, not only by the listener.
  async function chooseBroker(page: Page, url: string) {
    await openViewer(page)
    await viewer(page).getByRole("button", { name: "Connection settings" }).click()
    await viewer(page).locator("#websocketUrl").fill(url)
    await viewer(page).getByRole("button", { name: "Connect", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(viewer(page)).toHaveCount(0)
  }

  test("a live preview follows a broker chosen in the connection settings", async ({ page }) => {
    const other = await ownBroker()
    try {
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText(`Live from ${own.url}`, { timeout: 10_000 })
      await chooseBroker(page, other.url)
      await expect(page.getByTestId("preview-source-status")).toContainText(`Live from ${other.url}`, { timeout: 10_000 })
    } finally {
      await other.close()
    }
  })

  test("an address typed into one dialog is followed by the others, whatever was typed into them before", async ({ page }) => {
    const other = await ownBroker()
    const onOther: string[] = []
    other.broker.on("client", (client) => onOther.push(client.id))
    const deploy = page.getByRole("dialog", { name: "Deploy to Device" })
    const openDeploy = async () => {
      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
    }
    try {
      // Typed here first, and nothing answers: Deploy shows its field.
      await chooseBroker(page, "ws://127.0.0.1:9")
      await openDeploy()
      const field = page.locator("#deploy-broker-url")
      await expect(field).toBeVisible({ timeout: 10_000 })
      await field.fill(own.url)
      await deploy.getByRole("button", { name: "Connect", exact: true }).click()
      await expect(field).toHaveCount(0, { timeout: 10_000 })
      await page.keyboard.press("Escape")
      await expect(deploy).toHaveCount(0)
      // The File menu the dialog was opened from is still open behind it.
      await page.keyboard.press("Escape")

      // Until 2026-10-16 this window kept what had been typed into it.
      await openViewer(page)
      await expect(viewer(page).getByTitle(own.url)).toBeVisible()
      await expect.poll(() => heardOn(page, "pkw/tele/battery/soc"), { timeout: 10_000 }).not.toBeNull()
      await viewer(page).getByRole("button", { name: "Connection settings" }).click()
      await expect(viewer(page).locator("#websocketUrl")).toHaveValue(own.url)
      await page.keyboard.press("Escape")

      // And Deploy goes where this window says.
      await chooseBroker(page, other.url)
      await openDeploy()
      await expect.poll(() => onOther.some((id) => id.startsWith("schaltli-deploy")), { timeout: 10_000 }).toBe(true)
    } finally {
      await other.close()
    }
  })
})

test.describe("the discovery prefix", () => {
  const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem("schaltli-mqtt-connection") ?? "{}"))

  test("is typed beside the broker address and remembered with it", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openViewer(page)
    await viewer(page).getByRole("button", { name: "Connection settings" }).click()
    await expect(page.locator("#discoveryPrefix")).toHaveAttribute("placeholder", "homeassistant")
    await page.locator("#discoveryPrefix").fill("garage_homeassistant")
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.locator("#discoveryPrefix")).toHaveCount(0)
    expect(await stored(page)).toMatchObject({ discoveryPrefix: "garage_homeassistant" })

    await loadProject(page, COMBINED_TEST_PROJECT)
    await openViewer(page)
    await viewer(page).getByRole("button", { name: "Connection settings" }).click()
    await expect(page.locator("#discoveryPrefix")).toHaveValue("garage_homeassistant")
    await page.locator("#discoveryPrefix").fill("")
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.locator("#discoveryPrefix")).toHaveCount(0)
    expect(await stored(page)).toMatchObject({ discoveryPrefix: "" })
  })

  test("empty or blank is Home Assistant's own", () => {
    expect(discoveryPrefixOf(undefined)).toBe("homeassistant")
    expect(discoveryPrefixOf("  ")).toBe("homeassistant")
    expect(discoveryPrefixOf(" garage_homeassistant ")).toBe("garage_homeassistant")
  })
})
