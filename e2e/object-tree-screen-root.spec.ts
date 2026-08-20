import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, createScreen } from "./helpers"

// The object tree (right-hand "Objects" panel) gained a "Screen" root row
// above every object (2026-08-16): the screen's own objects are its
// children, and clicking the root clears object selection - landing on the
// same rename/icon/master editor Project Settings > Screens already has
// (ScreenEditorFields, shared between both places - see screen-properties.tsx
// and project-settings-dialog.tsx), merged into the property panel's
// existing "nothing selected" Screen Colors view rather than a new third
// selection state.

test.describe("Object tree Screen root", () => {
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
    await objectRows.first().click()
    await expect(page.getByText("Screen Colors", { exact: true })).toHaveCount(0)

    // Clicking the root clears that selection and opens the screen editor -
    // same heading/fields Project Settings > Screens uses.
    await screenRoot.click()
    await expect(page.getByText("Screen Colors", { exact: true })).toBeVisible()
    const nameInput = page.locator("div").filter({ hasText: "Screen Colors" }).locator("..").locator("input").first()
    await expect(nameInput).toHaveValue(currentScreenName)
  })

  test("renaming a screen from the tree-root editor updates the Screens panel too", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    const screenRoot = page.locator("[data-screen-root]")
    await screenRoot.click()

    // The rename input is the first (and only) plain text <input> in the
    // "Screen" section - ScreenEditorFields itself carries no id/label to
    // hook a more specific locator onto, matching Project Settings' own
    // per-row input.
    const nameInput = page.locator("div").filter({ hasText: "Screen Colors" }).locator("..").locator("input").first()
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
