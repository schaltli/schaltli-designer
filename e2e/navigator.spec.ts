import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, waitForDeviceGate, chooseDevice, createProject, waitForEditorReady } from "./helpers"
import { seedRoundFixtureDdf, seedWaveshare4v3bDdf } from "./ddf-seed"
import { Jimp } from "jimp"

// The navigator (docs/2026-10-08-navigator.md, tasks/navigator-todo.md):
// a bar along one edge with every screen, placed on a master. This file
// grows with the plan; it starts with «Hide screen» (Task 1).

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
// The fixture project says 240x240; the seeded round DDF makes it 360x360.
const FIXTURE_SCREEN = { width: 360, height: 360 }
const BUTTON = { x: 100, y: 100, width: 40, height: 20 }

const button = (id: string, action: Record<string, unknown>) => ({
  id,
  type: "button",
  ...BUTTON,
  zIndex: 1,
  properties: { text: "Go", iconAssetId: null, buttonStyle: "tonal", buttonColor: "#6750A4", action },
})

async function projectWith(screens: any[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.settings.supportsSoftwareButtons = true
  project.screens = screens
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `navigator-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function clickFixtureButton(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  const at = devicePoint(box, BUTTON.x + BUTTON.width / 2, BUTTON.y + BUTTON.height / 2, FIXTURE_SCREEN)
  await page.mouse.click(at.x, at.y)
}

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

// A 4.3B whose DDF declares the navigator (the real one does from Task 7 on).
const NAV_DEVICE_ID = "e2e-navigator-4v3b"
const SCREEN_43B = { width: 800, height: 480 }

async function newNavigatorProject(page: Page): Promise<{ master: string; screen: string }> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, NAV_DEVICE_ID, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)
  const saved = await downloadProjectJson(page)
  await page.keyboard.press("Escape")
  return {
    master: saved.screens.find((s: any) => s.isMaster).name,
    screen: saved.screens.find((s: any) => !s.isMaster && s.screenType !== "popup").name,
  }
}

async function placeNavigator(page: Page, master: string): Promise<void> {
  await page.getByRole("button", { name: master }).click()
  await page.getByRole("button", { name: "Navigator", exact: true }).click()
  const { box } = await getMainCanvas(page)
  const at = devicePoint(box, 400, 240, SCREEN_43B)
  await page.mouse.click(at.x, at.y)
}

test.describe("the navigator object", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(NAV_DEVICE_ID, (manifest) => {
        if (!manifest.supportedObjectTypes.includes("navigator")) manifest.supportedObjectTypes.push("navigator")
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  test("the tool is on a master that has none; placed, it fills the left edge and the tool goes", async ({ page }) => {
    const { master, screen } = await newNavigatorProject(page)
    await page.getByRole("button", { name: screen }).click()
    await expect(page.getByRole("button", { name: "Navigator", exact: true })).toHaveCount(0)

    await placeNavigator(page, master)
    await expect(page.getByRole("button", { name: "Navigator", exact: true })).toHaveCount(0)
    const saved = await downloadProjectJson(page)
    await page.keyboard.press("Escape")
    const nav = saved.screens.find((s: any) => s.isMaster).objects.find((o: any) => o.type === "navigator")
    expect({ x: nav.x, y: nav.y, width: nav.width, height: nav.height }).toEqual({ x: 0, y: 0, width: 80, height: 480 })
    expect(nav.properties).toMatchObject({ edge: "left", shows: "iconsAndText" })
  })

  test("«Edge» and «Shows» move and size it; dragging does not", async ({ page }) => {
    const { master } = await newNavigatorProject(page)
    await placeNavigator(page, master)
    await page.locator("#navigatorEdge").selectOption("bottom")
    await page.locator("#navigatorShows").selectOption("icons")

    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 400, 450, SCREEN_43B)
    const to = devicePoint(box, 400, 200, SCREEN_43B)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()

    const saved = await downloadProjectJson(page)
    const nav = saved.screens.find((s: any) => s.isMaster).objects.find((o: any) => o.type === "navigator")
    expect({ x: nav.x, y: nav.y, width: nav.width, height: nav.height }).toEqual({ x: 0, y: 416, width: 800, height: 64 })
    expect(nav.properties).toMatchObject({ edge: "bottom", shows: "icons" })
  })
})

// Drawn through test-render, as every renderer draws: a navigator on a
// screen with its entries, read back pixel by pixel where the colour is known.
const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`
const SQUARE = svg('<rect x="4" y="4" width="16" height="16" fill="currentColor"/>')
const CIRCLE = svg('<circle cx="12" cy="12" r="8" fill="currentColor"/>')
const GROUND = "#202020"
const INK = "#c0c0c0"
const ACCENT = "#4060ff"
const ON_ACCENT = "#ffffff"

function drawProject(liveIcon: boolean): any {
  const navigator = {
    id: "nav",
    type: "navigator",
    x: 0,
    y: 0,
    width: 64,
    height: 480,
    zIndex: 9,
    properties: { edge: "left", shows: "icons", backgroundColor: GROUND, textColor: INK, activeColor: ACCENT, activeTextColor: ON_ACCENT },
  }
  return {
    name: "nav-draw",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [
      { id: "square", name: "square", type: "icon", data: SQUARE },
      { id: "circle", name: "circle", type: "icon", data: CIRCLE },
    ],
    topics: [{ id: "t", topic: "van/light", type: "text", examples: ["true"] }],
    screens: [
      { id: "a", name: "A", backgroundColor: "#000000", iconAssetId: "square", objects: [navigator] },
      { id: "b", name: "B", hidden: true, iconAssetId: "square", objects: [] },
      {
        id: "c",
        name: "C",
        iconAssetId: "circle",
        ...(liveIcon
          ? { iconLive: { id: "lv1", source: { namespace: "topic", path: "van/light" }, rules: [{ op: "yes", result: { kind: "icon", icon: "square" } }], otherwise: { kind: "icon", icon: "circle" } } }
          : {}),
        objects: [],
      },
      { id: "d", name: "D", iconAssetId: "circle", objects: [] },
    ],
  }
}

async function pixels(page: Page, project: any, overrides: Record<string, string> = {}) {
  const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex: 0, topicOverrides: overrides })
  const img = await Jimp.read(Buffer.from(dataUrl.split(",")[1], "base64"))
  return (x: number, y: number) => {
    const c = img.getPixelColor(x, y)
    return "#" + (c >>> 8).toString(16).padStart(6, "0")
  }
}

