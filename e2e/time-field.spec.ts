import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, COMBINED_TEST_PROJECT, ROUND_FIXTURE_SCREEN, saveProjectAs } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { formatTime, NO_TIME, onStep, parseTime, timeFieldStep, timePayload } from "../lib/time-field"

// The Time field (tasks/ha-time-plan.md, D1/D2): a topic's time of day, set
// on a picker and sent to the write topic - an MQTT `time` of Home Assistant.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const FIELD = { x: 40, y: 60, width: 200, height: 48 }

test.describe("the rules every device shares", () => {
  test("a time is read from what Home Assistant writes and from an ISO date and time", () => {
    expect(parseTime("06:45")).toEqual({ hour: 6, minute: 45 })
    expect(parseTime("6:45")).toEqual({ hour: 6, minute: 45 })
    expect(parseTime("06:45:00")).toEqual({ hour: 6, minute: 45 })
    expect(parseTime(" 23:59:59.123456 ")).toEqual({ hour: 23, minute: 59 })
    // The time of an ISO date and time, as written - no time zone converted.
    expect(parseTime("2026-10-27T06:45:00+01:00")).toEqual({ hour: 6, minute: 45 })
    expect(parseTime("2026-10-27 18:05:10Z")).toEqual({ hour: 18, minute: 5 })
    expect(parseTime("2026-10-27T07:30-05:00")).toEqual({ hour: 7, minute: 30 })
  })

  test("anything else is no time", () => {
    for (const value of [undefined, "", "unknown", "24:00", "12:60", "12:5", "123:00", "12:00:60", "12:00:", "12:00:00.", "7pm", "06h45", "2026-10-27"]) {
      expect(parseTime(value), String(value)).toBeNull()
    }
  })

  test("shown in 24 hours, «--:--» for none", () => {
    expect(formatTime({ hour: 6, minute: 5 })).toBe("06:05")
    expect(formatTime({ hour: 18, minute: 30 })).toBe("18:30")
    expect(formatTime(null)).toBe(NO_TIME)
  })

  test("put on the step to the nearest, across the hour and midnight", () => {
    expect(onStep({ hour: 6, minute: 43 }, 5)).toEqual({ hour: 6, minute: 45 })
    expect(onStep({ hour: 6, minute: 42 }, 5)).toEqual({ hour: 6, minute: 40 })
    expect(onStep({ hour: 6, minute: 58 }, 5)).toEqual({ hour: 7, minute: 0 })
    expect(onStep({ hour: 23, minute: 58 }, 5)).toEqual({ hour: 0, minute: 0 })
    // Half a step rounds up.
    expect(onStep({ hour: 6, minute: 7 }, 15)).toEqual({ hour: 6, minute: 0 })
    expect(onStep({ hour: 6, minute: 8 }, 15)).toEqual({ hour: 6, minute: 15 })
    expect(onStep({ hour: 6, minute: 15 }, 30)).toEqual({ hour: 6, minute: 30 })
    expect(onStep({ hour: 6, minute: 43 }, 1)).toEqual({ hour: 6, minute: 43 })
  })

  test("sent as Home Assistant writes a time, the step read leniently", () => {
    expect(timePayload({ hour: 6, minute: 45 })).toBe("06:45:00")
    expect(timeFieldStep({})).toBe(5)
    expect(timeFieldStep({ minuteStep: 15 })).toBe(15)
    expect(timeFieldStep({ minuteStep: 7 })).toBe(5)
    expect(timeFieldStep({ minuteStep: "15" })).toBe(5)
  })
})

async function projectWithTimeField(prefix: string, extra: Record<string, unknown> = {}): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.topics.push(
    { id: "t-time-state", topic: `${prefix}/state`, type: "text", examples: ["06:30:00"] },
    { id: "t-time-cmd", topic: `${prefix}/set`, type: "text", examples: ["06:30:00"] },
  )
  project.screens[0].objects.push({
    id: "obj-time-field",
    type: "time-field",
    zIndex: 99,
    ...FIELD,
    properties: { topic: `${prefix}/state`, writeTopic: `${prefix}/set`, minuteStep: 5, fontId: project.fonts?.[0]?.id, ...extra },
  })
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `time-field-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-time-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

async function tapField(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  const point = devicePoint(box, FIELD.x + FIELD.width / 2, FIELD.y + FIELD.height / 2)
  await page.mouse.click(point.x, point.y)
}

test.describe("the Time field in the designer", () => {
  test("its panel has the topics and the minute step, 5 unless set", async ({ page }) => {
    await loadProject(page, await projectWithTimeField(`e2e-time/${Date.now()}`, { minuteStep: undefined }))
    await tapField(page)
    await expect(page.getByRole("combobox", { name: /^Topic / })).toContainText("/state")
    await expect(page.getByRole("combobox", { name: "Write topic", exact: true })).toContainText("/set")
    await expect(page.locator("#minuteStep")).toHaveValue("5")
  })

  test("in the preview a tap opens the picker on the field's time, and OK sends it on the step as HH:MM:00", async ({ page }) => {
    const prefix = `e2e-time/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const sent: string[] = []
    try {
      await new Promise<void>((resolve) => broker.publish(`${prefix}/state`, "2026-10-27T06:32:00+01:00", { qos: 1, retain: true }, () => resolve()))
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/set`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/set`) sent.push(payload.toString())
      })

      await loadProject(page, await projectWithTimeField(prefix))
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })

      await tapField(page)
      const entry = page.getByTestId("time-field-entry")
      const input = entry.getByLabel("Time")
      // 06:32 reported, opened on the step: 06:30.
      await expect(input).toHaveValue("06:30")
      await expect(input).toBeFocused()

      // Escape sends nothing.
      await input.press("Escape")
      await expect(entry).toHaveCount(0)
      await page.waitForTimeout(300)
      expect(sent).toEqual([])

      await tapField(page)
      await input.fill("06:43")
      await entry.getByRole("button", { name: "OK" }).click()
      await expect.poll(() => sent).toEqual(["06:45:00"])
      await expect(entry).toHaveCount(0)
    } finally {
      broker.end(true)
    }
  })
})

