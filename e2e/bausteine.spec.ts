import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import JSZip from "jszip"
import { readFile, writeFile } from "node:fs/promises"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { blockFont, buildEntry, buildFromCatalog, catalogLooks, blockIconAssetId, measureBlockText } from "../lib/bausteine"
import { expandConfig, toCatalogEntry, type CatalogEntry } from "../lib/ha-discovery"
import { readFileSync } from "node:fs"
import { minKnobSwitchWidth } from "../components/canvas/renderers/render-switch"
import { controlPalette } from "../lib/control-palette"

// Building blocks (lib/bausteine.ts): pick an entry the broker's discovery
// configs announce (lib/ha-discovery.ts), choose its look and icon, drag its
// rectangle, and a finished control appears beside its name - bound to
// topics the user never typed. Against the local broker (`npm run
// hil:broker`), the configs published first as their devices publish them.

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

// The icon a block suggests comes from /api/translate and Iconify
// (lib/icon-search.ts). No test here goes out to either: every page gets
// stand-ins that translate nothing and find nothing, and a test that wants an
// icon says which word finds which. `failing` makes Iconify unreachable.
const WATER_BODY = '<path fill="currentColor" d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>'
async function mockIconServices(
  page: Page,
  found: Record<string, string> = {},
  opts: { translate?: Record<string, string>; failing?: boolean } = {},
): Promise<string[]> {
  const asked: string[] = []
  await page.route("**/api/translate?**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? ""
    return route.fulfill({ json: { translated: opts.translate?.[q] ?? q } })
  })
  await page.route("https://api.iconify.design/**", (route) => {
    const url = new URL(route.request().url())
    if (opts.failing) return route.abort()
    if (url.pathname === "/search") {
      const query = url.searchParams.get("query") ?? ""
      asked.push(query)
      return route.fulfill({ json: { icons: found[query] ? [found[query]] : [] } })
    }
    const prefix = url.pathname.replace(/^\//, "").replace(/\.json$/, "")
    const names = (url.searchParams.get("icons") ?? "").split(",")
    return route.fulfill({
      json: { prefix, width: 24, height: 24, icons: Object.fromEntries(names.map((name) => [name, { body: WATER_BODY }])) },
    })
  })
  return asked
}

test.beforeEach(async ({ page }) => {
  await mockIconServices(page)
})

// A block is placed without anyone choosing a font, so the size follows the
// panel: the project font closest to 5% of the shorter side (2026-09-16).
test.describe("the font a block writes in", () => {
  const fonts = [
    { id: "f12", size: 12 },
    { id: "f18", size: 18 },
    { id: "f27", size: 27 },
    { id: "f35", size: 35 },
  ]

  test("follows the shorter side of the screen", () => {
    // 800x480 -> 24, and 27 is nearer than 18.
    expect(blockFont(fonts, 800, 480)?.size).toBe(27)
    // 360x360 -> 18 exactly.
    expect(blockFont(fonts, 360, 360)?.size).toBe(18)
    // Portrait counts its width: 300x400 -> 15, same as 400x300.
    expect(blockFont(fonts, 300, 400)?.size).toBe(blockFont(fonts, 400, 300)?.size)
  })

  test("breaks a tie towards the smaller font, and has none to give without fonts", () => {
    // 400x300 -> 15, which 12 and 18 miss by the same 3.
    expect(blockFont(fonts, 400, 300)?.size).toBe(12)
    expect(blockFont([], 400, 300)).toBeUndefined()
    expect(blockFont(undefined, 400, 300)).toBeUndefined()
  })
})

