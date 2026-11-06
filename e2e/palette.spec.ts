import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import JSZip from "jszip"
import { readFileSync } from "node:fs"
import { COMBINED_TEST_PROJECT, getMainCanvas, loadProject } from "./helpers"

// The palette (docs/2026-11-06-palette.md): Parts and Prebuilt in one window
// with a search - floating over the canvas, docked beside Screens, or
// minimized to a rail of two icons; never closed altogether. Everything but
// the search text remembered per browser.
//
// The suite starts with it minimized (playwright.config.ts); these tests
// start as a new user does, with nothing remembered.
test.use({ storageState: { cookies: [], origins: [] } })

const palette = (page: Page) => page.getByTestId("palette")
const mode = async (page: Page) => (await page.locator("[data-palette-mode]").first().getAttribute("data-palette-mode")) ?? ""
async function box(page: Page) {
  return (await palette(page).boundingBox())!
}

test.describe("the palette window", () => {
  test("a new user finds it floating at the canvas's top left corner, on Parts", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(palette(page)).toBeVisible()
    expect(await mode(page)).toBe("float")
    await expect(page.getByTestId("palette-tab-parts")).toHaveAttribute("aria-pressed", "true")
    const { canvas } = await getMainCanvas(page)
    const area = (await canvas.locator("xpath=..").boundingBox())!
    const at = await box(page)
    // Inside the canvas's area, near its top left corner.
    expect(at.x).toBeGreaterThanOrEqual(area.x - 1)
    expect(at.x).toBeLessThan(area.x + 40)
    expect(at.y).toBeLessThan(area.y + 40)
  })

  test("docked it takes a column and the canvas moves aside; floated again it leaves it", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const before = (await getMainCanvas(page)).box
    await page.getByTestId("palette-dock").click()
    expect(await mode(page)).toBe("dock")
    await expect.poll(async () => (await getMainCanvas(page)).box.x).toBeGreaterThan(before.x + 100)
    await page.getByTestId("palette-dock").click()
    expect(await mode(page)).toBe("float")
    await expect.poll(async () => Math.round((await getMainCanvas(page)).box.x)).toBe(Math.round(before.x))
  })

  test("minimized to a rail; an icon of it opens the palette on that tab, the search focused", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByTestId("palette-minimize").click()
    await expect(palette(page)).toHaveCount(0)
    await expect(page.getByTestId("palette-rail")).toBeVisible()
    await page.getByTestId("palette-rail-prebuilt").click()
    await expect(palette(page)).toBeVisible()
    expect(await mode(page)).toBe("float")
    await expect(page.getByTestId("palette-tab-prebuilt")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("palette-search")).toBeFocused()
    // Docked, minimized and opened again: docked as it was.
    await page.getByTestId("palette-dock").click()
    await page.getByTestId("palette-minimize").click()
    await page.getByTestId("palette-rail-parts").click()
    expect(await mode(page)).toBe("dock")
    await expect(page.getByTestId("palette-tab-parts")).toHaveAttribute("aria-pressed", "true")
  })

  test("Ctrl+K opens it from the rail and puts the focus in the search", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByTestId("palette-minimize").click()
    await page.keyboard.press("Control+k")
    await expect(palette(page)).toBeVisible()
    await expect(page.getByTestId("palette-search")).toBeFocused()
  })

  test("moved by its title bar and resized at its corner, it is where it was when the page is opened again", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const start = await box(page)
    const title = (await page.getByTestId("palette-titlebar").boundingBox())!
    await page.mouse.move(title.x + 60, title.y + title.height / 2)
    await page.mouse.down()
    await page.mouse.move(title.x + 160, title.y + title.height / 2 + 50, { steps: 5 })
    await page.mouse.up()
    const corner = (await page.getByTestId("palette-resize-se").boundingBox())!
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
    await page.mouse.down()
    await page.mouse.move(corner.x + corner.width / 2 + 40, corner.y + corner.height / 2 - 60, { steps: 5 })
    await page.mouse.up()
    const moved = await box(page)
    expect(Math.round(moved.x - start.x)).toBe(100)
    expect(Math.round(moved.y - start.y)).toBe(50)
    expect(Math.round(moved.width - start.width)).toBe(40)
    expect(Math.round(moved.height - start.height)).toBe(-60)

    // The page loaded afresh, the project opened again.
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(palette(page)).toBeVisible()
    const after = await box(page)
    expect([after.x, after.y, after.width, after.height].map(Math.round)).toEqual([moved.x, moved.y, moved.width, moved.height].map(Math.round))
  })

  test("kept inside the window when it shrinks", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const title = (await page.getByTestId("palette-titlebar").boundingBox())!
    await page.mouse.move(title.x + 60, title.y + title.height / 2)
    await page.mouse.down()
    await page.mouse.move(1500, title.y + title.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.setViewportSize({ width: 1000, height: 700 })
    await expect.poll(async () => {
      const b = await box(page)
      return b.x + b.width <= 1000 && b.y + 36 <= 700
    }).toBe(true)
  })

  test("keys typed in the search are the search's: Delete leaves the selection on the screen, Esc clears the text", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    // Something chosen on the screen: the first object in the list.
    const firstRow = page.locator("[data-object-id]").first()
    const id = await firstRow.getAttribute("data-object-id")
    await firstRow.click()
    const search = page.getByTestId("palette-search")
    await search.click()
    await search.fill("ab")
    await page.keyboard.press("Backspace")
    await page.keyboard.press("Delete")
    await expect(search).toHaveValue("a")
    await expect(page.locator(`[data-object-id="${id}"]`).first()).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(search).toHaveValue("")
  })

  test("the search text stays when the other tab is chosen", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const search = page.getByTestId("palette-search")
    await search.fill("licht")
    await page.getByTestId("palette-tab-prebuilt").click()
    await expect(search).toHaveValue("licht")
    await page.getByTestId("palette-tab-parts").click()
    await expect(search).toHaveValue("licht")
  })
})

