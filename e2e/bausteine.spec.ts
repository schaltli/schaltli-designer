import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import JSZip from "jszip"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { COMBINED_TEST_PROJECT, clickButton0, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN, asPlaceholders } from "./helpers"
import { seedRoundFixtureDdf, seedWaveshare4v3bDdf } from "./ddf-seed"
import { blockFont, buildEntry, buildFromCatalog, catalogLooks, blockIconAssetId, measureBlockText, blockRow, blockTable } from "../lib/bausteine"
import { isSnapTable, snapCellOf } from "../lib/snap-table"
import { expandConfig, toCatalogEntry, type CatalogEntry } from "../lib/ha-discovery"
import { readDescription } from "../lib/block-description"
import { layoutObjects } from "../lib/layout"
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

// A table put together by snapping, as the type standing in each cell, «row/column».
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byCell = (table: any) =>
  Object.fromEntries((table.children ?? []).map((c: any) => [`${snapCellOf(c).row}/${snapCellOf(c).column}`, c.type]))
// A block of several parts in one column: its parts top to bottom, in the
// Control column, its last (docs/2026-10-09-snap-tables.md).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const partsOf = (block: any): any[] => {
  const last = Math.max(...block.children.map((c: any) => snapCellOf(c).column))
  return block.children.filter((c: any) => snapCellOf(c).column === last).sort((a: any, b: any) => snapCellOf(a).row - snapCellOf(b).row)
}

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
      ([url, p]) =>
        window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url, discoveryPrefix: p, blocksPrefix: `${p}-blocks` })),
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

  test("a switch entry: its name and its buttons as a table of one row, its topics declared with the broker's value first", async ({ page }, testInfo) => {
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

      // A block of one part is a row (docs/2026-10-09-snap-tables.md, module
      // snap-table-blocks): let go away from any table, a table of its own,
      // open, its name chosen. A switch is always buttons, «An» and «Aus»
      // (decided 2026-10-01).
      const tables = (await savedScreen(page)).objects.filter(isSnapTable)
      expect(tables).toHaveLength(1)
      expect(byCell(tables[0])).toEqual({ "0/0": "text", "0/1": "button-group" })
      await expect(page.locator("h3").first()).toContainText("Text")

      const topics = await topicsInSettings(page, ["zigbee2mqtt/Kitchen plug", "zigbee2mqtt/Kitchen plug/set"])
      expect(topics["zigbee2mqtt/Kitchen plug"]).toEqual({ type: "json", examples: '{"state":"OFF"}' })
      expect(topics["zigbee2mqtt/Kitchen plug/set"]).toEqual({ type: "text", examples: "ON, OFF" })
    } finally {
      await clear()
    }
  })

  test("the look chosen in the dialog is the one placed; a switch has no choice, it is buttons", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug", "z2m-number-calibration"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Kitchen plug")
      await expect(page.getByRole("radiogroup", { name: "Look" })).toHaveCount(0)
      await page.keyboard.press("Escape")
      await pick(page, "Local temperature calibration")
      await expect(page.getByTestId("baustein-look-slider")).toHaveAttribute("aria-checked", "true")
      await page.getByTestId("baustein-look-dial").click()
      await page.getByTestId("baustein-insert").click()
      await drag(page, [60, 100], [300, 320])
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"][title^="dial "]')).toHaveCount(1)
    } finally {
      await clear()
    }
  })

  // An old table (docs/2026-10-02-layout-tables.md), which takes no block
  // any more (docs/2026-10-09-snap-tables.md, module snap-table-blocks).
  async function withTable(testInfo: { outputPath: (name: string) => string }): Promise<string> {
    const zip = await JSZip.loadAsync(await readFile(SWITCH_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens[0].objects.push({
      id: "the-table",
      type: "table",
      x: 60,
      y: 60,
      width: 240,
      height: 200,
      zIndex: 50,
      properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: 1 },
      children: [],
    })
    zip.file("project.json", JSON.stringify(project))
    const out = testInfo.outputPath("with-table.zip")
    await mkdir(path.dirname(out), { recursive: true })
    await writeFile(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }
  async function clickAt(page: Page, x: number, y: number) {
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, x, y, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(p.x, p.y)
    await page.mouse.move(p.x + 1, p.y + 1)
    await page.mouse.click(p.x + 1, p.y + 1)
  }
  async function savedScreen(page: Page) {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
    return JSON.parse(await (await JSZip.loadAsync(await readFile(await download.path()))).file("project.json")!.async("string")).screens[0]
  }
  // The one table put together by snapping on the screen.
  const snapTableOf = async (page: Page) => (await savedScreen(page)).objects.find(isSnapTable)
  // The armed block carried from low on the screen to just under `table`,
  // and let go there: in as a row.
  async function carryUnder(page: Page, table: { x: number; y: number; width: number; height: number }) {
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 180, 300, ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, table.x + table.width / 2, table.y + table.height + 4, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
  }

  // The checkpoint of the old tables (docs/2026-10-02-layout-tables.md), on
  // the new: three blocks one under the other stand as one table, names on
  // one edge and switches on another.
  test("three switch blocks dropped one under the other: one table, names and switches flush", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page)
      for (let i = 0; i < 3; i++) {
        await pick(page, "Kitchen plug")
        await page.getByTestId("baustein-insert").click()
        if (i === 0) await clickAt(page, 180, 100)
        else await carryUnder(page, await snapTableOf(page))
      }
      const objects = (await savedScreen(page)).objects
      const tables = objects.filter(isSnapTable)
      expect(tables).toHaveLength(1)
      expect(byCell(tables[0])).toEqual({ "0/0": "text", "0/1": "button-group", "1/0": "text", "1/1": "button-group", "2/0": "text", "2/1": "button-group" })
      const edges = (type: string) => new Set(tables[0].children.filter((c: { type: string }) => c.type === type).map((c: { x: number }) => c.x))
      expect(edges("text").size).toBe(1)
      expect(edges("button-group").size).toBe(1)
    } finally {
      await clear()
    }
  })

  // Seen 2026-10-10: with the first block's table still open, a block of
  // several parts went into it as a child without a cell and broke it.
  test("a block of several parts drawn while a table is open lies beside it, the table untouched", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug", "ha-docs-fan-bedroom"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page)
      await pick(page, "Kitchen plug")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 180, 70)
      const table = await snapTableOf(page)
      await pick(page, "Bedroom Fan")
      await page.getByTestId("baustein-insert").click()
      await drag(page, [60, 140], [300, 320])
      const objects = (await savedScreen(page)).objects
      expect(byCell(objects.find((o: { id: string }) => o.id === table.id))).toEqual({ "0/0": "text", "0/1": "button-group" })
      // The fan a table of its own on the screen, beside it.
      expect(objects.filter((o: { type: string }) => o.type === "table")).toHaveLength(2)
    } finally {
      await clear()
    }
  })

  // docs/2026-10-09-snap-tables.md: a block of several parts is a table of
  // its own and is never inserted into another - carried onto one and let
  // go, it lies there free.
  test("a block of several parts carried onto a table goes into none: a table of its own where it was let go", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug", "ha-docs-fan-bedroom"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page)
      await pick(page, "Kitchen plug")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 180, 70)
      const table = await snapTableOf(page)
      await pick(page, "Bedroom Fan")
      await page.getByTestId("baustein-insert").click()
      const { box, canvas } = await getMainCanvas(page)
      const from = devicePoint(box, 180, 300, ROUND_FIXTURE_SCREEN)
      const to = devicePoint(box, table.x + table.width / 2, table.y + table.height / 2, ROUND_FIXTURE_SCREEN)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 10 })
      // Nothing shows where it would go: it goes nowhere.
      expect(await canvas.getAttribute("data-row-drop")).toBeNull()
      await page.mouse.up()
      const tables = (await savedScreen(page)).objects.filter(isSnapTable)
      expect(tables).toHaveLength(2)
      expect(byCell(tables.find((t: { id: string }) => t.id === table.id))).toEqual({ "0/0": "text", "0/1": "button-group" })
      const fan = tables.find((t: { id: string }) => t.id !== table.id)
      expect(partsOf(fan).map((c: { type: string }) => c.type)).toContain("slider")
      // Its middle where it was let go.
      expect(Math.abs(fan.x + fan.width / 2 - (table.x + table.width / 2))).toBeLessThanOrEqual(2)
    } finally {
      await clear()
    }
  })

  test("a project with an old table opens without it; a block clicked where it stood lies as a table of its own", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page, await withTable(testInfo))
      await pick(page, "Kitchen plug")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 150, 60)
      const objects = (await savedScreen(page)).objects
      // Old tables dissolve on load (docs/2026-10-09-snap-tables.md, module
      // old-table-removal); this one held nothing.
      expect(objects.find((o: { id: string }) => o.id === "the-table")).toBeUndefined()
      expect(byCell(objects.find(isSnapTable))).toEqual({ "0/0": "text", "0/1": "button-group" })
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

  test("an entry with several parts: all of them placed, a look asked only where a part has more than one", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["ha-docs-fan-bedroom"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Bedroom Fan")
      // No parts to tick (decided 2026-10-01): what is not wanted is deleted on the screen.
      await expect(page.getByRole("checkbox")).toHaveCount(0)
      // A look only for the speed, slider or dial; switches and presets are buttons.
      await expect(page.locator('[data-testid^="baustein-part-"][data-testid$="-look-slider"]')).toHaveCount(1)
      await expect(page.getByTestId("baustein-part-2-look-slider")).toHaveAttribute("aria-checked", "true")
      // Every part's topics.
      await expect(page.getByTestId("baustein-chosen")).toContainText("bedroom_fan/on/set")
      await expect(page.getByTestId("baustein-chosen")).toContainText("bedroom_fan/speed/percentage")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 180, 180)

      // A table of its own (docs/2026-10-09-snap-tables.md): the name, and
      // beside it the five controls without a label each, one below the
      // other in the Control column.
      const block = (await savedScreen(page)).objects.find(isSnapTable)
      expect(partsOf(block).map((c: { type: string }) => c.type).sort()).toEqual(["button-group", "button-group", "button-group", "button-group", "slider"])
      const name = block.children.find((c: { type: string }) => c.type === "text")
      expect(name.properties.cell).toMatchObject({ row: 0, alignY: "top" })
      const topics = await topicsInSettings(page, ["bedroom_fan/speed/percentage", "bedroom_fan/preset/preset_mode", "bedroom_fan/on/set"])
      expect(Object.keys(topics).sort()).toEqual(["bedroom_fan/on/set", "bedroom_fan/preset/preset_mode", "bedroom_fan/speed/percentage"])
    } finally {
      await clear()
    }
  })

  // bridge-blocks Task 3: a description of somebody else's device, read
  // beside the Home Assistant configs - under a blocks prefix of this test's
  // own, so the others on the shared broker never see it.
  test("a block description: listed in place of the entry it covers, placed with its parts and its switcher", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["node-red-garden-pump-power"])
    const blocksPrefix = `e2e-blocks-${testInfo.testId}`
    const description = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "block-descriptions", "garden-pump.json"), "utf8"))
    const topic = `${blocksPrefix}/garden-pump/config`
    const client = await connectBroker()
    await publish(client, topic, JSON.stringify(description.payload))
    await page.addInitScript((prefix) => {
      const key = "schaltli-mqtt-connection"
      const stored = JSON.parse(window.localStorage.getItem(key) || "{}")
      window.localStorage.setItem(key, JSON.stringify({ ...stored, blocksPrefix: prefix }))
    }, blocksPrefix)
    try {
      await openOnRoundDevice(page)
      await page.getByRole("button", { name: "Block", exact: true }).click()
      const pump = page.locator('[data-testid="block-catalog-device"][data-device="Garden pump"]')
      await expect(pump.getByRole("menuitem", { name: "Garden pump", exact: true })).toBeEnabled()
      // The Home Assistant switch it covers is not listed.
      await expect(pump.getByRole("menuitem")).toHaveCount(1)
      await pump.getByRole("menuitem", { name: "Garden pump", exact: true }).click()
      await expect(page.getByRole("dialog")).toContainText("Insert Garden pump")
      await expect(page.getByTestId("baustein-chosen")).toContainText("garden/pump/runtime/set")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 180, 180)

      const block = (await savedScreen(page)).objects.find(isSnapTable)
      // The Control column, after the icon and the name.
      const rows = partsOf(block)
      expect(rows.map((c: { type: string }) => c.type)).toEqual(["button-group", "button-group", "switcher"])
      expect(rows[0].properties.states.map((s: { label: string }) => s.label)).toEqual(["Aus", "Ein"])
      const switcher = rows[2]
      expect(switcher.properties.topic).toBe("garden/pump/mode")
      expect(switcher.children.map((p: any) => p.properties.comparisonValue)).toEqual(["timer", "manual"])
    } finally {
      await publish(client, topic, "")
      client.end(true)
      await clear()
    }
  })

  // docs/2026-10-05-autoterm-block.md: a description's sections, one
  // checkbox each, all ticked; a part without a section always comes.
  test("a description's sections: a checkbox each, all ticked; one unticked leaves its parts out", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, [])
    const blocksPrefix = `e2e-blocks-${testInfo.testId}`
    const topic = `${blocksPrefix}/stove/config`
    const client = await connectBroker()
    await publish(
      client,
      topic,
      JSON.stringify({
        version: 1,
        name: "Stove",
        device: { identifiers: ["e2e-stove"], name: "Stove" },
        parts: [
          { name: "Mode", kind: "choice", state_topic: "stove/mode", command_topic: "stove/mode/set", options: ["off", "on"] },
          { name: "State", kind: "text", state_topic: "stove/state", section: "State", small: true },
          { name: "Voltage", kind: "value", state_topic: "stove/volt", unit_of_measurement: "V", section: "Supply" },
          { name: "Current", kind: "value", state_topic: "stove/amps", unit_of_measurement: "A", section: "Supply" },
          { name: "Reset", kind: "button", command_topic: "stove/reset", size: "xs" },
        ],
      }),
    )
    await page.addInitScript((prefix) => {
      const key = "schaltli-mqtt-connection"
      const stored = JSON.parse(window.localStorage.getItem(key) || "{}")
      window.localStorage.setItem(key, JSON.stringify({ ...stored, blocksPrefix: prefix }))
    }, blocksPrefix)
    try {
      await openOnRoundDevice(page)
      await pick(page, "Stove")
      const state = page.getByTestId("baustein-section-State").getByRole("checkbox")
      const supply = page.getByTestId("baustein-section-Supply").getByRole("checkbox")
      await expect(state).toBeChecked()
      await expect(supply).toBeChecked()
      await supply.uncheck()
      await expect(supply).not.toBeChecked()
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 180, 180)

      const rows = partsOf((await savedScreen(page)).objects.find(isSnapTable))
      expect(rows.map((c: { type: string; properties: { text?: string } }) => [c.type, asPlaceholders(c)])).toEqual([
        ["button-group", undefined],
        ["text", "State {topic:stove/state}"],
        ["button", "Reset"],
      ])
      // A button the description sizes XS comes in XS, not M.
      expect(rows[2]).toMatchObject({ type: "button", properties: { text: "Reset", sizeStep: "xs" } })
      expect(rows[2].properties.blockSizeStep).toBeUndefined()
      // Set small: in the Caption style, not the Label.
      expect(rows[1].properties.textStyle).toBe("caption")
      expect(rows[1].properties.blockTextStyle).toBeUndefined()
    } finally {
      await publish(client, topic, "")
      client.end(true)
      await clear()
    }
  })

  // A description's buttons with icons of their own (the bridge's theme,
  // 2026-10-04): loaded by the dialog, on the buttons, in the project once.
  test("a description's button icons come with the block", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, [])
    const blocksPrefix = `e2e-icons-${testInfo.testId}`
    const topic = `${blocksPrefix}/theme/config`
    const client = await connectBroker()
    await publish(
      client,
      topic,
      JSON.stringify({
        version: 1,
        name: "Theme",
        device: { identifiers: ["e2e-icons"], name: "E2E icons" },
        parts: [
          {
            kind: "switch",
            state_topic: "e2e/theme",
            command_topic: "e2e/theme/set",
            payload_on: { value: "dark", label: "Dunkel", icon: "mdi:weather-night" },
            payload_off: { value: "light", label: "Hell", icon: "mdi:weather-sunny" },
          },
        ],
      }),
    )
    await page.addInitScript((prefix) => {
      const key = "schaltli-mqtt-connection"
      const stored = JSON.parse(window.localStorage.getItem(key) || "{}")
      window.localStorage.setItem(key, JSON.stringify({ ...stored, blocksPrefix: prefix }))
    }, blocksPrefix)
    try {
      await openOnRoundDevice(page)
      await pick(page, "Theme")
      await page.getByTestId("baustein-insert").click()
      await drag(page)
      const screen = await savedScreen(page)
      const flat = (list: any[]): any[] => list.flatMap((o) => [o, ...flat(o.children ?? [])])
      const buttons = flat(screen.objects).find((o) => o.type === "button-group" && o.properties.topic === "e2e/theme")
      expect(buttons.properties.states.map((s: any) => [s.label, s.iconAssetId])).toEqual([
        ["Hell", "baustein-icon-mdi-weather-sunny"],
        ["Dunkel", "baustein-icon-mdi-weather-night"],
      ])
      await page.getByRole("button", { name: "File" }).click()
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
      const saved = JSON.parse(await (await JSZip.loadAsync(await readFile(await download.path()))).file("project.json")!.async("string"))
      const ids = saved.assets.map((a: any) => a.id)
      expect(ids).toEqual(expect.arrayContaining(["baustein-icon-mdi-weather-sunny", "baustein-icon-mdi-weather-night"]))
    } finally {
      await publish(client, topic, "")
      client.end(true)
      await clear()
    }
  })

  // Reported 2026-10-03: a block on a free screen, then the same block
  // under it - the first came out smaller. Both at M, a row each.
  test("a block let go free is as large as the same block put into its table: both at M", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-number-calibration"])
    try {
      await openOnRoundDevice(page)
      const place = async () => {
        await pick(page, "Local temperature calibration")
        await page.getByRole("button", { name: "None", exact: true }).click()
        await page.getByTestId("baustein-insert").click()
      }
      await place()
      await drag(page)
      await place()
      await carryUnder(page, await snapTableOf(page))
      const table = await snapTableOf(page)
      const rows = [0, 1].map((row) =>
        table.children.filter((c: { properties: { cell: { row: number } } }) => c.properties.cell.row === row),
      )
      const looks = rows.map((row) =>
        row.map((c: { type: string; height: number; properties: { fontId?: string; sizeStep?: string } }) => [c.type, c.height, c.properties.fontId, c.properties.sizeStep]),
      )
      expect(looks[1]).toEqual(looks[0])
      expect(rows[0].find((c: { type: string }) => c.type === "slider").properties.sizeStep).toBe("m")
    } finally {
      await clear()
    }
  })

  // Reported 2026-10-03, same setup with the icon: the third block's label
  // was missing. Now each block is a row of the one table, its icon, name
  // and slider in the columns of their kind - and one without an icon
  // leaves the icon cell empty.
  test("blocks with an icon, one under the other: a row each, icon, name and slider in their columns; one without an icon leaves its cell empty", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-number-calibration"])
    try {
      await openOnRoundDevice(page)
      const place = async (icon: boolean) => {
        await pick(page, "Local temperature calibration")
        if (!icon) await page.getByRole("button", { name: "None", exact: true }).click()
        await page.getByTestId("baustein-insert").click()
      }
      await place(true)
      await drag(page)
      await place(true)
      await carryUnder(page, await snapTableOf(page))
      await place(false)
      await carryUnder(page, await snapTableOf(page))
      expect(byCell(await snapTableOf(page))).toEqual({
        "0/0": "icon",
        "0/1": "text",
        "0/2": "slider",
        "1/0": "icon",
        "1/1": "text",
        "1/2": "slider",
        "2/1": "text",
        "2/2": "slider",
      })
    } finally {
      await clear()
    }
  })

  // Reported 2026-10-03 on the 4.3B: of two Restart blocks the second had
  // no icon, so its button was narrower - Insert was clicked while the icon
  // was still being looked for, and the block went without it.
  test("Insert clicked while the icon is still being looked for waits for it", async ({ page }, testInfo) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route("https://api.iconify.design/search**", async (route) => {
      await held
      await route.fulfill({ json: { icons: ["mdi:restart"] } })
    })
    const clear = await onBroker(page, testInfo.testId, ["esphome-button-restart"])
    try {
      await openOnRoundDevice(page)
      await pick(page, "Restart")
      await page.getByTestId("baustein-insert").click()
      // Still looking: the dialog waits, and says so.
      await expect(page.getByTestId("baustein-insert")).toHaveText("Waiting for icon…")
      release()
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await drag(page)
      const button = (await savedScreen(page)).objects
        .flatMap((o: { type: string; children?: unknown[] }) => (o.type === "table" ? (o.children as { type: string; properties: { iconAssetId?: string | null } }[]) : [o]))
        .find((o: { type: string }) => o.type === "button")
      expect(button.properties.iconAssetId).toBeTruthy()
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

  test("a switch: the name as fixed text, buttons reading its JSON field, An and Aus", () => {
    const entry = catalogEntry("z2m-switch-plug")
    // Always buttons (decided 2026-10-01).
    expect(catalogLooks(entry.controls[0]).map((l) => l.id)).toEqual(["buttons"])
    const built = build("z2m-switch-plug")
    const [label, control] = built.objects
    expect(label).toMatchObject({ type: "text", properties: { text: "Kitchen plug" } })
    expect(control).toMatchObject({
      type: "button-group",
      properties: {
        topic: "zigbee2mqtt/Kitchen plug#state",
        writeTopic: "zigbee2mqtt/Kitchen plug/set",
        states: [
          { id: "off", label: "Aus", readValue: "OFF", writeValue: "OFF" },
          { id: "on", label: "An", readValue: "ON", writeValue: "ON" },
        ],
      },
    })
    expect(built.topics).toEqual([
      { topic: "zigbee2mqtt/Kitchen plug", type: "json", examples: ['{"state":"ON"}'], subtopics: [{ id: "sub-state", path: "state", type: "text" }] },
      { topic: "zigbee2mqtt/Kitchen plug/set", type: "text", examples: ["ON", "OFF"] },
    ])
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
    const state = buildFromCatalog({ entry: shelly, control: shelly.controls[0], rect: RECT, palette }).objects[1]
    expect(state.type).toBe("text")
    expect(asPlaceholders(state)).toBe("{topic:shellyplus1pm-441793a1b2c3/status/switch:0#output}")
  })

  test("a value: a number with its unit, and a bar or gauge only where it is a fill", () => {
    const entry = catalogEntry("esphome-sensor-temperature")
    expect(catalogLooks(entry.controls[0]).map((l) => l.id)).toEqual(["number"])
    const built = build("esphome-sensor-temperature")
    expect(built.objects[1].type).toBe("text")
    expect(asPlaceholders(built.objects[1])).toBe("{topic:van-sensors/sensor/cabin_temperature/state} °C")
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
    expect(built.objects.map((o) => o.type)).toEqual(["icon", "text", "button-group"])
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

  // docs/2026-10-05-autoterm-block.md: a text as it comes, a level's fill on
  // the measured value with the handle on the setpoint, and what is only read
  // named in its row.
  test("a text, a value named in its row, and a dial whose fill is measured and whose handle is the setpoint", () => {
    const entry: CatalogEntry = {
      id: "block stove",
      component: "block",
      name: "Stove",
      label: "Stove",
      controls: [
        { kind: "text", read: "stove/fault" },
        { kind: "level", part: "Target", read: "stove/target", current: "room/temp", write: "stove/target/set", min: 5, max: 30, step: 1, unit: "°C" },
        { kind: "value", part: "Voltage", read: "stove/volt", unit: "V", level: false },
        { kind: "text", part: "Used", read: "stove/used" },
      ],
    }
    expect(catalogLooks(entry.controls[0]).map((l) => l.id)).toEqual(["text"])
    const rect = { x: 10, y: 20, width: 300, height: 240 }
    const built = buildEntry({
      entry,
      rect,
      palette,
      options: { label: "Stove", look: "", icon: null, parts: entry.controls.map((c, i) => ({ control: i, look: c.kind === "level" ? "dial" : c.kind === "value" ? "number" : "text" })) },
      reported: { "stove/fault": "" },
    })
    const [, fault, dial, voltage, used] = built.objects
    // A text without a name is the text alone; one with a name says it first.
    expect(fault).toMatchObject({ type: "text", width: rect.width })
    expect(asPlaceholders(fault)).toBe("{topic:stove/fault}")
    expect(asPlaceholders(used)).toBe("Used {topic:stove/used}")
    // A value says what it is: «Voltage 13.3 V», not «13.3 V».
    expect(asPlaceholders(voltage)).toBe("Voltage {topic:stove/volt} V")
    expect(dial).toMatchObject({
      type: "dial",
      properties: { topic: "room/temp", setpointTopic: "stove/target", writeTopic: "stove/target/set" },
    })
    expect(built.topics.map((t) => [t.topic, t.type])).toEqual([
      ["stove/fault", "text"],
      ["room/temp", "numeric"],
      ["stove/target", "numeric"],
      ["stove/target/set", "numeric"],
      ["stove/volt", "numeric"],
      ["stove/used", "text"],
    ])
    // The broker's empty fault is its example: nothing to show is a value too.
    expect(built.topics[0].examples).toEqual([""])
    // Without a measured value the level is as before: the setpoint fills it.
    const plain = { kind: "level", read: "stove/target", write: "stove/target/set", min: 5, max: 30, step: 1 } as const
    const alone = buildFromCatalog({ entry: { ...entry, controls: [plain] }, control: plain, rect: RECT, palette, options: { look: "dial" } }).objects[1]
    expect(alone.properties.topic).toBe("stove/target")
    expect(alone.properties.setpointTopic).toBeUndefined()
  })

  // Asked 2026-10-05 for a wide screen: a part without a column spans the
  // block, a run of parts in columns 1 and 2 stands side by side - two
  // Control columns of the block's table (docs/2026-10-09-snap-tables.md),
  // the last of the shorter side over the rows the other needs more.
  test("parts in two columns: one across both, then the two side by side, the shorter side's last over the rest", () => {
    const entry: CatalogEntry = {
      id: "block wide",
      component: "block",
      name: "Wide",
      label: "Wide",
      controls: [
        { kind: "choice", part: "Mode", read: "w/mode", write: "w/mode/set", options: ["off", "on"] },
        { kind: "level", part: "Level", read: "w/level", write: "w/level/set", min: 0, max: 10, step: 1, column: 1 },
        { kind: "value", part: "Volt", read: "w/volt", unit: "V", level: false, column: 2 },
        { kind: "text", part: "State", read: "w/state", column: 2 },
      ],
    }
    const parts = entry.controls.map((c, i) => ({ control: i, look: c.kind === "level" ? "dial" : catalogLooks(c)[0].id }))
    const built = buildEntry({ entry, rect: { x: 0, y: 0, width: 600, height: 300 }, palette, font: { id: "f", size: 20 }, options: { label: "Wide", look: "", icon: null, parts } })
    expect(built.partColumns).toEqual([0, 1, 2, 2])
    let next = 0
    const withIds = (o: any): any => ({ ...o, id: o.id || `w${next++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
    const [laid] = layoutObjects([withIds(blockTable(built))], { pixelsPerMm: 6 })
    expect(isSnapTable(laid)).toBe(true)
    const cells = (t: any) => (t.children ?? []).map((c: any) => [c.type, snapCellOf(c).row, snapCellOf(c).column, snapCellOf(c).rowSpan, snapCellOf(c).columnSpan])
    expect(cells(laid)).toEqual([
      ["text", 0, 0, 1, 1],
      ["button-group", 0, 1, 1, 2],
      ["dial", 1, 1, 2, 1],
      ["text", 1, 2, 1, 1],
      ["text", 2, 2, 1, 1],
    ])
    expect(laid.children!.slice(3).map((c: any) => asPlaceholders(c))).toEqual(["Volt {topic:w/volt} V", "State {topic:w/state}"])
    // A dial as a part is six lines of the block's font (120), put on its
    // track's grid - not a row's height.
    const dial = laid.children!.find((c: any) => c.type === "dial")!
    expect(dial.width).toBeGreaterThanOrEqual(90)
    expect(dial.width).toBeLessThanOrEqual(120)
    // A new row starts another pair below.
    const rowed: CatalogEntry = {
      ...entry,
      controls: [
        ...entry.controls,
        { kind: "text", part: "Used", read: "w/used", column: 1, row: "b" },
        { kind: "button", part: "Reset", write: "w/reset", payload: "reset", column: 2, row: "b" },
      ],
    }
    const rowedParts = rowed.controls.map((c, i) => ({ control: i, look: c.kind === "level" ? "dial" : catalogLooks(c)[0].id }))
    const two = buildEntry({ entry: rowed, rect: { x: 0, y: 0, width: 600, height: 300 }, palette, font: { id: "f", size: 20 }, options: { label: "Wide", look: "", icon: null, parts: rowedParts } })
    const [laidTwo] = layoutObjects([withIds(blockTable(two))], { pixelsPerMm: 6 })
    expect(cells(laidTwo).slice(5)).toEqual([
      ["text", 3, 1, 1, 1],
      ["button", 3, 2, 1, 1],
    ])

    // Without a column anywhere: one column, as before.
    const one = buildEntry({ entry: { ...entry, controls: entry.controls.map(({ column: _c, ...c }) => c as typeof c) }, rect: { x: 0, y: 0, width: 600, height: 300 }, palette, options: { label: "Wide", look: "", icon: null, parts } })
    expect(one.partColumns).toBeUndefined()
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

  // A block of one part is a row of its icon, name and control, placed as a
  // row template is; one of several parts a table of its own: its icon and
  // name in the first row, at the top, its parts one below the other in the
  // Control column, each filling its width (docs/2026-10-09-snap-tables.md,
  // module snap-table-blocks).
  test.describe("a block is a row, or a table of its own", () => {
    const build = (label: string, extra: Partial<Parameters<typeof buildEntry>[0]["options"]> = {}, name = "z2m-switch-plug") =>
      buildEntry({ entry: catalogEntry(name), rect: RECT, palette, options: { label, look: "", icon: null, ...extra } })
    const types = (pieces: Array<{ type: string }> | null) => pieces?.map((p) => p.type)

    test("one part: its name and control as a row; with an icon, the icon first", () => {
      expect(types(blockRow(build("Licht")))).toEqual(["text", "button-group"])
      expect(types(blockRow(build("Kaffee", { icon: { name: "mdi:coffee", data: "<svg/>", size: 24 } })))).toEqual(["icon", "text", "button-group"])
      for (const piece of blockRow(build("Licht"))!) expect(piece.properties?.cell).toBeUndefined()
    })

    test("several parts: a table of its own, the name at the top, the parts below each other in the Control column, filling it", () => {
      const fan = blockTable(build("Bedroom Fan", { parts: [{ control: 1, look: "buttons" }, { control: 2, look: "slider" }] }, "ha-docs-fan-bedroom"))
      expect(isSnapTable(fan as any)).toBe(true)
      expect(blockRow(build("Bedroom Fan", { parts: [{ control: 1, look: "buttons" }, { control: 2, look: "slider" }] }, "ha-docs-fan-bedroom"))).toBeNull()
      const cells = (fan.children ?? []).map((c) => [c.type, c.properties!.cell])
      expect(cells.slice(0, 1)).toEqual([["text", { row: 0, column: 0, alignY: "top" }]])
      expect(cells.slice(1).map(([type, cell]: any) => [type, cell.row, cell.column, cell.fill])).toEqual(
        cells.slice(1).map(([type]: any, i) => [type, i, 1, { width: true }]),
      )
      expect(cells.slice(1).map(([type]) => type)).toContain("slider")
    })

    // Asked 2026-10-03: a button names itself, so a Restart block has no
    // name; with an icon too it is the button alone.
    test("a block that is its button alone: a row of the button, with an icon too", () => {
      for (const icon of [null, { name: "mdi:restart", data: "<svg/>", size: 24 }]) {
        expect(types(blockRow(build("Restart", { icon }, "esphome-button-restart")))).toEqual(["button"])
      }
    })
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
  // Block descriptions under a prefix of the test's own too: whatever else
  // sits retained on the shared broker's schaltli/blocks stays out of it.
  async function useBroker(page: Page, websocketUrl: string, discoveryPrefix: string) {
    await page.addInitScript(
      ([url, prefix]) =>
        window.localStorage.setItem(
          "schaltli-mqtt-connection",
          JSON.stringify({ websocketUrl: url, discoveryPrefix: prefix, blocksPrefix: `${prefix}-blocks` }),
        ),
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

// A block whose parts come and go with a mode (docs/2026-10-04-bridge-blocks.md,
// bridge-blocks Task 2): the parts of a description that carry shown_when
// share one row, a switcher on their topic with a panel per value.
test.describe("a block whose parts come and go with a mode", () => {
  const RECT = { x: 10, y: 20, width: 300, height: 200 }
  const palette = controlPalette("24bit")
  function maxxfan(): CatalogEntry {
    const f = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "block-descriptions", "spec-maxxfan.json"), "utf8"))
    const result = readDescription(f.topic, JSON.stringify(f.payload))
    if (!result || !("entry" in result)) throw new Error("not an entry")
    return result.entry
  }
  const everyPart = (entry: CatalogEntry) => entry.controls.map((control, i) => ({ control: i, look: catalogLooks(control)[0].id }))
  const block = () => {
    const entry = maxxfan()
    return blockTable(buildEntry({ entry, rect: RECT, palette, options: { label: entry.label, look: "", icon: null, parts: everyPart(entry) } }))
  }
  // The block a table of its own (docs/2026-10-09-snap-tables.md): its
  // parts one below the other in its Control column.
  // Ids as the editor gives them, so the layout can tell the pieces apart.
  let next = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `o${next++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })

  test("Mode, then one switcher on the mode with an auto and a fan_only panel and none for off, then Cover and Airflow", () => {
    const parts = partsOf(block())
    expect(parts.map((c: any) => [c.type, c.properties.cell.row])).toEqual([
      ["button-group", 0],
      ["switcher", 1],
      ["button-group", 2],
      ["button-group", 3],
    ])
    const switcher = parts[1]
    expect(switcher.properties.topic).toBe("schaltli/state/maxxfan/hvac_mode")
    expect(switcher.children.map((p: any) => [p.type, p.properties.comparisonOperator, p.properties.comparisonValue])).toEqual([
      ["panel", "==", "auto"],
      ["panel", "==", "fan_only"],
    ])
    const slidersIn = (panel: any) => panel.children.flatMap((t: any) => t.children.map((c: any) => [t.type, c.type, c.properties.topic]))
    expect(slidersIn(switcher.children[0])).toEqual([["table", "slider", "schaltli/state/maxxfan/temperature"]])
    expect(slidersIn(switcher.children[1])).toEqual([["table", "slider", "schaltli/state/maxxfan/speed"]])
  })

  test("the description's words are on the buttons", () => {
    const parts = partsOf(block())
    const words = (o: any) => o.properties.states.map((s: any) => [s.label, s.readValue])
    expect(words(parts[0])).toEqual([
      ["Aus", "off"],
      ["Hand", "fan_only"],
      ["Auto", "auto"],
    ])
    expect(words(parts[2])).toEqual([
      ["Zu", "closed"],
      ["Offen", "open"],
    ])
  })

  test("the mode's topic is declared with the sliders' own", () => {
    const entry = maxxfan()
    const built = buildEntry({ entry, rect: RECT, palette, options: { label: entry.label, look: "", icon: null, parts: everyPart(entry) } })
    expect(built.topics.map((t) => t.topic)).toEqual(
      expect.arrayContaining([
        "schaltli/state/maxxfan/hvac_mode",
        "schaltli/state/maxxfan/temperature",
        "schaltli/cmnd/maxxfan/temperature",
        "schaltli/state/maxxfan/speed",
        "schaltli/cmnd/maxxfan/speed",
      ]),
    )
    expect(new Set(built.topics.map((t) => t.topic)).size).toBe(built.topics.length)
  })

  // docs/2026-10-04-block-grid.md, asked on the 4.3B: one right edge for
  // every part, the name level with the first.
  for (const pixelsPerMm of [4, 8.66]) {
    test(`on one grid at ${pixelsPerMm} px/mm: every part ends at the same right edge, the name at the top`, () => {
      const [laid] = layoutObjects([withIds(block())], { pixelsPerMm })
      const parts = partsOf(laid)
      const rights = new Set<number>(parts.map((c: any) => c.x + c.width))
      expect(rights.size).toBe(1)
      // Inside the switcher's panels too, at the switcher's right edge.
      const switcher = parts.find((c: any) => c.type === "switcher")
      for (const panel of switcher.children) for (const t of panel.children) {
        expect(new Set(t.children.map((c: any) => c.x + c.width))).toEqual(new Set([switcher.width]))
      }
      const name = (laid.children ?? []).find((c: any) => c.properties.cell.column === 0)!
      expect(name.y).toBe(0)
      expect(Math.max(...rights)).toBe(laid.width)
    })
  }

  for (const pixelsPerMm of [4, 6, 8.66]) {
    test(`laid out at ${pixelsPerMm} px/mm: each panel's slider spans the switcher, and no row runs into the next`, () => {
      const [laid] = layoutObjects([withIds(block())], { pixelsPerMm })
      const rows = partsOf(laid)
      for (let i = 0; i + 1 < rows.length; i++) expect(rows[i].y + rows[i].height).toBeLessThanOrEqual(rows[i + 1].y)
      const switcher = rows[1]
      for (const panel of switcher.children) {
        const table = panel.children[0]
        expect(table.width).toBe(switcher.width)
        const slider = table.children[0]
        expect(slider.height).toBeGreaterThan(0)
        expect(table.y + table.height).toBeLessThanOrEqual(switcher.height)
      }
    })
  }
})

test.describe("a placed block whose parts come and go with a mode", () => {
  // The block placed in a project, the ring's button bound to its switcher
  // (ring-adjust): what a press writes tells which panel the preview shows.
  test("in the preview the mode picks the slider: auto the temperature, by hand the speed, off none", async ({ page }, testInfo) => {
    const f = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "block-descriptions", "spec-maxxfan.json"), "utf8"))
    const result = readDescription(f.topic, JSON.stringify(f.payload))
    if (!result || !("entry" in result)) throw new Error("not an entry")
    const entry = result.entry
    const parts = entry.controls.map((control, i) => ({ control: i, look: catalogLooks(control)[0].id }))
    const built = buildEntry({ entry, rect: { x: 20, y: 20, width: 340, height: 240 }, palette: controlPalette("24bit"), options: { label: entry.label, look: "", icon: null, parts } })
    let next = 0
    const withIds = (o: any): any => ({ ...o, id: o.id || `mx-${next++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
    const table = withIds({ ...blockTable(built), id: "mx-block" })
    const switcherId = (function find(o: any): string | undefined {
      if (o.type === "switcher") return o.id
      for (const c of o.children ?? []) {
        const id = find(c)
        if (id) return id
      }
    })(table)!

    const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    // Laid out as the editor stores a placed block: positions are what the
    // canvas hit-tests.
    project.screens[0].objects = layoutObjects([table], { pixelsPerMm: 4 })
    // Where an object sits on the screen: its own x/y and its parents'.
    const placeOf = (id: string) => {
      const walk = (objects: any[], dx: number, dy: number): { x: number; y: number; width: number; height: number } | undefined => {
        for (const o of objects) {
          if (o.id === id) return { x: dx + o.x, y: dy + o.y, width: o.width, height: o.height }
          const inner = walk(o.children ?? [], dx + o.x, dy + o.y)
          if (inner) return inner
        }
      }
      return walk(project.screens[0].objects, 0, 0)!
    }
    const values: Record<string, string> = {
      "schaltli/state/maxxfan/hvac_mode": "auto",
      "schaltli/state/maxxfan/temperature": "20",
      "schaltli/state/maxxfan/speed": "40",
    }
    for (const topic of built.topics) {
      // A command topic starts empty, so what shows there is what a press wrote.
      const example = values[topic.topic] ?? (topic.topic.includes("/cmnd/") ? "" : (topic.examples[0] ?? ""))
      project.topics.push({ ...topic, id: `t-${topic.topic}`, examples: [example] })
    }
    zip.file("project.json", JSON.stringify(project))
    const file = testInfo.outputPath("maxxfan-block.zip")
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }))
    await loadProject(page, file)

    await page.screenshot({ path: testInfo.outputPath("maxxfan-block.png") })

    // The ring's button, on the switcher, one step down.
    await clickButton0(page)
    await page.locator("#button-10-actionType").selectOption("adjust-level")
    await page.locator("#button-10-targetObject").selectOption(switcherId)
    await page.locator("#button-10-adjustDirection").selectOption("down")
    const { box } = await getMainCanvas(page)
    await page.mouse.click(box.x + 5, box.y + 5)

    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.getByRole("button", { name: "Simulation", exact: true }).click()
    await page.waitForTimeout(300)
    const value = (name: string) =>
      page.locator("label", { hasText: new RegExp(`^${name}$`) }).first().locator("xpath=../..").locator("input, textarea").first()

    await clickButton0(page)
    await expect(value("schaltli/cmnd/maxxfan/temperature")).toHaveValue("19")
    await value("schaltli/state/maxxfan/hvac_mode").fill("fan_only")
    await value("schaltli/state/maxxfan/hvac_mode").press("Enter")
    await clickButton0(page)
    await expect(value("schaltli/cmnd/maxxfan/speed")).toHaveValue("30")
    await page.screenshot({ path: testInfo.outputPath("maxxfan-block-hand.png") })
    // A finger on the speed slider in its panel sets it, as on a device:
    // towards its high end - exactly where depends on how wide the grid lays
    // it out, so anything above the 30 the ring left.
    const speed = (function find(o: any): string | undefined {
      if (o.type === "slider" && o.properties.topic === "schaltli/state/maxxfan/speed") return o.id
      for (const c of o.children ?? []) {
        const id = find(c)
        if (id) return id
      }
    })(table)!
    const at = placeOf(speed)
    const { box: canvasBox } = await getMainCanvas(page)
    const point = devicePoint(canvasBox, at.x + at.width * 0.75, at.y + at.height / 2)
    await page.mouse.click(point.x, point.y)
    await expect(value("schaltli/cmnd/maxxfan/speed")).toHaveValue(/^(40|50|60|70|80|90|100)$/)
    const setByFinger = await value("schaltli/cmnd/maxxfan/speed").inputValue()
    await value("schaltli/state/maxxfan/hvac_mode").fill("off")
    await value("schaltli/state/maxxfan/hvac_mode").press("Enter")
    await clickButton0(page)
    await page.waitForTimeout(400)
    await expect(value("schaltli/cmnd/maxxfan/speed")).toHaveValue(setByFinger)
    await expect(value("schaltli/cmnd/maxxfan/temperature")).toHaveValue("19")
  })
})
