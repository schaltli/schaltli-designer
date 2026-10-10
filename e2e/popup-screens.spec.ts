import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { COMBINED_TEST_PROJECT, loadProject, createScreen, clickButton0, getMainCanvas, devicePoint, objectTreeRow } from "./helpers"
import { seedRoundFixtureDdf, seedWaveshare4v3bDdf } from "./ddf-seed"
import {
  withScreenType,
  isPopup,
  isMainScreen,
  popupFence,
  popupCloseBadge,
  onCloseBadge,
  withoutDeadPopupActions,
  popupOpeners,
} from "../lib/popup"
import { POPUP_GENERATION, generationBelow } from "../lib/system-generation"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import mqtt from "mqtt"
import { Jimp } from "jimp"

// Popup screens (docs/2026-10-06-popup-screens.md, tasks/popup-screens-todo.md):
// a screen whose type is «Popup» is out of navigation and opened over the
// current screen. It keeps a master for its theme only, «Show master» off.

// "Download Project" is the editable file; "Export Project" what a device gets.
async function downloadProjectJson(page: Page, menuItem = "Download Project"): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: menuItem }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  // «Export Project» leaves the File menu open (label-placeholders.spec.ts).
  await page.keyboard.press("Escape")
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

// The round fixture with a popup first in the list, then four main
// screens: A holds a software button paging to the previous screen, B one
// paging to the next, C one going to a screen, D one opening the popup, E
// one opening a popup that is not set. The popup's own button closes it; a
// box marks it.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
// The fixture project says 240x240; the seeded DDF makes it 360x360 on load.
const FIXTURE_SCREEN = { width: 360, height: 360 }
const BUTTON = { x: 100, y: 100, width: 40, height: 20 }
// A box only the popup has, inside its fence, to see it open.
const MARK = { x: 160, y: 200, width: 40, height: 40 }
const MARK_BOX = {
  id: "mark-p",
  type: "box",
  ...MARK,
  zIndex: 2,
  properties: { fillColor: "#ff0000", strokeColor: "#ff0000", strokeWidth: 1, cornerRadius: 0 },
}

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
    {
      id: "popup-p",
      name: "Popup P",
      screenType: "popup",
      showMaster: false,
      objects: [button("close-p", { type: "close-popup" }), MARK_BOX],
    },
    { id: "main-a", name: "Main A", objects: [button("prev-a", { type: "previous-screen" })] },
    { id: "main-b", name: "Main B", objects: [button("next-b", { type: "next-screen" })] },
    { id: "main-c", name: "Main C", objects: [button("goto-c", { type: "goto-screen", targetScreenId: "" })] },
    { id: "main-d", name: "Main D", objects: [button("open-d", { type: "open-popup", targetScreenId: "popup-p" })] },
    { id: "main-e", name: "Main E", objects: [button("open-e", { type: "open-popup", targetScreenId: "" })] },
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
    await expect(page.getByRole("button", { name: "Main E" })).toHaveClass(/bg-accent/)
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
  await page.locator("#button-10-actionType").selectOption({ label: "Go to a screen" })
  const target = page.locator("#button-10-targetScreen")
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
    await expect(page.locator("#swipe-left-actionType")).toBeVisible()
    await page.getByRole("button", { name: "Popup P" }).click()
    await expect(page.locator("#swipe-left-actionType")).toHaveCount(0)
    await expect(page.getByText("A swipe closes a popup.")).toBeVisible()
  })
})

