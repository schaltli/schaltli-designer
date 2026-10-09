import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { discoveryPrefixOf } from "../hooks/use-mqtt-connection"

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

    // No manual URL/Connect step (2026-08-03) - the dialog auto-connects
    // using the broker URL derived from the page's own host, which is
    // ws://localhost:9001 here, same as BROKER_URL.
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

  test("filtering scopes 'Add Selected Topics' to what's actually visible", async ({ page }, testInfo) => {
    // Reported live (2026-08-02): every discovered topic started out
    // selected="true" (until 2026-10-09), so typing a filter only
    // changed what was *shown*, not what "Add Selected Topics" would add -
    // clicking it while filtered silently added every hidden topic too,
    // not just the ones the user could actually see and meant to pick.
    const keepTopic = `test/discovery-filter-${testInfo.testId}/keep-me`
    const dropTopic = `test/discovery-filter-${testInfo.testId}/drop-me`
    await new Promise<void>((resolve) => {
      testClient.publish(keepTopic, "1", { retain: true }, () => {
        testClient.publish(dropTopic, "2", { retain: true }, () => resolve())
      })
    })

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    // No manual URL/Connect step (2026-08-03) - the dialog auto-connects
    // using the broker URL derived from the page's own host, which is
    // ws://localhost:9001 here, same as BROKER_URL.
    await page.getByRole("button", { name: "Start Discovery" }).click()
    await expect(page.getByText(keepTopic)).toBeVisible()
    await expect(page.getByText(dropTopic)).toBeVisible()
    // Both chosen, then the filter: the hidden one keeps its flag.
    await page.getByRole("dialog", { name: "Discover MQTT Topics" }).getByRole("button", { name: "Select All", exact: true }).click()

    await page.getByPlaceholder("Filter topics...").fill("keep-me")
    await expect(page.getByText(keepTopic)).toBeVisible()
    await expect(page.getByText(dropTopic)).not.toBeVisible()

    await page.getByRole("button", { name: "Add Selected Topics" }).click()

    // Back in the Topics tab: the filtered-out topic must not have been
    // added, only the one that was actually visible and selected.
    await expect(page.getByText(keepTopic)).toBeVisible()
    await expect(page.getByText(dropTopic)).not.toBeVisible()

    testClient.publish(dropTopic, "", { retain: true })
  })

  // Tester Arno, 2026-10-09: every topic started out selected, so «Add
  // Selected Topics» took 293 into his project - the whole broker, Home
  // Assistant's discovery configs among them - and the preview subscribed
  // to every one. Nothing is chosen until the user chooses it.
  test("nothing is selected until the user picks it", async ({ page }, testInfo) => {
    const one = `test/discovery-none-${testInfo.testId}/one`
    const two = `test/discovery-none-${testInfo.testId}/two`
    await new Promise<void>((resolve) => {
      testClient.publish(one, "1", { retain: true }, () => {
        testClient.publish(two, "2", { retain: true }, () => resolve())
      })
    })

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    await page.getByRole("button", { name: "Start Discovery" }).click()
    await expect(page.getByText(one)).toBeVisible()
    await expect(page.getByText(two)).toBeVisible()
    await expect(page.getByText(/^0 of \d+ topics selected$/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Add Selected Topics" })).toBeDisabled()

    await page.getByText(one).click()
    await page.getByRole("button", { name: "Add Selected Topics" }).click()
    await expect(page.getByText(one)).toBeVisible()
    await expect(page.getByText(two)).not.toBeVisible()

    testClient.publish(one, "", { retain: true })
    testClient.publish(two, "", { retain: true })
  })

  test("derives subtopics from a JSON topic and merges fields across differing payloads", async ({
    page,
  }, testInfo) => {
    // A publisher may legitimately vary its payload shape between messages
    // (optional fields, per-mode extra keys). Binding a field must not
    // depend on which message discovery happened to sample first, so the
    // fields are merged across messages rather than taken from one.
    const jsonTopic = `test/discovery-json-${testInfo.testId}/state`
    // Deliberately mixes all three path forms the shared grammar has to
    // emit (lib/json-path.ts's appendMemberSegment, which must stay
    // resolvable by ProjectLoader.cpp's tokenizeJsonPath on the device):
    // a bare member, a bracket-quoted member for a key a bare ".name" can't
    // express, and an array index.
    await new Promise<void>((resolve) => {
      testClient.publish(
        jsonTopic,
        JSON.stringify({ temp: 23, "sensor-a": { humid: 50 }, readings: [7] }),
        { retain: true },
        () => resolve(),
      )
    })

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    await page.getByRole("button", { name: "Start Discovery" }).click()

    const derived = "temp, ['sensor-a'].humid, readings[0]"
    const row = page.locator("text=" + jsonTopic).locator("..")
    await expect(row.getByText(derived, { exact: true })).toBeVisible()

    // A second payload carrying a field the first didn't have must widen
    // the field set, not replace it.
    testClient.publish(jsonTopic, JSON.stringify({ temp: 24, mode: "eco" }), { retain: false })
    await expect(row.getByText(`${derived}, mode`, { exact: true })).toBeVisible()

    await page.getByPlaceholder("Filter topics...").fill(jsonTopic)
    await page.getByRole("dialog", { name: "Discover MQTT Topics" }).getByRole("button", { name: "Select Shown", exact: true }).click()
    await page.getByRole("button", { name: "Add Selected Topics" }).click()

    // The derived fields must land on the project's topic as real
    // subtopics, i.e. bindable exactly like hand-added ones.
    await expect(page.getByText(`Subtopics: ${derived}, mode`)).toBeVisible()

    testClient.publish(jsonTopic, "", { retain: true })
  })

  test("stops collecting a JSON topic's examples at 10", async ({ page }, testInfo) => {
    // Without a cap, a topic whose payload is keyed by something unbounded
    // (a timestamp, a device id) would grow one subtopic per message
    // forever. Only a message contributing an unseen field is kept, and
    // after 10 such examples the topic is treated as characterized and its
    // later messages aren't inspected at all.
    const jsonTopic = `test/discovery-cap-${testInfo.testId}/state`
    await new Promise<void>((resolve) => {
      testClient.publish(jsonTopic, JSON.stringify({ f0: 0 }), { retain: true }, () => resolve())
    })

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    await page.getByRole("button", { name: "Start Discovery" }).click()

    const row = page.locator("text=" + jsonTopic).locator("..")
    await expect(row.getByText("f0", { exact: true })).toBeVisible()

    // Each of these introduces exactly one new field, so each is kept as an
    // example - f1..f9 fill the remaining 9 slots, f10/f11 arrive after the
    // cap and must be ignored entirely.
    for (let i = 1; i <= 11; i++) {
      testClient.publish(jsonTopic, JSON.stringify({ [`f${i}`]: i }), { retain: false })
    }

    const expected = Array.from({ length: 10 }, (_, i) => `f${i}`).join(", ")
    await expect(row.getByText(expected, { exact: true })).toBeVisible()
    await expect(row.getByText("f10")).toHaveCount(0)

    testClient.publish(jsonTopic, "", { retain: true })
  })

  test("stays scrollable with many topics - Add Selected Topics never gets pushed off-screen", async ({
    page,
  }, testInfo) => {
    // Reported live (2026-08-02): DialogContent's own base component is a
    // CSS grid, not flex - the flex-1/min-h-0 chain meant to keep the
    // topic list scrolling within a fixed-height dialog silently did
    // nothing, so with enough topics the whole dialog just grew past its
    // max-h and clipped, taking the footer buttons with it.
    const prefix = `test/discovery-many-${testInfo.testId}`
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => new Promise<void>((resolve) => testClient.publish(`${prefix}/t${i}`, String(i), { retain: true }, () => resolve()))),
    )

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    // No manual URL/Connect step (2026-08-03) - the dialog auto-connects
    // using the broker URL derived from the page's own host, which is
    // ws://localhost:9001 here, same as BROKER_URL.
    await page.getByRole("button", { name: "Start Discovery" }).click()
    await expect(page.getByText(`${prefix}/t39`)).toBeVisible()

    // Playwright's own actionability check requires the button to be
    // within the viewport and not obscured - this fails outright if the
    // dialog clipped it off-screen, exactly reproducing the report.
    await expect(page.getByRole("button", { name: "Add Selected Topics" })).toBeVisible()
    await page.getByRole("button", { name: "Stop Discovery" }).click()

    for (let i = 0; i < 40; i++) {
      testClient.publish(`${prefix}/t${i}`, "", { retain: true })
    }
  })
})

