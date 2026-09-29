import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import path from "path"
import JSZip from "jszip"
import { readFile, writeFile } from "node:fs/promises"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { BAUSTEINE, COMMAND_PREFIX, STATE_PREFIX, blockFont, discoverInstances, examplesWith, blockSupported, defaultOptions, fallbackInstances, labelText, measureBlockText, placedObjects } from "../lib/bausteine"
import { resolve } from "../lib/placeholders"
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

// The block is selected as a whole once placed - since 2026-09-29 it arrives
// as one group (lib/object-groups.ts) - so inspecting one of its objects
// means picking it out of the object tree first, which goes inside the
// group. The tree holds the fixture's own objects too, so its rows are
// searched, never indexed.
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
  test("a Tank block is a bar with its name as a text above it, bound to that tank", async ({ page }) => {
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
      await page.getByTestId("baustein-insert").click()

      // Two objects: the tank's name is a text of its own above the bar. From
      // 2026-09-19 to 2026-09-29 the name belonged to the bar and was drawn on
      // a header line; a Bar has no name any more, so it is a Text again -
      // and the two arrive in one group, which is what is selected.
      await expect(page.locator("h3").first()).toContainText("Group")
      await expect(page.getByTitle(/^text /).filter({ hasText: "Abwasser" })).toHaveCount(1)
      // The label follows the van's name for the tank, with the name found
      // while placing as its fallback (2026-09-29).
      await selectInTree(page, "text")
      await expect(page.locator("#text")).toHaveValue(`{topic:${STATE_PREFIX}tank/3/name ?? "Abwasser"}`)
      await selectInTree(page, "bar")
      await expect(page.locator("h3").first()).toContainText("Bar")
      await expect(page.getByText(`${STATE_PREFIX}tank/3/level`).first()).toBeVisible()
      // And the bar's panel offers no name of its own to fill in.
      await expect(page.locator("#level-label")).toHaveCount(0)
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
      await page.getByTestId("baustein-insert").click()

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
      await page.getByTestId("baustein-insert").click()

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
      await page.getByTestId("baustein-insert").click()

      // Its name is a text above it, as a Tank's is.
      await expect(page.getByTitle(/^text /).filter({ hasText: "Kuechenlicht" })).toHaveCount(1)
      // A slider, not a bar: it carries a write topic, and since 2026-09-20
      // that is the type (docs/2026-09-20-control-split.md).
      await selectInTree(page, "slider")
      await expect(page.locator("h3").first()).toContainText("Slider")
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

  // The label is the van's name, live: a placeholder on the name topic with
  // the name found while placing behind `??` (docs/2026-09-29-block-options.md).
  test("a block's label is its name topic, with the name found as the fallback", () => {
    const nameTopic = `${STATE_PREFIX}tank/1/name`
    const text = labelText({ key: "1", label: "Frischwasser", valueTopic: `${STATE_PREFIX}tank/1/level`, nameTopic })
    expect(text).toBe(`{topic:${nameTopic} ?? "Frischwasser"}`)
    // Renamed in the van, the screen says the new name; before any name has
    // arrived, the one found while placing.
    expect(resolve(text, (ref) => (ref.path === nameTopic ? "Trinkwasser" : undefined))).toBe("Trinkwasser")
    expect(resolve(text, () => undefined)).toBe("Frischwasser")
    // Quoted text cannot hold a `"`; the name still reads.
    const quoted = labelText({ key: "1", label: 'Tank "gross"', valueTopic: "x", nameTopic })
    expect(resolve(quoted, () => undefined)).toBe("Tank 'gross'")
    // No name topic (Battery, Theme): the literal label.
    expect(labelText({ key: "soc", label: "Battery", valueTopic: "x" })).toBe("Battery")
  })

  for (const id of ["tank", "switch", "dimmer"]) {
    test(`a ${id} block writes the placeholder, sized for the name rather than the placeholder`, () => {
      const block = BAUSTEINE.find((b) => b.id === id)!
      const font = { id: "f", size: 16 }
      const [instance] = fallbackInstances(block).filter((i) => i.key === "2")
      expect(instance.nameTopic).toBe(`${STATE_PREFIX}${block.group}/2/name`)
      const built = block.build({
        instance,
        rect: { x: 0, y: 0, width: 60, height: 40 },
        palette: controlPalette("24bit"),
        font,
      })
      const name = built.objects.find((o) => o.type === "text")!
      expect(name.properties.text).toBe(`{topic:${instance.nameTopic} ?? "${instance.label}"}`)
      // Wide enough for the name it shows, and no wider than the name needs
      // beyond the rectangle: the placeholder's own length is not what shows.
      expect(name.width).toBeGreaterThanOrEqual(measureBlockText(instance.label, font))
      expect(name.width).toBeLessThan(measureBlockText(name.properties.text, font))
    })
  }

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
    const bar = built.objects.find((o) => o.type === "slider")!
    expect(bar.width).toBe(240)
    expect(bar.properties.markerColor).toBeUndefined()
    expect(bar.properties.markerStyle).toBeUndefined()
    expect(bar.properties.fillColor).toBe(palette.fill)
  })

  // A Bar and a Slider have no name of their own since 2026-09-29, so a block
  // built on one writes its name as a Text object where the bar's header line
  // used to put it: above the bar, one line of the block's font tall, the bar
  // taking the rest of the rectangle that was dragged.
  for (const id of ["tank", "battery", "dimmer"]) {
    test(`a ${id} block writes its name as a Text object above the bar`, () => {
      const block = BAUSTEINE.find((b) => b.id === id)!
      const font = { id: "f", size: 16 }
      const rect = { x: 20, y: 30, width: 240, height: 60 }
      const built = block.build({
        instance: { key: "2", label: "Kuechenlicht", valueTopic: `${STATE_PREFIX}${block.group}/2/level` },
        rect,
        palette: controlPalette("24bit"),
        font,
      })
      expect(built.objects.map((o) => o.type)).toEqual(["text", id === "dimmer" ? "slider" : "bar"])
      expect(block.requiredObjectTypes).toContain("text")
      const [name, bar] = built.objects
      expect(name.properties.text).toBe("Kuechenlicht")
      expect(name.properties.fontId).toBe("f")
      // The bar carries neither a name nor an icon.
      expect(bar.properties).not.toHaveProperty("label")
      expect(bar.properties).not.toHaveProperty("iconAssetId")
      // The name on top, left-aligned with the bar; the bar right under it,
      // and the two together fill what was dragged.
      expect(name.x).toBe(rect.x)
      expect(name.y).toBe(rect.y)
      expect(bar.x).toBe(rect.x)
      expect(bar.width).toBe(rect.width)
      expect(bar.y).toBeGreaterThanOrEqual(name.y + name.height)
      expect(bar.y - (name.y + name.height)).toBeLessThanOrEqual(1)
      expect(bar.y + bar.height).toBe(rect.y + rect.height)
    })
  }

  // Placed, a block is one group: its name and its control inside it, where
  // build() put them, so the two move together - and a device, which has
  // never heard of a group, gets the two objects (lib/object-groups.ts).
  for (const id of ["tank", "battery", "dimmer", "switch", "theme"]) {
    test(`a placed ${id} block is one group holding its label and its control`, () => {
      const block = BAUSTEINE.find((b) => b.id === id)!
      const [instance] = fallbackInstances(block)
      const rect = { x: 20, y: 30, width: 240, height: 60 }
      const built = block.build({ instance, rect, palette: controlPalette("24bit"), font: { id: "f", size: 16 } })
      const placed = placedObjects(built)
      expect(placed).toHaveLength(1)
      const [group] = placed
      expect(group.type).toBe("group")
      expect(group.children!.map((c) => c.type)).toEqual(built.objects.map((o) => o.type))
      // Where build() put each piece, now relative to the group.
      built.objects.forEach((piece, i) => {
        expect(group.x + group.children![i].x).toBe(piece.x)
        expect(group.y + group.children![i].y).toBe(piece.y)
      })
      expect(group.x).toBe(Math.min(...built.objects.map((o) => o.x)))
      expect(group.y).toBe(Math.min(...built.objects.map((o) => o.y)))
      // A device is never asked to draw a group.
      expect(block.requiredObjectTypes).not.toContain("group")
    })
  }

  test("placed without a broker, a Tank block arrives as one group in the object list", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-2").click()
    await page.getByTestId("baustein-insert").click()

    // Selected as a whole, and the list shows the group with both inside.
    await expect(page.locator("h3").first()).toContainText("Group")
    const header = (await page.locator("h3").first().textContent()) ?? ""
    const groupId = header.replace("Group", "").trim()
    await expect(page.locator(`[data-object-id="${groupId}"]`)).toHaveAttribute("style", /padding-left:\s*4px/)
    const inside = page.locator('[data-object-id][style*="padding-left: 20px"]')
    await expect(inside).toHaveCount(2)
    await expect(inside.first()).toHaveAttribute("title", /^(text|bar) /)
    await expect(inside.nth(1)).toHaveAttribute("title", /^(text|bar) /)
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
    await page.getByTestId("baustein-insert").click()

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

  // Picking the tank opens the options; Insert places it (2026-09-29,
  // docs/2026-09-29-block-options.md).
  test("picking an instance opens the options, prefilled; Insert places it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    const before = await page.getByTitle(/^bar /).count()
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-2").click()

    // Nothing is placed yet; the second step says what was picked.
    await expect(page.getByTestId("baustein-chosen")).toContainText("Tank 2")
    expect(await page.getByTitle(/^bar /).count()).toBe(before)
    await expect(page.locator("#baustein-label")).toHaveValue(`{topic:${STATE_PREFIX}tank/2/name ?? "Tank 2"}`)

    // Back is the list again, and a different pick prefills anew.
    await page.getByRole("button", { name: "Back" }).click()
    await page.getByTestId("baustein-instance-3").click()
    await expect(page.locator("#baustein-label")).toHaveValue(`{topic:${STATE_PREFIX}tank/3/name ?? "Tank 3"}`)
    await page.getByTestId("baustein-insert").click()

    await expect(page.getByTestId("baustein-chosen")).toHaveCount(0)
    await selectInTree(page, "text")
    await expect(page.locator("#text")).toHaveValue(`{topic:${STATE_PREFIX}tank/3/name ?? "Tank 3"}`)
  })

  test("a label typed over in the dialog is placed as typed", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-1").click()
    await page.locator("#baustein-label").fill("Wasser")
    await page.getByTestId("baustein-insert").click()

    await selectInTree(page, "text")
    await expect(page.locator("#text")).toHaveValue("Wasser")
  })

  test("Esc on the options step places nothing", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    const before = await page.getByTitle(/^bar /).count()
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-1").click()
    await expect(page.getByTestId("baustein-chosen")).toBeVisible()
    await page.keyboard.press("Escape")

    await expect(page.getByTestId("baustein-chosen")).toHaveCount(0)
    expect(await page.getByTitle(/^bar /).count()).toBe(before)
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
    await page.getByTestId("baustein-insert").click()

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
      await page.getByTestId("baustein-insert").click()

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
    await page.getByTestId("baustein-insert").click()

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
      await page.getByTestId("baustein-insert").click()
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
    // Each in the group its block arrives in, so the whole tree is searched.
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const switches = deep(project.screens.flatMap((s: any) => s.objects)).filter((o: any) => o.properties?.writeTopic === `${COMMAND_PREFIX}theme`)
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

// How a block looks and where its label goes, chosen in the Insert dialog
// (docs/2026-09-29-block-options.md): a tank as a bar, a gauge or a number,
// a relay as a switch or buttons, a dimmer as a slider or a dial; the label
// above or on the left.
test.describe("a block's look", () => {
  const rect = { x: 20, y: 30, width: 300, height: 120 }
  const font = { id: "f", size: 16 }
  const EXPECTED: Record<string, Record<string, string>> = {
    tank: { bar: "bar", gauge: "gauge", number: "text" },
    battery: { bar: "bar", gauge: "gauge", number: "text" },
    switch: { switch: "switch", buttons: "button-group" },
    dimmer: { slider: "slider", dial: "dial" },
    theme: { switch: "switch", buttons: "button-group" },
  }

  for (const block of BAUSTEINE) {
    for (const look of block.looks) {
      test(`a ${block.id} as ${look.id} is a label and a ${EXPECTED[block.id][look.id]}, on the same topics`, () => {
        const [instance] = fallbackInstances(block)
        const built = block.build({ instance, rect, palette: controlPalette("24bit"), font, options: { look: look.id } })
        expect(built.objects.map((o) => o.type)).toEqual(["text", EXPECTED[block.id][look.id]])
        const control = built.objects[1]
        if (look.id === "number") {
          expect(control.properties.text).toBe(`{topic:${instance.valueTopic}:F0} %`)
        } else {
          expect(control.properties.topic).toBe(instance.valueTopic)
        }
        // A look that writes writes where the default look does.
        const defaultBuilt = block.build({ instance, rect, palette: controlPalette("24bit"), font })
        expect(control.properties.writeTopic).toBe(defaultBuilt.objects[1].properties.writeTopic)
        // The topics declared do not depend on the look.
        expect(built.topics).toEqual(defaultBuilt.topics)
        // A round level is square.
        if (control.type === "gauge" || control.type === "dial") expect(control.width).toBe(control.height)
        if (control.type === "dial") expect(control.properties.step).toBe(5)
      })
    }

    test(`a ${block.id}'s default options place what it placed without any`, () => {
      const [instance] = fallbackInstances(block)
      const input = { instance, rect, palette: controlPalette("24bit"), font }
      expect(block.build({ ...input, options: defaultOptions(block, instance) })).toEqual(block.build(input))
    })
  }

  test("the label on the left sits beside the control, above sits over it", () => {
    const tank = BAUSTEINE.find((b) => b.id === "tank")!
    const [instance] = fallbackInstances(tank)
    const input = { instance, rect, palette: controlPalette("24bit"), font }

    const [leftLabel, leftBar] = tank.build({ ...input, options: { labelPosition: "left" } }).objects
    expect(leftBar.x).toBeGreaterThanOrEqual(leftLabel.x + leftLabel.width)
    expect(leftBar.y).toBe(rect.y)
    expect(leftBar.height).toBe(rect.height)
    expect(leftBar.x + leftBar.width).toBe(rect.x + rect.width)

    const [aboveLabel, aboveBar] = tank.build({ ...input, options: { labelPosition: "above" } }).objects
    expect(aboveBar.x).toBe(rect.x)
    expect(aboveBar.y).toBeGreaterThanOrEqual(aboveLabel.y + aboveLabel.height)
    expect(aboveBar.width).toBe(rect.width)
  })

  test("a look the device cannot draw is not the default, and a block with one it can is offered", () => {
    const tank = BAUSTEINE.find((b) => b.id === "tank")!
    const dimmer = BAUSTEINE.find((b) => b.id === "dimmer")!
    const [instance] = fallbackInstances(tank)
    // A round display: gauges but no bars.
    const round = ["text", "gauge", "dial"]
    expect(defaultOptions(tank, instance, round).look).toBe("gauge")
    expect(blockSupported(tank, round)).toBe(true)
    expect(blockSupported(dimmer, round)).toBe(true)
    expect(defaultOptions(dimmer, fallbackInstances(dimmer)[0], round).look).toBe("dial")
    // Nothing to set a level with: no dimmer.
    expect(blockSupported(dimmer, ["text", "bar"])).toBe(false)
    // No list is no limit.
    expect(blockSupported(dimmer, undefined)).toBe(true)
  })

  // Every device's DDF declares all the looks today (2026-09-29), so which
  // one is greyed out is checked above through lookSupported(), not here.
  test("the dialog offers the looks and the label's place, and places the one chosen", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-1").click()

    await expect(page.getByTestId("baustein-look-bar")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("baustein-look-gauge")).toBeEnabled()
    await expect(page.getByTestId("baustein-label-position-above")).toHaveAttribute("aria-checked", "true")

    await page.getByTestId("baustein-look-number").click()
    await page.getByTestId("baustein-label-position-left").click()
    await page.getByTestId("baustein-insert").click()

    // The number is a text of its own, beside the name.
    const number = page.getByTitle(/^text /).filter({ hasText: "tank/1/level" })
    await expect(number).toHaveCount(1)
    await number.click()
    await expect(page.locator("#text")).toHaveValue(`{topic:${STATE_PREFIX}tank/1/level:F0} %`)
  })
})

