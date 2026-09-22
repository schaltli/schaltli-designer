import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { BAUSTEINE, COMMAND_PREFIX, STATE_PREFIX, blockFont, measureBlockText } from "../lib/bausteine"
import { minKnobSwitchWidth } from "../components/canvas/renderers/render-switch"
import { switchLabelBox } from "../lib/switch-shape"
import type { ScreenObject } from "../components/project-editor"
import { controlPalette } from "../lib/control-palette"

// The e-paper fixture every other test here uses renders no Switch, so the
// Switch block is tested on the round device, which does.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

// Building blocks (lib/bausteine.ts): pick a block, drag its rectangle, answer
// which instance it is for, and a finished control appears beside its label -
// bound to topics the user never typed.
//
// The instances come from the broker, so this runs against the local one
// (`npm run hil:broker`) with retained values published first, exactly as the
// VanPi bridge publishes them.

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

// The block is selected as a whole once placed, so inspecting one of its
// objects means picking it out of the object tree first - and the tree holds
// the fixture's own objects too, so its rows are searched, never indexed.
async function selectInTree(page: Page, name: string): Promise<void> {
  await page.getByTitle(new RegExp(`^${name} `)).first().click()
}

async function insertBlock(page: Page, block: string, screen?: { width: number; height: number }): Promise<void> {
  await page.getByRole("button", { name: "Block", exact: true }).click()
  await page.getByRole("menuitem", { name: new RegExp(`^${block}`) }).click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, 40, 40, screen)
  const to = devicePoint(box, 300, 100, screen)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

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

