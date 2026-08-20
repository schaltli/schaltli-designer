import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { getMainCanvas, chooseDevice, createScreen, M5DIAL_DEVICE_ID } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// Covers the designer-side configuration surface for touch-swipe screen
// navigation (2026-08-17): swipe-left/right/up/down are 4 fixed, firmware-
// invented button ids (lib/device-description.ts's
// deviceDescriptionToProjectFields, gated on the same supportsSoftwareButtons
// signal the SoftwareButton toolbar tool already uses) with no adornment SVG
// element to click on the canvas - their only UI entry point is the new
// "Swipe Navigation" section in the property panel's screen-scoped view
// (components/property-panel/screen-properties.tsx, shown whenever no object
// is selected), which opens the exact same HardwareButtonSidePanel any other
// button click does.
//
// This covers only the designer-side configuration surface (population,
// discovery UI, save, export). The actual swipe gesture - content sliding,
// intent-lock, commit/cancel thresholds - runs entirely in firmware
// (screenbee-m5dial's main.cpp) and has no HIL/e2e coverage path:
// TestInterfaceServer has no touch-simulation endpoint, and the HIL
// orchestrator cannot actuate a physical finger on the capacitive sensor.
// Manual on-device testing is the only verification for that half of this
// feature.

const actionTypeSelect = (page: Page) =>
  page.locator("label", { hasText: "Action Type" }).locator("..").getByRole("combobox")

// Clicks well outside the round screen/adornment artwork to clear any
// selection - same convention as hardware-button-master-inheritance.spec.ts's
// own deselect(), which shows the ScreenProperties panel (no object
// selected) this section lives in.
async function deselect(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  await page.mouse.click(box.x + 5, box.y + 5)
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

test.describe("M5 Dial swipe navigation", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("creating a project with the M5 Dial adds all 4 swipe directions to hardwareButtons", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    const project = await downloadProjectJson(page)
    const cases = [
      { id: "swipe-left", name: "Swipe Left" },
      { id: "swipe-right", name: "Swipe Right" },
      { id: "swipe-up", name: "Swipe Up" },
      { id: "swipe-down", name: "Swipe Down" },
    ]
    for (const { id, name } of cases) {
      expect(project.hardwareButtons.find((b: { id: string; name: string }) => b.id === id)).toEqual({ id, name })
    }
  })

  test("Swipe Navigation section lists all 4 directions as Unassigned, configuring one saves and exports it", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)
    await deselect(page)

    await expect(page.getByText("Swipe Navigation")).toBeVisible()
    for (const name of ["Swipe Left", "Swipe Right", "Swipe Up", "Swipe Down"]) {
      const row = page.getByRole("button", { name })
      await expect(row).toBeVisible()
      await expect(row).toContainText("Unassigned")
    }

    await page.getByRole("button", { name: "Swipe Left" }).click()
    await expect(actionTypeSelect(page)).toHaveText("No Action")
    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Previous Screen" }).click()
    await deselect(page)

    await expect(page.getByRole("button", { name: "Swipe Left" })).toContainText("Previous Screen")

    // Reopen - must reflect what was actually saved.
    await page.getByRole("button", { name: "Swipe Left" }).click()
    await expect(actionTypeSelect(page)).toHaveText("Previous Screen")
    await deselect(page)

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["swipe-left"]).toEqual({ type: "previous-screen" })
  })

  test("a swipe direction inherits its master screen's action (yellow) and can be overridden locally (red)", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    // Every project now starts with one default master ("Master 1",
    // 2026-08-17) - configure its Swipe Right action directly rather than
    // creating a second master, so the new screen below still inherits from
    // "the only existing master".
    await page.getByRole("button", { name: "Master 1" }).click()
    await deselect(page)
    await page.getByRole("button", { name: "Swipe Right" }).click()
    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Next Screen" }).click()
    await deselect(page)

    // A new normal screen auto-inherits the (only) existing master.
    await createScreen(page, "E2E Swipe Screen", false)
    await deselect(page)

    const statusDot = (page: Page) =>
      page.getByRole("button", { name: "Swipe Right" }).locator("span.rounded-full")

    await expect(statusDot(page)).toHaveCSS("background-color", "rgb(234, 179, 8)") // yellow-500, vererbt
    await page.getByRole("button", { name: "Swipe Right" }).click()
    await expect(actionTypeSelect(page)).toHaveText("Inherit from Master: Next Screen")

    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Previous Screen" }).click()
    await deselect(page)
    await expect(statusDot(page)).toHaveCSS("background-color", "rgb(220, 38, 38)") // red-600, lokal definiert
  })
})
