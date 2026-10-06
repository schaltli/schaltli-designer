import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { COMBINED_TEST_PROJECT, loadProject, createScreen, clickButton0, getMainCanvas, devicePoint, objectTreeRow } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { withScreenType, isPopup, isMainScreen, popupFence } from "../lib/popup"
import { Jimp } from "jimp"

// Popup screens (docs/2026-10-06-popup-screens.md, tasks/popup-screens-todo.md):
// a screen whose type is «Popup» is out of navigation and opened over the
// current screen. It keeps a master for its theme only, «Show master» off.

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

async function addPopupScreen(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Add screen" }).click()
  await page.getByRole("menuitem", { name: "Add Popup Screen", exact: true }).click()
  await page.locator("#screenName").fill(name)
  await page.getByRole("button", { name: "Create Screen" }).click()
  await page.waitForTimeout(300)
}

test.describe("Popup screens: the type (pure)", () => {
  test("a popup turns «Show master» off and drops its swipe actions, keeping the others", () => {
    const screen: {
      id: string
      masterScreenId?: string
      showMaster?: boolean
      screenType?: "popup"
      isMaster?: boolean
      buttonActions?: Record<string, unknown>
    } = {
      id: "s",
      masterScreenId: "m",
      showMaster: true,
      buttonActions: {
        "swipe-left": { type: "next-screen" },
        "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
        "button-1": { type: "send-mqtt", mqttTopic: "t", mqttMessage: "1" },
      },
    }
    const popup = withScreenType(screen, "popup")
    expect(popup.screenType).toBe("popup")
    expect(popup.showMaster).toBe(false)
    expect(popup.masterScreenId).toBe("m")
    expect(Object.keys(popup.buttonActions ?? {})).toEqual(["button-1"])
    expect(isPopup(popup)).toBe(true)
    expect(isMainScreen(popup)).toBe(false)

    const back = withScreenType(popup, "main")
    expect("screenType" in back).toBe(false)
    expect(back.showMaster).toBe(false)
    expect(isMainScreen(back)).toBe(true)
    expect(isMainScreen({ isMaster: true })).toBe(false)
  })
})

test.describe("Popup screens: the type in the designer", () => {
  test("«Add Popup Screen» makes a popup in its own group, with a master for its theme and no «Show master»", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await addPopupScreen(page, "E2E Popup")

    const group = page.getByTestId("popup-screens")
    await expect(group.getByText("Popups", { exact: true })).toBeVisible()
    await expect(group.getByText("E2E Popup", { exact: true })).toBeVisible()
    await expect(group.getByText("Popup", { exact: true })).toBeVisible()

    // The screen's own properties: its type, a master select, no «Show master».
    await expect(page.getByLabel("Screen type")).toHaveValue("popup")
    await expect(page.getByText("Show master", { exact: true })).toHaveCount(0)

    const project = await downloadProjectJson(page)
    const popup = project.screens.find((s: any) => s.name === "E2E Popup")
    expect(popup.screenType).toBe("popup")
    expect(popup.showMaster).toBe(false)
    expect(project.screens.some((s: any) => s.isMaster && s.id === popup.masterScreenId)).toBe(true)
    // Every other screen is written as before: no screenType on them.
    expect(project.screens.filter((s: any) => "screenType" in s).map((s: any) => s.name)).toEqual(["E2E Popup"])
  })

  test("a main screen turned into a popup and back", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "E2E Turned", false)

    await page.getByLabel("Screen type").selectOption("popup")
    await expect(page.getByTestId("popup-screens").getByText("E2E Turned", { exact: true })).toBeVisible()
    let project = await downloadProjectJson(page)
    let screen = project.screens.find((s: any) => s.name === "E2E Turned")
    expect(screen.screenType).toBe("popup")
    expect(screen.showMaster).toBe(false)

    await page.getByLabel("Screen type").selectOption("main")
    await expect(page.getByTestId("popup-screens")).toHaveCount(0)
    await expect(page.getByText("Show master", { exact: true })).toBeVisible()
    project = await downloadProjectJson(page)
    screen = project.screens.find((s: any) => s.name === "E2E Turned")
    expect("screenType" in screen).toBe(false)
    expect(screen.showMaster).toBe(false)
  })
})

// The round fixture with a popup first in the list, then three
// main screens: A holds a software button paging to the previous screen, B
// one paging to the next, C one going to a screen.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
// The fixture project says 240x240; the seeded DDF makes it 360x360 on load.
const FIXTURE_SCREEN = { width: 360, height: 360 }
const BUTTON = { x: 100, y: 100, width: 40, height: 20 }