test.describe("building blocks", () => {
  test("a Tank block is one object carrying its own name, bound to that tank", async ({ page }) => {
    const broker = await connectBroker()
    try {
      // What the bridge publishes for a van with two calibrated tanks.
      await publish(broker, `${STATE_PREFIX}tank/1/level`, "40")
      await publish(broker, `${STATE_PREFIX}tank/1/name`, "Frischwasser")
      await publish(broker, `${STATE_PREFIX}tank/3/level`, "5")
      await publish(broker, `${STATE_PREFIX}tank/3/name`, "Abwasser")

      await loadProject(page, COMBINED_TEST_PROJECT)
      await insertBlock(page, "Tank")

      // The wizard asks which tank, with the van's own names - nobody types
      // a topic.
      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-1")).toContainText("Frischwasser")
      await page.getByTestId("baustein-instance-3").click()

      // ONE object, not two. The tank's name used to be a label placed beside
      // the bar, which the author then had to keep in step by hand; since
      // 2026-09-19 the name belongs to the control and is drawn above it
      // (docs/2026-09-19-slider-look.md, decision 9).
      await expect(page.locator("h3").first()).toContainText("Bar")
      await expect(page.getByText(`${STATE_PREFIX}tank/3/level`).first()).toBeVisible()
      await expect(page.locator("#level-label")).toHaveValue("Abwasser")
      // The bar's thickness is written into the object and set in the panel
      // (docs/2026-09-19-slider-look.md, decision 14) - Material's 16 to start.
      // Named "Thickness" with its unit in the field since the rebuild
      // (docs/2026-09-20-property-panel.md), so the id is what to hold - and
      // the property is `thickness` since the ring took the same one
      // (2026-09-22); `barThickness` is only read for projects saved before.
      const thickness = page.locator("#thickness")
      await expect(thickness).toHaveValue("16")
      await thickness.fill("30")
      await expect(thickness).toHaveValue("30")
      // And no label object was left behind beside it.
      await expect(page.getByTitle(/^text /).filter({ hasText: "Abwasser" })).toHaveCount(0)

      // It writes in the font the screen's size picks (blockFont above).
      const fontPicker = page.locator("#fontId")
      expect((await fontPicker.innerText()).trim()).not.toBe("")
    } finally {
      broker.end(true)
    }
  })

  test("a Battery block binds to the state of charge, which has no number", async ({ page }) => {
    const broker = await connectBroker()
    try {
      await publish(broker, `${STATE_PREFIX}battery/soc`, "99")

      await loadProject(page, COMBINED_TEST_PROJECT)
      await insertBlock(page, "Battery")

      // One battery, so one entry - and it is still shown, so what is about
      // to be placed is visible before it is.
      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-soc")).toContainText(`${STATE_PREFIX}battery/soc`)
      await page.getByTestId("baustein-instance-soc").click()

      await selectInTree(page, "bar")
      await expect(page.locator("h3").first()).toContainText("Bar")
      await expect(page.getByText(`${STATE_PREFIX}battery/soc`).first()).toBeVisible()
    } finally {
      broker.end(true)
    }
  })

  test("a Switch block reads a relay and writes its command topic", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-firmware not checked out alongside this repo")
    const broker = await connectBroker()
    try {
      await publish(broker, `${STATE_PREFIX}relay/3/power`, "off")
      await publish(broker, `${STATE_PREFIX}relay/3/name`, "Frischwasserpumpe")

      await loadProject(page, SWITCH_TEST_PROJECT)
      await insertBlock(page, "Switch", ROUND_FIXTURE_SCREEN)

      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-3")).toContainText("Frischwasserpumpe")
      await page.getByTestId("baustein-instance-3").click()

      // Reads the relay's state, writes the command topic beside it - the two
      // halves a hand-built Switch gets wrong most often.
      await expect(page.getByTitle(/^text /).filter({ hasText: "Frischwasserpumpe" })).toHaveCount(1)
      // A switch, not a button group. It built a button group until
      // 2026-09-21, which is not what a block called "Switch" should place -
      // a relay that is on or off is the control everybody knows from a
      // phone (docs/2026-09-20-switch-look.md).
      await selectInTree(page, "switch")
      await expect(page.locator("h3").first()).toContainText("Switch")
      await expect(page.getByText(`${STATE_PREFIX}relay/3/power`).first()).toBeVisible()
      await expect(page.getByText(`${COMMAND_PREFIX}relay/3`).first()).toBeVisible()
    } finally {
      broker.end(true)
    }
  })

  test("a Dimmer block is a slider, on its command topic", async ({ page }) => {
    const broker = await connectBroker()
    try {
      await publish(broker, `${STATE_PREFIX}dimmer/2/level`, "50")
      await publish(broker, `${STATE_PREFIX}dimmer/2/name`, "Kuechenlicht")

      // The round fixture, not the e-paper the other blocks use: a Dimmer
      // places a Slider, and since 2026-09-20 a device without touch does not
      // declare one (docs/2026-09-20-control-split.md). On the e-paper the
      // block is correctly offered disabled - a dimmer nobody can move is not
      // a dimmer - which is the whole point of the split and not something to
      // test around.
      await loadProject(page, SWITCH_TEST_PROJECT)
      await insertBlock(page, "Dimmer", ROUND_FIXTURE_SCREEN)

      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await expect(page.getByTestId("baustein-instance-2")).toContainText("Kuechenlicht")
      await page.getByTestId("baustein-instance-2").click()

      // A slider, not a bar: it carries a write topic, and since 2026-09-20
      // that is the type (docs/2026-09-20-control-split.md).
      await expect(page.locator("h3").first()).toContainText("Slider")
      await expect(page.locator("#level-label")).toHaveValue("Kuechenlicht")
      // Reads the dimmer's level, writes its command topic - and is settable,
      // which is what a dimmer needs: five fixed steps was the shape this
      // block had before a level could be set at all
      // (docs/2026-09-17-settable-level.md).
      await expect(page.getByText(`${STATE_PREFIX}dimmer/2/level`).first()).toBeVisible()
      await expect(page.getByText(`${COMMAND_PREFIX}dimmer/2`).first()).toBeVisible()
      // A step of 5 over 0-100: 21 values a finger can reach, and the panel
      // says so.
      await expect(page.getByTestId("step-summary")).toContainText("21 steps")
    } finally {
      broker.end(true)
    }
  })

  test("a Switch block places a switch whose labels fit beside it", () => {
    const block = BAUSTEINE.find((b) => b.id === "switch")!
    const palette = controlPalette("24bit")
    const font = { id: "f", size: 16 }
    const built = block.build({
      instance: { key: "3", label: "Frischwasserpumpe", valueTopic: `${STATE_PREFIX}relay/3/power` },
      // Deliberately far too narrow: the point is that the block does not
      // accept it.
      rect: { x: 0, y: 0, width: 10, height: 48 },
      palette,
      font,
    })

    const sw = built.objects.find((o) => o.type === "switch")!
    expect(sw, "a block called Switch places a switch").toBeTruthy()

    // German, and "on" is the state that makes the track take the colour.
    expect(sw.properties.states.map((s: { label: string }) => s.label)).toEqual(["Aus", "An"])
    expect(sw.properties.states.map((s: { readValue: string }) => s.readValue)).toEqual(["off", "on"])
    expect(sw.properties.states.map((s: { writeValue: string }) => s.writeValue)).toEqual(["off", "on"])
    expect(sw.properties.states[1].showAsOn, "An is the one drawn in colour").toBe(true)

    // The label stands to the right of the track with SWITCH_GAP between it
    // and the object's right edge (switchLabelBox). Measured, not guessed: a
    // block that sizes by a rule of thumb hands over a clipped label, and
    // nobody picked a width here at all.
    const widest = Math.max(
      ...sw.properties.states.map((s: { label: string }) => measureBlockText(s.label, font)),
    )
    expect(sw.width).toBeGreaterThanOrEqual(minKnobSwitchWidth(sw.height, 2, widest))

    const box = switchLabelBox({ ...sw, id: "x", zIndex: 1 } as ScreenObject, 2)
    expect(box.w, "the longest label fits in the space beside the track").toBeGreaterThanOrEqual(widest)

    // And the block's own name, in the text object beside the control. A
    // text object draws clipped to its box, so a box too small does not
    // shrink the writing - it cuts it off, and "Abwasserventil" came out
    // "Abwasserventi" (reported 2026-09-21 from a block dropped into a
    // narrow rectangle).
    const name = built.objects.find((o) => o.type === "text")!
    expect(name.properties.text).toBe("Frischwasserpumpe")
    expect(name.width, "the name is not cut off").toBeGreaterThanOrEqual(
      measureBlockText("Frischwasserpumpe", font),
    )
    // Beside, not on top of: the control starts after the name.
    expect(sw.x).toBeGreaterThanOrEqual(name.x + name.width)
  })

  test("a block's handle cannot be invisible, because it is the fill's own colour", () => {
    // The white-on-white bug this replaces: palette.marker is white, which is
    // right on an arc - its unfilled ring is dark - and invisible on a bar,
    // whose unfilled part was the object's own white background. Every dimmer
    // block shipped before 2026-09-18 drew a white marker on white.
    //
    // It cannot come back, because the handle no longer has a colour of its
    // own: handle and fill are one object that the gap separates (decision 3),
    // so the block must not name a marker colour at all.
    const dimmer = BAUSTEINE.find((b) => b.id === "dimmer")!
    const palette = controlPalette("24bit")
    const built = dimmer.build({
      instance: { key: "2", label: "Kuechenlicht", valueTopic: `${STATE_PREFIX}dimmer/2/level` },
      rect: { x: 0, y: 0, width: 240, height: 60 },
      palette,
      font: undefined,
    })
    // One object, and it carries the name itself.
    expect(built.objects).toHaveLength(1)
    const bar = built.objects[0]
    expect(bar.type).toBe("slider")
    expect(bar.properties.label).toBe("Kuechenlicht")
    expect(bar.width).toBe(240)
    expect(bar.properties.markerColor).toBeUndefined()
    expect(bar.properties.markerStyle).toBeUndefined()
    expect(bar.properties.fillColor).toBe(palette.fill)
  })

  test("without a broker it offers the standard topics", async ({ page }) => {
    // Nothing listens on port 9 - the same stored setting the Deploy dialog
    // and the live preview use.
    await page.addInitScript(() => {
      window.localStorage.setItem("screenbee-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")

    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await expect(page.getByTestId("baustein-instance-2")).toContainText(`${STATE_PREFIX}tank/2/level`)
    await page.getByTestId("baustein-instance-2").click()

    await selectInTree(page, "bar")
    await expect(page.locator("h3").first()).toContainText("Bar")
    await expect(page.getByText(`${STATE_PREFIX}tank/2/level`).first()).toBeVisible()
  })

  // The same rule a tool has: a block whose objects this device cannot draw
  // is offered, but not placeable - the e-paper fixture renders no Switch.
  test("a block the device cannot render is disabled", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Block", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: /^Switch/ })).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByRole("menuitem", { name: /^Tank/ })).not.toHaveAttribute("aria-disabled", "true")
  })

  test("cancelling the wizard places nothing", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const before = await page.getByTitle(/^level-indicator /).count()
    await insertBlock(page, "Tank")
    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByTestId("baustein-source")).toHaveCount(0)
    expect(await page.getByTitle(/^level-indicator /).count()).toBe(before)
  })
})
