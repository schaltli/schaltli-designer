import { test, expect } from "@playwright/test"
import { chooseDevice, M5DIAL_DEVICE_ID } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// Search-as-you-type icon auto-suggestion for the New Screen dialog
// (screens-panel.tsx, 2026-08-17): as the user types a screen name, it's
// translated to English (app/api/translate - Iconify's index is
// effectively English-only) and searched live via lib/icon-search.ts's
// searchIcons(), the same Iconify endpoint the manual "Select icon" picker
// already uses (screen-icon.spec.ts). Hits the real translate + Iconify
// services - same precedent as screen-icon.spec.ts's own manual-search
// tests, which already assert exact Iconify result names against the real
// API, not a mock. Verified live (curl) before writing these:
//   - "Wohnzimmer" (German, untranslated) -> zero Iconify results
//   - /api/translate?q=Wohnzimmer&target=en -> "Living room"
//   - Iconify search "living room" -> top results all contain "living"
// so asserting a title *containing* "living" (not an exact icon name) is
// what actually proves translation ran, without pinning to Iconify's exact
// top-1 ranking, which could reorder over time.
test.describe("Screen icon auto-suggestion", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  async function createProjectAndOpenNewScreenDialog(page: import("@playwright/test").Page): Promise<void> {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Add screen" }).click()
    await page.getByRole("menuitem", { name: "Add Screen", exact: true }).click()
  }

  test("typing an English screen name auto-suggests a matching icon, and creating the screen saves it", async ({
    page,
  }) => {
    await createProjectAndOpenNewScreenDialog(page)
    await page.locator("#screenName").fill("Home")

    // No manual search - the preview and "Change" label appear on their own.
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible({ timeout: 8000 })
    await expect(page.getByTitle(/home/i)).toBeVisible()

    await page.getByRole("button", { name: "Create Screen" }).click()
    await page.waitForTimeout(300)

    const row = page.locator("button", { hasText: "Home" })
    await expect(row.locator("svg")).toHaveCount(1)
  })

  test("typing a German screen name still finds a match - proves the translate step actually runs", async ({
    page,
  }) => {
    await createProjectAndOpenNewScreenDialog(page)
    await page.locator("#screenName").fill("Wohnzimmer")

    await expect(page.getByRole("button", { name: "Change" })).toBeVisible({ timeout: 8000 })
    await expect(page.getByTitle(/living/i)).toBeVisible()
  })

  // Regression test (2026-08-18, live user report): app/api/translate used
  // to call Google Translate with sl=auto, whose source-language guess is
  // unreliable on short, context-free single words - "Schloss" ("castle" /
  // "lock") got auto-detected as English and left untranslated (0 Iconify
  // results, no suggestion at all); "Schoss" ("lap") got auto-detected as
  // Luxembourgish (confidence 0.51) and mistranslated to "Shot" (wrong
  // meaning). Fixed by hardcoding sl=de - this app's users are German-
  // speaking. Both words are real ambiguous cases, not cherry-picked to
  // just barely pass.
  test("ambiguous short German words that auto-detect used to mis-translate now suggest a real icon", async ({
    page,
  }) => {
    await createProjectAndOpenNewScreenDialog(page)
    await page.locator("#screenName").fill("Schloss")
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible({ timeout: 8000 })
    await expect(page.getByTitle(/lock/i)).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()

    // A fresh dialog, not a clear-and-retype in the same one - clearing an
    // icon manually freezes auto-suggest for the rest of that dialog's
    // session by design (see screens-panel.tsx's iconManuallySet), so
    // reusing the same dialog here would test that freeze, not this fix.
    await page.getByRole("button", { name: "Add screen" }).click()
    await page.getByRole("menuitem", { name: "Add Screen", exact: true }).click()
    await page.locator("#screenName").fill("Schoss")
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible({ timeout: 8000 })
    await expect(page.getByTitle(/lap/i)).toBeVisible()
  })

  test("manually picking a different icon overrides the auto-suggestion, and it stays overridden", async ({
    page,
  }) => {
    await createProjectAndOpenNewScreenDialog(page)
    await page.locator("#screenName").fill("Home")
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible({ timeout: 8000 })

    await page.getByRole("button", { name: "Change" }).click()
    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()
    await page.getByPlaceholder("Search for icons...").fill("star")
    const starResult = page.getByRole("button", { name: "material-symbols:star", exact: true })
    await expect(starResult).toBeVisible()
    await starResult.click()
    await expect(page.getByRole("dialog", { name: "Select Icon" })).not.toBeVisible()

    // Keep typing - a manual pick must not get silently clobbered by a
    // later auto-suggestion.
    await page.locator("#screenName").fill("Home Screen")
    await page.waitForTimeout(1000)
    await expect(page.getByTitle("material-symbols:star")).toBeVisible()

    await page.getByRole("button", { name: "Create Screen" }).click()
    await page.waitForTimeout(300)

    const row = page.locator("button", { hasText: "Home Screen" })
    await expect(row.locator("svg")).toHaveCount(1)
  })

  test("clearing the icon stops the auto-suggestion from reappearing", async ({ page }) => {
    await createProjectAndOpenNewScreenDialog(page)
    await page.locator("#screenName").fill("Home")
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible({ timeout: 8000 })

    await page.getByTitle("Clear screen icon").click()
    await expect(page.getByRole("button", { name: "Select icon" })).toBeVisible()

    await page.locator("#screenName").fill("Home Again")
    await page.waitForTimeout(1000)
    await expect(page.getByRole("button", { name: "Select icon" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Change" })).toHaveCount(0)

    await page.getByRole("button", { name: "Create Screen" }).click()
    await page.waitForTimeout(300)

    const row = page.locator("button", { hasText: "Home Again" })
    await expect(row.locator("svg")).toHaveCount(0)
  })
})
