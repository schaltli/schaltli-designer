import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import JSZip from "jszip"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { COMBINED_TEST_PROJECT, clickButton0, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN, clickTablePlus } from "./helpers"
import { seedRoundFixtureDdf, seedWaveshare4v3bDdf } from "./ddf-seed"
import { blockFont, buildEntry, buildFromCatalog, catalogLooks, blockIconAssetId, measureBlockText, blockTable } from "../lib/bausteine"
import { mergedRows } from "../lib/table"
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

  test("a switch entry: a label and its buttons in a small table of their own, its topics declared with the broker's value first", async ({ page }, testInfo) => {
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

      // Selected as a whole: a small table (docs/2026-10-02-layout-tables.md),
      // with the label and the switch in its cells.
      await expect(page.locator("h3").first()).toContainText("Table")
      const inside = page.locator('[data-object-id][style*="padding-left: 20px"]')
      await expect(inside).toHaveCount(2)
      // A switch is always buttons, «An» and «Aus» (decided 2026-10-01).
      await expect(inside.nth(0)).toHaveAttribute("title", /^(text|button-group) /)
      await expect(inside.nth(1)).toHaveAttribute("title", /^(text|button-group) /)

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

  // Tables Task 8: a block clicked onto a table's row line is merged into
  // its rows; into an empty cell it is nested there.
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
  const WIDE = { width: 800, height: 480 }
  const WIDE_DEVICE_ID = "e2e-bausteine-4v3b"
  async function savedScreen(page: Page) {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
    return JSON.parse(await (await JSZip.loadAsync(await readFile(await download.path()))).file("project.json")!.async("string")).screens[0]
  }
  async function savedTable(page: Page) {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
    const saved = JSON.parse(await (await JSZip.loadAsync(await readFile(await download.path()))).file("project.json")!.async("string"))
    return saved.screens[0].objects.find((o: { id: string }) => o.id === "the-table")
  }

  test("onto a table's row line: its name and control merged into the table's columns", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page, await withTable(testInfo))
      await pick(page, "Kitchen plug")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 150, 60)
      const table = await savedTable(page)
      expect(table.children.map((c: { type: string; properties: { cell: { row: number; column: number } } }) => [c.type, c.properties.cell.row, c.properties.cell.column])).toEqual([
        ["text", 0, 0],
        ["button-group", 0, 1],
      ])
    } finally {
      await clear()
    }
  })

  test("into an empty cell: nested there as a small table", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page, await withTable(testInfo))
      await pick(page, "Kitchen plug")
      await page.getByTestId("baustein-insert").click()
      await clickAt(page, 200, 75)
      const table = await savedTable(page)
      expect(table.children).toHaveLength(1)
      expect(table.children[0].type).toBe("table")
      expect(table.children[0].properties.cell).toEqual({ row: 0, column: 1 })
    } finally {
      await clear()
    }
  })

  // Checkpoint C (docs/2026-10-02-layout-tables.md, success criteria): three
  // blocks into «Name and control» stand as three rows, names on one edge
  // and controls on another.
  test("three blocks into a name-and-control table: three rows, names and controls each on one edge", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      await openOnRoundDevice(page, await withTable(testInfo))
      for (let i = 0; i < 3; i++) {
        await pick(page, "Kitchen plug")
        await page.getByTestId("baustein-insert").click()
        if (i === 0) {
          // The first onto the table's top line: merged into its one row.
          await clickAt(page, 150, 60)
        } else {
          // Then on the «+» below the table (table-overlay.ts PLUS, 9 px at
          // zoom 1, a third of that below the last row, under the middle of
          // its rows): a new row at its end.
          const kids = (await savedTable(page)).children as { x: number; y: number; width: number; height: number }[]
          const right = Math.max(...kids.map((c) => c.x + c.width))
          const bottom = Math.max(...kids.map((c) => c.y + c.height))
          await clickAt(page, 60 + right / 2, 60 + bottom + 12)
        }
      }
      const children = (await savedTable(page)).children as { type: string; x: number; properties: { cell: { row: number; column: number } } }[]
      expect(children.map((c) => [c.type, c.properties.cell.row, c.properties.cell.column]).sort()).toEqual([
        ["button-group", 0, 1],
        ["button-group", 1, 1],
        ["button-group", 2, 1],
        ["text", 0, 0],
        ["text", 1, 0],
        ["text", 2, 0],
      ])
      const edges = (type: string) => new Set(children.filter((c) => c.type === type).map((c) => c.x))
      expect(edges("text").size).toBe(1)
      expect(edges("button-group").size).toBe(1)
    } finally {
      await clear()
    }
  })

  // On the 4.3B - on the Knob two blocks are wider than its screen, and the
  // first one's column takes all it needs (a share column is never narrower
  // than a table in it can be).
  test("two blocks into the cells of «Two columns» stand there whole, side by side", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-switch-plug"], { "zigbee2mqtt/Kitchen plug": '{"state":"OFF"}' })
    try {
      const zip = await withTable(testInfo)
      const loaded = await JSZip.loadAsync(await readFile(zip))
      const project = JSON.parse(await loaded.file("project.json")!.async("string"))
      const seeded = await seedWaveshare4v3bDdf(WIDE_DEVICE_ID)
      test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
      project.settings.deviceId = WIDE_DEVICE_ID
      project.screenWidth = WIDE.width
      project.screenHeight = WIDE.height
      Object.assign(project.screens[0].objects.find((o: { id: string }) => o.id === "the-table"), { x: 50, width: 700 })
      project.screens[0].objects.find((o: { id: string }) => o.id === "the-table").properties.columns = [{ width: { share: 50 } }, { width: { share: 50 } }]
      loaded.file("project.json", JSON.stringify(project))
      await writeFile(zip, await loaded.generateAsync({ type: "nodebuffer" }))
      await loadProject(page, zip)
      for (const x of [150, 550]) {
        await pick(page, "Kitchen plug")
        await page.getByTestId("baustein-insert").click()
        const { box } = await getMainCanvas(page)
        const p = devicePoint(box, x, 75, WIDE)
        await page.mouse.move(p.x, p.y)
        await page.mouse.move(p.x + 1, p.y + 1)
        await page.mouse.click(p.x + 1, p.y + 1)
      }
      const children = (await savedTable(page)).children as { type: string; children: { type: string }[]; properties: { cell: unknown } }[]
      expect(children.map((c) => c.type)).toEqual(["table", "table"])
      expect(children.map((c) => c.properties.cell)).toEqual(expect.arrayContaining([{ row: 0, column: 0 }, { row: 0, column: 1 }]))
      for (const block of children) expect(block.children.map((c) => c.type).sort()).toEqual(["button-group", "text"])
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
      await drag(page, [40, 60], [320, 320])

      // The name, and beside it the five controls without a label each, in a
      // small table of their own (one row per block, asked 2026-10-03).
      const inside = page.locator('[data-object-id][style*="padding-left: 20px"]')
      await expect(inside).toHaveCount(2)
      await expect(page.locator('[data-object-id][style*="padding-left: 20px"][title^="table "]')).toHaveCount(1)
      const block = (await savedScreen(page)).objects.find((o: { type: string }) => o.type === "table")
      const partsTable = block.children.find((c: { type: string }) => c.type === "table")
      expect(partsTable.properties.cell).toEqual({ row: 0, column: 1 })
      expect(partsTable.children.map((c: { type: string }) => c.type).sort()).toEqual(["button-group", "button-group", "button-group", "button-group", "slider"])
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
      await drag(page, [40, 60], [320, 320])

      const block = (await savedScreen(page)).objects.find((o: { type: string }) => o.type === "table")
      // The control column; the name is a table of its own too, with its icon.
      const parts = block.children.find((c: any) => c.properties.cell.column === 1)
      const rows = [...parts.children].sort((a: any, b: any) => a.properties.cell.row - b.properties.cell.row)
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

  // Reported 2026-10-03: a block on a free screen, then the same block
  // twice through the «+» below it - the first came out smaller. On a free
  // area it kept the size of the rectangle, into a table it went to M.
  test("a block on a free area is as large as the same block put into a table: both at M", async ({ page }, testInfo) => {
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
      const blockOf = async () => (await savedScreen(page)).objects.find((o: { type: string }) => o.type === "table")
      const first = await blockOf()
      await place()
      await clickTablePlus(page, first.id, ROUND_FIXTURE_SCREEN)
      const table = await blockOf()
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
  // was missing - the appended blocks went into the first one's name table,
  // whose «+» lay where the block's own table has its «+».
  test("three blocks with an icon, appended through the «+»: three rows, each its own name and control", async ({ page }, testInfo) => {
    const clear = await onBroker(page, testInfo.testId, ["z2m-number-calibration"])
    try {
      await openOnRoundDevice(page)
      const place = async () => {
        await pick(page, "Local temperature calibration")
        await page.getByTestId("baustein-insert").click()
      }
      await place()
      await drag(page)
      const blockOf = async () => (await savedScreen(page)).objects.find((o: { type: string }) => o.type === "table")
      const first = await blockOf()
      for (let i = 0; i < 2; i++) {
        await place()
        await clickTablePlus(page, first.id, ROUND_FIXTURE_SCREEN)
      }
      const table = await blockOf()
      type Piece = { type: string; properties: { cell: { row: number; column: number } }; children?: { type: string }[] }
      const rows = [0, 1, 2].map((row) => (table.children as Piece[]).filter((c) => c.properties.cell.row === row))
      for (const row of rows) {
        expect(row.map((c) => [c.type, c.properties.cell.column])).toEqual([
          ["table", 0],
          ["slider", 1],
        ])
        expect(row[0].children!.map((c) => c.type).sort()).toEqual(["icon", "text"])
      }
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

  // Layout plan Task 10: a block placed into a stack, a row or a grid.
  // Tables Task 8 (docs/2026-10-02-layout-tables.md): a block is a small
  // table - its name and control in a row, each further part in a row below
  // in the control's column; merged into a table at a row line, the target
  // keeping its columns.
  test.describe("a block is a small table", () => {
    const tableOf = (label: string, extra: Partial<Parameters<typeof buildEntry>[0]["options"]> = {}, name = "z2m-switch-plug") =>
      blockTable(buildEntry({ entry: catalogEntry(name), rect: RECT, palette, options: { label, look: "", icon: null, ...extra } }))
    const cellsOf = (t: { children?: Array<{ type: string; properties: Record<string, any> }> }) =>
      (t.children ?? []).map((c) => [c.type, c.properties.cell.row, c.properties.cell.column])

    test("its name and control in a row; with an icon the name is a table of its own", () => {
      const plain = tableOf("Licht")
      expect(plain.type).toBe("table")
      expect(plain.properties.columns).toEqual([{ width: "auto" }, { width: { share: 100 } }])
      expect(cellsOf(plain)).toEqual([
        ["text", 0, 0],
        ["button-group", 0, 1],
      ])
      const withIcon = tableOf("Kaffee", { icon: { name: "mdi:coffee", data: "<svg/>", size: 24 } })
      expect(cellsOf(withIcon)).toEqual([
        ["table", 0, 0],
        ["button-group", 0, 1],
      ])
      expect(cellsOf(withIcon.children![0] as any)).toEqual([
        ["icon", 0, 0],
        ["text", 0, 1],
      ])
    })

    // Every block one row of two columns (asked 2026-10-03), so blocks put
    // one below the other list as a table: the name left, and right the
    // control - several of them in a small table of their own, one below
    // the other.
    test("several parts: one row all the same, the parts in a small table in the control's cell", () => {
      const fan = tableOf("Bedroom Fan", { parts: [{ control: 1, look: "buttons" }, { control: 2, look: "slider" }] }, "ha-docs-fan-bedroom")
      expect(fan.properties.rows).toBe(1)
      expect(cellsOf(fan)).toEqual([
        ["text", 0, 0],
        ["table", 0, 1],
      ])
      const parts = fan.children![1] as any
      expect(parts.properties.columns).toEqual([{ width: { share: 100 } }])
      expect(cellsOf(parts)).toEqual([
        ["button-group", 0, 0],
        ["slider", 1, 0],
      ])
    })

    // Asked 2026-10-03: a button names itself, so a Restart block has no name;
    // its button stays in the control column, the name cell empty.
    test("a block that is its button alone: the button in the control column, with an icon too", () => {
      for (const icon of [null, { name: "mdi:restart", data: "<svg/>", size: 24 }]) {
        const restart = tableOf("Restart", { icon }, "esphome-button-restart")
        expect(cellsOf(restart)).toEqual([["button", 0, 1]])
        expect(mergedRows(restart, 2).map((m) => [m.object.type, m.row, m.column])).toEqual([["button", 0, 1]])
        expect(mergedRows(restart, 1).map((m) => [m.object.type, m.row, m.column])).toEqual([["button", 0, 0]])
      }
    })

    test("merged into a table: one row of its two columns; into a single column the name and the parts one below the other", () => {
      const fan = tableOf("Bedroom Fan", { parts: [{ control: 1, look: "buttons" }, { control: 2, look: "slider" }] }, "ha-docs-fan-bedroom")
      const at = (n: number) => mergedRows(fan, n).map((m) => [m.object.type, m.row, m.column])
      expect(at(2)).toEqual([
        ["text", 0, 0],
        ["table", 0, 1],
      ])
      expect(at(3)).toEqual(at(2))
      expect(at(1)).toEqual([
        ["text", 0, 0],
        ["table", 1, 0],
      ])
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
  const controlCell = (table: any) => table.children.find((c: any) => c.properties.cell.column === 1)
  // Ids as the editor gives them, so the layout can tell the pieces apart.
  let next = 0
  const withIds = (o: any): any => ({ ...o, id: o.id || `o${next++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })

  test("Mode, then one switcher on the mode with an auto and a fan_only panel and none for off, then Cover and Airflow", () => {
    const parts = controlCell(block())
    expect(parts.type).toBe("table")
    expect(parts.children.map((c: any) => [c.type, c.properties.cell.row])).toEqual([
      ["button-group", 0],
      ["switcher", 1],
      ["button-group", 2],
      ["button-group", 3],
    ])
    const switcher = parts.children[1]
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
    const parts = controlCell(block())
    const words = (o: any) => o.properties.states.map((s: any) => [s.label, s.readValue])
    expect(words(parts.children[0])).toEqual([
      ["Aus", "off"],
      ["Hand", "fan_only"],
      ["Auto", "auto"],
    ])
    expect(words(parts.children[2])).toEqual([
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

  for (const pixelsPerMm of [4, 6, 8.66]) {
    test(`laid out at ${pixelsPerMm} px/mm: each panel's slider spans the switcher, and no row runs into the next`, () => {
      const [laid] = layoutObjects([withIds(block())], { pixelsPerMm })
      const parts = controlCell(laid)
      const rows = [...parts.children].sort((a: any, b: any) => a.properties.cell.row - b.properties.cell.row)
      for (let i = 0; i + 1 < rows.length; i++) expect(rows[i].y + rows[i].height).toBeLessThanOrEqual(rows[i + 1].y)
      const switcher = rows[1]
      for (const panel of switcher.children) {
        const table = panel.children[0]
        expect(table.width).toBe(switcher.width)
        const slider = table.children[0]
        expect(slider.height).toBeGreaterThan(0)
        expect(table.y + table.height).toBeLessThanOrEqual(switcher.height)
      }
      expect(parts.properties.overflow).toBeUndefined()
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
    await page.locator("#actionType").selectOption("adjust-level")
    await page.locator("#targetObject").selectOption(switcherId)
    await page.locator("#adjustDirection").selectOption("down")
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
    // A finger on the speed slider in its panel sets it, as on a device: at
    // three quarters of its track, 70 or 80 by its step of ten.
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
    await expect(value("schaltli/cmnd/maxxfan/speed")).toHaveValue(/^(60|70|80|90)$/)
    const setByFinger = await value("schaltli/cmnd/maxxfan/speed").inputValue()
    await value("schaltli/state/maxxfan/hvac_mode").fill("off")
    await value("schaltli/state/maxxfan/hvac_mode").press("Enter")
    await clickButton0(page)
    await page.waitForTimeout(400)
    await expect(value("schaltli/cmnd/maxxfan/speed")).toHaveValue(setByFinger)
    await expect(value("schaltli/cmnd/maxxfan/temperature")).toHaveValue("19")
  })
})