// What a block's states say and a dimmer's step, set in the dialog, and the
// dialog remembering the last choices per block for the session
// (docs/2026-09-29-block-options.md, Task 4).
test.describe("a block's texts and step", () => {
  const rect = { x: 0, y: 0, width: 300, height: 60 }
  const input = (id: string) => {
    const block = BAUSTEINE.find((b) => b.id === id)!
    return { block, instance: fallbackInstances(block)[0], rect, palette: controlPalette("24bit"), font: undefined }
  }

  test("a Switch says what the dialog says, in either look; an emptied state keeps its default", () => {
    const { block, ...rest } = input("switch")
    for (const look of ["switch", "buttons"]) {
      const built = block.build({ ...rest, options: { look, stateLabels: { off: "Zu", on: "Offen" } } })
      expect(built.objects[1].properties.states.map((s: { label: string }) => s.label)).toEqual(["Zu", "Offen"])
    }
    const emptied = block.build({ ...rest, options: { stateLabels: { off: " ", on: "Offen" } } })
    expect(emptied.objects[1].properties.states.map((s: { label: string }) => s.label)).toEqual(["Aus", "Offen"])
    // What a tap writes does not change with what it says.
    expect(emptied.objects[1].properties.states.map((s: { writeValue: string }) => s.writeValue)).toEqual(["off", "on"])
  })

  test("the Theme's states can be renamed too, and keep the moon", () => {
    const { block, ...rest } = input("theme")
    const built = block.build({ ...rest, options: { stateLabels: { light: "Tag", dark: "Nacht" } } })
    const states = built.objects[1].properties.states
    expect(states.map((s: { label: string }) => s.label)).toEqual(["Tag", "Nacht"])
    expect(states[1].iconAssetId).toBeDefined()
  })

  test("a Dimmer with a step of 10 moves in tens, and its examples are on the step", () => {
    const { block, instance, ...rest } = input("dimmer")
    const built = block.build({ ...rest, instance: { ...instance, reportedValue: "43" }, options: { step: 10 } })
    const slider = built.objects[1]
    expect(slider.properties.step).toBe(10)
    expect(built.topics[0].examples).toEqual(["40", "60", "30"])
    // The dial takes the step as well.
    const dial = block.build({ ...rest, instance, options: { step: 10, look: "dial" } }).objects[1]
    expect(dial.properties.step).toBe(10)
    // The default stays 5.
    expect(defaultOptions(block, instance).step).toBe(5)
    expect(block.build({ ...rest, instance }).objects[1].properties.step).toBe(5)
  })

  test("the second Tank in a session opens with the first one's look and label position", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, COMBINED_TEST_PROJECT)
    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-1").click()
    await page.getByTestId("baustein-look-number").click()
    await page.getByTestId("baustein-label-position-left").click()
    await page.getByTestId("baustein-insert").click()
    await expect(page.getByTestId("baustein-chosen")).toHaveCount(0)

    await insertBlock(page, "Tank")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-2").click()
    await expect(page.getByTestId("baustein-look-number")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("baustein-label-position-left")).toHaveAttribute("aria-checked", "true")
    // The label is the second tank's own, not the first one's.
    await expect(page.locator("#baustein-label")).toHaveValue(`{topic:${STATE_PREFIX}tank/2/name ?? "Tank 2"}`)
    // A Battery is a block of its own and starts from its defaults.
    await page.getByRole("button", { name: "Cancel" }).click()
    await insertBlock(page, "Battery")
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-soc").click()
    await expect(page.getByTestId("baustein-look-bar")).toHaveAttribute("aria-checked", "true")
  })

  test("a Dimmer placed with a step of 10 says 11 steps in the panel", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, SWITCH_TEST_PROJECT)
    await insertBlock(page, "Dimmer", ROUND_FIXTURE_SCREEN)
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-1").click()
    await expect(page.getByTestId("baustein-step")).toHaveValue("5")
    await page.getByTestId("baustein-step").fill("10")
    await page.getByTestId("baustein-insert").click()

    await selectInTree(page, "slider")
    await expect(page.getByTestId("step-summary")).toContainText("11 steps")
  })

  test("a Switch placed with «Zu» and «Offen» shows them", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    await loadProject(page, SWITCH_TEST_PROJECT)
    await insertBlock(page, "Switch", ROUND_FIXTURE_SCREEN)
    await expect(page.getByTestId("baustein-source")).toContainText("No broker", { timeout: 20000 })
    await page.getByTestId("baustein-instance-1").click()
    await expect(page.getByTestId("baustein-state-off")).toHaveAttribute("placeholder", "Aus")
    await page.getByTestId("baustein-state-off").fill("Zu")
    await page.getByTestId("baustein-state-on").fill("Offen")
    await page.getByTestId("baustein-insert").click()

    await selectInTree(page, "switch")
    // The panel lists the states as "<label> · <value>".
    await expect(page.getByRole("button", { name: "1 Zu · off" })).toBeVisible()
    await expect(page.getByRole("button", { name: "2 Offen · on" })).toBeVisible()
  })
})