// Block plan Task 6c: a catalog entry placed - picked in the Block menu, its
// options chosen, Insert, the rectangle dragged. The configs and the values
// are on the local broker (npm run hil:broker), under a discovery prefix of
// the test's own, so what other tests leave there does not show up.
test.describe("placing a catalog entry", () => {
  // The round device: it draws a switch and a button group, which the
  // e-paper fixture does not.
  const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
  async function openOnRoundDevice(page: Page, zip = SWITCH_TEST_PROJECT) {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, zip)
  }
  const fixtureOf = (name: string) =>
    JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ha-discovery", `${name}.json`), "utf8")) as { topic: string; payload: unknown }

  /**
   * The fixtures' configs published under a prefix of this test's own, the
   * values on their topics retained, and the page told to read there.
   * Returns what to clear afterwards.
   */
  async function onBroker(
    page: Page,
    testId: string,
    fixtures: string[],
    values: Record<string, string> = {},
    websocketUrl = BROKER_URL,
  ): Promise<() => Promise<void>> {
    const prefix = `e2e-place-${testId}`
    const client = await connectBroker()
    const published: string[] = []
    for (const name of fixtures) {
      const f = fixtureOf(name)
      const topic = `${prefix}/${f.topic.split("/").slice(1).join("/")}`
      await publish(client, topic, JSON.stringify(f.payload))
      published.push(topic)
    }
    for (const [topic, value] of Object.entries(values)) {
      await publish(client, topic, value)
      published.push(topic)
    }
    await page.addInitScript(
      ([url, p]) => window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url, discoveryPrefix: p })),
      [websocketUrl, prefix],
    )
    return async () => {
      for (const topic of published) await publish(client, topic, "")
      client.end(true)
    }
  }

  async function pick(page: Page, entryName: string) {
    await page.getByRole("button", { name: "Block", exact: true }).click()
    await page.getByRole("menuitem", { name: entryName, exact: true }).click()
    await expect(page.getByRole("dialog")).toContainText(`Insert ${entryName}`)
  }

  async function drag(page: Page, start: [number, number] = [60, 140], end: [number, number] = [300, 200]) {
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, start[0], start[1], ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, end[0], end[1], ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }

  // What the Topics tab lists for `wanted`: its type and its line of examples.
  async function topicsInSettings(page: Page, wanted: string[]): Promise<Record<string, { type: string; examples: string }>> {
    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Topics", exact: true }).click()
    await expect(dialog.getByRole("button", { name: "Add Topic" })).toBeVisible()
    const lines = (await dialog.innerText()).split("\n").map((l) => l.trim()).filter(Boolean)
    const found: Record<string, { type: string; examples: string }> = {}
    lines.forEach((line, i) => {
      if (wanted.includes(line) && lines[i + 2] === "Examples:") found[line] = { type: lines[i + 1], examples: lines[i + 3] }
    })
    await page.keyboard.press("Escape")
    return found
  }

  test("a switch entry: a label and a switch in one group, its topics declared with the broker's value first", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page)
      await pick(page, "Kitchen plug")
      // The broker's value, read while the options are chosen.
      await expect(page.getByTestId("baustein-value")).toHaveText(": OFF")
      await expect(page.getByTestId("baustein-chosen")).toContainText("zigbee2mqtt/Kitchen plug#state")
      await expect(page.getByTestId("baustein-chosen")).toContainText("zigbee2mqtt/Kitchen plug/set")
      await page.getByTestId("baustein-insert").click()
      await drag(page)

      // Selected as a whole: the group, with the label and the switch inside.
      await expect(page.locator("h3").first()).toContainText("Group")
      const inside = page.locator('[data-object-id][style*="padding-left: 20px"]')
      await expect(inside).toHaveCount(2)
      await expect(inside.nth(0)).toHaveAttribute("title", /^(text|switch) /)
      await expect(inside.nth(1)).toHaveAttribute("title", /^(text|switch) /)

      const topics = await topicsInSettings(page, ["zigbee2mqtt/Kitchen plug", "zigbee2mqtt/Kitchen plug/set"])
      expect(topics["zigbee2mqtt/Kitchen plug"]).toEqual({ type: "json", examples: '{"state":"OFF"}' })
      expect(topics["zigbee2mqtt/Kitchen plug/set"]).toEqual({ type: "text", examples: "ON, OFF" })
    } finally {
      await clear()
    }
  })

  test("the look chosen in the dialog is the one placed", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Kitchen plug")
      await expect(page.getByTestId("baustein-look-switch")).toHaveAttribute("aria-checked", "true")
      await page.getByTestId("baustein-look-buttons").click()
      await page.getByTestId("baustein-insert").click()
      await drag(page)
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"][title^="button-group "]')).toHaveCount(1)
    } finally {
      await clear()
    }
  })

  test("Esc or Cancel on the options places nothing, and the tool stays unarmed", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"])
    try {
      await openOnRoundDevice(page)
      const before = await page.locator("[data-object-id]").count()
      await pick(page, "Kitchen plug")
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await pick(page, "Kitchen plug")
      await page.getByRole("button", { name: "Cancel" }).click()
      await drag(page)
      await expect(page.locator("[data-object-id]")).toHaveCount(before)
    } finally {
      await clear()
    }
  })

  test("an entry with several parts: each ticked, unticking leaves out, the rest placed with their looks", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["ha-docs-fan-bedroom"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Bedroom Fan")
      const parts = page.getByRole("group", { name: "Parts" })
      for (const part of ["Power", "Preset", "Speed", "Direction", "Oscillation"]) {
        await expect(parts.getByRole("checkbox", { name: part })).toBeChecked()
      }
      for (const part of ["Power", "Direction", "Oscillation"]) await parts.getByRole("checkbox", { name: part }).uncheck()
      // The topics shown are the ticked parts'.
      await expect(page.getByTestId("baustein-chosen")).toContainText("bedroom_fan/speed/percentage")
      await expect(page.getByTestId("baustein-chosen")).not.toContainText("bedroom_fan/on/set")
      await expect(page.getByTestId("baustein-part-2-look-slider")).toHaveAttribute("aria-checked", "true")
      await page.getByTestId("baustein-insert").click()
      await drag(page, [40, 100], [320, 300])

      // The name, and the two controls without a label each.
      const inside = page.locator('[data-object-id][style*="padding-left: 20px"]')
      await expect(inside).toHaveCount(3)
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"][title^="slider "]')).toHaveCount(1)
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"][title^="button-group "]')).toHaveCount(1)
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"][title^="switch "]')).toHaveCount(0)
      const topics = await topicsInSettings(page, ["bedroom_fan/speed/percentage", "bedroom_fan/preset/preset_mode", "bedroom_fan/on/set"])
      expect(Object.keys(topics).sort()).toEqual(["bedroom_fan/preset/preset_mode", "bedroom_fan/speed/percentage"])
    } finally {
      await clear()
    }
  })

  test("with no part ticked there is nothing to insert", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["ha-docs-fan-bedroom"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Bedroom Fan")
      const parts = page.getByRole("group", { name: "Parts" })
      for (const part of ["Power", "Preset", "Speed", "Direction", "Oscillation"]) await parts.getByRole("checkbox", { name: part }).uncheck()
      await expect(page.getByTestId("baustein-insert")).toBeDisabled()
      await parts.getByRole("checkbox", { name: "Speed" }).check()
      await expect(page.getByTestId("baustein-insert")).toBeEnabled()
    } finally {
      await clear()
    }
  })

  test("the config's own icon is suggested; None places it without", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-number-calibration"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Local temperature calibration")
      await expect(page.getByTestId("baustein-icon")).toContainText("mdi:math-compass")
      await page.getByRole("button", { name: "None", exact: true }).click()
      await expect(page.getByTestId("baustein-icon-status")).toHaveText("No icon")
      await page.getByTestId("baustein-insert").click()
      await drag(page)
      const inside = page.locator('[data-object-id][style*="padding-left: 20px"]')
      await expect(inside).toHaveCount(2)
      await expect(page.locator('[data-object-id][title^="icon "]')).toHaveCount(0)
    } finally {
      await clear()
    }
  })

  test("without the icon service the dialog says so, and the block is placed without one", async ({ page }, testInfo) => {
    await mockIconServices(page, {}, { failing: true })
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Kitchen plug")
      await expect(page.getByTestId("baustein-icon-status")).toHaveText("No icon: the icon service did not answer.")
      await page.getByTestId("baustein-insert").click()
      await drag(page)
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"]')).toHaveCount(2)
    } finally {
      await clear()
    }
  })

  // A topic the project already has is the user's - typed by hand, maybe
  // edited - and a block placed on it must not overwrite it.
  test("a topic the project already has keeps its type and examples", async ({ page }, testInfo) => {
    const zip = await JSZip.loadAsync(await readFile(SWITCH_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.topics.push({ id: "topic_mine", topic: "zigbee2mqtt/Kitchen plug/set", type: "text", examples: ["mine"] })
    zip.file("project.json", JSON.stringify(project, null, 2))
    const own = testInfo.outputPath("own-topic.zip")
    await writeFile(own, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))

    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"])
    try {
      await openOnRoundDevice(page, own)
      await pick(page, "Kitchen plug")
      await page.getByTestId("baustein-insert").click()
      await drag(page)
      const topics = await topicsInSettings(page, ["zigbee2mqtt/Kitchen plug", "zigbee2mqtt/Kitchen plug/set"])
      expect(topics["zigbee2mqtt/Kitchen plug/set"]).toEqual({ type: "text", examples: "mine" })
      // The missing one is still added.
      expect(topics["zigbee2mqtt/Kitchen plug"]?.type).toBe("json")
    } finally {
      await clear()
    }
  })
})

