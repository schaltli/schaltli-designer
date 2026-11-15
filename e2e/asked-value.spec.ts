import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint } from "./helpers"
import { askedValueAnswered, askedValueDeadline, LEVEL_AWAIT_MS, sameLevel, SWITCH_AWAIT_MS } from "../lib/asked-value"
import { shownLevelValue } from "../components/canvas/renderers/render-level-indicator"
import type { ScreenObject } from "../components/project-editor"

// When an answer from the installation ends what a hand asked for in the
// preview, and what a level shows meanwhile (2026-09-27). The devices keep the
// same rules; these are the pure halves the editor and the renderers use.

test.describe("a request in the preview", () => {
  const now = 1_000_000

  test("under the hand, no answer ends it", () => {
    const held = { value: "70", seen: "10", holding: true }
    expect(askedValueAnswered(held, "40", now)).toBe(false)
    expect(askedValueAnswered(held, "70", now)).toBe(false)
  })

  test("released, only the answer to its own value ends it - or the wait running out", () => {
    const held = { value: "70", seen: "10", awaitUntil: now + LEVEL_AWAIT_MS }
    // An answer to a value the drag passed through: still on its way, set aside.
    expect(askedValueAnswered(held, "40", now + 100)).toBe(false)
    // The answer to the value it was released on, however it is written.
    expect(askedValueAnswered(held, "70", now + 100)).toBe(true)
    expect(askedValueAnswered(held, "70.0", now + 100)).toBe(true)
    // Nothing of the kind within the wait: the installation's word wins.
    expect(askedValueAnswered(held, "40", now + LEVEL_AWAIT_MS)).toBe(true)
  })

  test("a Switch's request ends on any answer that is not a repeat", () => {
    const held = { value: "on", seen: "off" }
    expect(askedValueAnswered(held, "off", now)).toBe(false)
    expect(askedValueAnswered(held, "on", now)).toBe(true)
  })

  test("a Switch's request without any answer ends after SWITCH_AWAIT_MS, as on the devices", () => {
    expect(SWITCH_AWAIT_MS).toBe(4000)
    expect(askedValueDeadline({ value: "on", seen: "off", giveUpAt: now + SWITCH_AWAIT_MS })).toBe(now + SWITCH_AWAIT_MS)
    expect(askedValueDeadline({ value: "70", seen: "10", awaitUntil: now + LEVEL_AWAIT_MS })).toBe(now + LEVEL_AWAIT_MS)
    // Under the hand there is no deadline: the hand is still asking.
    expect(askedValueDeadline({ value: "70", seen: "10", holding: true })).toBeUndefined()
  })

  test("the same level, whichever way it is written", () => {
    expect(sameLevel("40", "40.0")).toBe(true)
    expect(sameLevel("40", "41")).toBe(false)
    expect(sameLevel(undefined, "40")).toBe(false)
  })
})

test.describe("what a level shows", () => {
  const reported: Record<string, string> = { "dimmer/level": "10", "heater/temp": "17", "heater/target": "21" }
  const asked: Record<string, string> = { "dimmer/level": "70", "heater/target": "25" }
  const get = (map: Record<string, string>) => (topic: string | undefined) => (topic ? map[topic] ?? "" : "")
  const level = (properties: Record<string, unknown>) => ({ id: "l", type: "level-indicator", properties }) as unknown as ScreenObject

  test("the dimmer pattern: the finger, while it asks", () => {
    const dimmer = level({ topic: "dimmer/level", writeTopic: "dimmer/cmd" })
    expect(shownLevelValue(dimmer, get(reported), get(asked))).toBe("70")
    expect(shownLevelValue(dimmer, get(reported), get({}))).toBe("10")
  })

  test("the heater pattern and a read-only gauge: the report", () => {
    const heater = level({ topic: "heater/temp", setpointTopic: "heater/target", writeTopic: "heater/cmd" })
    expect(shownLevelValue(heater, get(reported), get(asked))).toBe("17")
    const gauge = level({ topic: "dimmer/level" })
    expect(shownLevelValue(gauge, get(reported), get(asked))).toBe("10")
  })
})

// A Switch tapped in the live preview that the installation never answers: a
// bridge publishes only changes, so a command it did not take brings no
// message at all. The asked mark goes after SWITCH_AWAIT_MS, as the 4.3B's
// and the 4"'s PENDING_TIMEOUT_MS - it pulsed for good before (the starter's
// «Lüften» while the heater heated, 2026-11-15).
test.describe("a Switch's tap in the live preview", () => {
  const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
  const COMBINED_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "combined-test-project.zip")
  const BOX = { x: 40, y: 120, width: 200, height: 48 }

  async function projectWithSwitch(prefix: string): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.topics.push(
      { id: "t-ask-mode", topic: `${prefix}/mode`, type: "string", examples: ["off"] },
      { id: "t-ask-cmd", topic: `${prefix}/cmd`, type: "string", examples: ["off"] },
    )
    project.screens[0].objects.push({
      id: "obj-asked-switch",
      type: "button-group",
      zIndex: 99,
      ...BOX,
      properties: {
        topic: `${prefix}/mode`,
        writeTopic: `${prefix}/cmd`,
        states: [
          { id: "s-off", label: "Aus", readValue: "off", writeValue: "off" },
          { id: "s-on", label: "An", readValue: "on", writeValue: "on", showAsOn: true },
        ],
      },
    })
    zip.file("project.json", JSON.stringify(project))
    const file = path.join(os.tmpdir(), `asked-switch-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    return file
  }

  const connectBroker = () =>
    new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-ask-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
      client.once("connect", () => resolve(client))
      client.once("error", reject)
    })
  const publish = (client: mqtt.MqttClient, topic: string, payload: string) =>
    new Promise<void>((resolve, reject) =>
      client.publish(topic, payload, { qos: 1, retain: true }, (err) => (err ? reject(err) : resolve())),
    )

  async function shot(page: Page): Promise<Buffer> {
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, BOX.x, BOX.y)
    return page.screenshot({ clip: { x: at.x, y: at.y, width: BOX.width, height: BOX.height } })
  }

  test("is dropped when nothing answers it", async ({ page }) => {
    const prefix = `e2e-ask/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const zipPath = await projectWithSwitch(prefix)
    const commands: string[] = []
    try {
      await publish(broker, `${prefix}/mode`, "off")
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/cmd`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/cmd`) commands.push(payload.toString())
      })

      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })
      await page.mouse.move(0, 0)
      // Settled on the reported "off" first.
      await expect.poll(async () => (await shot(page)).equals(await shot(page))).toBe(true)
      const before = await shot(page)

      const { box } = await getMainCanvas(page)
      const on = devicePoint(box, BOX.x + BOX.width * 0.75, BOX.y + BOX.height / 2)
      await page.mouse.click(on.x, on.y)
      await page.mouse.move(0, 0)
      const tapped = Date.now()
      await expect.poll(() => commands).toContain("on")

      // Asked: the "An" segment is marked, so the switch looks different ...
      await expect.poll(async () => (await shot(page)).equals(before)).toBe(false)
      // ... and with no answer, back to what was reported - not at once, after the wait.
      await expect.poll(async () => (await shot(page)).equals(before), { timeout: SWITCH_AWAIT_MS + 4000 }).toBe(true)
      expect(Date.now() - tapped).toBeGreaterThanOrEqual(SWITCH_AWAIT_MS - 500)
    } finally {
      await publish(broker, `${prefix}/mode`, "").catch(() => {})
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })
})