test.describe("the navigator, drawn", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  // Three listed screens on 480: 160 each. Entry 0 (A) is open.
  test("the open entry in the accent, the others on the ground, icons in their ink", async ({ page }) => {
    const at = await pixels(page, drawProject(false))
    expect(at(8, 20)).toBe(ACCENT)
    expect(at(32, 80)).toBe(ON_ACCENT)
    expect(at(8, 180)).toBe(GROUND)
    expect(at(32, 240)).toBe(INK)
    // Beside the strip the screen itself.
    expect(at(100, 240)).toBe("#000000")
  })

  test("a hidden screen has no entry; a live screen icon follows its value", async ({ page }) => {
    // C is the second entry (B is hidden): a corner of its icon box is inked
    // by the square, not by the circle.
    const corner = [16 + 7, 160 + 64 + 7] as const
    expect((await pixels(page, drawProject(true), { "van/light": "true" }))(...corner)).toBe(INK)
    expect((await pixels(page, drawProject(true), { "van/light": "false" }))(...corner)).toBe(GROUND)
    expect((await pixels(page, drawProject(false)))(...corner)).toBe(GROUND)
  })
})

test.describe("the navigator's strip on a screen", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(NAV_DEVICE_ID, (manifest) => {
        if (!manifest.supportedObjectTypes.includes("navigator")) manifest.supportedObjectTypes.push("navigator")
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  test("is hatched while editing, not in the preview", async ({ page }) => {
    const { master, screen } = await newNavigatorProject(page)
    await placeNavigator(page, master)
    await page.getByRole("button", { name: screen }).click()
    // A few pixels in the strip, below the first entry's highlight.
    const strip = async () => {
      const { box } = await getMainCanvas(page)
      const at = devicePoint(box, 40, 470, SCREEN_43B)
      const png = await page.screenshot({ clip: { x: at.x - 2, y: at.y - 2, width: 4, height: 4 } })
      const img = await Jimp.read(png)
      const colours = new Set<number>()
      for (let y = 0; y < img.bitmap.height; y++) for (let x = 0; x < img.bitmap.width; x++) colours.add(img.getPixelColor(x, y))
      return [...colours].sort().join(",")
    }
    const edit = await strip()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    expect(await strip()).not.toBe(edit)
  })
})

// A navigator project with twelve screens, the last with a button back to
// the first: built from the designer's own download, loaded again.
async function twelveScreenProject(page: Page): Promise<string[]> {
  const { master } = await newNavigatorProject(page)
  await placeNavigator(page, master)
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const masterScreen = project.screens.find((s: any) => s.isMaster)
  const names = Array.from({ length: 12 }, (_, i) => `Nav ${i + 1}`)
  project.screens = [
    masterScreen,
    ...names.map((name, i) => ({
      id: `nav-${i + 1}`,
      name,
      masterScreenId: masterScreen.id,
      objects:
        i === 11
          ? [{ id: "back", type: "button", x: 380, y: 220, width: 80, height: 40, zIndex: 1, properties: { text: "Back", buttonStyle: "tonal", action: { type: "goto-screen", targetScreenId: "nav-1" } } }]
          : [],
    })),
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `navigator-12-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, out)
  return names
}

test.describe("the navigator in the preview", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(NAV_DEVICE_ID, (manifest) => {
        if (!manifest.supportedObjectTypes.includes("navigator")) manifest.supportedObjectTypes.push("navigator")
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  // Twelve entries of 88 on 480 (lib/navigator.ts): entry i at 88 i - scroll.
  const press = async (page: Page, y: number, toY = y) => {
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 40, y, SCREEN_43B)
    const to = devicePoint(box, 40, toY, SCREEN_43B)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    if (toY !== y) await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
  }
  const isOpen = (page: Page, name: string) => expect(page.getByRole("button", { name, exact: true })).toHaveClass(/bg-accent/)

  test("a click opens the entry's screen; a drag scrolls and opens nothing; a change scrolls to the open entry", async ({ page }) => {
    await twelveScreenProject(page)
    await page.getByRole("button", { name: "Nav 1", exact: true }).click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)

    await press(page, 88 * 2 + 40)
    await isOpen(page, "Nav 3")

    // Up by 200: the same place is two entries further on, and the drag
    // itself opened nothing.
    await press(page, 400, 200)
    await isOpen(page, "Nav 3")
    await press(page, 40)
    await isOpen(page, "Nav 3")
    await press(page, 130)
    await isOpen(page, "Nav 4")

    // To the end and the last entry, then its button back to the first: the
    // navigator follows to the start, so 130 is the second entry again.
    await press(page, 460, 0)
    await press(page, 470)
    await isOpen(page, "Nav 12")
    const { box } = await getMainCanvas(page)
    const back = devicePoint(box, 420, 240, SCREEN_43B)
    await page.mouse.click(back.x, back.y)
    await isOpen(page, "Nav 1")
    await press(page, 130)
    await isOpen(page, "Nav 2")
  })
})

test.describe("Hide screen", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("paging passes over a hidden screen; «Go to a screen» still opens it", async ({ page }) => {
    await loadProject(
      page,
      await projectWith([
        { id: "a", name: "Screen A", objects: [button("next-a", { type: "next-screen" })] },
        { id: "b", name: "Screen B", hidden: true, objects: [button("next-b", { type: "next-screen" })] },
        { id: "c", name: "Screen C", objects: [button("goto-c", { type: "goto-screen", targetScreenId: "b" })] },
      ]),
    )
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    await clickFixtureButton(page)
    await expect(page.getByRole("button", { name: "Screen C" })).toHaveClass(/bg-accent/)
    await clickFixtureButton(page)
    await expect(page.getByRole("button", { name: "Screen B" })).toHaveClass(/bg-accent/)
  })

  test("a project whose first screen is hidden opens on the next", async ({ page }) => {
    await loadProject(
      page,
      await projectWith([
        { id: "a", name: "Screen A", hidden: true, objects: [] },
        { id: "b", name: "Screen B", objects: [] },
      ]),
    )
    await expect(page.getByRole("button", { name: "Screen B" })).toHaveClass(/bg-accent/)
  })

  test("the checkbox is on a main screen only, and is saved", async ({ page }) => {
    await loadProject(
      page,
      await projectWith([
        { id: "m", name: "Master M", isMaster: true, objects: [] },
        { id: "a", name: "Screen A", masterScreenId: "m", objects: [] },
        { id: "p", name: "Popup P", screenType: "popup", showMaster: false, objects: [] },
      ]),
    )
    await page.getByRole("button", { name: "Screen A" }).click()
    const hide = page.getByLabel("Hide screen")
    await expect(hide).toBeVisible()
    await hide.check()
    await expect(page.getByRole("button", { name: "Screen A" }).getByText("Hidden")).toBeVisible()
    const saved = await downloadProjectJson(page)
    expect(saved.screens.find((s: any) => s.id === "a").hidden).toBe(true)

    await page.getByRole("button", { name: "Master M" }).click()
    await expect(page.getByLabel("Hide screen")).toHaveCount(0)
    await page.getByRole("button", { name: "Popup P" }).click()
    await expect(page.getByLabel("Hide screen")).toHaveCount(0)
  })
})
