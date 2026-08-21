import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { getMainCanvas, chooseDevice, devicePoint, waitForEditorReady, M5DIAL_DEVICE_ID, WAVESHARE_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedM5DialDdf, seedWaveshareDdf } from "./ddf-seed"

// Covers the designer half of device-specific actions (2026-08-20): a device
// declares `deviceActions: ["showScreenMenu"]` in its DDF, the designer offers
// exactly those ids as a "Device Action" button action, and writes the choice
// back as { type: "device-action", deviceActionId } - see
// docs/device-contract.md §5's registry and lib/device-actions.ts.
//
// The firmware half (dispatching the id, and skipping unknown ones) is
// covered on real hardware by hil/waveshare/verify-smoke-test.js, which fires
// swipe-up through POST /api/input and asserts the screen menu is actually
// drawn. What this spec adds is everything upstream of that: that the option
// only exists for a device that declared it, that an id the registry doesn't
// know is still offered, and that the export carries the exact shape firmware
// parses.

const actionTypeSelect = (page: Page) =>
  page.locator("label", { hasText: "Action Type" }).locator("..").getByRole("combobox")

const deviceActionSelect = (page: Page) =>
  page.locator("label", { hasText: "Device Action" }).locator("..").getByRole("combobox")

// Clicks well outside the round screen/adornment artwork to clear any
// selection, showing the ScreenProperties panel the Swipe Navigation section
// lives in - same convention as m5dial-swipe-actions.spec.ts's own deselect().
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

// A test-only variant of the Waveshare, declaring one action id the
// designer's registry doesn't know. Its own device id keeps it a separate
// .data/ddf entry from the real board's; the "e2e-" prefix marks it as a
// spec leftover in .data/ddf, matching what the other seeding specs use.
const UNREGISTERED_ACTION_DEVICE_ID = "e2e-waveshare-unregistered-action"

// This board's own screen, for the drag that places a SoftwareButton.
const WAVESHARE_SCREEN = { width: 360, height: 360 }

async function createProjectOn(page: Page, deviceId: string): Promise<void> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, deviceId, "auto-discovered")
  await page.getByRole("button", { name: "Create Project" }).click()
  await waitForEditorReady(page)
}

test.describe("device-specific actions", () => {
  test("a declared device action is offered, saved, and exported as device-action", async ({ page }) => {
    test.skip(!(await seedWaveshareDdf()), "screenbee-waveshare-1v8 not checked out alongside this repo")

    await createProjectOn(page, WAVESHARE_DEVICE_ID)
    await deselect(page)

    // Swipe-up is what this board actually binds the screen menu to - the
    // knob is reserved for adjusting values, not navigation.
    await page.getByRole("button", { name: "Swipe Up" }).click()
    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Device Action" }).click()

    // Picking the type picks the device's first declared id too: a device
    // action is never useful unset, unlike "Go to Screen"'s target. The label
    // comes from the registry, not the raw id.
    await expect(deviceActionSelect(page)).toHaveText("Show Screen Menu")

    await deselect(page)
    await expect(page.getByRole("button", { name: "Swipe Up" })).toContainText("Show Screen Menu")

    // Reopen - must reflect what was actually saved, not just what was typed.
    await page.getByRole("button", { name: "Swipe Up" }).click()
    await expect(actionTypeSelect(page)).toHaveText("Device Action")
    await expect(deviceActionSelect(page)).toHaveText("Show Screen Menu")
    await deselect(page)

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["swipe-up"]).toEqual({ type: "device-action", deviceActionId: "showScreenMenu" })
  })

  test("an id the designer's registry doesn't know is still offered, under its raw id", async ({ page }) => {
    // A device shipping a new action must not have to wait for a designer
    // release - the mirror image of firmware skipping unknown ids. Seeded
    // under its own device id rather than as a mutated copy of the real
    // Waveshare, so the specs in this file (which run in parallel) don't
    // fight over one .data/ddf entry.
    const seeded = await seedWaveshareDdf({
      deviceId: UNREGISTERED_ACTION_DEVICE_ID,
      mutateDeviceJson: (manifest) => {
        manifest.deviceActions = [...(manifest.deviceActions ?? []), "hapticBuzz"]
      },
    })
    test.skip(!seeded, "screenbee-waveshare-1v8 not checked out alongside this repo")

    await createProjectOn(page, UNREGISTERED_ACTION_DEVICE_ID)
    await deselect(page)

    await page.getByRole("button", { name: "Swipe Up" }).click()
    await actionTypeSelect(page).click()
    await page.getByRole("option", { name: "Device Action" }).click()
    await deviceActionSelect(page).click()
    await page.getByRole("option", { name: "hapticBuzz", exact: true }).click()
    await expect(deviceActionSelect(page)).toHaveText("hapticBuzz")
    await deselect(page)

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["swipe-up"]).toEqual({ type: "device-action", deviceActionId: "hapticBuzz" })
  })

  test("a SoftwareButton can be bound to a device action too", async ({ page }) => {
    // Firmware parses a SoftwareButton's action with the same ButtonAction
    // parser as a hardware button's (screenbee-waveshare-1v8's
    // ProjectLoader.cpp), so the designer offers device actions on both -
    // this covers the second, separate editor in
    // property-panel/software-button-properties.tsx.
    test.skip(!(await seedWaveshareDdf()), "screenbee-waveshare-1v8 not checked out alongside this repo")

    await createProjectOn(page, WAVESHARE_DEVICE_ID)

    // The Button tool is hidden until this project-level flag is on - see
    // software-button-render.spec.ts's own note on why that's separate from
    // the DDF's supportedObjectTypes.
    await page.getByRole("button", { name: "Settings" }).click()
    await page.locator("#software-buttons").check()
    await page.keyboard.press("Escape")

    const { box } = await getMainCanvas(page)
    await page.getByRole("button", { name: "Button", exact: true }).first().click()
    await page.waitForTimeout(150)
    const from = devicePoint(box, 100, 100, WAVESHARE_SCREEN)
    const to = devicePoint(box, 220, 160, WAVESHARE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)

    // Plain <select>s here, not the Radix ones the hardware-button panel uses.
    const typeSelect = page.locator("label", { hasText: "Action Type" }).locator("..").getByRole("combobox")
    await typeSelect.selectOption("device-action")
    const idSelect = page.locator("label", { hasText: "Device Action" }).locator("..").getByRole("combobox")
    await expect(idSelect).toHaveValue("showScreenMenu")

    const project = await downloadProjectJson(page)
    const button = project.screens
      .flatMap((s: { objects: any[] }) => s.objects)
      .find((o: { type: string }) => o.type === "SoftwareButton")
    expect(button.properties.action).toEqual({ type: "device-action", deviceActionId: "showScreenMenu" })
  })

  test("a device that declares no device actions doesn't offer the type at all", async ({ page }) => {
    test.skip(!(await seedM5DialDdf()), "screenbee-m5dial not checked out alongside this repo")

    await createProjectOn(page, M5DIAL_DEVICE_ID)
    await deselect(page)

    await page.getByRole("button", { name: "Swipe Up" }).click()
    await actionTypeSelect(page).click()
    // Every other type is there - it's specifically the one with nothing to
    // pick that's absent, rather than the dropdown failing to render.
    await expect(page.getByRole("option", { name: "Send MQTT Message" })).toBeVisible()
    await expect(page.getByRole("option", { name: "Device Action" })).toHaveCount(0)
  })
})