// Drawn with its tool, as a person makes one: until 2026-10-27 neither the
// text field's tool nor the time field's made anything - the canvas's own
// table of what each tool makes (canvas.tsx objectFor) lacked both, and every
// test above put its field into the project by hand.
test.describe("drawn with the toolbar", () => {
  for (const [label, type] of [
    ["Time field", "time-field"],
    ["Text field", "text-field"],
  ] as const) {
    test(`the ${label} tool puts down a ${type}`, async ({ page }) => {
      test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
      // A copy under a name of its own, as the other specs load this fixture.
      const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", "test-projects", "switch-test-project.zip")))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      project.name = `draw-${type}-${Date.now()}`
      zip.file("project.json", JSON.stringify(project))
      const copy = path.join(os.tmpdir(), `${project.name}.zip`)
      fs.writeFileSync(copy, await zip.generateAsync({ type: "nodebuffer" }))
      await loadProject(page, copy)
      await page.getByRole("button", { name: label, exact: true }).first().click()
      const { box } = await getMainCanvas(page)
      const p = devicePoint(box, 180, 240, ROUND_FIXTURE_SCREEN)
      await page.mouse.click(p.x, p.y)
      const name = `draw-${type}-${Date.now()}`
      await saveProjectAs(page, name)
      try {
        const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
        const made = saved.screens.flatMap((sc: any) => sc.objects ?? []).find((o: any) => o.type === type)
        expect(made, `no ${type} on any screen`).toBeDefined()
        expect(made.width).toBeGreaterThan(20)
        expect(made.properties).toMatchObject(type === "time-field" ? { minuteStep: 5 } : { minLength: 0, maxLength: 255 })
      } finally {
        await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
      }
    })
  }
})

// Both exports carry it as a live object, its colours resolved light and
// dark, its step as it is (D2).
test.describe("the Time field in the exports", () => {
  const project = () => ({
    name: "time-field-export",
    screenWidth: 480,
    screenHeight: 320,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [
      { id: "t-state", topic: "van/heater/start", type: "text", examples: ["06:30:00"] },
      { id: "t-set", topic: "van/heater/start/set", type: "text", examples: ["06:30:00"] },
    ],
    screens: [
      { id: "m", name: "Master", isMaster: true, themeId: "lavender", objects: [] },
      {
        id: "s1",
        name: "Heater",
        masterScreenId: "m",
        objects: [
          {
            id: "tf",
            type: "time-field",
            zIndex: 1,
            x: 20,
            y: 40,
            width: 160,
            height: 48,
            properties: { topic: "van/heater/start", writeTopic: "van/heater/start/set", minuteStep: 15 },
          },
        ],
      },
    ],
  })

  for (const [name, hook] of [
    ["the boards'", "__buildDeviceZipForTest"],
    ["the app's", "__buildAndroidZipForTest"],
  ] as const) {
    test(`${name} export carries it with its topics, its step and its colours`, async ({ page }) => {
      await page.goto("/test-render")
      await page.waitForFunction(() => (window as any).__testRenderReady === true)
      const zipBase64: string = await page.evaluate(([h, p]) => (window as any)[h](p), [hook, project()] as const)
      const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
      const exported = JSON.parse(await zip.file("project.json")!.async("string"))
      const field = exported.screens.flatMap((sc: any) => sc.objects ?? []).find((o: any) => o.id === "tf")
      expect(field?.type).toBe("time-field")
      expect(field.properties).toMatchObject({
        topic: "van/heater/start",
        writeTopic: "van/heater/start/set",
        minuteStep: 15,
        fieldColor: "#e5e5e5",
        lineColor: "#6750A4",
        textColor: "#000000",
      })
      expect(field.properties.fieldColorDark).toMatch(/^#[0-9a-f]{6}$/i)
    })
  }
})