// The Prebuilt tab (docs/2026-11-06-palette.md, plan task T2), on the local
// broker (`npm run hil:broker`) under a discovery prefix of each test's own.
const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ha-discovery", `${name}.json`), "utf8")).payload
function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-palette-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}
const publish = (client: mqtt.MqttClient, topic: string, payload: string) =>
  new Promise<void>((resolve, reject) => client.publish(topic, payload, { retain: true, qos: 1 }, (err) => (err ? reject(err) : resolve())))

// The configs under the test's prefix; the page told to read there. Returns what clears them.
async function announced(page: Page, prefix: string, configs: [string, unknown][]): Promise<() => Promise<void>> {
  const client = await connectBroker()
  for (const [topic, payload] of configs) await publish(client, `${prefix}/${topic}`, JSON.stringify(payload))
  await page.addInitScript(
    ([url, p]) => window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url, discoveryPrefix: p, blocksPrefix: `${p}-blocks` })),
    [BROKER_URL, prefix],
  )
  return async () => {
    for (const [topic] of configs) await publish(client, `${prefix}/${topic}`, "")
    client.end(true)
  }
}

// The combined project's e-paper draws a bar and text, not a switch: the
// cabin sensor is placeable, the plug greyed.
const VAN: [string, unknown][] = [
  ["switch/0xa4c138d2c1e0e5f1/switch/config", fixture("z2m-switch-plug")],
  ["sensor/van-sensors/cabin_temperature/config", fixture("esphome-sensor-temperature")],
  ["sensor/van-sensors/interval/config", { name: "Interval", stat_t: "van-sensors/interval", val_tpl: "{{ value_json.ms / 1000 }}", dev: { ids: "a8032ab4c5d6", name: "van-sensors" } }],
  ["light/office_light/config", fixture("ha-docs-light-office")],
]

const group = (page: Page, name: string) => page.locator(`[data-group="${name}"]`)
async function savedObjects(page: Page) {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const zip = await JSZip.loadAsync(readFileSync(await download.path()))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return project.screens[0].objects as any[]
}
// The palette moved off the screen: to the window's left edge, low.
async function aside(page: Page) {
  const title = (await page.getByTestId("palette-titlebar").boundingBox())!
  await page.mouse.move(title.x + 60, title.y + title.height / 2)
  await page.mouse.down()
  await page.mouse.move(70, 400, { steps: 4 })
  await page.mouse.up()
}

