import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import fs from "node:fs"
import path from "node:path"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { STATE_PREFIX } from "../lib/bausteine"
import { computeDdfHash } from "../lib/ddf-name"
import { getMainCanvas, devicePoint, revealDevice, waitForDeviceGate, waitForEditorReady } from "./helpers"

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
  // beside both side panels; twice the pixels so labels stay sharp when the
  // handbook shows the picture at a third of its width.
  test.use({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })

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

    // 2. A double click makes the project, on a screen the 4.3B's size.
    await card.dblclick()
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
      clip: { x, y: 0, width: Math.min(1680 - x, menu.x + menu.width + 40 - x), height: menu.y + menu.height + 24 },
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
    await page.getByRole("button", { name: "Deploy", exact: true }).click()
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

    // 6. A successful deploy leaves a checkpoint in Version History.
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
        const at = { x: box.x + box.width / 2 - 180 + (348.14 - 90), y: box.y + box.height / 2 - 180 + (492.72 - 90) }
        await page.mouse.click(at.x, at.y)
        await expect(page.getByText("Rotate Right", { exact: true })).toBeVisible()
        await page.screenshot({ path: path.join(dir, "taste-knob.png") })
        await page.mouse.click(beside.x, beside.y)
      }

      // The device and its frame, cut out of the canvas around its centre.
      const margin = 110
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await page.screenshot({
        path: path.join(dir, `geraet-${board.id}.png`),
        clip: {
          x: cx - board.screen.width / 2 - margin,
          y: cy - board.screen.height / 2 - margin,
          width: board.screen.width + 2 * margin,
          height: board.screen.height + 2 * margin,
        },
      })
    })
  }
})
