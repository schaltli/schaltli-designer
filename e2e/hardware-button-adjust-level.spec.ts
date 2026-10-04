import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import {
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

async function clickRing(page: Page, side: "left" | "right") {
  const { box } = await getMainCanvas(page)
  const svg = RING[side]
  await page.mouse.click(box.x + (box.width - 360) / 2 + (svg.x - 90), box.y + (box.height - 360) / 2 + (svg.y - 90))
  await expect(page.getByText(side === "left" ? "Rotate Left" : "Rotate Right", { exact: true })).toBeVisible()
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

test.describe("Adjust a slider or dial: the side panel", () => {
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
    await clickRing(page, "right")
    await page.locator("#actionType").selectOption("adjust-level")
    await expect(page.getByText("This screen has no slider, dial or switcher to adjust.")).toBeVisible()
    await page.locator("#actionType").selectOption("none")
    await closePanel(page)

    const sliderId = await drawSlider(page)
    await closePanel(page)

    await clickRing(page, "right")
    await page.locator("#actionType").selectOption("adjust-level")
    await expect(page.locator("#targetObject")).toHaveValue(sliderId)
    await expect(page.locator("#targetObject option:checked")).toHaveText(/^Slider · /)
    await expect(page.locator("#adjustDirection")).toHaveValue("up")
    await closePanel(page)

    await clickRing(page, "left")
    await page.locator("#actionType").selectOption("adjust-level")
    await expect(page.locator("#adjustDirection")).toHaveValue("down")
    await closePanel(page)

    // Reopened, it shows what was saved.
    await clickRing(page, "right")
    await expect(page.locator("#actionType")).toHaveValue("adjust-level")
    await expect(page.locator("#targetObject")).toHaveValue(sliderId)
    await closePanel(page)

    // The slider goes; the action stays, and says so.
    const { box } = await getMainCanvas(page)
    const onSlider = devicePoint(box, 180, 180, ROUND_FIXTURE_SCREEN)
    await page.mouse.click(onSlider.x, onSlider.y)
    await expect.poll(() => getSelectedHeader(page)).toContain(sliderId)
    await page.keyboard.press("Delete")
    await clickRing(page, "right")
    await expect(page.locator("#actionType")).toHaveValue("adjust-level")
    await expect(page.getByText(/^Target missing/)).toBeVisible()
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
