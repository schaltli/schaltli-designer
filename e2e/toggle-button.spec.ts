import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, objectTreeRow, getSelectedHeader, openAllTwisties, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { controlMinWidth } from "../lib/size-scale"
import { placedSize } from "../lib/placing"
import { STRETCHES_HEIGHT, STRETCHES_WIDTH } from "../lib/anchor"

// The Toggle Button in the designer (docs/2026-11-06-toggle-button.md, T2):
// drawn in its reported state's look, its panel, and in the preview a tap
// that sends the next state, the ring while nothing has confirmed it.
// Its look in numbers is e2e/toggle-button-shape.spec.ts.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
// The 24-bit round fixture, in Lavender light: Card #ffffff, Card border
// #e6e3ef, Accent #6750a4 (lib/themes.ts).
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
const TILE = { x: 80, y: 120, width: 200, height: 84 }
const CARD = "#ffffff"
const EDGE = "#e6e3ef"
const ACCENT = "#6750a4"

async function projectWithTile(prefix: string, extra: Record<string, unknown> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.topics.push(
    { id: "t-tile-state", topic: `${prefix}/state`, type: "text", examples: ["off", "on"] },
    { id: "t-tile-cmd", topic: `${prefix}/set`, type: "text", examples: ["off", "on"] },
  )
  // Alone on the screen, so nothing else is under the pixels read.
  project.screens[0].objects = [
    {
      id: "obj-tile",
      type: "toggle-button",
      zIndex: 99,
      ...TILE,
      properties: {
        topic: `${prefix}/state`,
        writeTopic: `${prefix}/set`,
        text: "",
        states: [
          { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
          { id: "on", label: "Ein", readValue: "on", writeValue: "on", showAsOn: true },
        ],
        switchStyle: "korry",
        switchColor: "accent",
        ...extra,
      },
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `toggle-button-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-tile-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => client.publish(topic, payload, { qos: 1, retain: true }, (err) => (err ? reject(err) : resolve())))
}

async function colourAt(page: Page, ox: number, oy: number): Promise<string> {
  const { canvas, box } = await getMainCanvas(page)
  const point = devicePoint(box, ox, oy, ROUND_FIXTURE_SCREEN)
  return canvas.evaluate((el, [px, py]) => {
    const c = el as HTMLCanvasElement
    const rect = c.getBoundingClientRect()
    const d = c.getContext("2d")!.getImageData(
      Math.round(((px - rect.left) / rect.width) * c.width),
      Math.round(((py - rect.top) / rect.height) * c.height),
      1,
      1,
    ).data
    return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")
  }, [point.x, point.y])
}

// Inside the tile, above its window (clear of the round end).
const fillAt = (page: Page) => colourAt(page, TILE.x + 24, TILE.y + 5)
// Inside the Korry window, which stands centred without a name, clear of its word.
const windowAt = (page: Page) => colourAt(page, TILE.x + 16, TILE.y + TILE.height / 2)
// The middle of its top edge: the 1-px card border, or the 2-px ring.
const edgeAt = (page: Page, dy = 0) => colourAt(page, TILE.x + TILE.width / 2, TILE.y + dy)

async function tapTile(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  const point = devicePoint(box, TILE.x + TILE.width / 2, TILE.y + TILE.height / 2, ROUND_FIXTURE_SCREEN)
  await page.mouse.click(point.x, point.y)
}

test.describe("its rules beside the other controls", () => {
  test("placed as a tile tall enough for two lines, stretching like a button", () => {
    const placed = placedSize("toggle-button", 10)!
    expect(placed.height).toBeGreaterThan(placedSize("button", 10)!.height)
    expect(STRETCHES_WIDTH.has("toggle-button")).toBe(true)
    expect(STRETCHES_HEIGHT.has("toggle-button")).toBe(true)
  })

  test("never narrower than its widest content: plain the widest label, named the name and its label", () => {
    const fonts = [{ id: "f", name: "f", size: 14, ascent: 12, descent: 3, capHeight: 10 }] as any
    const obj = (props: Record<string, unknown>) =>
      ({ id: "t", type: "toggle-button", x: 0, y: 0, width: 10, height: 84, zIndex: 1, properties: { fontId: "f", states: [{ label: "Aus" }, { label: "Wasserpumpe", iconAssetId: "drop" }], ...props } }) as any
    const plain = controlMinWidth(obj({}), 84, fonts)
    const named = controlMinWidth(obj({ text: "Ganz langer Name" }), 84, fonts)
    expect(plain).toBeGreaterThan(16)
    expect(named).toBeGreaterThan(plain)
  })
})

test.describe("the Toggle Button in the designer", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("its panel: the topics, Name, Shows as on per state, the tile's colour", async ({ page }) => {
    await loadProject(page, await projectWithTile(`e2e-tile/${Date.now()}`))
    await objectTreeRow(page, "obj-tile").click()
    expect(await getSelectedHeader(page)).toContain("Toggle Button")
    await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue("")
    await openAllTwisties(page)
    await expect(page.getByText("Tile takes the colour")).toHaveCount(2)
    await expect(page.locator("[data-row-label]", { hasText: /^Tile$/ })).toBeVisible()
  })

  test("nothing reported: a card with its edge; the colour comes with a state that shows as on", async ({ page }) => {
    const prefix = `e2e-tile/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await loadProject(page, await projectWithTile(prefix))
    await expect.poll(() => fillAt(page), { timeout: 15000 }).toBe(CARD)
    expect(await edgeAt(page)).toBe(EDGE)
  })

  test("in the preview a tap sends the next state, the window pulses until it is confirmed, then lights; the tile stays calm", async ({ page }) => {
    const prefix = `e2e-tile/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const sent: string[] = []
    try {
      await publish(broker, `${prefix}/state`, "off")
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/set`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/set`) sent.push(payload.toString())
      })

      await loadProject(page, await projectWithTile(prefix))
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })
      await expect.poll(() => fillAt(page), { timeout: 15000 }).toBe(CARD)
      expect(await edgeAt(page)).toBe(EDGE)
      const dark = await windowAt(page)
      expect(dark).not.toBe(ACCENT)

      // Off -> the next state, On. Nothing answers yet: the window pulses at
      // half strength (docs/2026-11-11-led-look.md, decision 4) - neither dark
      // nor lit - and the tile stays as it was.
      await tapTile(page)
      await expect.poll(() => sent).toEqual(["on"])
      await expect.poll(async () => { const c = await windowAt(page); return c !== dark && c !== ACCENT }, { timeout: 15000 }).toBe(true)
      expect(await fillAt(page)).toBe(CARD)

      // The answer: the window lights in the colour; the tile, its edge, stay.
      await publish(broker, `${prefix}/state`, "on")
      await expect.poll(() => windowAt(page), { timeout: 15000 }).toBe(ACCENT)
      expect(await fillAt(page)).toBe(CARD)
      expect(await edgeAt(page)).toBe(EDGE)

      // And on wraps back to off.
      await tapTile(page)
      await expect.poll(() => sent).toEqual(["on", "off"])
    } finally {
      broker.end(true)
    }
  })

  test("with nothing reported a tap sends the first state that shows as on", async ({ page }) => {
    const prefix = `e2e-tile/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const sent: string[] = []
    try {
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/set`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/set`) sent.push(payload.toString())
      })
      await loadProject(page, await projectWithTile(prefix))
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })
      await tapTile(page)
      await expect.poll(() => sent).toEqual(["on"])
    } finally {
      broker.end(true)
    }
  })
})