test.describe("Popup screens: «Open a popup» and «Close this popup»", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  const optionsOf = (page: Page, id: string) =>
    page.locator(`#${id} option`).evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).label))

  test("a software button opens a popup chosen from the popups only, and exports it as written", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Main C" }).click()
    await objectTreeRow(page, "goto-c").click()
    const does = await optionsOf(page, "actionType")
    expect(does).toContain("Open a popup")
    expect(does).not.toContain("Close this popup")

    await page.locator("#actionType").selectOption({ label: "Open a popup" })
    expect(await optionsOf(page, "targetPopupId")).toEqual(["Select a popup...", "Popup P"])
    await page.locator("#targetPopupId").selectOption({ label: "Popup P" })

    const project = await downloadProjectJson(page)
    const button = project.screens.find((s: any) => s.id === "main-c").objects.find((o: any) => o.id === "goto-c")
    expect(button.properties.action).toEqual({ type: "open-popup", targetScreenId: "popup-p" })
  })

  test("a software button on a popup can close it", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Popup P" }).click()
    await objectTreeRow(page, "close-p").click()
    await expect(page.locator("#actionType")).toHaveValue("close-popup")
    expect(await optionsOf(page, "actionType")).toContain("Close this popup")
  })

  test("deleting the popup empties the target of a button that opened it", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    const popupRow = page.locator('[data-screen-id="popup-p"]')
    await popupRow.hover()
    await popupRow.getByRole("button").last().click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(page.getByTestId("popup-screens")).toHaveCount(0)

    await page.getByRole("button", { name: "Main D" }).click()
    await objectTreeRow(page, "open-d").click()
    await expect(page.locator("#actionType")).toHaveValue("open-popup")
    await expect(page.locator("#targetPopupId")).toHaveValue("")
  })
})

test("a hardware button on a popup can open or close a popup, and inherits nothing", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await clickButton0(page)
  let does = await page.locator("#button-10-actionType option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).label))
  expect(does).toContain("Open a popup")
  expect(does).not.toContain("Close this popup")

  await addPopupScreen(page, "E2E Popup")
  await clickButton0(page)
  does = await page.locator("#button-10-actionType option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).label))
  expect(does).toContain("Open a popup")
  expect(does).toContain("Close this popup")
  expect(does.some((label) => label.startsWith("Inherit"))).toBe(false)

  await page.locator("#button-10-actionType").selectOption({ label: "Close this popup" })
  const project = await downloadProjectJson(page)
  const popup = project.screens.find((s: any) => s.name === "E2E Popup")
  expect(Object.values(popup.buttonActions)).toEqual([{ type: "close-popup" }])
})

test.describe("Popup screens: the preview", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  async function rgbAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, x, y, FIXTURE_SCREEN)
    const image = await Jimp.read(await page.screenshot({ clip: { x: at.x, y: at.y, width: 1, height: 1 } }))
    const d = image.bitmap.data
    return [d[0], d[1], d[2]]
  }
  // The box's colour is the theme's after migration, not the red written; it
  // is dark either way, on a white screen.
  const markShown = ([r, g, b]: [number, number, number]) => r + g + b < 450
  const brightness = ([r, g, b]: [number, number, number]) => r + g + b
  const markCentre = { x: MARK.x + MARK.width / 2, y: MARK.y + MARK.height / 2 }
  // Outside the Knob's fence (radius 161 round 180,180) but on its glass.
  const outsideFence = { x: 8, y: 180 }

  test("a button opens the popup over the screen, dimmed outside the fence; its own button closes it", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Main D" }).click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    const before = await rgbAt(page, outsideFence.x, outsideFence.y)
    expect(markShown(await rgbAt(page, markCentre.x, markCentre.y))).toBe(false)

    await clickFixtureButton(page)
    await expect(page.getByText("→ Open popup").first()).toBeVisible()
    expect(markShown(await rgbAt(page, markCentre.x, markCentre.y))).toBe(true)
    expect(brightness(await rgbAt(page, outsideFence.x, outsideFence.y))).toBeLessThan(brightness(before) * 0.7)

    // The popup's own button sits where D's did: the click is the popup's.
    await clickFixtureButton(page)
    await page.waitForTimeout(200)
    expect(markShown(await rgbAt(page, markCentre.x, markCentre.y))).toBe(false)
    expect(await rgbAt(page, outsideFence.x, outsideFence.y)).toEqual(before)
  })

  test("a click outside the fence closes the popup", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Main D" }).click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    await clickFixtureButton(page)
    expect(markShown(await rgbAt(page, markCentre.x, markCentre.y))).toBe(true)

    const { box } = await getMainCanvas(page)
    const outside = devicePoint(box, outsideFence.x, outsideFence.y, FIXTURE_SCREEN)
    await page.mouse.click(outside.x, outside.y)
    await page.waitForTimeout(200)
    expect(markShown(await rgbAt(page, markCentre.x, markCentre.y))).toBe(false)
  })

  test("previewing a popup being edited shows it open over the first main screen", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Popup P" }).click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    expect(markShown(await rgbAt(page, markCentre.x, markCentre.y))).toBe(true)
    await expect(page.getByRole("button", { name: "Main A" })).toHaveClass(/bg-accent/)
  })

  test("a button without a popup set says so", async ({ page }) => {
    await loadProject(page, await projectWithPopupFirst())
    await page.getByRole("button", { name: "Main E" }).click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    await clickFixtureButton(page)
    await expect(page.getByText("No popup configured for this button").first()).toBeVisible()
  })
})

