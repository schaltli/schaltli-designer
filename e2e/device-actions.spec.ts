import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { createProject, getMainCanvas, chooseDevice, devicePoint, waitForEditorReady, WAVESHARE_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedWaveshareDdf } from "./ddf-seed"

// Covers the designer half of device-specific actions (2026-08-20): a device
// declares `deviceActions: ["displayOff"]` in its DDF, the designer offers
// exactly those ids as a "Device Action" button action, and writes the choice
// back as { type: "device-action", deviceActionId } - see
// docs/device-contract.md §5's registry and lib/device-actions.ts.
//
// The knob's «Show Screen Menu» was the first; it went with the screen graph
// (lib/screen-menu.ts, device contract §2.10), and the knob declares none
// now. So the board here is the knob's description declaring the 4.3B's
// displayOff, under an id of its own. What this spec covers: that the option
// only exists for a device that declared it, that an id the registry doesn't
// know is still offered, that the export carries the exact shape firmware
// parses, and that the screen menu is offered no more.

// Swipe up's own row in the screen's panel, where its action is chosen right
// there (screen-properties.tsx, 2026-10-07): each row's ids start with its
// button's.
const swipeUpType = (page: Page) => page.locator("#swipe-up-actionType")
const swipeUpDeviceAction = (page: Page) => page.locator("#swipe-up-deviceAction")

// Clicks well outside the round screen/adornment artwork to clear any
// selection, showing the ScreenProperties panel the Swipe Navigation section
// lives in - same convention as swipe-actions.spec.ts's own deselect().
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
  await createProject(page)
  await waitForEditorReady(page)
}

// The knob's description with the 4.3B's displayOff, under its own id.
const DISPLAY_OFF_DEVICE_ID = "e2e-waveshare-display-off"
const seedDisplayOff = () =>
  seedWaveshareDdf({
    deviceId: DISPLAY_OFF_DEVICE_ID,
    mutateDeviceJson: (manifest) => {
      manifest.deviceActions = ["displayOff"]
    },
  })

test.describe("device-specific actions", () => {
  test("a declared device action is offered, saved, and exported as device-action", async ({ page }) => {
    test.skip(!(await seedDisplayOff()), "schaltli-firmware not checked out alongside this repo")

    await createProjectOn(page, DISPLAY_OFF_DEVICE_ID)
    await deselect(page)

    await swipeUpType(page).selectOption("device-action")

    // Picking the type picks the device's first declared id too: a device
    // action is never useful unset, unlike "Go to Screen"'s target. One the
    // registry has no label for shows as itself.
    await expect(swipeUpDeviceAction(page)).toHaveValue("displayOff")
    await expect(swipeUpDeviceAction(page).locator("option:checked")).toHaveText("displayOff")

    // Away and back - must reflect what was actually saved, not just what was typed.
    await page.getByRole("button", { name: "Master 1" }).click()
    await page.getByRole("button", { name: "Screen 1" }).click()
    await deselect(page)
    await expect(swipeUpType(page)).toHaveValue("device-action")
    await expect(swipeUpDeviceAction(page)).toHaveValue("displayOff")

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["swipe-up"]).toEqual({ type: "device-action", deviceActionId: "displayOff" })
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
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")

    await createProjectOn(page, UNREGISTERED_ACTION_DEVICE_ID)
    await deselect(page)

    await swipeUpType(page).selectOption("device-action")
    await swipeUpDeviceAction(page).selectOption("hapticBuzz")
    await expect(swipeUpDeviceAction(page)).toHaveValue("hapticBuzz")

    const project = await downloadProjectJson(page)
    const screen = project.screens.find((s: { isMaster?: boolean }) => !s.isMaster)
    expect(screen.buttonActions["swipe-up"]).toEqual({ type: "device-action", deviceActionId: "hapticBuzz" })
  })

  test("a SoftwareButton can be bound to a device action too", async ({ page }) => {
    // Firmware parses a SoftwareButton's action with the same ButtonAction
    // parser as a hardware button's (schaltli-firmware's
    // ProjectLoader.cpp), so the designer offers device actions on both -
    // this covers the second, separate editor in
    // property-panel/software-button-properties.tsx.
    test.skip(!(await seedDisplayOff()), "schaltli-firmware not checked out alongside this repo")

    await createProjectOn(page, DISPLAY_OFF_DEVICE_ID)

    // The Button tool is hidden until this project-level flag is on - see
    // software-button-render.spec.ts's own note on why that's separate from
    // the DDF's supportedObjectTypes.
    await page.getByRole("button", { name: "Settings", exact: true }).click()
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

    // Plain <select>s here, not the Radix ones the hardware-button panel
    // uses - and since the rebuild they carry their own ids, so there is no
    // need to find them through the label beside them
    // (docs/2026-09-20-property-panel.md, round 5).
    await page.locator("#actionType").selectOption("device-action")
    await expect(page.locator("#deviceActionId")).toHaveValue("displayOff")

    const project = await downloadProjectJson(page)
    const button = project.screens
      .flatMap((s: { objects: any[] }) => s.objects)
      .find((o: { type: string }) => o.type === "button")
    expect(button.properties.action).toEqual({ type: "device-action", deviceActionId: "displayOff" })
  })

  // The negative case: the knob itself, which declares none since its
  // screen menu went (lib/screen-menu.ts). And a knob description from before
  // that, still naming showScreenMenu: it is not offered either.
  const OLD_KNOB_DEVICE_ID = "e2e-knob-with-screen-menu"

  test("a device that declares no device actions doesn't offer the type at all", async ({ page }) => {
    test.skip(!(await seedWaveshareDdf()), "schaltli-firmware not checked out alongside this repo")
    await createProjectOn(page, WAVESHARE_DEVICE_ID)
    await deselect(page)

    // Every other type is there - it's specifically the one with nothing to
    // pick that's absent, rather than the dropdown failing to render.
    await expect(swipeUpType(page).locator('option[value="send-mqtt"]')).toHaveCount(1)
    await expect(swipeUpType(page).locator('option[value="device-action"]')).toHaveCount(0)
  })

  test("a knob's description from before the screen graph still names the screen menu: it is not offered", async ({ page }) => {
    const seeded = await seedWaveshareDdf({
      deviceId: OLD_KNOB_DEVICE_ID,
      mutateDeviceJson: (manifest) => {
        manifest.deviceActions = ["showScreenMenu"]
      },
    })
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await createProjectOn(page, OLD_KNOB_DEVICE_ID)
    await deselect(page)

    // Every other type is there - it's specifically the one with nothing to
    // pick that's absent, rather than the dropdown failing to render.
    await expect(swipeUpType(page).locator('option[value="send-mqtt"]')).toHaveCount(1)
    await expect(swipeUpType(page).locator('option[value="device-action"]')).toHaveCount(0)
  })
})
