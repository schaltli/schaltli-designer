import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, devicePoint, saveProjectAs } from "./helpers"

// Covers version-history-dialog.tsx and the versions of a saved project
// (docs/2026-09-23-explicit-save.md, "Versions"). Since 2026-09-24 every
// save is a version, and a deploy only marks the version it sent - that
// part, with a device on the broker, is e2e/deploy-save.spec.ts. Restore
// opens a version as unsaved changes on top of the newest - like a checkout
// in git: no version is removed.

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e versions ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

async function openVersionHistory(page: Page) {
  await page.getByRole("button", { name: "File" }).click()
  await page.getByRole("menuitem", { name: "Version History" }).click()
  await expect(page.getByRole("heading", { name: "Version History" })).toBeVisible()
}

async function drawBox(page: Page) {
  await page.getByRole("button", { name: "Box", exact: true }).first().click()
  const { box } = await getMainCanvas(page)
  // Device pixels, not canvas-box fractions - see helpers.ts's devicePoint.
  const from = devicePoint(box, 60, 40)
  const to = devicePoint(box, 180, 140)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

test.describe("Version History", () => {
  test("a project that was never saved has no versions yet, and says how to start", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openVersionHistory(page)
    await expect(page.getByText("Save the project to start its version history.")).toBeVisible()
  })

  test("every save is a version; restoring one opens it unsaved and keeps them all", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "restore")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    const objectCountBefore = await page.locator("[data-object-id]").count()

    await drawBox(page)
    await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore + 1)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByTestId("project-title")).toHaveText(name)

    // Longer than the 5 s default: the first request may find `next dev`
    // still compiling the versions route (2026-09-22, one failure in 391).
    await openVersionHistory(page)
    const entries = page.getByRole("list", { name: "Versions" }).getByRole("listitem")
    await expect(entries).toHaveCount(2, { timeout: 20_000 })
    await expect(entries.first()).toContainText("MQTT ePaper Display (GDEY042T81)")

    // The older one, from before the box.
    await entries.nth(1).getByRole("button", { name: "Restore" }).click()
    await expect(page.getByRole("heading", { name: "Version History" })).not.toBeVisible({ timeout: 20_000 })
    // The File menu that opened the dialog is still open underneath: its
    // item prevents the menu's close-on-select, so the click that opens the
    // dialog is not swallowed.
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore)
    await expect(page.getByTestId("project-title")).toHaveText(`• ${name}`)
    // A restore is a load: nothing to undo across it.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.locator("[data-object-id]")).toHaveCount(objectCountBefore)

    const versions = async () =>
      (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}/versions`)).json()).versions.length
    expect(await versions()).toBe(2)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByTestId("project-title")).toHaveText(name)
    expect(await versions()).toBe(3)

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })
})
