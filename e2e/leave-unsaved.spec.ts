import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, createScreen, loadProject, saveProjectAs } from "./helpers"

// Leaving an unsaved project inside the designer asks first: «Save changes
// to "…"?» with Save, Don't Save and Cancel (docs/2026-09-23-explicit-save.md,
// "Leaving an unsaved project").

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e leave ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

async function fileMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "File" }).click()
  await page.getByRole("menuitem", { name: item }).click()
}

const deviceStep = (page: Page) => page.getByText("Choose the device this project is for.")
const title = (page: Page) => page.getByTestId("project-title")

test.describe("Leaving an unsaved project", () => {
  test("Cancel stays with the changes; Don't Save carries on", async ({ page }) => {
    // Uploaded and never saved: unsaved.
    await loadProject(page, COMBINED_TEST_PROJECT)
    await fileMenu(page, "New Project")
    await expect(page.getByRole("heading", { name: 'Save changes to "Untitled"?' })).toBeVisible()

    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(deviceStep(page)).toHaveCount(0)
    await expect(title(page)).toHaveText("• Untitled")

    await fileMenu(page, "New Project")
    await page.getByRole("button", { name: "Don't Save" }).click()
    await expect(deviceStep(page)).toBeVisible()
  })

  test("Save on a named project saves, then carries on", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "named")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    await createScreen(page, "Edited", false)

    await fileMenu(page, "New Project")
    await expect(page.getByRole("heading", { name: `Save changes to "${name}"?` })).toBeVisible()
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(deviceStep(page)).toBeVisible()
    const versions = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}/versions`)).json())
      .versions
    expect(versions).toHaveLength(2)
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("Save on an unnamed project goes through the Save dialog; cancelling that stays", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "unnamed")
    await loadProject(page, COMBINED_TEST_PROJECT)

    await fileMenu(page, "New Project")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Save Project" })).toBeVisible()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(deviceStep(page)).toHaveCount(0)
    await expect(title(page)).toHaveText("• Untitled")

    // And saving through it carries on.
    await fileMenu(page, "New Project")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await page.locator("#save-project-name").fill(name)
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(deviceStep(page)).toBeVisible()
    expect((await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).ok()).toBe(true)
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("Upload Project asks too, and the file picker still opens", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await fileMenu(page, "Upload Project")
    await expect(page.getByRole("heading", { name: 'Save changes to "Untitled"?' })).toBeVisible()
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Don't Save" }).click()
    await chooser
  })

  test("a saved project is left without a question", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "saved")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    await fileMenu(page, "New Project")
    await expect(deviceStep(page)).toBeVisible()
    await expect(page.getByRole("heading", { name: /Save changes/ })).toHaveCount(0)
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })
})