test.describe("the palette's Prebuilt tab", () => {
  // No icon looked for on the internet: a press would wait up to 4 s for it
  // (docs/2026-11-05-quick-blocks.md), and a drag begun meanwhile carries
  // nothing.
  test.beforeEach(async ({ page }) => {
    await page.route("https://api.iconify.design/**", (route) => route.fulfill({ json: { icons: [] } }))
  })

  test("a group per device, alphabetical, the first open; the others open and close, remembered; greyed with the reason", async ({ page }, testInfo) => {
    const clear = await announced(page, `e2e-palette-${testInfo.testId}`, VAN)
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      await page.getByTestId("palette-tab-prebuilt").click()
      const groups = page.getByTestId("palette-list-prebuilt").locator("[data-group]")
      await expect(groups).toHaveCount(3, { timeout: 10_000 })
      // Alphabetical, a thing of no device («Other») last.
      expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute("data-group")))).toEqual(["Kitchen plug", "van-sensors", "Other"])
      // The first open, the others closed.
      await expect(group(page, "Kitchen plug").locator("[data-entry-id]")).toHaveCount(1)
      await expect(group(page, "van-sensors").locator("[data-entry-id]")).toHaveCount(0)
      await group(page, "van-sensors").getByRole("button", { name: /van-sensors/ }).click()
      await expect(group(page, "van-sensors").getByRole("button", { name: "Cabin temperature" })).toBeVisible()
      // Greyed: the plug, which this e-paper cannot draw; the interval, for its template.
      const plug = group(page, "Kitchen plug").locator("[data-entry-id]")
      await expect(plug).toHaveAttribute("aria-disabled", "true")
      await expect(plug).toHaveAttribute("title", "Not rendered by the loaded device's firmware")
      await expect(group(page, "van-sensors").locator('[data-entry-id="sensor van-sensors interval"]')).toHaveAttribute("title", "Not supported: the value template: arithmetic (/ 1000)")
      await expect(page.getByTestId("prebuilt-count")).toHaveText("4 things from 3 devices")
      // Opened again: van-sensors still open, the plug's group too.
      await loadProject(page, COMBINED_TEST_PROJECT)
      await expect(group(page, "van-sensors").getByRole("button", { name: "Cabin temperature" })).toBeVisible({ timeout: 10_000 })
      await expect(group(page, "Kitchen plug").locator("[data-entry-id]")).toHaveCount(1)
    } finally {
      await clear()
    }
  })

  test("the search keeps the things whose name or device holds it, their groups open; nothing matching says so", async ({ page }, testInfo) => {
    const clear = await announced(page, `e2e-palette-${testInfo.testId}`, VAN)
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      await page.getByTestId("palette-tab-prebuilt").click()
      const list = page.getByTestId("palette-list-prebuilt")
      await expect(list.locator("[data-group]")).toHaveCount(3, { timeout: 10_000 })
      const search = page.getByTestId("palette-search")
      await search.fill("LIGHT")
      await expect(list.locator("[data-entry-id]")).toHaveCount(1)
      await expect(list.getByRole("button", { name: "Office light" })).toBeVisible()
      // A device's name: all of its things.
      await search.fill("sensors")
      await expect(list.locator("[data-entry-id]")).toHaveCount(2)
      await search.fill("zzz")
      await expect(list).toContainText("Nothing matches «zzz».")
    } finally {
      await clear()
    }
  })

  test("a row clicked, then the screen: the card placed; dragged: placed where let go; let go over the palette: nothing", async ({ page }, testInfo) => {
    const clear = await announced(page, `e2e-palette-${testInfo.testId}`, VAN)
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      await aside(page)
      await page.getByTestId("palette-tab-prebuilt").click()
      await page.getByTestId("palette-search").fill("cabin")
      const row = page.getByTestId("palette-list-prebuilt").getByRole("button", { name: "Cabin temperature" })
      await expect(row).toBeVisible({ timeout: 10_000 })
      // Cards anywhere on the screen: one let go over another goes into it.
      const cards = async () => JSON.stringify(await savedObjects(page)).split('"look":"card"').length - 1
      const before = await cards()
      // Clicked: in hand, shown pressed; a click on the screen places it.
      await row.click()
      await expect(row).toHaveAttribute("data-armed", "true")
      const { box } = await getMainCanvas(page)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect.poll(cards).toBe(before + 1)
      // Dragged from the row onto the screen, clear of the first card - on
      // it, it would go into it.
      const r = (await row.boundingBox())!
      await page.mouse.move(r.x + 20, r.y + r.height / 2)
      await page.mouse.down()
      // In hand once its icons are looked up - a moment, under load longer.
      await expect(row).toHaveAttribute("data-armed", "true")
      await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 10 })
      await page.mouse.up()
      await expect.poll(cards).toBe(before + 2)
      // Pressed and let go over the palette again: nothing.
      const r2 = (await row.boundingBox())!
      await page.mouse.move(r2.x + 20, r2.y + r2.height / 2)
      await page.mouse.down()
      await page.mouse.move(r2.x + 60, r2.y + r2.height / 2 + 30, { steps: 4 })
      await page.mouse.up()
      await page.keyboard.press("Escape")
      expect(await cards()).toBe(before + 2)
    } finally {
      await clear()
    }
  })

  // Found by the user 2026-11-06: a row clicked first and then dragged
  // carried nothing - the second press gave the prebuilt up at once.
  test("a row clicked first and then dragged from: the card placed; clicked twice: given up", async ({ page }, testInfo) => {
    const clear = await announced(page, `e2e-palette-${testInfo.testId}`, VAN)
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      await aside(page)
      await page.getByTestId("palette-tab-prebuilt").click()
      await page.getByTestId("palette-search").fill("cabin")
      const row = page.getByTestId("palette-list-prebuilt").getByRole("button", { name: "Cabin temperature" })
      await expect(row).toBeVisible({ timeout: 10_000 })
      const cards = async () => JSON.stringify(await savedObjects(page)).split('"look":"card"').length - 1
      const before = await cards()
      await row.click()
      await expect(row).toHaveAttribute("data-armed", "true")
      const { box } = await getMainCanvas(page)
      const r = (await row.boundingBox())!
      await page.mouse.move(r.x + 20, r.y + r.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 10 })
      await page.mouse.up()
      await expect.poll(cards).toBe(before + 1)
      await expect(row).not.toHaveAttribute("data-armed", /.+/)
      // Clicked, clicked again: given up.
      await row.click()
      await expect(row).toHaveAttribute("data-armed", "true")
      await row.click()
      await expect(row).not.toHaveAttribute("data-armed", /.+/)
    } finally {
      await clear()
    }
  })

  test("«Listen to Broker» pointing to the devices opens the palette on Prebuilt", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByTestId("palette-minimize").click()
    await page.evaluate(() => window.dispatchEvent(new Event("schaltli:open-block-menu")))
    await expect(palette(page)).toBeVisible()
    await expect(page.getByTestId("palette-tab-prebuilt")).toHaveAttribute("aria-pressed", "true")
  })
})

