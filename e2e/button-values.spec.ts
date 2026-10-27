import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, COMBINED_TEST_PROJECT } from "./helpers"
import { buttonValuesFeature, fillMessage, hasPlaceholder, pressedMessage, usesButtonValues } from "../lib/button-values"
import { DEFAULT_SEPARATORS, type PlaceholderScope } from "../lib/placeholders"

// A button's message with values, only when, then clearing
// (tasks/ha-alarm-plan.md, D1/D2): what an alarm panel's Disarm needs - the
// code typed in a text field put into the command, sent only where it
// matches, and not left standing in the field.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const CODE = "local/e2e-alarm/code"
const MESSAGE = '{"action":"DISARM","code":"{topic:local/e2e-alarm/code}"}'

test.describe("the rules", () => {
  const scope = (values: Record<string, string>, combined: Record<string, string> = {}): PlaceholderScope => ({
    lookup: (ref) => (ref.namespace === "topic" ? values[ref.path] : undefined),
    separators: DEFAULT_SEPARATORS,
    combined: (name) => combined[name],
  })

  test("a message holds a placeholder or not", () => {
    expect(hasPlaceholder(MESSAGE)).toBe(true)
    expect(hasPlaceholder("ARM_AWAY")).toBe(false)
    expect(hasPlaceholder('{"a":1}')).toBe(false)
    expect(usesButtonValues({ type: "send-mqtt", mqttTopic: "a", mqttMessage: "ON" })).toBe(false)
    expect(usesButtonValues({ type: "send-mqtt", mqttTopic: "a", mqttMessage: "ON", clears: CODE })).toBe(true)
    expect(usesButtonValues({ type: "next-screen", onlyWhen: "x" })).toBe(false)
  })

  test("only {topic:…} is filled in; every other brace stands as written", () => {
    const values: Record<string, string> = { "a/b": "12", "c#d": "x" }
    const v = (p: string) => values[p]
    expect(fillMessage(MESSAGE, () => "1234")).toBe('{"action":"DISARM","code":"1234"}')
    expect(fillMessage("{topic:a/b}-{topic:c#d}", v)).toBe("12-x")
    expect(fillMessage("{topic:none}", v)).toBe("")
    expect(fillMessage('{"x":{{value}}}', v)).toBe('{"x":{{value}}}')
    expect(fillMessage("{topic:a/b", v)).toBe("{topic:a/b")
  })

  test("at the press: the message resolved, only when yes, what to clear", () => {
    const action = { type: "send-mqtt" as const, mqttTopic: "alarm/set", mqttMessage: MESSAGE, onlyWhen: "code_ok", clears: CODE }
    expect(pressedMessage(action, scope({ [CODE]: "1234" }, { code_ok: "false" }))).toEqual({ send: null })
    expect(pressedMessage(action, scope({ [CODE]: "1234" }, { code_ok: "true" }))).toEqual({
      send: { topic: "alarm/set", message: '{"action":"DISARM","code":"1234"}' },
      clear: CODE,
    })
    // Without «Only when» it always sends.
    expect(pressedMessage({ type: "send-mqtt", mqttTopic: "t", mqttMessage: "ARM_AWAY" }, scope({}))).toEqual({ send: { topic: "t", message: "ARM_AWAY" } })
  })

  test("Deploy names what needs the feature", () => {
    const need = buttonValuesFeature({
      screens: [
        {
          name: "Alarm",
          objects: [
            { type: "button", properties: { action: { type: "send-mqtt", mqttTopic: "a", mqttMessage: MESSAGE } } },
            { type: "text-field", properties: { keyboard: "digits" } },
            { type: "button", properties: { action: { type: "send-mqtt", mqttTopic: "a", mqttMessage: "ON" } } },
          ],
        },
      ],
    })
    expect(need).toEqual({ feature: "button-values", label: "values in button messages (a button on Alarm, a text field for digits on Alarm)" })
    expect(buttonValuesFeature({ screens: [{ name: "x", objects: [{ type: "button", properties: { action: { type: "next-screen" } } }] }] })).toBeNull()
  })
})

const FIELD = { x: 40, y: 50, width: 200, height: 40 }
const BUTTON = { x: 40, y: 120, width: 140, height: 40 }