// The close button a device draws on an open popup's edge, always (the user,
// 2026-10-07): every device, each saying so in its DDF - the Android app in
// the one it builds itself (schaltli-android DdfBuilderTest).
test.describe("Popup screens: the close button (pure)", () => {
  test("on the 4.3B it sits on the fence's top right corner and takes taps round it", () => {
    const badge = popupCloseBadge(popupFence({ screenWidth: 800, screenHeight: 480 }), 24)
    // The same numbers as the firmware's test_popup_fence.
    expect(badge).toEqual({ cx: 758, cy: 26, radius: 24, hitRadius: 38 })
    expect(onCloseBadge(badge, { x: 758 - 38, y: 26 })).toBe(true)
    expect(onCloseBadge(badge, { x: 758 - 39, y: 26 })).toBe(false)
    expect(onCloseBadge(badge, { x: 400, y: 240 })).toBe(false)
  })

  test("on a circle it sits on the rim at the top right; without a radius there is none", () => {
    const knob = popupFence({ screenWidth: 360, screenHeight: 360, screenShape: "round" })
    expect(popupCloseBadge(knob, 20)).toMatchObject({ cx: 294, cy: 66 })
    expect(popupCloseBadge(knob, undefined)).toBeUndefined()
    expect(onCloseBadge(undefined, { x: 294, y: 66 })).toBe(false)
  })

  test("the boards' DDFs declare it, each its own size", async () => {
    const radius = async (file: string) => {
      const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", "public", "ddf", file)))
      return JSON.parse(await zip.file("device.json")!.async("string")).screen.popupCloseRadius
    }
    expect(await radius("waveshare-touch-lcd-4v3b.ddf.zip")).toBe(24)
    // Smaller on the knob: any bigger and its round glass cuts the button.
    expect(await radius("waveshare-knob-1v8.ddf.zip")).toBe(18)
    expect(await radius("m5stack-papers3.ddf.zip")).toBe(26)
  })
})

