import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import {
  COMBINED_TEST_PROJECT,
  clickButton0,
  loadProject,
  createProject,
  getMainCanvas,
  chooseDevice,
  devicePoint,
  getSelectedHeader,
  ROUND_FIXTURE_DEVICE_ID,
  ROUND_FIXTURE_SCREEN,
  waitForDeviceGate,
} from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// «Adjust a slider or dial» (tasks/ring-adjust-plan.md): a hardware button -
// on the Knob each detent of the ring - moves a slider, a dial, or the one a
// switcher shows, one step. Task 1: setting it in the side panel and what an
// export writes.

type Obj = Record<string, any>

// The Knob's ring as the round fixture draws it: the arrows over the case,
// points found in hardware-button-canvas-clicks.spec.ts.
const RING = {
  left: { x: 15, y: 115.5 },
  right: { x: 523, y: 115 },
}

// A click on the ring's arrow in the device's frame brings that button's row
// in the screen's panel into view, its list focused (2026-10-07). Returns the
// prefix of the row's field ids.
async function clickRing(page: Page, side: "left" | "right"): Promise<string> {
  const { box } = await getMainCanvas(page)
  const svg = RING[side]
  await page.mouse.click(box.x + (box.width - 360) / 2 + (svg.x - 90), box.y + (box.height - 360) / 2 + (svg.y - 90))
  const id = side === "left" ? "#button-0-" : "#button-1-"
  await expect(page.locator(`${id}actionType`)).toBeFocused()
  return id
}

async function closePanel(page: Page) {
  const { box } = await getMainCanvas(page)
  await page.mouse.click(box.x + 10, box.y + 10)
}

async function drawSlider(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Slider", exact: true }).first().click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, 60, 160, ROUND_FIXTURE_SCREEN)
  const to = devicePoint(box, 300, 200, ROUND_FIXTURE_SCREEN)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => getSelectedHeader(page)).toContain("Slider")
  return (await getSelectedHeader(page)).replace("Slider", "").trim()
}

test.describe("Adjust a slider or dial: the ring's rows in the screen's panel", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test("picks the only slider, presets the direction from the ring's side, and says when the target is gone", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await page.waitForTimeout(1500)

    // Nothing to adjust yet: the type is there, and says why it cannot work.
    let ring = await clickRing(page, "right")
    await page.locator(`${ring}actionType`).selectOption("adjust-level")
    await expect(page.getByText("This screen has no slider, dial or switcher to adjust.")).toBeVisible()
    await page.locator(`${ring}actionType`).selectOption("none")
    await closePanel(page)

    const sliderId = await drawSlider(page)
    await closePanel(page)

    ring = await clickRing(page, "right")
    await page.locator(`${ring}actionType`).selectOption("adjust-level")
    await expect(page.locator(`${ring}targetObject`)).toHaveValue(sliderId)
    await expect(page.locator(`${ring}targetObject option:checked`)).toHaveText(/^Slider · /)
    await expect(page.locator(`${ring}adjustDirection`)).toHaveValue("up")
    await closePanel(page)

    ring = await clickRing(page, "left")
    await page.locator(`${ring}actionType`).selectOption("adjust-level")
    await expect(page.locator(`${ring}adjustDirection`)).toHaveValue("down")
    await closePanel(page)

    // Back again, it shows what was saved.
    ring = await clickRing(page, "right")
    await expect(page.locator(`${ring}actionType`)).toHaveValue("adjust-level")
    await expect(page.locator(`${ring}targetObject`)).toHaveValue(sliderId)
    await closePanel(page)

    // The slider goes; the action stays, and says so.
    const { box } = await getMainCanvas(page)
    const onSlider = devicePoint(box, 180, 180, ROUND_FIXTURE_SCREEN)
    await page.mouse.click(onSlider.x, onSlider.y)
    await expect.poll(() => getSelectedHeader(page)).toContain(sliderId)
    await page.keyboard.press("Delete")
    ring = await clickRing(page, "right")
    await expect(page.locator(`${ring}actionType`)).toHaveValue("adjust-level")
    // Both ring rows now adjust the slider that went; Rotate Right's says so.
    await expect(page.locator('[data-button-row="button-1"]').getByText(/^Target missing/)).toBeVisible()
  })
})

