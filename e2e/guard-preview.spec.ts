import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, COMBINED_TEST_PROJECT } from "./helpers"
import { GUARD_HINT, GUARD_RELOCK_MS, GUARD_TOPUP_MS, guardUnlockTravel } from "../lib/guard"

// Guard in the preview (docs/2026-11-15-guard.md): the mouse is one finger
// (E10). Taps go to the live broker, as a device's would, so what a tap
// sends is what the test reads.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const GROUP = { x: 40, y: 120, width: 200, height: 48 }
const NEXT = { x: 40, y: 220, width: 120, height: 40 }
const SWITCHER = { x: 260, y: 20, width: 130, height: 80 }
const SW = { x: 10, y: 10, width: 110, height: 40 }

async function guardedProject(prefix: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  for (const t of ["mode", "cmd", "panel", "sw", "swcmd"]) project.topics.push({ id: `t-g-${t}`, topic: `${prefix}/${t}`, type: "string", examples: ["off"] })
  const states = [
    { id: "s-off", label: "Aus", readValue: "off", writeValue: "off" },
    { id: "s-on", label: "An", readValue: "on", writeValue: "on", showAsOn: true },
  ]
  project.screens[0].objects = [
    { id: "g-group", type: "button-group", zIndex: 10, ...GROUP, properties: { guard: true, topic: `${prefix}/mode`, writeTopic: `${prefix}/cmd`, states } },
    { id: "g-next", type: "button", zIndex: 11, ...NEXT, properties: { text: "Next", action: { type: "next-screen" } } },
    {
      id: "g-switcher",
      type: "switcher",
      zIndex: 12,
      ...SWITCHER,
      properties: { topic: `${prefix}/panel` },
      children: [
        {
          id: "g-panel-a",
          type: "panel",
          x: 0,
          y: 0,
          width: SWITCHER.width,
          height: SWITCHER.height,
          zIndex: 1,
          properties: { comparisonOperator: "==", comparisonValue: "a" },
          children: [{ id: "g-switch", type: "switch", zIndex: 1, ...SW, properties: { guard: true, topic: `${prefix}/sw`, writeTopic: `${prefix}/swcmd`, states } }],
        },
        { id: "g-panel-b", type: "panel", x: 0, y: 0, width: SWITCHER.width, height: SWITCHER.height, zIndex: 2, properties: { comparisonOperator: "==", comparisonValue: "b" }, children: [] },
      ],
    },
  ]
  project.screens[1].objects = [{ id: "g-back", type: "button", zIndex: 11, ...NEXT, properties: { text: "Back", action: { type: "previous-screen" } } }]
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `guard-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

const connectBroker = () =>
  new Promise<mqtt.MqttClient>((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-guard-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
const publish = (client: mqtt.MqttClient, topic: string, payload: string) =>
  new Promise<void>((resolve, reject) => client.publish(topic, payload, { qos: 1, retain: true }, (err) => (err ? reject(err) : resolve())))

const guards = async (page: Page) => (await getMainCanvas(page)).canvas.evaluate((c) => (c as HTMLCanvasElement).dataset.guards ?? "")
const hint = async (page: Page) => (await getMainCanvas(page)).canvas.evaluate((c) => (c as HTMLCanvasElement).dataset.guardHint ?? "")

async function at(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  return devicePoint(box, x, y)
}

/** Finger down at (x, y) on the screen, up by `up` px in steps, then lifted. */
async function push(page: Page, x: number, y: number, up: number) {
  const start = await at(page, x, y)
  const end = await at(page, x, y - up)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

async function tap(page: Page, x: number, y: number) {
  const p = await at(page, x, y)
  await page.mouse.click(p.x, p.y)
}

test.describe("a guarded control in the live preview", () => {
  let broker: mqtt.MqttClient
  let prefix: string
  let zipPath: string
  const sent: Array<{ topic: string; value: string; at: number }> = []
  const values = (topic: string) => sent.filter((m) => m.topic === `${prefix}/${topic}`).map((m) => m.value)

  test.beforeEach(async ({ page }) => {
    prefix = `e2e-guard/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    sent.length = 0
    broker = await connectBroker()
    await publish(broker, `${prefix}/mode`, "off")
    await publish(broker, `${prefix}/sw`, "off")
    await publish(broker, `${prefix}/panel`, "a")
    await new Promise<void>((resolve) => broker.subscribe([`${prefix}/cmd`, `${prefix}/swcmd`], () => resolve()))
    broker.on("message", (topic, payload) => sent.push({ topic, value: payload.toString(), at: Date.now() }))
    zipPath = await guardedProject(prefix)
    await loadProject(page, zipPath)
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })
  })

  test.afterEach(async () => {
    for (const t of ["mode", "sw", "panel"]) await publish(broker, `${prefix}/${t}`, "").catch(() => {})
    broker.end(true)
    fs.unlinkSync(zipPath)
  })

  const onSegment = { x: GROUP.x + GROUP.width * 0.75, y: GROUP.y + GROUP.height / 2 }

  test("a tap shows the cover, switches nothing, and shows the hint; the cover goes on the lift", async ({ page }) => {
    const p = await at(page, onSegment.x, onSegment.y)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await expect.poll(() => guards(page)).toBe("g-group:pushing")
    await page.mouse.up()
    await expect.poll(() => hint(page)).toBe(GUARD_HINT)
    await expect.poll(() => guards(page)).toBe("")
    await page.waitForTimeout(800)
    expect(values("cmd")).toEqual([])
  })

  test("a push not far enough: no hint, nothing sent, still locked", async ({ page }) => {
    await push(page, onSegment.x, onSegment.y, guardUnlockTravel(GROUP.height) - 4)
    await expect.poll(() => guards(page)).toBe("")
    expect(await hint(page)).toBe("")
    await tap(page, onSegment.x, onSegment.y)
    await page.waitForTimeout(800)
    expect(values("cmd")).toEqual([])
  })

  test("pushed past 45 %, it waits and a tap switches; a change with more than 2 s left does not move the drop at 5 s", async ({ page }) => {
    const before = Date.now()
    await push(page, onSegment.x, onSegment.y, guardUnlockTravel(GROUP.height) + 6)
    await expect.poll(() => guards(page)).toBe("g-group:open")
    const lockedIn = Date.now()
    await tap(page, onSegment.x, onSegment.y)
    await expect.poll(() => values("cmd")).toEqual(["on"])
    // Locked in somewhere between `before` and `lockedIn`: open well before 5 s ...
    await page.waitForTimeout(Math.max(0, before + GUARD_RELOCK_MS - 800 - Date.now()))
    expect(await guards(page)).toBe("g-group:open")
    // ... and gone soon after.
    await expect.poll(() => guards(page), { timeout: Math.max(1000, lockedIn + GUARD_RELOCK_MS + 1000 - Date.now()) }).toBe("")
    // Locked again: a tap shows the cover, sends nothing.
    await tap(page, onSegment.x, onSegment.y)
    await page.waitForTimeout(600)
    expect(values("cmd")).toEqual(["on"])
  })

  test("a change with less than 2 s left: the drop is 2 s after it (decision 13)", async ({ page }) => {
    await push(page, onSegment.x, onSegment.y, guardUnlockTravel(GROUP.height) + 6)
    await expect.poll(() => guards(page)).toBe("g-group:open")
    const lockedIn = Date.now()
    // With well under 2 s left (it locked in at or before lockedIn).
    await page.waitForTimeout(Math.max(0, lockedIn + GUARD_RELOCK_MS - 1300 - Date.now()))
    const late = Date.now()
    await tap(page, onSegment.x, onSegment.y)
    await expect.poll(() => values("cmd")).toEqual(["on"])
    // Without the top-up it would have dropped by now.
    await page.waitForTimeout(Math.max(0, late + GUARD_TOPUP_MS - 400 - Date.now()))
    expect(await guards(page)).toBe("g-group:open")
    await expect.poll(() => guards(page), { timeout: 2000 }).toBe("")
  })

  test("a swipe that starts on it does not page (E6)", async ({ page }) => {
    const start = await at(page, onSegment.x, onSegment.y)
    const end = await at(page, onSegment.x - 180, onSegment.y)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    // Still on the first screen: the Next button is where it was, the cover gone.
    await expect.poll(() => guards(page)).toBe("")
    await push(page, onSegment.x, onSegment.y, guardUnlockTravel(GROUP.height) + 6)
    await expect.poll(() => guards(page)).toBe("g-group:open")
  })

  test("leaving the screen locks it (E2)", async ({ page }) => {
    await push(page, onSegment.x, onSegment.y, guardUnlockTravel(GROUP.height) + 6)
    await expect.poll(() => guards(page)).toBe("g-group:open")
    await tap(page, NEXT.x + 20, NEXT.y + 20)
    await page.waitForTimeout(300)
    await tap(page, NEXT.x + 20, NEXT.y + 20)
    await page.waitForTimeout(300)
    expect(await guards(page)).toBe("")
    await tap(page, onSegment.x, onSegment.y)
    await page.waitForTimeout(600)
    expect(values("cmd")).toEqual([])
  })

  test("hidden while open, it locks; shown again, it is locked (E4)", async ({ page }) => {
    const sw = { x: SWITCHER.x + SW.x + SW.width / 2, y: SWITCHER.y + SW.y + SW.height / 2 }
    await push(page, sw.x, sw.y, guardUnlockTravel(SW.height) + 6)
    await expect.poll(() => guards(page)).toBe("g-switch:open")
    await publish(broker, `${prefix}/panel`, "b")
    await expect.poll(() => guards(page)).toBe("")
    await publish(broker, `${prefix}/panel`, "a")
    await page.waitForTimeout(400)
    await tap(page, sw.x, sw.y)
    await page.waitForTimeout(600)
    expect(values("swcmd")).toEqual([])
  })

  test("the minimum travel: a flat control still needs 20 px (E1)", () => {
    expect(guardUnlockTravel(24)).toBe(20)
  })
})