async function alarmProject(prefix: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.topics.push(
    { id: "t-code", topic: CODE, type: "text", examples: [], local: true, initial: "" },
    { id: "t-alarm-set", topic: `${prefix}/set`, type: "text", examples: ["DISARM"] },
  )
  project.combinedTopics = [
    ...(project.combinedTopics ?? []),
    { id: "c-code", name: "code_ok", mode: "all", conditions: [{ source: { namespace: "topic", path: CODE }, op: "==", operand: "1234" }] },
  ]
  project.screens[0].objects.push(
    {
      id: "code",
      type: "text-field",
      zIndex: 98,
      ...FIELD,
      properties: { topic: CODE, writeTopic: CODE, hidden: true, keyboard: "digits", fontId: project.fonts?.[0]?.id },
    },
    {
      id: "disarm",
      type: "button",
      zIndex: 99,
      ...BUTTON,
      properties: {
        text: "Disarm",
        buttonStyle: "tonal",
        fontId: project.fonts?.[0]?.id,
        action: { type: "send-mqtt", mqttTopic: `${prefix}/set`, mqttMessage: MESSAGE, onlyWhen: "code_ok", clears: CODE },
      },
    },
  )
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `button-values-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

async function clickAt(page: Page, r: { x: number; y: number; width: number; height: number }) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.click(p.x, p.y)
}

test("in the preview Disarm sends the typed code only when it matches, then the field is empty", async ({ page }) => {
  const prefix = `e2e-alarm/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const broker = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(BROKER_URL, { clientId: `e2e-alarm-${Date.now()}`, reconnectPeriod: 0 })
    c.once("connect", () => resolve(c))
    c.once("error", reject)
  })
  const sent: string[] = []
  try {
    await new Promise<void>((resolve) => broker.subscribe(`${prefix}/set`, () => resolve()))
    broker.on("message", (topic, payload) => {
      if (topic === `${prefix}/set`) sent.push(payload.toString())
    })
    await loadProject(page, await alarmProject(prefix))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })

    const type = async (code: string) => {
      await clickAt(page, FIELD)
      const input = page.getByTestId("text-field-entry").locator("input")
      await expect(input).toHaveAttribute("inputmode", "numeric")
      await input.fill(code)
      await input.press("Enter")
      await expect(page.getByTestId("text-field-entry")).toHaveCount(0)
    }

    // No code, then a wrong one: nothing goes out.
    await clickAt(page, BUTTON)
    await type("1111")
    await clickAt(page, BUTTON)
    await page.waitForTimeout(600)
    expect(sent).toEqual([])

    // The right one: Disarm with it in the message, and the field empty after.
    await type("1234")
    await clickAt(page, BUTTON)
    await expect.poll(() => sent).toEqual(['{"action":"DISARM","code":"1234"}'])
    await clickAt(page, FIELD)
    await expect(page.getByTestId("text-field-entry").locator("input")).toHaveValue("")
  } finally {
    broker.end(true)
  }
})

// Both exports carry the three as they are (D2): the device fills in and checks.
test.describe("in the exports", () => {
  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook} keeps the message, Only when and Then clear`, async ({ page }) => {
      const project = {
        name: "button-values-export",
        screenWidth: 480,
        screenHeight: 320,
        settings: { colorDepth: "24bit" },
        fonts: [],
        assets: [],
        topics: [{ id: "c", topic: CODE, type: "text", examples: [], local: true, initial: "" }],
        combinedTopics: [{ id: "k", name: "code_ok", mode: "all", conditions: [{ source: { namespace: "topic", path: CODE }, op: "==", operand: "1234" }] }],
        screens: [
          { id: "m", name: "Master", isMaster: true, themeId: "lavender", objects: [] },
          {
            id: "s1",
            name: "Alarm",
            masterScreenId: "m",
            objects: [
              {
                id: "b",
                type: "button",
                zIndex: 1,
                x: 20,
                y: 20,
                width: 120,
                height: 40,
                properties: { text: "Disarm", action: { type: "send-mqtt", mqttTopic: "alarm/set", mqttMessage: MESSAGE, onlyWhen: "code_ok", clears: CODE } },
              },
            ],
          },
        ],
      }
      await page.goto("/test-render")
      await page.waitForFunction(() => (window as any).__testRenderReady === true)
      const zipBase64: string = await page.evaluate(([h, p]) => (window as any)[h](p), [hook, project] as const)
      const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
      const exported = JSON.parse(await zip.file("project.json")!.async("string"))
      const button = exported.screens.flatMap((sc: any) => sc.objects ?? []).find((o: any) => o.id === "b")
      expect(button.properties.action).toMatchObject({ mqttMessage: MESSAGE, onlyWhen: "code_ok", clears: CODE })
    })
  }
})