test.describe("Popup screens: the close button on the 4.3B", () => {
  const DEVICE_ID = "e2e-popup-close-4v3b"
  const SCREEN = { width: 800, height: 480 }
  const BADGE = { cx: 758, cy: 26 }
  // Wide enough for the whole 800 px screen: at 1600 the canvas is cut at the
  // sides, the button's corner with it.
  test.use({ viewport: { width: 2200, height: 1250 } })

  test.beforeEach(async () => {
    test.skip(!(await seedWaveshare4v3bDdf(DEVICE_ID)), "schaltli-firmware not checked out alongside this repo")
  })

  async function onThe4v3b(): Promise<string> {
    const file = await projectWithPopupFirst()
    const zip = await JSZip.loadAsync(fs.readFileSync(file))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.settings.deviceId = DEVICE_ID
    project.screenWidth = SCREEN.width
    project.screenHeight = SCREEN.height
    zip.file("project.json", JSON.stringify(project))
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    return file
  }
  async function rgbAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, x, y, SCREEN)
    const image = await Jimp.read(await page.screenshot({ clip: { x: at.x, y: at.y, width: 1, height: 1 } }))
    const d = image.bitmap.data
    return [d[0], d[1], d[2]]
  }
  // On the button's lower half, inside the fence, off the X; and a point on
  // the same row just past the button, where the screen is plain.
  const onDisc = { x: BADGE.cx - 4, y: BADGE.cy + 18 }
  const beside = { x: BADGE.cx + 30, y: BADGE.cy + 18 }
  const differs = (a: number[], b: number[]) => a.some((c, i) => Math.abs(c - b[i]) > 12)

  test("editing a popup shows the button where the device draws it; a main screen has none", async ({ page }) => {
    await loadProject(page, await onThe4v3b())
    await page.getByRole("button", { name: "Main A" }).click()
    await page.waitForTimeout(300)
    expect(differs(await rgbAt(page, onDisc.x, onDisc.y), await rgbAt(page, beside.x, beside.y))).toBe(false)

    await page.getByRole("button", { name: "Popup P" }).click()
    await page.waitForTimeout(300)
    expect(differs(await rgbAt(page, onDisc.x, onDisc.y), await rgbAt(page, beside.x, beside.y))).toBe(true)
  })

  test("in the preview a click on the button closes the popup", async ({ page }) => {
    await loadProject(page, await onThe4v3b())
    await page.getByRole("button", { name: "Main D" }).click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    const markCentre = { x: MARK.x + MARK.width / 2, y: MARK.y + MARK.height / 2 }
    const before = await rgbAt(page, markCentre.x, markCentre.y)

    const { box } = await getMainCanvas(page)
    const button = devicePoint(box, BUTTON.x + BUTTON.width / 2, BUTTON.y + BUTTON.height / 2, SCREEN)
    await page.mouse.click(button.x, button.y)
    await page.waitForTimeout(200)
    expect(differs(await rgbAt(page, markCentre.x, markCentre.y), before)).toBe(true)
    expect(differs(await rgbAt(page, onDisc.x, onDisc.y), await rgbAt(page, beside.x, beside.y))).toBe(true)

    // Inside the fence, on the button's half over the popup.
    const onBadge = devicePoint(box, BADGE.cx - 8, BADGE.cy + 8, SCREEN)
    await page.mouse.click(onBadge.x, onBadge.y)
    await page.waitForTimeout(200)
    expect(await rgbAt(page, markCentre.x, markCentre.y)).toEqual(before)
  })
})

test.describe("Popup screens: the device export", () => {
  test("an «Open a popup» whose target is not a popup is dropped, on a hardware button and a software button (pure)", () => {
    const button = (id: string, action: Record<string, unknown>) => ({ id, type: "button", properties: { action } })
    const project = {
      screens: [
        { id: "p", screenType: "popup" as const, objects: [] },
        {
          id: "a",
          buttonActions: {
            "button-0": { type: "open-popup", targetScreenId: "gone" },
            "button-1": { type: "open-popup", targetScreenId: "p" },
            "button-2": { type: "open-popup", targetScreenId: "a" },
          },
          objects: [
            button("lost", { type: "open-popup", targetScreenId: "gone" }),
            button("kept", { type: "open-popup", targetScreenId: "p" }),
            { id: "group", type: "group", properties: {}, children: [button("nested", { type: "open-popup", targetScreenId: "" })] },
          ],
        },
      ],
    }
    const out = withoutDeadPopupActions(project as any) as any
    expect(Object.keys(out.screens[1].buttonActions)).toEqual(["button-1"])
    expect(out.screens[1].objects[0].properties.action).toBeUndefined()
    expect(out.screens[1].objects[1].properties.action).toEqual({ type: "open-popup", targetScreenId: "p" })
    expect(out.screens[1].objects[2].children[0].properties.action).toBeUndefined()
  })

  test("popups go to popups[], beside the fence and their frame colours; the screens stay as they were", async ({ page }) => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, await projectWithPopupFirst())
    const exported = await downloadProjectJson(page, "Export Project")

    expect(exported.screens.map((s: any) => s.name)).toEqual(["Main A", "Main B", "Main C", "Main D", "Main E"])
    expect(exported.popups.map((s: any) => s.name)).toEqual(["Popup P"])
    expect(exported.popupFence).toEqual({ ...popupFence({ screenWidth: 360, screenHeight: 360, screenShape: "round" }) })

    const popup = exported.popups[0]
    expect(popup.id).toBe("popup-p")
    expect(popup.borderColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(popup.borderColorDark).toMatch(/^#[0-9a-f]{6}$/i)
    expect(popup.scrimColor).toBe("#000000")
    expect(popup.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i)
    const close = popup.objects.find((o: any) => o.id === "close-p")
    expect(close.properties.action).toEqual({ type: "close-popup" })

    const opener = exported.screens.find((s: any) => s.id === "main-d").objects.find((o: any) => o.id === "open-d")
    expect(opener.properties.action).toEqual({ type: "open-popup", targetScreenId: "popup-p" })
    const unset = exported.screens.find((s: any) => s.id === "main-e").objects.find((o: any) => o.id === "open-e")
    expect(unset.properties.action).toBeUndefined()
  })

  test("a project without popups exports no popup keys", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const exported = await downloadProjectJson(page, "Export Project")
    expect("popups" in exported).toBe(false)
    expect("popupFence" in exported).toBe(false)
  })
})

