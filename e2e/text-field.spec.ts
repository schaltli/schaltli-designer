import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, COMBINED_TEST_PROJECT, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import {
  canSendText,
  clampText,
  shownText,
  textFieldBounds,
  textFieldGeometry,
  textLength,
} from "../lib/text-field"

// The Text field (tasks/ha-text-plan.md, D1): a topic's text, typed anew on
// a keyboard and sent to the write topic - an MQTT `text` of Home Assistant.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const FIELD = { x: 40, y: 60, width: 240, height: 48 }
// The 24-bit round fixture, for the colours.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

test.describe("the rules every device shares", () => {
  test("a text's length is its characters, as Home Assistant counts them", () => {
    expect(textLength("Grüezi")).toBe(6)
    expect(textLength("Straße")).toBe(6)
    // Two UTF-16 units, four UTF-8 bytes: one character.
    expect(textLength("😀")).toBe(1)
    expect(textLength("")).toBe(0)
  })

  test("cut to max never leaves half a character", () => {
    expect(clampText("Grüezi", 3)).toBe("Grü")
    expect(clampText("a😀b", 2)).toBe("a😀")
    expect(clampText("ab", 5)).toBe("ab")
  })

  test("the bounds default to Home Assistant's and stay inside 0-255, min never above max", () => {
    expect(textFieldBounds({})).toEqual({ minLength: 0, maxLength: 255 })
    expect(textFieldBounds({ minLength: 3, maxLength: 10 })).toEqual({ minLength: 3, maxLength: 10 })
    expect(textFieldBounds({ minLength: 20, maxLength: 10 })).toEqual({ minLength: 10, maxLength: 10 })
    expect(textFieldBounds({ maxLength: 999 })).toEqual({ minLength: 0, maxLength: 255 })
    expect(textFieldBounds({ maxLength: 0 })).toEqual({ minLength: 0, maxLength: 1 })
    expect(canSendText("ab", { minLength: 3, maxLength: 10 })).toBe(false)
    expect(canSendText("abc", { minLength: 3, maxLength: 10 })).toBe(true)
    expect(canSendText("", { minLength: 0, maxLength: 10 })).toBe(true)
  })

  test("a hidden text is a dot per character, a star where the font has no dot", () => {
    expect(shownText("Grüezi", false, true)).toBe("Grüezi")
    expect(shownText("Grü😀", true, true)).toBe("••••")
    expect(shownText("ab", true, false)).toBe("**")
  })

  test("the geometry: a fifth of the height for the corner, the text inside the corners", () => {
    expect(textFieldGeometry(240, 48)).toEqual({ radius: 9, pad: 12, lineY: 46, lineHeight: 2 })
    expect(textFieldGeometry(20, 10)).toEqual({ radius: 2, pad: 2, lineY: 8, lineHeight: 2 })
  })
})

