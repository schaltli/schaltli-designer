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
    await page.getByRole("button", { name: "v1.2 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()

    // An outline button with a Search icon + visible text, same style as
    // the New Screen dialog's own picker (screens-panel.tsx) - the earlier
    // icon-only ghost button crammed into the row's move/duplicate/delete
    // cluster was "kaum sichtbar" (barely visible), found live 2026-08-11.
    const iconButton = page.getByRole("button", { name: "Select icon" })
    await expect(iconButton).toBeVisible()
    await iconButton.click()

    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()
    await page.getByPlaceholder("Search for icons...").fill("home")
    const firstResult = page.getByRole("button", { name: "material-symbols:home", exact: true })
    await expect(firstResult).toBeVisible()
    await firstResult.click()

    // Modal closes, the button label flips to "Change" (the icon preview
    // itself carries the asset name in `title`) and a separate clear ("x")
    // button appears.
    await expect(page.getByRole("dialog", { name: "Select Icon" })).not.toBeVisible()
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible()
    await expect(page.getByTitle("Screen icon: material-symbols:home")).toBeVisible()
    const clearButton = page.getByTitle("Clear screen icon")
    await expect(clearButton).toBeVisible()

    await clearButton.click()
    await expect(page.getByRole("button", { name: "Select icon" })).toBeVisible()
    await expect(clearButton).not.toBeVisible()
  })

  test("a master screen never shows the icon picker", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "v1.2 M5Stack M5Dial (V1.1)" }).click()
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
    await expect(page.getByRole("button", { name: "Select icon" })).toHaveCount(1)
  })

  // Covers a real bug found live 2026-08-11: the New Screen dialog's icon
  // picker (screens-panel.tsx) is its own separate IconSelectorModal
  // instance, not project-editor.tsx's shared one (that one's "screen-icon"
  // context needs an existing screenId, which a screen being created here
  // doesn't have yet). Its onIncrementNextId prop was first wired as
  // `() => onProjectUpdate({...project, nextId: project.nextId+1})` using
  // this component's own (by-then-stale) `project` prop - IconSelectorModal
  // calls onAddAsset() then onIncrementNextId() synchronously in the same
  // handler, before React re-renders, so that spread silently clobbered the
  // asset onAddAsset had just added moments earlier. The picker visibly
  // "worked" (button changed from "Select icon" to "Change") but the
  // screen's iconAssetId pointed at an asset that was never actually saved
  // - nothing ever rendered anywhere. Fixed by passing the real functional
  // setProject((prev) => ...) down instead of reconstructing it from a
  // prop.
  test("picking an icon while creating a screen actually saves it (left panel shows it too)", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "v1.2 M5Stack M5Dial (V1.1)" }).click()
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Add screen" }).click()
    await page.getByRole("menuitem", { name: "Add Screen", exact: true }).click()

    const selectIconButton = page.getByRole("button", { name: "Select icon" })
    await expect(selectIconButton).toBeVisible()
    await selectIconButton.click()

    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()
    await page.getByPlaceholder("Search for icons...").fill("star")
    const firstResult = page.getByRole("button", { name: "material-symbols:star", exact: true })
    await expect(firstResult).toBeVisible()
    await firstResult.click()

    // Button label flips from "Select icon" to "Change" - this part
    // "worked" even with the bug, so it alone doesn't prove the fix.
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible()

    await page.locator("#screenName").fill("Star Screen")
    await page.getByRole("button", { name: "Create Screen" }).click()
    await page.waitForTimeout(300)

    // The real proof: the left Screens panel's row for the new screen must
    // actually render the icon's SVG, not just remember an id pointing at
    // an asset that silently never got saved.
    const row = page.locator("button", { hasText: "Star Screen" })
    await expect(row.locator("svg")).toHaveCount(1)
  })
})