// --- What an export writes ---------------------------------------------------

function level(id: string, type: string, topic: string): Obj {
  return {
    id,
    type,
    x: 40,
    y: 150,
    width: 280,
    height: 40,
    zIndex: 1,
    properties: { topic, writeTopic: `${topic}/set`, step: 10, calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }] },
  }
}

function adjustProject(): Obj {
  return {
    name: "adjust",
    screenWidth: 360,
    screenHeight: 360,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [
      { id: "button-0", name: "Rotate Left" },
      { id: "button-1", name: "Rotate Right" },
    ],
    snapGuides: [],
    nextId: 100,
    screens: [
      {
        id: "master-1",
        name: "Master",
        isMaster: true,
        backgroundColor: "#ffffff",
        objects: [level("m-dial", "dial", "fan/speed")],
        buttonActions: { "button-1": { type: "adjust-level", targetObjectId: "m-dial", direction: "up" } },
      },
      {
        id: "s1",
        name: "Own slider",
        backgroundColor: "#ffffff",
        objects: [level("sl", "slider", "heater/target")],
        buttonActions: {
          "button-1": { type: "adjust-level", targetObjectId: "sl", direction: "up" },
          // Its target was deleted: nothing a device could do with it.
          "button-0": { type: "adjust-level", targetObjectId: "gone", direction: "down" },
        },
      },
      { id: "s2", name: "From the master", masterScreenId: "master-1", backgroundColor: "#ffffff", objects: [] },
      // The master hidden: its action, and the dial it targets, are not here.
      { id: "s3", name: "Master hidden", masterScreenId: "master-1", showMaster: false, backgroundColor: "#ffffff", objects: [] },
    ],
  }
}

async function exported(page: Page, hook: "__buildDeviceZipForTest" | "__buildAndroidZipForTest"): Promise<Obj> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate(({ hook, project }) => (window as any)[hook](project), {
    hook,
    project: adjustProject(),
  })
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

