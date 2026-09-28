import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import fs from "node:fs"
import path from "node:path"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { STATE_PREFIX } from "../lib/bausteine"
import { computeDdfHash } from "../lib/ddf-name"
import { THEMES } from "../lib/themes"
import { pressDeploy, createProject, getMainCanvas, devicePoint, revealDevice, waitForDeviceGate, waitForEditorReady } from "./helpers"

// The handbook's "Erste Schritte", walked through in the real designer: pick
// the 4.3B, put a tank, the battery, a light switch and a dimmer on the screen
// from building blocks, look at them in the live preview, and send the project
// to a board. Every step asserts what the handbook says happens there, so a
// change that breaks the walkthrough breaks this test (CLAUDE.md, "Handbook").
//
// The same run is what photographs the designer for the handbook: with
// HANDBOOK_SHOTS_DIR set (npm run screenshots, and the Pages workflow) the
// pictures land there, handbuch/public/bilder/ by default - never in git, the
// workflow makes them fresh for every publish. Without it they go to this
// test's own output directory, so an ordinary e2e run leaves nothing behind.
//
// The van is the local broker (npm run hil:broker) with the retained values the
// VanPi bridge would publish; the board is this test's own MQTT client,
// answering the way DeployManager does, like e2e/deploy-dialog.spec.ts.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const ROOT = path.join(__dirname, "..")
const DEVICE_ID = "waveshare-touch-lcd-4v3b"
const SCREEN = { width: 800, height: 480 }
const VIEWPORT_WIDTH = 1920
// Shaped like a real board's id (device id and a MAC), and no real board's.
const INSTANCE_ID = `${DEVICE_ID}-0a1b2c3d4e5f`

const VAN: Record<string, string> = {
  "tank/1/level": "62",
  "tank/1/name": "Frischwasser",
  "tank/2/level": "15",
  "tank/2/name": "Abwasser",
  "battery/soc": "87",
  "relay/1/power": "on",
  "relay/1/name": "Licht",
  "dimmer/1/level": "40",
  "dimmer/1/name": "Leselicht",
}

function connect(clientId: string): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string, retain = true): Promise<void> {
  return new Promise((resolve, reject) =>
    client.publish(topic, payload, { qos: 1, retain }, (err) => (err ? reject(err) : resolve())),
  )
}

function shotsDir(testInfo: import("@playwright/test").TestInfo): string {
  const dir = process.env.HANDBOOK_SHOTS_DIR
    ? path.resolve(ROOT, process.env.HANDBOOK_SHOTS_DIR)
    : testInfo.outputPath("bilder")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function drawBlock(page: Page, block: string, from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: "Block", exact: true }).click()
  await page.getByRole("menuitem", { name: new RegExp(`^${block}`) }).click()
  const { box } = await getMainCanvas(page)
  const a = devicePoint(box, from[0], from[1], SCREEN)
  const b = devicePoint(box, to[0], to[1], SCREEN)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
  // The designer asks the broker what this van has, and says where it looked.
  await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
}

