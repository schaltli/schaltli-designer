import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, clickButton0, createScreen, getMainCanvas, BUTTON_0_OFFSET } from "./helpers"

// Replaces the old project-wide HardwareButton.defaultAction mechanism
// (deleted 2026-08-16 along with Project Settings > Hardware Buttons - see
// docs/device-contract.md §5 and lib/hardware-button-actions.ts) with
// inheritance from a screen's assigned master screen: a master screen can
// set its own buttonActions, and any normal screen that references it via
// masterScreenId picks those up unless it defines its own local override.
// Status is shown live on the canvas via a button's own fill color - gray
// (BUTTON_STATUS_COLOR.none), yellow (.inherited), red (.local).

// A plain <select> with its own id since the panel rebuild
// (docs/2026-09-20-property-panel.md), and the row is called "Does", the
// same as the software button's.
const actionTypeSelect = (page: Page) => page.locator("#actionType")

// button-10's fill color, sampled directly off the interactive <canvas>
// bitmap (not the DOM) at the same point clickButton0() clicks - see
// canvas.tsx's draw() for the fill pass this reads back, and
// lib/hardware-button-actions.ts's BUTTON_STATUS_COLOR for the 3 colors.
async function sampleButton0Color(page: Page): Promise<[number, number, number]> {
  const { canvas, box } = await getMainCanvas(page)
  const px = box.width / 2 + BUTTON_0_OFFSET.x
  const py = box.height / 2 + BUTTON_0_OFFSET.y
  return canvas.evaluate((el: HTMLCanvasElement, { px, py }: { px: number; py: number }) => {
    const ctx = (el as HTMLCanvasElement).getContext("2d")!
    const data = ctx.getImageData(px, py, 1, 1).data
    return [data[0], data[1], data[2]] as [number, number, number]
  }, { px, py })
}

// Closes whatever hardware-button panel is open, the same way clicking any
// non-button canvas area would at runtime - project-editor.tsx's
// onSelectObject clears showHardwareButtonPanel on every selection change.
async function deselect(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  await page.mouse.click(box.x + 5, box.y + 5)
}

test.describe("Hardware button master-screen inheritance", () => {
  test("a button with no master starts unassigned (gray), a local action persists and colors it red, and clearing it back to None returns it to gray", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    expect(await sampleButton0Color(page)).toEqual([156, 163, 175]) // gray-400, unbelegt

    await clickButton0(page)
    await expect(actionTypeSelect(page)).toHaveValue("none")

    await actionTypeSelect(page).selectOption("next-screen")
    await deselect(page)
    expect(await sampleButton0Color(page)).toEqual([220, 38, 38]) // red-600, lokal definiert

    // Reopen - must reflect what was actually saved, not reset to blank.
    await clickButton0(page)
    await expect(actionTypeSelect(page)).toHaveValue("next-screen")

    // Explicit "No Action" (distinct from never having configured it -
    // both display as unbelegt/gray, but this is a deliberate local choice,
    // not just an absent entry).
    await actionTypeSelect(page).selectOption("none")
    await deselect(page)
    expect(await sampleButton0Color(page)).toEqual([156, 163, 175])

    await clickButton0(page)
    await expect(actionTypeSelect(page)).toHaveValue("none")
  })

  test("a screen inherits its master's button action (yellow), can override it locally (red), and can switch back to inheriting", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    await createScreen(page, "E2E Button Master", true)
    await clickButton0(page)
    await actionTypeSelect(page).selectOption("next-screen")
    await deselect(page)

    // A new normal screen auto-inherits the (only) existing master.
    await createScreen(page, "E2E Button Screen", false)
    expect(await sampleButton0Color(page)).toEqual([234, 179, 8]) // yellow-500, vererbt

    await clickButton0(page)
    // The inherited choice says what it would inherit, so it reads as an
    // answer rather than as a setting.
    await expect(actionTypeSelect(page)).toHaveValue("inherit")
    await expect(actionTypeSelect(page).locator('option[value="inherit"]')).toHaveText("Inherit: Next screen")

    // Override locally.
    await actionTypeSelect(page).selectOption("previous-screen")
    await deselect(page)
    expect(await sampleButton0Color(page)).toEqual([220, 38, 38]) // red-600, lokal definiert
    await clickButton0(page)
    await expect(actionTypeSelect(page)).toHaveValue("previous-screen")

    // Switch back to inheriting via the dropdown entry itself, not a
    // separate reset control.
    await actionTypeSelect(page).selectOption("inherit")
    // The inherited choice says what it would inherit, so it reads as an
    // answer rather than as a setting.
    await expect(actionTypeSelect(page)).toHaveValue("inherit")
    await expect(actionTypeSelect(page).locator('option[value="inherit"]')).toHaveText("Inherit: Next screen")
    await deselect(page)
    expect(await sampleButton0Color(page)).toEqual([234, 179, 8])
  })

  // Covers the request that a Send MQTT action pick its topic from a
  // dropdown of already-registered topics (reusing the same TopicSelector
  // Switch's own Write Topic uses, allowSubtopics=false), not free text -
  // the old side panel had a plain <Input> for it.
  test("Send MQTT Message uses a Write Topic dropdown (not free text) plus a payload field, and persists", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    await clickButton0(page)
    await actionTypeSelect(page).selectOption("send-mqtt")

    // The row is called "Topic" since the panel rebuild, and its name is a
    // span rather than a <label> - the picker it names cannot be reached
    // with `for`.
    const writeTopicSelect = page.locator("[data-row-label]", { hasText: "Topic" }).first().locator("..").getByRole("combobox")
    await writeTopicSelect.click()
    // COMBINED_TEST_PROJECT's topics all live under a "test/..." prefix
    // (plus one unrelated "Freshwater/Level") - the tree starts fully
    // collapsed when nothing is selected yet, so the "test" group header
    // needs an explicit expand click first (unlike switch-render.spec.ts's
    // equivalent check, which starts from an already-selected topic whose
    // ancestor auto-expands).
    await page.getByRole("listbox").getByText("test", { exact: true }).click()
    await page.getByRole("option", { name: "zone-level" }).click()
    await expect(writeTopicSelect).toContainText("test/zone-level")

    await page.locator("#mqttMessage").fill("77")
    await deselect(page)

    // Reopen - both the picked topic and the payload must have persisted.
    await clickButton0(page)
    await expect(actionTypeSelect(page)).toHaveValue("send-mqtt")
    await expect(writeTopicSelect).toContainText("test/zone-level")
    await expect(page.locator("#mqttMessage")).toHaveValue("77")
  })
})