async function projectWithPopupFirst(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  // A touch device, as the round fixture's DDF declares: swipes are offered.
  project.settings.supportsSoftwareButtons = true
  const button = (id: string, action: Record<string, unknown>) => ({
    id,
    type: "button",
    ...BUTTON,
    zIndex: 1,
    properties: { text: "Go", iconAssetId: null, buttonStyle: "tonal", buttonColor: "#6750A4", action },
  })
  project.screens = [
    { id: "popup-p", name: "Popup P", screenType: "popup", showMaster: false, objects: [] },
    { id: "main-a", name: "Main A", objects: [button("prev-a", { type: "previous-screen" })] },
    { id: "main-b", name: "Main B", objects: [button("next-b", { type: "next-screen" })] },
    { id: "main-c", name: "Main C", objects: [button("goto-c", { type: "goto-screen", targetScreenId: "" })] },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `popup-screens-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function clickFixtureButton(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  const at = devicePoint(box, BUTTON.x + BUTTON.width / 2, BUTTON.y + BUTTON.height / 2, FIXTURE_SCREEN)
  await page.mouse.click(at.x, at.y)
}

test.describe("Popup screens: out of navigation and goto pickers", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("a project whose first screen is a popup opens on its first main screen", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await expect(page.getByRole("button", { name: "Main A" })).toHaveClass(/bg-accent/)
  })

  test("previous/next in the preview never lands on a popup", async ({ page }) => {
    // The popup heads the list, right before Main A: «previous» from A
    // wraps to the last main screen, not to the popup.
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    await clickFixtureButton(page)
    await expect(page.getByText("→ Previous screen").first()).toBeVisible()
    // In the preview the screens panel marks the screen being previewed.
    await expect(page.getByRole("button", { name: "Main C" })).toHaveClass(/bg-accent/)
  })

  test("a software button's «Go to a screen» does not offer a popup", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Main C" }).click()
    await objectTreeRow(page, "goto-c").click()
    const target = page.locator("#targetScreenId")
    await expect(target.getByRole("option", { name: "Main A", exact: true })).toHaveCount(1)
    await expect(target.getByRole("option", { name: "Popup P", exact: true })).toHaveCount(0)
  })
})

test("a hardware button's «Go to a screen» does not offer a popup", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await addPopupScreen(page, "E2E Popup")
  await page.getByRole("button", { name: "tab-control-tests" }).click()
  await clickButton0(page)
  await page.getByLabel("Does", { exact: true }).selectOption({ label: "Go to a screen" })
  const target = page.getByLabel("Screen", { exact: true })
  await expect(target.getByRole("option", { name: "E2E Popup", exact: true })).toHaveCount(0)
  await expect(target.getByRole("option", { name: "label-tests-white-background", exact: true })).toHaveCount(1)
})

test.describe("Popup screens: the fence (pure)", () => {
  const cases = [
    { name: "4.3B", screenWidth: 800, screenHeight: 480, screenShape: "rect" as const, display: 800 * 480 },
    { name: "PaperS3", screenWidth: 960, screenHeight: 540, screenShape: "rect" as const, display: 960 * 540 },
    { name: "Knob", screenWidth: 360, screenHeight: 360, screenShape: "round" as const, display: Math.PI * 180 * 180 },
  ]
  for (const c of cases) {
    test(`on the ${c.name} the fence encloses 80 % of the display, centred`, () => {
      const f = popupFence(c)
      expect(f.shape).toBe(c.screenShape === "round" ? "circle" : "rect")
      const area = f.shape === "circle" ? Math.PI * (f.width / 2) ** 2 : f.width * f.height
      expect(area / c.display).toBeGreaterThan(0.79)
      expect(area / c.display).toBeLessThan(0.81)
      expect(Math.abs(f.x * 2 + f.width - c.screenWidth)).toBeLessThanOrEqual(1)
      expect(Math.abs(f.y * 2 + f.height - c.screenHeight)).toBeLessThanOrEqual(1)
    })
  }
})

// How many pixels of the editor's violet (#7c3aed) a small patch of the page holds.
async function violetPixels(page: Page, at: { x: number; y: number }): Promise<number> {
  const image = await Jimp.read(await page.screenshot({ clip: { x: at.x - 4, y: at.y - 4, width: 9, height: 9 } }))
  const data = image.bitmap.data
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    if (Math.abs(r - 0x7c) < 40 && Math.abs(g - 0x3a) < 40 && Math.abs(b - 0xed) < 40) n++
  }
  return n
}

test.describe("Popup screens: the fence on the canvas", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("a popup on a round display shows a circle; a main screen shows none", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    const f = popupFence({ screenWidth: 360, screenHeight: 360, screenShape: "round" })
    const leftEdge = { x: f.x, y: f.y + f.height / 2 }
    const topEdge = { x: f.x + f.width / 2, y: f.y }

    const { box } = await getMainCanvas(page)
    const onLeft = devicePoint(box, leftEdge.x, leftEdge.y, FIXTURE_SCREEN)
    const onTop = devicePoint(box, topEdge.x, topEdge.y, FIXTURE_SCREEN)
    // Inside a square fence of the same size but not on a circle: its corner.
    const onCorner = devicePoint(box, f.x + 4, f.y + 4, FIXTURE_SCREEN)
    expect(await violetPixels(page, onLeft)).toBe(0)

    await page.getByRole("button", { name: "Popup P" }).click()
    await page.waitForTimeout(300)
    expect(await violetPixels(page, onLeft)).toBeGreaterThan(0)
    expect(await violetPixels(page, onTop)).toBeGreaterThan(0)
    expect(await violetPixels(page, onCorner)).toBe(0)
  })

  test("a popup has no swipe actions to set, only a line saying a swipe closes it", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await expect(page.getByRole("button", { name: "Swipe Left" })).toBeVisible()
    await page.getByRole("button", { name: "Popup P" }).click()
    await expect(page.getByRole("button", { name: "Swipe Left" })).toHaveCount(0)
    await expect(page.getByText("A swipe closes a popup.")).toBeVisible()
  })
})
