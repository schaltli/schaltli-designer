import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, createScreen } from "./helpers"
import { replayIconServices } from "./icon-service-recording"

// The object tree (right-hand "Objects" panel) gained a "Screen" root row
// above every object (2026-08-16): the screen's own objects are its
// children, and clicking the root clears object selection - landing on the
// same rename/icon/master editor Project Settings > Screens already has
// (ScreenEditorFields, shared between both places - see screen-properties.tsx
// and project-settings-dialog.tsx), merged into the property panel's
// existing "nothing selected" Screen Colors view rather than a new third
// selection state.

test.describe("Object tree Screen root", () => {
  test.beforeEach(async ({ page }) => {
    await replayIconServices(page)
  })

  test("shows the current screen as root with its objects nested under it, and clicking it opens the rename/icon/master editor", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    const screenRoot = page.locator("[data-screen-root]")
    await expect(screenRoot).toBeVisible()
    const currentScreenName = (await screenRoot.textContent())?.trim() ?? ""
    expect(currentScreenName.length).toBeGreaterThan(0)

    // The Screens panel's own row for that same screen must be the one
    // marked "currently editing" (screens-panel.tsx's isSelected/bg-accent)
    // - cross-checks the root against the actual source of truth for
    // "current screen" rather than just trusting its own label.
    await expect(page.getByRole("button", { name: currentScreenName })).toHaveClass(/bg-accent/)

    // At least one real object nested under the root (COMBINED_TEST_PROJECT's
    // default screen is never empty).
    const objectRows = page.locator("[data-object-id]")
    expect(await objectRows.count()).toBeGreaterThan(0)

    // Selecting an object shows its own properties, not the screen editor.
    // "Background image" is a section only the screen has; Colour is on
    // nearly every object since the panel rebuild.
    await objectRows.first().click()
    await expect(page.getByRole("button", { name: /^Background image/ })).toHaveCount(0)

    // Clicking the root clears that selection and opens the screen editor -
    // the same fields Project Settings > Screens uses.
    await screenRoot.click()
    await expect(page.getByRole("button", { name: /^Background image/ })).toBeVisible()
    await expect(page.getByTestId("screen-name")).toHaveValue(currentScreenName)
  })

  test("renaming a screen from the tree-root editor updates the Screens panel too", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    const screenRoot = page.locator("[data-screen-root]")
    await screenRoot.click()

    // ScreenEditorFields carries one test hook, because it has no id or
    // label of its own and is shared with Project Settings > Screens.
    const nameInput = page.getByTestId("screen-name")
    await nameInput.fill("Renamed From Tree")
    await nameInput.blur()
    await page.waitForTimeout(200)

    await expect(page.getByRole("button", { name: "Renamed From Tree" })).toBeVisible()
    await expect(page.locator("[data-screen-root]")).toContainText("Renamed From Tree")
  })

  test("a master screen's tree-root editor has no icon picker or master-assignment (mirrors Project Settings)", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "E2E Tree Master", true)

    await page.locator("[data-screen-root]").click()
    // .last() - the left Screens panel (screens-panel.tsx) now also badges
    // its own master rows "Master" (2026-08-17), so this exact text matches
    // twice; the property panel's own badge (screen-editor-fields.tsx,
    // what this test is actually about) is the one that renders later in
    // the DOM.
    await expect(page.getByText("Master", { exact: true }).last()).toBeVisible()
    await expect(page.getByRole("button", { name: "Select icon" })).toHaveCount(0)
    await expect(page.getByText("Show master")).toHaveCount(0)
  })
})