// Block plan Task 5: the prefix Home Assistant discovery is read under, set
// beside the broker address and remembered with it (docs/2026-09-30-block-
// discovery.md). The Block menu's catalog reads it (storedDiscoveryPrefix).
test.describe("the discovery prefix", () => {
  async function openConnectionStep(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    // The dialog connects by itself; Connection settings brings the fields back.
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible()
    await page.getByRole("button", { name: "Connection settings" }).click()
    await expect(page.locator("#discoveryPrefix")).toBeVisible()
  }
  const stored = (page: import("@playwright/test").Page) =>
    page.evaluate(() => JSON.parse(window.localStorage.getItem("schaltli-mqtt-connection") ?? "{}"))

  test("is typed beside the broker address and remembered with it, across a reload", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openConnectionStep(page)
    await expect(page.locator("#discoveryPrefix")).toHaveAttribute("placeholder", "homeassistant")
    await page.locator("#discoveryPrefix").fill("garage_homeassistant")
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible()
    expect(await stored(page)).toMatchObject({ discoveryPrefix: "garage_homeassistant" })

    await page.reload()
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openConnectionStep(page)
    await expect(page.locator("#discoveryPrefix")).toHaveValue("garage_homeassistant")

    // Emptied again: stored empty, read as the default.
    await page.locator("#discoveryPrefix").fill("")
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible()
    expect(await stored(page)).toMatchObject({ discoveryPrefix: "" })
  })

  test("empty or blank is Home Assistant's own", () => {
    expect(discoveryPrefixOf(undefined)).toBe("homeassistant")
    expect(discoveryPrefixOf("  ")).toBe("homeassistant")
    expect(discoveryPrefixOf(" garage_homeassistant ")).toBe("garage_homeassistant")
  })
})