test.describe("Adjust a slider or dial: the export", () => {
  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook}: writes the target and direction, drops an action whose target is gone`, async ({ page }) => {
      const project = await exported(page, hook)
      const screen = (id: string) => project.screens.find((s: Obj) => s.id === id)

      expect(screen("s1").buttonActions).toEqual({
        "button-1": { type: "adjust-level", targetObjectId: "sl", direction: "up" },
      })
      // A master's action on the master's own dial reaches every screen using it.
      expect(screen("s2").buttonActions).toEqual({
        "button-1": { type: "adjust-level", targetObjectId: "m-dial", direction: "up" },
      })
      expect(screen("s3").buttonActions).toBeUndefined()
    })
  }
})

// --- The preview turns it (Task 2) -------------------------------------------

// The combined project's first screen, emptied and given what a press can
// move: a slider on its own, and a switcher showing one of two sliders by a
// mode - the MaxxFan's shape (docs/2026-10-04-bridge-blocks.md).
async function previewProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const slider = (id: string, topic: string, step: number, max: number, y: number): Obj => ({
    id,
    type: "slider",
    x: 20,
    y,
    width: 300,
    height: 30,
    zIndex: 1,
    properties: {
      topic,
      writeTopic: `${topic}/set`,
      step,
      direction: "left-to-right",
      displayValue: "value",
      fillColor: "#3366cc",
      calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: max, barSizePercent: 100 }],
    },
  })
  const panel = (id: string, value: string, children: Obj[]): Obj => ({
    id,
    type: "panel",
    x: 0,
    y: 0,
    width: 340,
    height: 80,
    zIndex: 0,
    properties: { comparisonOperator: "==", comparisonValue: value },
    children,
  })
  project.screens[0].objects = [
    slider("speed", "fan/speed", 10, 100, 20),
    // Nothing reported yet: a press has no value to step from.
    slider("unknown", "fan/unknown", 10, 100, 70),
    {
      id: "mode-switcher",
      type: "switcher",
      x: 20,
      y: 120,
      width: 340,
      height: 80,
      zIndex: 2,
      properties: { topic: "fan/mode" },
      children: [
        panel("p-auto", "auto", [slider("temperature", "fan/temperature", 1, 37, 20)]),
        panel("p-hand", "fan_only", [slider("hand-speed", "fan/hand-speed", 10, 100, 20)]),
        panel("p-off", "off", []),
      ],
    },
  ]
  const topic = (name: string, example: string): Obj => ({ id: `t-${name}`, topic: name, type: "numeric", examples: [example] })
  project.topics.push(
    topic("fan/speed", "50"),
    topic("fan/speed/set", ""),
    { id: "t-fan/mode", topic: "fan/mode", type: "text", examples: ["auto"] },
    topic("fan/temperature", "20"),
    topic("fan/temperature/set", ""),
    topic("fan/hand-speed", "40"),
    topic("fan/hand-speed/set", ""),
    topic("fan/unknown", ""),
    topic("fan/unknown/set", ""),
  )
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `adjust-level-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

// A topic's row in the Topic Values panel, as preview-mode.spec.ts finds it.
const topicValue = (page: Page, name: string) =>
  page.locator("label", { hasText: new RegExp(`^${name.replace(/\//g, "\/")}$`) }).first().locator("xpath=../..").locator("input, textarea").first()

async function bindButton0(page: Page, targetId: string, direction: "up" | "down") {
  await clickButton0(page)
  await page.locator("#button-10-actionType").selectOption("adjust-level")
  await page.locator("#button-10-targetObject").selectOption(targetId)
  await page.locator("#button-10-adjustDirection").selectOption(direction)
  const { box } = await getMainCanvas(page)
  await page.mouse.click(box.x + 5, box.y + 5)
}

async function enterSimulation(page: Page) {
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.getByRole("button", { name: "Simulation", exact: true }).click()
  await expect(page.getByRole("button", { name: "Simulation", exact: true })).toHaveAttribute("aria-pressed", "true")
  await page.waitForTimeout(300)
}

test.describe("Adjust a slider or dial: the preview", () => {
  test("each press writes the next value from the one asked for, and nothing past the end", async ({ page }) => {
    await loadProject(page, await previewProject())
    await bindButton0(page, "speed", "up")
    await enterSimulation(page)

    // No answer comes back (no mock rule): every press counts from the value
    // the last one asked for, not from the 50 still reported.
    for (const expected of ["60", "70", "80", "90", "100"]) {
      await clickButton0(page)
      await expect(topicValue(page, "fan/speed/set")).toHaveValue(expected)
    }
    await clickButton0(page)
    await page.waitForTimeout(300)
    await expect(topicValue(page, "fan/speed/set")).toHaveValue("100")
  })

  test("with no value known yet, a press writes nothing", async ({ page }) => {
    await loadProject(page, await previewProject())
    await bindButton0(page, "unknown", "up")
    await enterSimulation(page)
    await clickButton0(page)
    await page.waitForTimeout(500)
    await expect(topicValue(page, "fan/unknown/set")).toHaveValue("")
    // Once one arrives, it steps from there.
    await topicValue(page, "fan/unknown").fill("40")
    await topicValue(page, "fan/unknown").press("Enter")
    await clickButton0(page)
    await expect(topicValue(page, "fan/unknown/set")).toHaveValue("50")
  })

  test("bound to a switcher, a press moves the slider its panel shows, and none when it shows none", async ({ page }) => {
    await loadProject(page, await previewProject())
    await bindButton0(page, "mode-switcher", "down")
    await enterSimulation(page)

    await clickButton0(page)
    await expect(topicValue(page, "fan/temperature/set")).toHaveValue("19")

    await topicValue(page, "fan/mode").fill("fan_only")
    await topicValue(page, "fan/mode").press("Enter")
    await clickButton0(page)
    await expect(topicValue(page, "fan/hand-speed/set")).toHaveValue("30")

    await topicValue(page, "fan/mode").fill("off")
    await topicValue(page, "fan/mode").press("Enter")
    await clickButton0(page)
    await page.waitForTimeout(300)
    await expect(topicValue(page, "fan/hand-speed/set")).toHaveValue("30")
    await expect(topicValue(page, "fan/temperature/set")).toHaveValue("19")
  })
})
