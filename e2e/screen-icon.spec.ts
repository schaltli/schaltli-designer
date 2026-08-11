import { test, expect } from "@playwright/test"

// Per-screen icon (2026-08-11, Phase 1 of an M5 Dial screen-switch
// navigator overlay - see docs/device-contract.md for the eventual
// firmware side, not built yet). Purely designer-side: ProjectScreen.
// iconAssetId, picked via the same IconSelectorModal/asset library every
// other icon field already uses (a new "screen-icon" branch in
// project-editor.tsx's shared iconSelectorContext/handleIconSelect).
// Deliberately not exported to the device yet (lib/project-zip.ts
// untouched) - Phase 2 will define the actual render/bake requirements.
test.describe("Per-screen icon", () => {
  test("setting and clearing a screen's icon via Settings > Screens", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "v1.1 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()

    // Buttons here carry only an emoji/×/svg as visible content, with the
    // real label in `title` (a tooltip, not the a11y name for a non-empty-
    // content button) - getByTitle, not getByRole's name matching.
    const iconButton = page.getByTitle("Set screen icon")
    await expect(iconButton).toBeVisible()
    await iconButton.click()

    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()
    await page.getByPlaceholder("Search for icons...").fill("home")
    const firstResult = page.getByRole("button", { name: "material-symbols:home", exact: true })
    await expect(firstResult).toBeVisible()
    await firstResult.click()

    // Modal closes, the row's icon button now shows the picked icon (title
    // reflects the asset name) and a separate clear ("x") button appears.
    await expect(page.getByRole("dialog", { name: "Select Icon" })).not.toBeVisible()
    const setIconButton = page.getByTitle("Screen icon: material-symbols:home")
    await expect(setIconButton).toBeVisible()
    const clearButton = page.getByTitle("Clear screen icon")
    await expect(clearButton).toBeVisible()

    await clearButton.click()
    await expect(page.getByTitle("Set screen icon")).toBeVisible()
    await expect(clearButton).not.toBeVisible()
  })

  test("a master screen never shows the icon picker", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "v1.1 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Add screen" }).click()
    await page.getByRole("menuitem", { name: "Add Master Screen" }).click()
    await page.locator("#screenName").fill("E2E Master")
    await page.getByRole("button", { name: "Create Screen" }).click()
    await page.waitForTimeout(300)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()

    // Two rows now (Screen 1 + the new master) - exactly one icon button,
    // for the non-master screen only.
    await expect(page.getByTitle("Set screen icon")).toHaveCount(1)
  })
})
