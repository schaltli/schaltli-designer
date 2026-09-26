import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import JSZip from "jszip"
import { readFile, writeFile } from "node:fs/promises"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { BAUSTEINE, COMMAND_PREFIX, STATE_PREFIX, blockFont, discoverInstances, examplesWith, fallbackInstances, measureBlockText } from "../lib/bausteine"
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
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
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
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
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

// What a block leaves in the project's Topics list (docs/2026-09-25-block-
// topics.md): every topic its objects read or write, the name topic where the
// van publishes one, and examples a van would really send. The list was right
// about which topics from the first block on (2026-09-16), and nothing checked
// it until 2026-09-25; the examples were 45/0/100 for every tank.
test.describe("what a block declares", () => {
  const blockBuild = (id: string) => {
    const def = BAUSTEINE.find((b) => b.id === id)!
    const instance = fallbackInstances(def)[0]
    return def.build({ instance, rect: { x: 0, y: 0, width: 240, height: 60 }, palette: controlPalette("24bit") })
  }
  const declared = (id: string) =>
    Object.fromEntries(blockBuild(id).topics.map((t) => [t.topic, { type: t.type, examples: t.examples }]))

  test("without a broker, each block declares its topics with a van's examples", () => {
    expect(declared("tank")).toEqual({
      [`${STATE_PREFIX}tank/1/level`]: { type: "numeric", examples: ["72", "35", "8"] },
      [`${STATE_PREFIX}tank/1/name`]: { type: "text", examples: ["Tank 1"] },
    })
    // The bridge publishes no name for the battery, so there is none to declare.
    expect(declared("battery")).toEqual({
      [`${STATE_PREFIX}battery/soc`]: { type: "numeric", examples: ["87", "54", "12"] },
    })
    expect(declared("switch")).toEqual({
      [`${STATE_PREFIX}relay/1/power`]: { type: "text", examples: ["on", "off"] },
      [`${COMMAND_PREFIX}relay/1`]: { type: "text", examples: ["on", "off"] },
      [`${STATE_PREFIX}relay/1/name`]: { type: "text", examples: ["Relay 1"] },
    })
    // Every dimmer example is one of its steps of 5, or the block is drawn
    // with no step marked while it is being designed.
    expect(declared("dimmer")).toEqual({
      [`${STATE_PREFIX}dimmer/1/level`]: { type: "numeric", examples: ["60", "25", "100"] },
      [`${COMMAND_PREFIX}dimmer/1`]: { type: "numeric", examples: ["60", "25", "100"] },
      [`${STATE_PREFIX}dimmer/1/name`]: { type: "text", examples: ["Dimmer 1"] },
    })
  })

  test("examples put a reported value first, never twice, three at most", () => {
    expect(examplesWith(undefined, ["72", "35", "8"])).toEqual(["72", "35", "8"])
    expect(examplesWith("40", ["72", "35", "8"])).toEqual(["40", "72", "35"])
    expect(examplesWith("35", ["72", "35", "8"])).toEqual(["35", "72", "8"])
    expect(examplesWith("on", ["on", "off"])).toEqual(["on", "off"])
    expect(examplesWith("off", ["on", "off"])).toEqual(["off", "on"])
    expect(examplesWith("  ", ["72", "35", "8"])).toEqual(["72", "35", "8"])
    expect(examplesWith("abc", ["72", "35", "8"], (v) => !Number.isNaN(Number(v)))).toEqual(["72", "35", "8"])
  })

  // What the van reported while the block was placed leads the examples, so
  // the preview shows the van as it is. Read off the same retained snapshot
  // the wizard reads.
  const declaredFrom = (id: string, values: Record<string, string>) => {
    const def = BAUSTEINE.find((b) => b.id === id)!
    const [instance] = discoverInstances(def, values)
    const built = def.build({ instance, rect: { x: 0, y: 0, width: 240, height: 60 }, palette: controlPalette("24bit") })
    return Object.fromEntries(built.topics.map((t) => [t.topic, t.examples]))
  }

  test("a reported value comes first, and a reported name is the name's example", () => {
    const tank = declaredFrom("tank", { [`${STATE_PREFIX}tank/1/level`]: "40", [`${STATE_PREFIX}tank/1/name`]: "Frischwasser" })
    expect(tank[`${STATE_PREFIX}tank/1/level`]).toEqual(["40", "72", "35"])
    expect(tank[`${STATE_PREFIX}tank/1/name`]).toEqual(["Frischwasser"])

    expect(declaredFrom("battery", { [`${STATE_PREFIX}battery/soc`]: "91" })[`${STATE_PREFIX}battery/soc`]).toEqual(["91", "87", "54"])

    const relay = declaredFrom("switch", { [`${STATE_PREFIX}relay/3/power`]: "off" })
    expect(relay[`${STATE_PREFIX}relay/3/power`]).toEqual(["off", "on"])
    expect(relay[`${COMMAND_PREFIX}relay/3`]).toEqual(["off", "on"])

    // Moved onto the dimmer's step of 5, like its defaults.
    const dimmer = declaredFrom("dimmer", { [`${STATE_PREFIX}dimmer/2/level`]: "43" })
    expect(dimmer[`${STATE_PREFIX}dimmer/2/level`]).toEqual(["45", "60", "25"])
    expect(dimmer[`${COMMAND_PREFIX}dimmer/2`]).toEqual(["45", "60", "25"])
  })

  test("a reported value that does not fit leaves the defaults", () => {
    expect(declaredFrom("tank", { [`${STATE_PREFIX}tank/1/level`]: "abc" })[`${STATE_PREFIX}tank/1/level`]).toEqual(["72", "35", "8"])
    expect(declaredFrom("tank", { [`${STATE_PREFIX}tank/1/level`]: "140" })[`${STATE_PREFIX}tank/1/level`]).toEqual(["72", "35", "8"])
    expect(declaredFrom("switch", { [`${STATE_PREFIX}relay/1/power`]: "ON!" })[`${STATE_PREFIX}relay/1/power`]).toEqual(["on", "off"])
  })

  // What the Topics tab in Project Settings lists: each topic with its type
  // and a line of examples, read off the dialog's text in that order.
  async function topicsInSettings(page: Page): Promise<Record<string, { type: string; examples: string }>> {
    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Topics", exact: true }).click()
    await expect(dialog.getByRole("button", { name: "Add Topic" })).toBeVisible()
    const lines = (await dialog.innerText()).split("\n").map((l) => l.trim()).filter(Boolean)
    const found: Record<string, { type: string; examples: string }> = {}
    lines.forEach((line, i) => {
      if ((line.startsWith(STATE_PREFIX) || line.startsWith(COMMAND_PREFIX)) && lines[i + 2] === "Examples:") found[line] = { type: lines[i + 1], examples: lines[i + 3] }
    })
    await page.keyboard.press("Escape")
    return found
  }

  const noBroker = async (page: Page) =>
    page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })

  test("placed without a broker, the Topics list has the block's topics and examples", async ({ page }) => {
    await noBroker(page)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-2").click()

    const topics = await topicsInSettings(page)
    expect(topics[`${STATE_PREFIX}tank/2/level`]).toEqual({ type: "numeric", examples: "72, 35, 8" })
    expect(topics[`${STATE_PREFIX}tank/2/name`]).toEqual({ type: "text", examples: "Tank 2" })
  })

  // The whole way through, with the local broker (npm run hil:broker): the
  // spec's own success criterion, a van reporting 72 % and "Frischwasser".
  // Tank 7, which no other test here publishes, cleared again afterwards.
  test("placed on a van reporting 72 and Frischwasser, the Topics list starts with them", async ({ page }) => {
    const broker = await connectBroker()
    try {
      await publish(broker, `${STATE_PREFIX}tank/7/level`, "72")
      await publish(broker, `${STATE_PREFIX}tank/7/name`, "Frischwasser")

      await loadProject(page, COMBINED_TEST_PROJECT)
      await insertBlock(page, "Tank")
      await expect(page.getByTestId("baustein-source")).toContainText("Found on", { timeout: 15000 })
      await page.getByTestId("baustein-instance-7").click()

      const topics = await topicsInSettings(page)
      expect(topics[`${STATE_PREFIX}tank/7/level`]).toEqual({ type: "numeric", examples: "72, 35, 8" })
      expect(topics[`${STATE_PREFIX}tank/7/name`]).toEqual({ type: "text", examples: "Frischwasser" })
    } finally {
      await publish(broker, `${STATE_PREFIX}tank/7/level`, "")
      await publish(broker, `${STATE_PREFIX}tank/7/name`, "")
      broker.end(true)
    }
  })

  // A topic the project already has is the user's - maybe typed by hand, maybe
  // edited - and a block placed on it must not overwrite it.
  test("a topic the project already has keeps its type and examples", async ({ page }, testInfo) => {
    const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.topics.push({ id: "topic_mine", topic: `${STATE_PREFIX}tank/2/level`, type: "numeric", examples: ["11", "22"] })
    zip.file("project.json", JSON.stringify(project, null, 2))
    const own = testInfo.outputPath("own-tank-topic.zip")
    await writeFile(own, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))

    await noBroker(page)
    await loadProject(page, own)
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-2").click()

    const topics = await topicsInSettings(page)
    expect(topics[`${STATE_PREFIX}tank/2/level`]).toEqual({ type: "numeric", examples: "11, 22" })
    // The missing one is still added.
    expect(topics[`${STATE_PREFIX}tank/2/name`]).toEqual({ type: "text", examples: "Tank 2" })
  })
})