test.describe("the property and the lock at rest", () => {
  test("«Guard» on a Button Group puts a badge on its top-right corner and nothing else changes", async ({ page }) => {
    const zipPath = await guardedProject("e2e-guard-prop")
    try {
      // The same project, the group not guarded.
      const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      delete project.screens[0].objects[0].properties.guard
      zip.file("project.json", JSON.stringify(project))
      fs.writeFileSync(zipPath, await zip.generateAsync({ type: "nodebuffer" }))
      await loadProject(page, zipPath)
      const { box } = await getMainCanvas(page)
      const shot = async (x: number, y: number, width: number, height: number) => {
        const p = devicePoint(box, x, y)
        await page.mouse.move(0, 0)
        return page.screenshot({ clip: { x: p.x, y: p.y, width, height } })
      }
      // Selected, so its selection frame is in both pictures.
      await tap(page, GROUP.x + 30, GROUP.y + GROUP.height / 2)
      const corner = { x: GROUP.x + GROUP.width - 26, y: GROUP.y + 2, width: 24, height: 24 }
      const rest = { x: GROUP.x + 4, y: GROUP.y + 4, width: GROUP.width - 40, height: GROUP.height - 8 }
      const cornerBefore = await shot(corner.x, corner.y, corner.width, corner.height)
      const restBefore = await shot(rest.x, rest.y, rest.width, rest.height)
      await page.getByText("Push a cover up before it switches").click()
      await expect.poll(async () => (await shot(corner.x, corner.y, corner.width, corner.height)).equals(cornerBefore)).toBe(false)
      expect((await shot(rest.x, rest.y, rest.width, rest.height)).equals(restBefore)).toBe(true)
      await page.screenshot({ path: test.info().outputPath("guarded-group.png") })
    } finally {
      fs.unlinkSync(zipPath)
    }
  })
})