// The layout a block lays its pieces out in: the name beside a switch, above
// a bar or slider; an icon before the name, as tall as its line; a switch as
// wide as its words need. Pure.
test.describe("a catalog block's layout", () => {
  const RECT = { x: 10, y: 20, width: 300, height: 80 }
  const font = { id: "f", size: 16 }
  const palette = controlPalette("24bit")
  const entry = (control: any) => ({ id: "x", component: "x", name: "Pumpe", label: "Pumpe", controls: [control] })
  const sw = { kind: "switch", write: "p/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } } as const
  const level = { kind: "level", write: "l/set", min: 0, max: 100, step: 1 } as const

  test("a switch's name sits beside it, a slider's above it", () => {
    const [labelS, controlS] = buildFromCatalog({ entry: entry(sw), control: sw, rect: RECT, palette, font }).objects
    expect(controlS.x).toBeGreaterThan(labelS.x + labelS.width - 1)
    const [labelL, controlL] = buildFromCatalog({ entry: entry(level), control: level, rect: RECT, palette, font }).objects
    expect(controlL.y).toBeGreaterThanOrEqual(labelL.y + labelL.height)
    expect(controlL.x).toBe(labelL.x)
  })

  test("an icon comes first, as tall as the name's line, and the name moves over for it", () => {
    const icon = { name: "mdi:water-pump", data: "<svg/>", size: 10 }
    const [image, label, control] = buildFromCatalog({ entry: entry(sw), control: sw, rect: RECT, palette, font, options: { icon } }).objects
    expect(image.type).toBe("icon")
    expect(image.height).toBe(label.height)
    expect(label.x).toBeGreaterThan(image.x + image.width - 1)
    expect(control.x).toBeGreaterThan(label.x)
  })

  test("a switch is as wide as its words need beside its track", () => {
    const long = { ...sw, on: { read: "Automatikbetrieb", write: "AUTO" }, off: { read: "Handbetrieb", write: "MANUAL" } }
    const control = buildFromCatalog({ entry: entry(long), control: long, rect: { ...RECT, width: 120 }, palette, font }).objects[1]
    expect(control.width).toBeGreaterThanOrEqual(minKnobSwitchWidth(control.height, 2, measureBlockText("Automatikbetrieb", font)))
  })
})

// Block plan Task 6a: a catalog entry's control placed as a block - the
// entry's name as fixed text, the control in the chosen look, the topics
// it reads and writes. Pure: from the real configs in
// e2e/fixtures/ha-discovery/, through lib/ha-discovery.ts.
test.describe("a block from a catalog entry", () => {
  const RECT = { x: 10, y: 20, width: 300, height: 60 }
  const palette = controlPalette("24bit")
  function catalogEntry(name: string) {
    const f = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ha-discovery", `${name}.json`), "utf8"))
    const [config] = expandConfig(f.topic, JSON.stringify(f.payload), f.prefix)
    const result = toCatalogEntry(config)
    if (!("entry" in result)) throw new Error(result.unsupported.reason)
    return result.entry
  }
  function build(name: string, look?: string, extra: Partial<Parameters<typeof buildFromCatalog>[0]> = {}) {
    const entry = catalogEntry(name)
    return buildFromCatalog({ entry, control: entry.controls[0], rect: RECT, palette, ...(look ? { options: { look } } : {}), ...extra })
  }

  test("a switch: the name as fixed text, the switch reading its JSON field, An and Aus", () => {
    const entry = catalogEntry("z2m-switch-plug")
    expect(catalogLooks(entry.controls[0]).map((l) => l.id)).toEqual(["switch", "buttons"])
    const built = build("z2m-switch-plug")
    const [label, control] = built.objects
    expect(label).toMatchObject({ type: "text", properties: { text: "Kitchen plug" } })
    expect(control).toMatchObject({
      type: "switch",
      properties: {
        topic: "zigbee2mqtt/Kitchen plug#state",
        writeTopic: "zigbee2mqtt/Kitchen plug/set",
        states: [
          { id: "off", label: "Aus", readValue: "OFF", writeValue: "OFF", showAsOn: false },
          { id: "on", label: "An", readValue: "ON", writeValue: "ON", showAsOn: true },
        ],
      },
    })
    expect(built.topics).toEqual([
      { topic: "zigbee2mqtt/Kitchen plug", type: "json", examples: ['{"state":"ON"}'], subtopics: [{ id: "sub-state", path: "state", type: "text" }] },
      { topic: "zigbee2mqtt/Kitchen plug/set", type: "text", examples: ["ON", "OFF"] },
    ])
    // The other look: a button group, the same states.
    expect(build("z2m-switch-plug", "buttons").objects[1]).toMatchObject({ type: "button-group", properties: { writeTopic: "zigbee2mqtt/Kitchen plug/set" } })
  })

  test("a switch that reads True and writes ON keeps both, and its own words where they are not on and off", () => {
    const entry = catalogEntry("ha-docs-fan-bedroom")
    const direction = entry.controls.find((c) => c.part === "Direction")!
    const built = buildFromCatalog({ entry, control: direction, rect: RECT, palette })
    expect(built.objects[1].properties.states).toMatchObject([
      { label: "reverse", readValue: "reverse", writeValue: "reverse" },
      { label: "forward", readValue: "forward", writeValue: "forward" },
    ])
    const shelly = catalogEntry("shelly-rpc-switch-command-template")
    // Read only: a state, its word as a text.
    expect(buildFromCatalog({ entry: shelly, control: shelly.controls[0], rect: RECT, palette }).objects[1]).toMatchObject({
      type: "text",
      properties: { text: "{topic:shellyplus1pm-441793a1b2c3/status/switch:0#output}" },
    })
  })

  test("a value: a number with its unit, and a bar or gauge only where it is a fill", () => {
    const entry = catalogEntry("esphome-sensor-temperature")
    expect(catalogLooks(entry.controls[0]).map((l) => l.id)).toEqual(["number"])
    const built = build("esphome-sensor-temperature")
    expect(built.objects[1]).toMatchObject({ type: "text", properties: { text: "{topic:van-sensors/sensor/cabin_temperature/state} °C" } })
    expect(built.topics).toEqual([{ topic: "van-sensors/sensor/cabin_temperature/state", type: "numeric", examples: ["60"] }])
    const fill = { kind: "value", read: "tank/level", unit: "%", level: true } as const
    expect(catalogLooks(fill).map((l) => l.id)).toEqual(["bar", "gauge", "number"])
    const bar = buildFromCatalog({ entry: { ...entry, controls: [fill] }, control: fill, rect: RECT, palette }).objects[1]
    expect(bar).toMatchObject({ type: "bar", properties: { topic: "tank/level" } })
  })

  test("a level: a slider or dial on the entity's range and step, its middle as the example", () => {
    const built = build("z2m-number-calibration")
    expect(built.objects[1]).toMatchObject({
      type: "slider",
      properties: {
        topic: "zigbee2mqtt/Living room TRV#local_temperature_calibration",
        writeTopic: "zigbee2mqtt/Living room TRV/set/local_temperature_calibration",
        step: 0.1,
        calibrationPoints: [
          { value: -9, barSizePercent: 0 },
          { value: 9, barSizePercent: 100 },
        ],
      },
    })
    expect(built.topics[0]).toMatchObject({ type: "json", examples: ['{"local_temperature_calibration":0}'] })
    expect(built.topics[1]).toEqual({ topic: "zigbee2mqtt/Living room TRV/set/local_temperature_calibration", type: "numeric", examples: ["0"] })
    expect(build("z2m-number-calibration", "dial").objects[1].type).toBe("dial")
  })

  test("a choice: one button per option, as many as there are", () => {
    for (const [name, count] of [["esphome-select-mode", 3], ["esphome-select-five", 5]] as const) {
      const group = build(name).objects[1]
      expect(group.type).toBe("button-group")
      expect(group.properties.states).toHaveLength(count)
    }
    expect(build("esphome-select-mode").objects[1].properties.states[1]).toMatchObject({ label: "Low", readValue: "Low", writeValue: "Low" })
  })

  test("a button: one object named after the entry, publishing its payload", () => {
    const built = build("esphome-button-restart")
    expect(built.objects).toHaveLength(1)
    expect(built.objects[0]).toMatchObject({
      type: "button",
      properties: { text: "Restart", action: { type: "send-mqtt", mqttTopic: "van-sensors/button/restart/command", mqttMessage: "PRESS" } },
    })
  })

  test("what the broker holds is the first example, a typed label and an icon are used", () => {
    const built = build("z2m-switch-plug", undefined, {
      reported: { "zigbee2mqtt/Kitchen plug": '{"state":"OFF","power":12}' },
      options: { label: "Kaffee", icon: { name: "mdi:coffee", data: "<svg/>", size: 24 } },
    })
    expect(built.topics[0].examples).toEqual(['{"state":"OFF","power":12}'])
    expect(built.objects.map((o) => o.type)).toEqual(["icon", "text", "switch"])
    expect(built.objects[1].properties.text).toBe("Kaffee")
    expect(built.assets).toEqual([{ id: blockIconAssetId("mdi:coffee"), type: "icon", name: "mdi:coffee", data: "<svg/>", size: 24 }])
  })

  // Block plan Task 7: of an entry with several controls, the parts ticked.
  test("several parts: the name on a line of its own, then one row per part, its control alone, in the entry's order", () => {
    const entry = catalogEntry("ha-docs-fan-bedroom")
    // From the coarse to the detail: on or off, the mode, then how fast.
    expect(entry.controls.map((c) => c.part)).toEqual(["Power", "Preset", "Speed", "Direction", "Oscillation"])
    const rect = { x: 10, y: 20, width: 300, height: 160 }
    const built = buildEntry({
      entry,
      rect,
      palette,
      options: { label: "Bedroom Fan", look: "", icon: null, parts: [{ control: 1, look: "buttons" }, { control: 2, look: "slider" }] },
    })
    // No «Preset» or «Speed» beside them: the buttons and the value say it.
    expect(built.objects.map((o) => [o.type, o.properties.text])).toEqual([
      ["text", "Bedroom Fan"],
      ["button-group", undefined],
      ["slider", undefined],
    ])
    const [name, presets, slider] = built.objects
    expect(slider.properties).toMatchObject({
      topic: "bedroom_fan/speed/percentage_state",
      writeTopic: "bedroom_fan/speed/percentage",
      calibrationPoints: [{ value: 1, barSizePercent: 0 }, { value: 10, barSizePercent: 100 }],
    })
    expect(presets.properties).toMatchObject({ topic: "bedroom_fan/preset/preset_mode_state", writeTopic: "bedroom_fan/preset/preset_mode" })
    expect(presets.properties.states.map((st: { readValue: string }) => st.readValue)).toEqual(["auto", "smart", "whoosh", "eco", "breeze"])
    // Top to bottom, inside what was dragged.
    expect(name.y).toBe(rect.y)
    expect(presets.y).toBeGreaterThan(name.y)
    expect(slider.y).toBeGreaterThan(presets.y)
    // Each control as wide as what was dragged, now that no label takes a share.
    expect(slider.x).toBe(rect.x)
    expect(slider.width).toBe(rect.width)
    expect(slider.y + slider.height).toBeLessThanOrEqual(rect.y + rect.height)
    expect(built.topics.map((t) => t.topic)).toEqual([
      "bedroom_fan/preset/preset_mode_state",
      "bedroom_fan/preset/preset_mode",
      "bedroom_fan/speed/percentage_state",
      "bedroom_fan/speed/percentage",
    ])
    // One part ticked is placed as a single control is, under the entry's name.
    const one = buildEntry({ entry, rect, palette, options: { label: "Bedroom Fan", look: "", icon: null, parts: [{ control: 1, look: "buttons" }] } })
    expect(one.objects.map((o) => [o.type, o.properties.text])).toEqual([["text", "Bedroom Fan"], ["button-group", undefined]])
  })

  test("two parts reading fields of one JSON topic declare it once, with both fields", () => {
    const entry: CatalogEntry = {
      id: "light hall",
      component: "light",
      name: "Hall",
      label: "Hall",
      controls: [
        { kind: "switch", read: "hall#state", write: "hall/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" }, part: "Power" },
        { kind: "level", read: "hall#brightness", write: "hall/brightness/set", min: 0, max: 255, step: 1, part: "Brightness" },
      ],
    }
    const built = buildEntry({
      entry,
      rect: { x: 0, y: 0, width: 300, height: 160 },
      palette,
      options: { label: "Hall", look: "", icon: null, parts: [{ control: 0, look: "switch" }, { control: 1, look: "slider" }] },
    })
    const hall = built.topics.filter((t) => t.topic === "hall")
    expect(hall).toHaveLength(1)
    expect(hall[0].subtopics?.map((sub) => sub.path)).toEqual(["state", "brightness"])
  })
})