test.describe("handbook: Erste Schritte", () => {
  // Wide enough that the 4.3B's 800 pixels and its frame fit the canvas at 100 %
  // beside the side panels - three since the Projects panel (2026-09-24, +240
  // px; at 1680 the tank landed beside the canvas); twice the pixels so labels
  // stay sharp when the handbook shows the picture at a third of its width.
  test.use({ viewport: { width: VIEWPORT_WIDTH, height: 1000 }, deviceScaleFactor: 2 })

  let van: mqtt.MqttClient
  let board: mqtt.MqttClient

  test.beforeEach(async ({}, testInfo) => {
    van = await connect(`e2e-handbook-van-${testInfo.testId}`)
    for (const [leaf, value] of Object.entries(VAN)) await publish(van, `${STATE_PREFIX}${leaf}`, value)

    // A 4.3B on the broker, announcing the DDF this designer already has, so
    // nothing needs fetching from it.
    board = await connect(INSTANCE_ID)
    const ddf = fs.readFileSync(path.join(ROOT, "public", "ddf", `${DEVICE_ID}.ddf.zip`))
    const release = JSON.parse(fs.readFileSync(path.join(ROOT, "firmware", "manifest.json"), "utf8")).release
    await publish(
      board,
      `${TOPIC_PREFIX}/${INSTANCE_ID}/hello`,
      JSON.stringify({
        deviceId: DEVICE_ID,
        firmwareVersion: release,
        firmwareBuild: release,
        systemGeneration: "1.0",
        ddfHash: computeDdfHash(new Uint8Array(ddf)),
        url: "http://192.0.2.1/ddf.zip",
      }),
    )
    await publish(board, `${TOPIC_PREFIX}/${INSTANCE_ID}/status`, "online")
  })

  test.afterEach(async () => {
    // The board goes; the van's values stay, as the bridge would leave them.
    for (const leaf of ["hello", "status", "deploy"]) await publish(board, `${TOPIC_PREFIX}/${INSTANCE_ID}/${leaf}`, "")
    board.end(true)
    van.end(true)
  })

  test("from the device to a project on the board", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const dir = shotsDir(testInfo)
    const shot = (name: string) => page.screenshot({ path: path.join(dir, `${name}.png`) })
    // A dialog on its own: legible at the handbook's column width, and without
    // the File menu, which stays open behind the Deploy dialog it holds.
    const dialogShot = (name: string) => page.getByRole("dialog").screenshot({ path: path.join(dir, `${name}.png`) })

    // 1. The start screen: every device the designer knows, whether or not
    //    one is on the desk.
    await page.goto("/")
    await waitForDeviceGate(page)
    const card = await revealDevice(page, DEVICE_ID, "curated")
    await expect(page.getByTestId("handbook-link")).toBeVisible()
    // Finding the card may have scrolled; the picture starts at the heading.
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot("start")

    // 2. A double click and a name make the project, on a screen the 4.3B's
    //    size.
    await card.dblclick()
    await createProject(page)
    await waitForEditorReady(page)
    await expect(page.getByText(`${SCREEN.width} × ${SCREEN.height}`)).toBeVisible()
    await shot("editor")

    // 3. Building blocks: the menu, then a tank, named the way the van names it.
    await page.getByRole("button", { name: "Block", exact: true }).click()
    for (const block of ["Tank", "Battery", "Switch", "Dimmer"]) {
      await expect(page.getByRole("menuitem", { name: new RegExp(`^${block}`) })).toBeVisible()
    }
    // Only the corner that matters: the ribbon's end and the open menu.
    const menu = (await page.getByRole("menu").boundingBox())!
    const x = Math.max(0, menu.x - 360)
    await page.screenshot({
      path: path.join(dir, "baustein-menue.png"),
      clip: { x, y: 0, width: Math.min(VIEWPORT_WIDTH - x, menu.x + menu.width + 40 - x), height: menu.y + menu.height + 24 },
    })
    await page.keyboard.press("Escape")

    await drawBlock(page, "Tank", [40, 40], [380, 150])
    await expect(page.getByTestId("baustein-instance-1")).toContainText("Frischwasser")
    await expect(page.getByTestId("baustein-instance-2")).toContainText("Abwasser")
    await dialogShot("baustein-tank")
    await page.getByTestId("baustein-instance-1").click()

    await drawBlock(page, "Battery", [420, 40], [760, 150])
    await page.locator('[data-testid^="baustein-instance-"]').first().click()

    await drawBlock(page, "Switch", [40, 240], [380, 320])
    await expect(page.getByTestId("baustein-instance-1")).toContainText("Licht")
    await page.getByTestId("baustein-instance-1").click()

    await drawBlock(page, "Dimmer", [420, 240], [760, 320])
    await expect(page.getByTestId("baustein-instance-1")).toContainText("Leselicht")
    await page.getByTestId("baustein-instance-1").click()

    // Clicking beside the screen leaves nothing selected, for a clean picture.
    const { box } = await getMainCanvas(page)
    const beside = devicePoint(box, -40, SCREEN.height / 2, SCREEN)
    await page.mouse.click(beside.x, beside.y)
    await shot("screen-fertig")

    // For the designer chapter: a selected object and its properties - the
    // tank's bar, bound to the tank's level.
    const tankAt = devicePoint(box, 210, 110, SCREEN)
    await page.mouse.click(tankAt.x, tankAt.y)
    await expect(page.locator("h3").first()).toContainText("Bar")
    await expect(page.getByText(`${STATE_PREFIX}tank/1/level`).first()).toBeVisible()
    await shot("eigenschaften")
    await page.mouse.click(beside.x, beside.y)

    // The project's topics, which the blocks registered by themselves.
    await page.getByRole("button", { name: "Settings" }).click()
    await expect(page.getByRole("dialog")).toContainText("Project Settings")
    await page.getByRole("dialog").getByRole("button", { name: "Topics", exact: true }).click()
    await expect(page.getByRole("dialog").getByText(`${STATE_PREFIX}tank/1/level`).first()).toBeVisible()
    await dialogShot("einstellungen-topics")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)

    // 4. The preview, live: the van's own values, before any board shows them.
    await page.getByRole("button", { name: "Preview" }).click()
    await expect(page.getByText(/^Live from ws:\/\//)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(`${STATE_PREFIX}tank/1/level`).first()).toBeVisible()
    await shot("vorschau-live")
    // Simulation: the examples instead, and nothing published.
    await page.getByRole("button", { name: "Simulation", exact: true }).click()
    await expect(page.getByText(/^Simulation: examples and Mock Responses/)).toBeVisible()
    await shot("vorschau-simulation")
    await page.getByRole("button", { name: "Exit Preview" }).click()

    // 5. Deploy: the board is offered, up to date with the firmware.
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
    const row = page.getByRole("button").filter({ hasText: INSTANCE_ID })
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    // The board runs the firmware this designer ships, so there is nothing to
    // update - the state a freshly flashed board is in.
    await expect(page.getByTestId("firmware-section")).toContainText("Up to date with the release.", { timeout: 15000 })
    await dialogShot("deploy-dialog")

    // The trigger arrives on the board's own topic; it answers as a board does.
    const trigger = new Promise<{ deployId: string }>((resolve) => {
      board.on("message", (topic, payload) => {
        if (topic === `${TOPIC_PREFIX}/${INSTANCE_ID}/deploy` && payload.length > 0) resolve(JSON.parse(payload.toString()))
      })
    })
    board.subscribe(`${TOPIC_PREFIX}/${INSTANCE_ID}/deploy`)
    await pressDeploy(page)
    const { deployId } = await trigger
    for (const [state, extra] of [
      ["downloading", { percent: 100 }],
      ["verifying", {}],
      ["applying", {}],
      ["rebooting", {}],
    ] as const) {
      await publish(board, `${TOPIC_PREFIX}/${INSTANCE_ID}/deploy-status`, JSON.stringify({ deployId, state, ...extra }), false)
    }
    await expect(page.getByText(`${INSTANCE_ID}: Rebooting`)).toBeVisible({ timeout: 15000 })
    await dialogShot("deploy-fertig")

    // 6. The deploy saved first; Version History shows that version, marked
    //    with the board it went to.
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Version History" }).click()
    await expect(page.getByRole("dialog").getByRole("button", { name: "Restore" }).first()).toBeVisible({ timeout: 15000 })
    await dialogShot("versionen")
  })
})

