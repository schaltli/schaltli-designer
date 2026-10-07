import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { createProject, getMainCanvas, chooseDevice, createScreen, ROUND_FIXTURE_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// Covers the designer-side configuration surface for touch-swipe screen
// navigation (2026-08-17): swipe-left/right/up/down are 4 fixed, firmware-
// invented button ids (lib/device-description.ts's
// deviceDescriptionToProjectFields, gated on the same supportsSoftwareButtons
// signal the SoftwareButton toolbar tool already uses) with no adornment SVG
// element to click on the canvas - their only UI entry point is the
// "Swipe navigation" section in the property panel's screen-scoped view
// (components/property-panel/screen-properties.tsx, shown whenever no object
// is selected). Since 2026-10-07 each direction's action is chosen right
// there, in a list of its own (HardwareButtonActionFields), and the device's
// own buttons have a section beside it, "Hardware buttons": a button, then
// «Does», then the action was a click too many, and the screen's panel was
// gone after it (the user).
//
// This covers only the designer-side configuration surface (population,
// discovery UI, save, export). The actual swipe gesture - content sliding,
// intent-lock, commit/cancel thresholds - runs entirely in firmware and has
// no HIL/e2e coverage path: TestInterfaceServer has no touch-simulation
// endpoint, and the HIL orchestrator cannot actuate a physical finger on the
// capacitive sensor. Manual on-device testing is the only verification for
// that half of this feature.
//
// Written against the M5 Dial (2026-08-17) and moved to the shared round
// fixture on 2026-09-10 when that device was dropped. Nothing here was ever
// specific to it: the feature is gated on supportsSoftwareButtons, which is
// what the fixture device declares too.

// A button's own «Does» list in the screen's panel: its ids start with the
// button's.
const actionTypeOf = (page: Page, buttonId: string) => page.locator(`#${buttonId}-actionType`)

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

test.describe("Swipe navigation", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test("creating a project on a swipe-capable device adds all 4 swipe directions to hardwareButtons", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
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

  test("Swipe navigation lists all 4 directions with their list right there; picking one saves and exports it", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await page.waitForTimeout(1500)
    await deselect(page)

    await expect(page.getByRole("button", { name: /^Swipe navigation/i })).toBeVisible()
    for (const id of ["swipe-left", "swipe-right", "swipe-up", "swipe-down"]) {
      await expect(actionTypeOf(page, id)).toHaveValue("none")
    }

    // One pick, and the screen's panel is still there.
    await actionTypeOf(page, "swipe-left").selectOption("previous-screen")
    await expect(page.getByRole("button", { name: /^Swipe navigation/i })).toBeVisible()

    // Away and back - must reflect what was actually saved.
    await page.getByRole("button", { name: "Master 1" }).click()
    await page.getByRole("button", { name: "Screen 1" }).click()
    await deselect(page)
    await expect(actionTypeOf(page, "swipe-left")).toHaveValue("previous-screen")

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["swipe-left"]).toEqual({ type: "previous-screen" })
  })

  test("a swipe direction inherits its master screen's action (yellow) and can be overridden locally (red)", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await page.waitForTimeout(1500)

    // Every project now starts with one default master ("Master 1",
    // 2026-08-17) - configure its Swipe Right action directly rather than
    // creating a second master, so the new screen below still inherits from
    // "the only existing master".
    await page.getByRole("button", { name: "Master 1" }).click()
    await deselect(page)
    await actionTypeOf(page, "swipe-right").selectOption("next-screen")

    // A new normal screen auto-inherits the (only) existing master.
    await createScreen(page, "E2E Swipe Screen", false)
    await deselect(page)

    // The dot at the front of the list says where the action comes from.
    const statusDot = (page: Page) => actionTypeOf(page, "swipe-right").locator("..").locator("span.rounded-full")

    await expect(statusDot(page)).toHaveCSS("background-color", "rgb(234, 179, 8)") // yellow-500, vererbt
    await expect(actionTypeOf(page, "swipe-right")).toHaveValue("inherit")

    await actionTypeOf(page, "swipe-right").selectOption("previous-screen")
    await expect(statusDot(page)).toHaveCSS("background-color", "rgb(220, 38, 38)") // red-600, lokal definiert
  })

  // The knob's ring, on the round fixture: its buttons are in the adornment,
  // and until 2026-10-07 reachable only by clicking there.
  test("Hardware buttons lists the device's buttons; one sets a slider to adjust, its control right under it", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await page.waitForTimeout(1500)
    await deselect(page)

    await expect(page.getByRole("button", { name: /^Hardware buttons/i })).toBeVisible()
    await expect(page.getByLabel("Rotate Left")).toHaveValue("none")
    await expect(page.getByLabel("Rotate Right")).toHaveValue("none")
    // Swipes stay in their own section, not twice.
    await expect(page.locator("[id$='-actionType']")).toHaveCount(2 + 4)

    await page.getByLabel("Rotate Right").selectOption("goto-screen")
    await expect(page.locator("#button-1-targetScreen")).toBeVisible()
    await page.getByLabel("Rotate Right").selectOption("next-screen")
    await expect(page.locator("#button-1-targetScreen")).toHaveCount(0)

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["button-1"]).toEqual({ type: "next-screen" })
  })
})