// Block plan Task 6b: the Block menu lists what the broker's discovery
// configs announce, by device; what cannot be placed greyed out with why.
// Each test reads under a prefix of its own, so configs other tests or runs
// left on the broker do not show up. Needs `npm run hil:broker`.
test.describe("the Block menu's catalog", () => {
  function fixturePayload(name: string) {
    return JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ha-discovery", `${name}.json`), "utf8")).payload
  }
  async function useBroker(page: Page, websocketUrl: string, discoveryPrefix: string) {
    await page.addInitScript(
      ([url, prefix]) => window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url, discoveryPrefix: prefix })),
      [websocketUrl, discoveryPrefix],
    )
  }

  test("lists a switch and a sensor under their devices, and an unsupported config greyed out with its reason", async ({ page }, testInfo) => {
    const prefix = `e2e-catalog-${testInfo.testId}`
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
      await useBroker(page, BROKER_URL, prefix)
      await loadProject(page, COMBINED_TEST_PROJECT)
      await page.getByRole("button", { name: "Block", exact: true }).click()

      const plug = page.locator('[data-testid="block-catalog-device"][data-device="Kitchen plug"]')
      await expect(plug.getByRole("menuitem", { name: "Kitchen plug" })).toBeEnabled()
      const sensors = page.locator('[data-testid="block-catalog-device"][data-device="van-sensors"]')
      await expect(sensors.getByRole("menuitem", { name: "Cabin temperature" })).toBeEnabled()
      const interval = sensors.locator('[data-entry-id="sensor van-sensors interval"]')
      await expect(interval).toHaveAttribute("aria-disabled", "true")
      await expect(interval).toContainText("Not supported: the value template: arithmetic (/ 1000)")
    } finally {
      for (const [topic] of configs) await publish(client, topic, "")
      client.end()
    }
  })

  test("says so when nothing announces itself under the prefix", async ({ page }, testInfo) => {
    await useBroker(page, BROKER_URL, `e2e-catalog-empty-${testInfo.testId}`)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Block", exact: true }).click()
    // An empty prefix is given up on after the 5 s a broker gets to answer.
    await expect(page.getByTestId("block-catalog-status")).toContainText("Nothing announces itself under e2e-catalog-empty-", { timeout: 10_000 })
  })

  test("without a broker the menu says so and offers nothing from it", async ({ page }) => {
    await useBroker(page, "ws://localhost:1", "homeassistant")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Block", exact: true }).click()
    await expect(page.getByTestId("block-catalog-status")).toContainText("No broker at ws://localhost:1", { timeout: 10_000 })
    await expect(page.locator('[data-testid="block-catalog-device"]')).toHaveCount(0)
  })
})