// The Parts tab (plan task T3).
test.describe("the palette's Parts tab", () => {
  test("the groups of the ribbon, Show open first; what the e-paper cannot draw not shown; the search over parts", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const list = page.getByTestId("palette-list-parts")
    const names = await list.locator("[data-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-group")))
    // The combined project's e-paper declares nothing from Operate.
    expect(names).toEqual(["Show", "Draw", "Arrange", "Tables"])
    await expect(list.locator('[data-tool="text"]')).toBeVisible()
    await expect(list.locator('[data-tool="box"]')).toHaveCount(0)
    await group(page, "Draw").getByRole("button", { name: /Draw/ }).click()
    await expect(list.locator('[data-tool="box"]')).toBeVisible()
    await expect(list.locator('[data-tool="select"]')).toHaveCount(0)
    await page.getByTestId("palette-search").fill("car")
    await expect(list.locator("[data-tool]")).toHaveCount(1)
    await expect(list.locator('[data-tool="card"]')).toBeVisible()
  })

  test("a part clicked then the screen clicked is placed; dragged it is placed; clicked twice it is given up", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await aside(page)
    const list = page.getByTestId("palette-list-parts")
    await page.getByTestId("palette-search").fill("box")
    const row = list.locator('[data-tool="box"]')
    const before = (await savedObjects(page)).length
    await row.click()
    await expect(row).toHaveAttribute("data-armed", "true")
    const { box } = await getMainCanvas(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(async () => (await savedObjects(page)).length).toBe(before + 1)
    const r = (await row.boundingBox())!
    await page.mouse.move(r.x + 20, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 60, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => (await savedObjects(page)).length).toBe(before + 2)
    await row.click()
    await expect(row).toHaveAttribute("data-armed", "true")
    await row.click()
    await expect(row).not.toHaveAttribute("data-armed", /.+/)
  })
})
