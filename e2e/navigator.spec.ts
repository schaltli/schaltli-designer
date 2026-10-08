import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, waitForDeviceGate, chooseDevice, createProject, waitForEditorReady } from "./helpers"
import { seedRoundFixtureDdf, seedWaveshare4v3bDdf } from "./ddf-seed"

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