async function projectWithTextField(prefix: string, extra: Record<string, unknown> = {}, source = COMBINED_TEST_PROJECT): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(source))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.topics.push(
    { id: "t-text-state", topic: `${prefix}/state`, type: "text", examples: ["Hallo"] },
    { id: "t-text-cmd", topic: `${prefix}/set`, type: "text", examples: ["Hallo"] },
  )
  project.screens[0].objects.push({
    id: "obj-text-field",
    type: "text-field",
    zIndex: 99,
    ...FIELD,
    properties: {
      topic: `${prefix}/state`,
      writeTopic: `${prefix}/set`,
      minLength: 0,
      maxLength: 255,
      fontId: project.fonts?.[0]?.id,
      ...extra,
    },
  })
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `text-field-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-text-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => client.publish(topic, payload, { qos: 1, retain: true }, (err) => (err ? reject(err) : resolve())))
}

/** How many dark pixels the field's inside has: text drawn or not. */
async function darkInside(page: Page): Promise<number> {
  const { canvas, box } = await getMainCanvas(page)
  const from = devicePoint(box, FIELD.x + 14, FIELD.y + 6)
  const to = devicePoint(box, FIELD.x + FIELD.width - 14, FIELD.y + FIELD.height - 6)
  return canvas.evaluate(
    (el, [x0, y0, x1, y1]) => {
      const c = el as HTMLCanvasElement
      const rect = c.getBoundingClientRect()
      const sx = c.width / rect.width
      const sy = c.height / rect.height
      const d = c.getContext("2d")!.getImageData(
        Math.round((x0 - rect.left) * sx),
        Math.round((y0 - rect.top) * sy),
        Math.round((x1 - x0) * sx),
        Math.round((y1 - y0) * sy),
      ).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 250) n++
      return n
    },
    [from.x, from.y, to.x, to.y],
  )
}

async function tapField(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  const point = devicePoint(box, FIELD.x + FIELD.width / 2, FIELD.y + FIELD.height / 2)
  await page.mouse.click(point.x, point.y)
}

test.describe("the Text field in the designer", () => {
  test("its panel has the topics, the bounds and Hide text", async ({ page }) => {
    const zipPath = await projectWithTextField(`e2e-text/${Date.now()}`)
    await loadProject(page, zipPath)

    await tapField(page)
    // The row's hint is part of its name.
    await expect(page.getByRole("combobox", { name: /^Topic / })).toContainText("/state")
    await expect(page.getByRole("combobox", { name: "Write topic", exact: true })).toContainText("/set")
    await expect(page.locator("#minLength")).toHaveValue("0")
    await expect(page.locator("#maxLength")).toHaveValue("255")
    await expect(page.getByRole("checkbox", { name: "Dots instead of letters" })).not.toBeChecked()
  })

  test("in the preview a tap opens the keyboard on what the field shows, and OK sends the typed text", async ({ page }) => {
    const prefix = `e2e-text/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const sent: string[] = []
    try {
      await publish(broker, `${prefix}/state`, "Hallo")
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/set`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/set`) sent.push(payload.toString())
      })

      await loadProject(page, await projectWithTextField(prefix, { minLength: 2, maxLength: 8 }))
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })
      // The topic's text is drawn in the field.
      await expect.poll(() => darkInside(page)).toBeGreaterThan(20)

      await tapField(page)
      const entry = page.getByTestId("text-field-entry")
      const input = entry.getByRole("textbox", { name: "Text" })
      await expect(input).toHaveValue("Hallo")

      // Below min OK is grey; past max the keys stop.
      await input.fill("G")
      await expect(entry.getByRole("button", { name: "OK" })).toBeDisabled()
      await input.fill("Grüezi mitenand")
      await expect(input).toHaveValue("Grüezi m")
      await expect(entry.getByTestId("text-field-count")).toHaveText("8/8")

      // Cancel sends nothing.
      await entry.getByRole("button", { name: "Cancel" }).click()
      await expect(entry).toHaveCount(0)
      await page.waitForTimeout(300)
      expect(sent).toEqual([])

      await tapField(page)
      await input.fill("Grüezi")
      await input.press("Enter")
      await expect.poll(() => sent).toEqual(["Grüezi"])
      await expect(entry).toHaveCount(0)
    } finally {
      broker.end(true)
    }
  })

  test("a hidden field types into a password line", async ({ page }) => {
    const prefix = `e2e-text/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await loadProject(page, await projectWithTextField(prefix, { hidden: true }))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await tapField(page)
    // The tap leaves the line ready to type into.
    await expect(page.getByTestId("text-field-entry").locator("input")).toBeFocused()
    await expect(page.getByTestId("text-field-entry").locator("input")).toHaveAttribute("type", "password")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("text-field-entry")).toHaveCount(0)
  })

  test("is drawn in the theme: the field in Panel, the line under it in the accent", async ({ page }) => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, await projectWithTextField(`e2e-text/${Date.now()}`, {}, SWITCH_TEST_PROJECT))
    const { canvas, box } = await getMainCanvas(page)
    const colourAt = async (ox: number, oy: number) => {
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
    // Lavender, light (lib/themes.ts): Panel #e5e5e5, Accent #6750a4.
    await expect.poll(() => colourAt(FIELD.x + FIELD.width - 20, FIELD.y + 10)).toBe("#e5e5e5")
    expect(await colourAt(FIELD.x + FIELD.width / 2, FIELD.y + FIELD.height - 1)).toBe("#6750a4")
  })
})

// Both exports carry it as a live object, its colours resolved for the
// device - light, and at 24 bit each one's dark beside it - and its bounds
// as they are (tasks/ha-text-plan.md, D2).
test.describe("the Text field in the exports", () => {
  const project = () => ({
    name: "text-field-export",
    screenWidth: 480,
    screenHeight: 320,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [
      { id: "t-state", topic: "van/name/state", type: "text", examples: ["Hallo"] },
      { id: "t-set", topic: "van/name/set", type: "text", examples: ["Hallo"] },
    ],
    screens: [
      { id: "m", name: "Master", isMaster: true, themeId: "lavender", objects: [] },
      {
        id: "s1",
        name: "Name",
        masterScreenId: "m",
        objects: [
          {
            id: "tf",
            type: "text-field",
            zIndex: 1,
            x: 20,
            y: 40,
            width: 240,
            height: 48,
            properties: { topic: "van/name/state", writeTopic: "van/name/set", minLength: 2, maxLength: 20, hidden: true },
          },
        ],
      },
    ],
  })

  for (const [name, hook] of [
    ["the boards'", "__buildDeviceZipForTest"],
    ["the app's", "__buildAndroidZipForTest"],
  ] as const) {
    test(`${name} export carries it with its topics, its bounds and its colours`, async ({ page }) => {
      await page.goto("/test-render")
      await page.waitForFunction(() => (window as any).__testRenderReady === true)
      const zipBase64: string = await page.evaluate(([h, p]) => (window as any)[h](p), [hook, project()] as const)
      const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
      const exported = JSON.parse(await zip.file("project.json")!.async("string"))
      const objects = exported.screens.flatMap((sc: any) => sc.objects ?? [])
      const field = objects.find((o: any) => o.id === "tf")
      expect(field, JSON.stringify(objects.map((o: any) => o.type))).toBeDefined()
      expect(field.type).toBe("text-field")
      expect(field.properties).toMatchObject({
        topic: "van/name/state",
        writeTopic: "van/name/set",
        minLength: 2,
        maxLength: 20,
        hidden: true,
        // Lavender (lib/themes.ts): Panel, Accent, Text - and their darks.
        fieldColor: "#e5e5e5",
        lineColor: "#6750A4",
        textColor: "#000000",
      })
      expect(field.properties.fieldColorDark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(field.properties.lineColorDark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(field.properties.textColorDark).toMatch(/^#[0-9a-f]{6}$/i)
    })
  }
})