test.describe("Popup screens: deploying to a device that does not know them", () => {
  test("the buttons that would open a popup, named (pure)", () => {
    const button = (id: string, text: string, action: Record<string, unknown>) => ({ id, type: "button", properties: { text, action } })
    const project = {
      hardwareButtons: [{ id: "button-1", name: "Rotate Right" }],
      screens: [
        { id: "p", name: "Timer", screenType: "popup" as const, objects: [button("c", "Close", { type: "close-popup" })] },
        {
          id: "a",
          name: "Heizung",
          buttonActions: { "button-1": { type: "open-popup", targetScreenId: "p" } },
          objects: [button("o", "Timer", { type: "open-popup", targetScreenId: "p" }), button("x", "Gone", { type: "open-popup", targetScreenId: "nope" })],
        },
        { id: "m", name: "Master", isMaster: true, objects: [] },
      ],
    }
    expect(popupOpeners(project as any)).toEqual(['"Timer" on Heizung', "Rotate Right on Heizung"])
    expect(popupOpeners({ hardwareButtons: [], screens: [{ id: "a", name: "A", objects: [] }] } as any)).toEqual([])
    expect(generationBelow("1.2", POPUP_GENERATION)).toBe(true)
    expect(generationBelow("1.3", POPUP_GENERATION)).toBe(false)
  })

  const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
  for (const [generation, warned] of [
    ["1.2", true],
    ["1.3", false],
  ] as const) {
    test(`a device announcing ${generation} is ${warned ? "" : "not "}warned about`, async ({ page }, testInfo) => {
      test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
      const id = `e2e-popup-${testInfo.testId}`
      const device = await new Promise<mqtt.MqttClient>((resolve, reject) => {
        const client = mqtt.connect(BROKER_URL, { clientId: `e2e-popup-${testInfo.testId}`, reconnectPeriod: 0 })
        client.once("connect", () => resolve(client))
        client.once("error", reject)
      })
      try {
        device.publish(
          `${TOPIC_PREFIX}/${id}/hello`,
          JSON.stringify({ deviceId: "e2e-round-fixture", name: `Popup Test ${id}`, systemGeneration: generation }),
          { retain: true },
        )
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "online", { retain: true })

        await loadProject(page, await projectWithPopupFirst())
        await page.getByRole("button", { name: "File" }).click()
        await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
        await page.getByText(`Popup Test ${id}`).click()
        const warning = page.getByTestId("deploy-blocked")
        await expect(warning).toHaveCount(warned ? 1 : 0)
        if (warned) await expect(warning).toContainText('"Go" on Main D')
      } finally {
        device.publish(`${TOPIC_PREFIX}/${id}/hello`, "", { retain: true })
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        device.end()
      }
    })
  }
})