// The Theme block (docs/2026-09-25-theme-topic.md): a knob switch between
// light and dark for the whole installation. It reads schaltli/state/theme -
// a topic with nothing below its group - and asks on schaltli/cmnd/theme; the
// bridge answers. Dark is the on state and carries the moon.
test.describe("the Theme block", () => {
  const THEME = BAUSTEINE.find((b) => b.id === "theme")!

  test("reads the theme state, asks on the theme command, and carries the moon while dark", () => {
    const [instance] = fallbackInstances(THEME)
    expect(instance.valueTopic).toBe(`${STATE_PREFIX}theme`)
    const built = THEME.build({ instance, rect: { x: 0, y: 0, width: 240, height: 60 }, palette: controlPalette("24bit") })

    const [label, sw] = built.objects as ScreenObject[]
    expect(label.type).toBe("text")
    expect(label.properties.text).toBe("Theme")
    expect(sw.type).toBe("switch")
    expect(sw.properties.topic).toBe(`${STATE_PREFIX}theme`)
    expect(sw.properties.writeTopic).toBe(`${COMMAND_PREFIX}theme`)
    expect(sw.properties.states.map((s: any) => [s.label, s.readValue, s.writeValue, s.showAsOn])).toEqual([
      ["Hell", "light", "light", false],
      ["Dunkel", "dark", "dark", true],
    ])
    // The moon is on the dark state only: a knob draws its icon only when on.
    expect(sw.properties.states[0].iconAssetId).toBeUndefined()
    expect(sw.properties.states[1].iconAssetId).toBe("baustein-theme-moon")
    expect(built.assets?.map((a) => [a.id, a.type])).toEqual([["baustein-theme-moon", "icon"]])
    expect(atob(built.assets![0].data.split(",")[1])).toContain('fill="currentColor"')

    expect(Object.fromEntries(built.topics.map((t) => [t.topic, t.examples]))).toEqual({
      [`${STATE_PREFIX}theme`]: ["light", "dark"],
      [`${COMMAND_PREFIX}theme`]: ["light", "dark"],
    })
  })

  test("finds the theme the broker holds, and offers it when the broker holds none", () => {
    const found = discoverInstances(THEME, { [`${STATE_PREFIX}theme`]: "dark", [`${STATE_PREFIX}relay/1/power`]: "on" })
    expect(found).toEqual([{ key: "theme", label: "Theme", valueTopic: `${STATE_PREFIX}theme`, reportedValue: "dark" }])
    // What the van holds leads the examples.
    const built = THEME.build({ instance: found[0], rect: { x: 0, y: 0, width: 240, height: 60 }, palette: controlPalette("24bit") })
    expect(built.topics[0].examples).toEqual(["dark", "light"])
    // Never switched: nothing on the broker, and the wizard falls back.
    expect(discoverInstances(THEME, {})).toEqual([])
    // The battery, the other single group, still has its leaf.
    const battery = BAUSTEINE.find((b) => b.id === "battery")!
    expect(fallbackInstances(battery)[0].valueTopic).toBe(`${STATE_PREFIX}battery/soc`)
  })

  test("placed twice, it brings its moon into the project once", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, SWITCH_TEST_PROJECT)
    for (let i = 0; i < 2; i++) {
      await insertBlock(page, "Theme", ROUND_FIXTURE_SCREEN)
      await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
      await page.getByTestId("baustein-instance-theme").click()
      await expect(page.getByTestId("baustein-source")).toHaveCount(0)
    }

    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))

    expect(project.assets.filter((a: any) => a.id === "baustein-theme-moon")).toHaveLength(1)
    const switches = project.screens.flatMap((s: any) => s.objects).filter((o: any) => o.properties?.writeTopic === `${COMMAND_PREFIX}theme`)
    expect(switches).toHaveLength(2)
    expect(project.topics.map((t: any) => t.topic)).toEqual(expect.arrayContaining([`${STATE_PREFIX}theme`, `${COMMAND_PREFIX}theme`]))
  })

  test("is not offered on a device with one variant", async ({ page }) => {
    // The e-paper fixture is 1 bit: a theme has only its light variant there.
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Block", exact: true }).click()
    const item = page.getByRole("menuitem", { name: /^Theme/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toContainText("Only on a colour device")
  })
})
