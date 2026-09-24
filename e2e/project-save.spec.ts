import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, createScreen, loadProject } from "./helpers"

// Saving in the editor (docs/2026-09-23-explicit-save.md). Saving is
// explicit: nothing goes to the server while editing, only on Save.

test.describe("Saving", () => {
  // The server autosave this replaced wrote the whole project three seconds
  // after every change - 3.4 MB to a Pi's SD card each time.
  test("editing sends nothing to the server", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const writes: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("/api/projects") && req.method() !== "GET") writes.push(`${req.method()} ${req.url()}`)
    })

    await createScreen(page, "Edited", false)
    await expect(page.getByText("Edited", { exact: true }).first()).toBeVisible()
    await page.waitForTimeout(5000)
    expect(writes).toEqual([])
  })
})