// The same small van - a tank and the light - on each board, framed the way
// the designer frames it: the device pages show what shape and colour depth
// make of one screen. Built from building blocks, so this also holds that each
// board's toolbar offers them.
test.describe("handbook: the boards side by side", () => {
  test.use({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 2 })

  const BOARDS: { id: string; screen: { width: number; height: number }; tank: [[number, number], [number, number]]; light: [[number, number], [number, number]] }[] = [
    { id: "waveshare-knob-1v8", screen: { width: 360, height: 360 }, tank: [[50, 100], [310, 170]], light: [[70, 210], [290, 260]] },
    { id: "waveshare-touch-lcd-4v3b", screen: { width: 800, height: 480 }, tank: [[60, 60], [740, 170]], light: [[60, 280], [500, 360]] },
    { id: "m5stack-papers3", screen: { width: 960, height: 540 }, tank: [[60, 60], [900, 190]], light: [[60, 320], [600, 410]] },
  ]

  let van: mqtt.MqttClient

  test.beforeEach(async ({}, testInfo) => {
    van = await connect(`e2e-handbook-boards-${testInfo.testId}`)
    for (const [leaf, value] of Object.entries(VAN)) await publish(van, `${STATE_PREFIX}${leaf}`, value)
  })

  test.afterEach(() => {
    van.end(true)
  })

  for (const board of BOARDS) {
    test(`the van on ${board.id}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const dir = shotsDir(testInfo)

      await page.goto("/")
      await waitForDeviceGate(page)
      await (await revealDevice(page, board.id, "curated")).dblclick()
      await createProject(page)
      await waitForEditorReady(page)
      await expect(page.getByText(`${board.screen.width} × ${board.screen.height}`)).toBeVisible()

      const place = async (block: string, [from, to]: [[number, number], [number, number]], name: string) => {
        await page.getByRole("button", { name: "Block", exact: true }).click()
        await page.getByRole("menuitem", { name: new RegExp(`^${block}`) }).click()
        const { box } = await getMainCanvas(page)
        const a = devicePoint(box, from[0], from[1], board.screen)
        const b = devicePoint(box, to[0], to[1], board.screen)
        await page.mouse.move(a.x, a.y)
        await page.mouse.down()
        await page.mouse.move(b.x, b.y, { steps: 8 })
        await page.mouse.up()
        await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
        await expect(page.getByTestId("baustein-instance-1")).toContainText(name)
        await page.getByTestId("baustein-instance-1").click()
      }
      await place("Tank", board.tank, "Frischwasser")
      await place("Switch", board.light, "Licht")

      const { box } = await getMainCanvas(page)
      const beside = devicePoint(box, -60, board.screen.height / 2, board.screen)
      await page.mouse.click(beside.x, beside.y)

      if (board.id === "waveshare-knob-1v8") {
        // The ring's right turn, clicked on the device drawing: its action
        // panel, for the page on hardware buttons. A point deep inside the
        // arrow, as e2e/hardware-button-canvas-clicks.spec.ts found it; the
        // drawing area (<rect id="screen">) starts at 90,90.
        const at = { x: box.x + box.width / 2 - 180 + (523 - 90), y: box.y + box.height / 2 - 180 + (115 - 90) }
        await page.mouse.click(at.x, at.y)
        await expect(page.getByText("Rotate Right", { exact: true })).toBeVisible()
        await page.screenshot({ path: path.join(dir, "taste-knob.png") })
        await page.mouse.click(beside.x, beside.y)
      }

      // The device pages' pictures come from "the homepage showcase" below,
      // cut out of the canvas with each board's new frame; this walk still holds
      // that each board's toolbar offers the building blocks.
    })
  }
})

// The homepage's pictures: the same small van, finished, on three boards, as
// the designer draws it with each board's frame - and the 4.3B once in every
// theme, light and dark (handbuch/index.md, 2026-09-28: "im Moment ist es etwas
// textlastig, von der schönen Oberfläche die man bauen kann, sieht man
// nichts"). Rendered here rather than drawn, so the homepage shows what the
// designer and the boards really show, and changes with them.
//
// Each project is written straight to the project store and opened, so the
// pictures do not depend on the building blocks' own layout. The frames are cut
// out of the canvas's grey in the browser - flood-filled from the corners, the
// knob's round body masked so its two arrows stay behind - and saved as WebP.
test.describe("handbook: the homepage showcase", () => {
  test.use({ viewport: { width: 2200, height: 1400 }, deviceScaleFactor: 2 })

  const S = STATE_PREFIX
  const C = S.replace("/state/", "/cmnd/")
  const LIN = (lo: number, hi: number) => [
    { value: lo, barSizePercent: 0 },
    { value: hi, barSizePercent: 100 },
  ]

  // The van moving along: what the hero steps through, one picture per step.
  const STATES: Record<string, string>[] = [
    { "tank/1/level": "62", "tank/2/level": "18", "battery/soc": "87", "dimmer/1/level": "40", "relay/1/power": "on", "relay/2/power": "off", "relay/3/power": "on", "heater/temp": "19.5", "heater/setpoint": "21" },
    { "tank/1/level": "61", "tank/2/level": "19", "battery/soc": "86", "dimmer/1/level": "55", "relay/1/power": "on", "relay/2/power": "off", "relay/3/power": "on", "heater/temp": "20", "heater/setpoint": "21" },
    { "tank/1/level": "59", "tank/2/level": "21", "battery/soc": "85", "dimmer/1/level": "70", "relay/1/power": "on", "relay/2/power": "on", "relay/3/power": "on", "heater/temp": "20.5", "heater/setpoint": "21" },
    { "tank/1/level": "56", "tank/2/level": "24", "battery/soc": "84", "dimmer/1/level": "70", "relay/1/power": "off", "relay/2/power": "on", "relay/3/power": "on", "heater/temp": "21", "heater/setpoint": "22.5" },
    { "tank/1/level": "55", "tank/2/level": "25", "battery/soc": "84", "dimmer/1/level": "45", "relay/1/power": "off", "relay/2/power": "off", "relay/3/power": "off", "heater/temp": "21.5", "heater/setpoint": "22.5" },
    { "tank/1/level": "55", "tank/2/level": "25", "battery/soc": "86", "dimmer/1/level": "25", "relay/1/power": "on", "relay/2/power": "off", "relay/3/power": "off", "heater/temp": "22", "heater/setpoint": "22.5" },
  ]

  type Obj = { type: string; x: number; y: number; width: number; height: number; properties: Record<string, unknown> }
  type Font = (px: number) => string

  const text = (f: Font, x: number, y: number, w: number, h: number, t: string, size: number, color = "text"): Obj => ({
    type: "text", x, y, width: w, height: h,
    properties: { text: t, fontId: f(size), color, textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
  })
  const onOff = (f: Font, leaf: string, size: number) => ({
    topic: S + leaf,
    writeTopic: C + leaf,
    states: [
      { id: "off", label: "Aus", readValue: "off", writeValue: "off", showAsOn: false },
      { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true },
    ],
    switchStyle: "filled",
    switchColor: "accent",
    fontId: f(size),
  })
  const heater = (f: Font, size: number, thickness: number) => ({
    topic: S + "heater/temp", setpointTopic: S + "heater/setpoint", writeTopic: C + "heater/setpoint", step: 0.5,
    calibrationPoints: LIN(10, 30), minAngle: 225, maxAngle: 135, direction: "cw", thickness,
    displayValue: "value", fillColor: "accent", textColor: "text", fontId: f(size),
  })
  const level = (f: Font, leaf: string, label: string, size: number, thickness: number) => ({
    topic: S + leaf, label, displayValue: "percentage", fillColor: "accent", thickness, textColor: "text", fontId: f(size),
  })

  const cockpit = (f: Font): Obj[] => [
    text(f, 32, 22, 300, 36, "Cockpit", 24),
    text(f, 520, 26, 250, 30, "Samstag, 14:32", 18, "textMuted"),
    { type: "bar", x: 32, y: 78, width: 360, height: 52, properties: level(f, "tank/1/level", "Frischwasser", 18, 16) },
    { type: "bar", x: 32, y: 146, width: 360, height: 52, properties: level(f, "tank/2/level", "Abwasser", 18, 16) },
    { type: "slider", x: 32, y: 222, width: 360, height: 60, properties: { ...level(f, "dimmer/1/level", "Leselicht", 18, 20), writeTopic: C + "dimmer/1", step: 5 } },
    { type: "switch", x: 32, y: 330, width: 150, height: 60, properties: onOff(f, "relay/1/power", 18) },
    { type: "switch", x: 290, y: 330, width: 150, height: 60, properties: onOff(f, "relay/2/power", 18) },
    { type: "switch", x: 548, y: 330, width: 150, height: 60, properties: onOff(f, "relay/3/power", 18) },
    text(f, 36, 400, 200, 30, "Licht", 18, "textMuted"),
    text(f, 294, 400, 200, 30, "Wasserpumpe", 18, "textMuted"),
    text(f, 552, 400, 200, 30, "Boiler", 18, "textMuted"),
    { type: "gauge", x: 430, y: 78, width: 150, height: 150, properties: { topic: S + "battery/soc", minAngle: 225, maxAngle: 135, direction: "cw", thickness: 14, displayValue: "percentage", fillColor: "accent", textColor: "text", fontId: f(24) } },
    text(f, 470, 232, 120, 28, "Batterie", 18, "textMuted"),
    { type: "dial", x: 600, y: 78, width: 170, height: 170, properties: heater(f, 24, 14) },
    text(f, 648, 252, 120, 28, "Heizung", 18, "textMuted"),
  ]
  const knob = (f: Font): Obj[] => [
    { type: "dial", x: 30, y: 30, width: 300, height: 300, properties: heater(f, 35, 22) },
    text(f, 130, 250, 110, 30, "Heizung", 18, "textMuted"),
  ]
  const paper = (f: Font): Obj[] => [
    text(f, 48, 36, 400, 44, "Vorräte", 35),
    { type: "bar", x: 48, y: 110, width: 520, height: 70, properties: level(f, "tank/1/level", "Frischwasser", 24, 24) },
    { type: "bar", x: 48, y: 210, width: 520, height: 70, properties: level(f, "tank/2/level", "Abwasser", 24, 24) },
    { type: "gauge", x: 640, y: 100, width: 240, height: 240, properties: { topic: S + "battery/soc", minAngle: 225, maxAngle: 135, direction: "cw", thickness: 20, displayValue: "percentage", fillColor: "accent", textColor: "text", fontId: f(35) } },
    text(f, 710, 350, 160, 36, "Batterie", 24, "textMuted"),
    { type: "switch", x: 48, y: 330, width: 200, height: 76, properties: onOff(f, "relay/1/power", 24) },
    text(f, 270, 350, 200, 36, "Licht", 24, "textMuted"),
  ]

  // The device pages' picture: one small screen - a tank and the light - the
  // same on every board, so the pages can show what shape and colour depth
  // make of it.
  const compare: Record<string, (f: Font) => Obj[]> = {
    "waveshare-knob-1v8": (f) => [
      { type: "bar", x: 50, y: 110, width: 260, height: 56, properties: level(f, "tank/1/level", "Frischwasser", 18, 16) },
      text(f, 70, 222, 90, 30, "Licht", 18),
      { type: "switch", x: 160, y: 208, width: 130, height: 56, properties: onOff(f, "relay/1/power", 18) },
    ],
    "waveshare-touch-lcd-4v3b": (f) => [
      { type: "bar", x: 60, y: 70, width: 680, height: 64, properties: level(f, "tank/1/level", "Frischwasser", 24, 20) },
      text(f, 60, 300, 140, 36, "Licht", 24),
      { type: "switch", x: 200, y: 286, width: 170, height: 64, properties: onOff(f, "relay/1/power", 24) },
    ],
    "m5stack-papers3": (f) => [
      { type: "bar", x: 60, y: 70, width: 840, height: 80, properties: level(f, "tank/1/level", "Frischwasser", 35, 24) },
      text(f, 60, 340, 160, 44, "Licht", 35),
      { type: "switch", x: 240, y: 322, width: 210, height: 76, properties: onOff(f, "relay/1/power", 35) },
    ],
  }

  const THEME_IDS = ["lavender", "schaltli", "slate", "forest", "ocean", "amber", "terracotta", "garden"]
  const BOARDS = [
    // The hero: every step of the van, in the theme each board is shown in.
    { id: "waveshare-touch-lcd-4v3b", slug: "4v3b", screen: { width: 800, height: 480 }, build: cockpit, width: 1100, hero: { theme: "garden", variant: "dark" }, themes: true, round: false },
    { id: "waveshare-knob-1v8", slug: "knob", screen: { width: 360, height: 360 }, build: knob, width: 640, hero: { theme: "ocean", variant: "dark" }, themes: false, round: true },
    { id: "m5stack-papers3", slug: "papers3", screen: { width: 960, height: 540 }, build: paper, width: 1000, hero: { theme: "slate", variant: "light" }, themes: false, round: false },
  ]

  // Cuts the frame out of the canvas's grey and saves it as WebP, in the page.
  async function cutOut(page: Page, png: Buffer, width: number, round: boolean): Promise<Buffer> {
    const dataUrl = await page.evaluate(
      async ({ src, width, round }) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const c = document.createElement("canvas")
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext("2d")!
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, c.width, c.height)
        const px = data.data
        const w = c.width
        const h = c.height
        const bg = [px[0], px[1], px[2]]
        const near = (i: number) => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) <= 12
        const seen = new Uint8Array(w * h)
        const stack = [0, w - 1, (h - 1) * w, h * w - 1]
        while (stack.length) {
          const p = stack.pop()!
          if (seen[p]) continue
          seen[p] = 1
          if (!near(p * 4)) continue
          px[p * 4 + 3] = 0
          const x = p % w
          if (x > 0) stack.push(p - 1)
          if (x < w - 1) stack.push(p + 1)
          if (p >= w) stack.push(p - w)
          if (p < w * (h - 1)) stack.push(p + w)
        }
        if (round) {
          // The body's radius, read straight down from the centre, where
          // nothing but the body is.
          const cx = Math.floor(w / 2)
          const cy = Math.floor(h / 2)
          let r = 0
          for (let y = cy; y < h; y++) if (px[(y * w + cx) * 4 + 3] !== 0) r = y - cy
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
              const i = (y * w + x) * 4 + 3
              if (d > r + 1) px[i] = 0
              else if (d > r) px[i] = Math.round(px[i] * (r + 1 - d))
            }
          }
        }
        ctx.putImageData(data, 0, 0)
        // Tight around what is left.
        let x0 = w, y0 = h, x1 = 0, y1 = 0
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] === 0) continue
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
        const out = document.createElement("canvas")
        out.width = width
        out.height = Math.round(((y1 - y0 + 1) * width) / (x1 - x0 + 1))
        const octx = out.getContext("2d")!
        octx.imageSmoothingQuality = "high"
        octx.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height)
        return out.toDataURL("image/webp", 0.86)
      },
      { src: `data:image/png;base64,${png.toString("base64")}`, width, round },
    )
    expect(dataUrl.startsWith("data:image/webp")).toBe(true)
    return Buffer.from(dataUrl.split(",")[1], "base64")
  }

  for (const board of BOARDS) {
    test(`the homepage's ${board.slug}`, async ({ page }, testInfo) => {
      test.setTimeout(600_000)
      const dir = shotsDir(testInfo)

      // A project the designer makes for this board: its fonts, frame and DDF.
      await page.goto("/")
      await waitForDeviceGate(page)
      await (await revealDevice(page, board.id, "curated")).dblclick()
      const base = `handbook showcase ${board.slug} ${Date.now().toString(36)}`
      await createProject(page, base)
      await waitForEditorReady(page)
      await page.keyboard.press("Control+s")
      let template: any
      await expect(async () => {
        const res = await page.request.get(`/api/projects/${encodeURIComponent(base)}`)
        expect(res.status()).toBe(200)
        template = (await res.json()).project
      }).toPass({ timeout: 20000 })

      const fonts: { id: string; size: number }[] = template.fonts
      const regular = fonts.filter((ft) => !/B\d\d/.test(ft.id))
      const f: Font = (px) => regular.reduce((a, b) => (Math.abs(b.size - px) < Math.abs(a.size - px) ? b : a)).id
      const master = template.screens.find((s: any) => s.isMaster)
      const screen = template.screens.find((s: any) => !s.isMaster)
      const place = (objects: Obj[]) => objects.map((o, i) => ({ ...o, id: `obj-${i + 1}`, zIndex: i }))
      delete screen.themeId

      const photograph = async (
        name: string,
        values: Record<string, string>,
        theme: string,
        variant: string,
        objects: Obj[] = board.build(f),
      ) => {
        screen.objects = place(objects)
        master.themeId = theme
        template.topics = Object.entries(values).map(([leaf, v]) => ({ topic: S + leaf, examples: [v] }))
        const project = `${base} ${name}`
        expect((await page.request.post("/api/projects", { data: { name: project, project: template } })).status()).toBe(201)
        try {
          await page.goto(`/projects/${encodeURIComponent(project)}`)
          await waitForEditorReady(page)
          const dark = page.getByRole("switch", { name: "Dark" })
          if (await dark.isEnabled()) {
            if (((await dark.getAttribute("aria-checked")) === "true") !== (variant === "dark")) await dark.click()
          }
          // The objects' own values, drawn: the dial's number shows the setpoint.
          await expect(page.getByRole("switch", { name: "Dark" })).toBeVisible()
          await page.waitForTimeout(600)
          const { box } = await getMainCanvas(page)
          const margin = 120
          const cx = box.x + box.width / 2
          const cy = box.y + box.height / 2
          const png = await page.screenshot({
            clip: {
              x: cx - board.screen.width / 2 - margin,
              y: cy - board.screen.height / 2 - margin,
              width: board.screen.width + 2 * margin,
              height: board.screen.height + 2 * margin,
            },
          })
          fs.writeFileSync(path.join(dir, `${name}.webp`), await cutOut(page, png, board.width, board.round))
        } finally {
          await page.request.delete(`/api/projects/${encodeURIComponent(project)}`)
        }
      }

      try {
        for (let i = 0; i < STATES.length; i++) {
          await photograph(`start-${board.slug}-${i + 1}`, STATES[i], board.hero.theme, board.hero.variant)
        }
        // A new project's own theme, light: what anyone sees first.
        await photograph(`geraet-${board.id}`, STATES[0], "lavender", "light", compare[board.id](f))
        if (board.themes) {
          // What the switcher on the homepage offers: each theme's name and the
          // two ends of its gradient, straight from the designer's themes.
          expect(THEMES.map((t) => t.id)).toEqual(THEME_IDS)
          fs.writeFileSync(
            path.join(dir, "themes.json"),
            JSON.stringify(
              THEMES.map((t) => ({ id: t.id, name: t.name, light: [t.light.accent, t.light.accentEnd], dark: [t.dark.accent, t.dark.accentEnd] })),
            ),
          )
          for (const theme of THEME_IDS) {
            for (const variant of ["light", "dark"]) await photograph(`theme-${theme}-${variant}`, STATES[0], theme, variant)
          }
        }
      } finally {
        await page.request.delete(`/api/projects/${encodeURIComponent(base)}`)
      }
      for (let i = 1; i <= STATES.length; i++) expect(fs.existsSync(path.join(dir, `start-${board.slug}-${i}.webp`))).toBe(true)
    })
  }
})
