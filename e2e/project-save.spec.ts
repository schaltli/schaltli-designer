import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, createScreen, loadProject, saveProjectAs } from "./helpers"

// Saving in the editor (docs/2026-09-23-explicit-save.md). Saving is
// explicit: nothing goes to the server while editing, only on Save. The
// first save asks for a name in a dialog that shows what is already there.

// Parallel workers share .data, so every test saves under its own names.
function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e save ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

const title = (page: Page) => page.getByTestId("project-title")

async function versionCount(page: Page, name: string): Promise<number> {
  const res = await page.request.get(`/api/projects/${encodeURIComponent(name)}/versions`)
  return (await res.json()).versions.length
}

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

  test("the first Ctrl+S asks for a name among the projects already saved, and saves under it", async ({ page }, testInfo) => {
    const other = uniqueName(testInfo, "already there")
    expect((await page.request.post("/api/projects", { data: { name: other, project: { settings: {} } } })).ok()).toBe(true)
    const name = uniqueName(testInfo, "first")

    await loadProject(page, COMBINED_TEST_PROJECT)
    // Loaded from a file, the project has no name on the server yet.
    await expect(title(page)).toHaveText("• Untitled")
    await expect(page).toHaveTitle("• Untitled - Schaltli Designer")

    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByRole("heading", { name: "Save Project" })).toBeVisible()
    // The file's own name is the suggestion.
    await expect(page.locator("#save-project-name")).toHaveValue("Combined Test Project")
    await expect(page.getByRole("list", { name: "Saved projects" }).getByText(other)).toBeVisible()

    await page.locator("#save-project-name").fill(name)
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Save Project" })).toHaveCount(0)
    await expect(title(page)).toHaveText(name)
    await expect(page).toHaveTitle(`${name} - Schaltli Designer`)

    const saved = await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()
    expect(saved.project.name).toBe(name)
    expect(saved.project.screens.length).toBeGreaterThan(0)

    await page.request.delete(`/api/projects/${encodeURIComponent(other)}`)
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("after that, Ctrl+S saves without asking; an edit sets the dot, undo back to the saved state clears it", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "again")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    expect(await versionCount(page, name)).toBe(1)

    await createScreen(page, "Edited", false)
    await expect(title(page)).toHaveText(`• ${name}`)

    // Undo back to what was saved: saved again, no dot.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(title(page)).toHaveText(name)

    await page.keyboard.press("ControlOrMeta+y")
    await expect(title(page)).toHaveText(`• ${name}`)
    // Named now, so Ctrl+S asks nothing.
    await page.keyboard.press("ControlOrMeta+s")
    await expect(title(page)).toHaveText(name)
    await expect(page.getByRole("heading", { name: "Save Project" })).toHaveCount(0)
    expect(await versionCount(page, name)).toBe(2)

    // File > Save does the same.
    await createScreen(page, "Edited again", false)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Save Ctrl+S", exact: true }).click()
    await expect(title(page)).toHaveText(name)
    expect(await versionCount(page, name)).toBe(3)

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("an invalid name says why and cannot be saved", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Save Ctrl+S", exact: true }).click()
    const field = page.locator("#save-project-name")
    const save = page.getByRole("button", { name: "Save", exact: true })

    for (const [bad, reason] of [
      ["Van/Knob", "A name cannot contain /"],
      ["Van Knob.", "A name cannot end with a dot."],
      ["nul", '"nul" is reserved by Windows.'],
    ]) {
      await field.fill(bad)
      await expect(page.getByRole("alert")).toHaveText(reason)
      await expect(save).toBeDisabled()
    }
    await field.fill("Van Knob")
    await expect(save).toBeEnabled()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(title(page)).toHaveText("• Untitled")
  })

  // Replacing is how git treats a file that gets entirely new content: a new
  // commit on top, the history kept. Nothing of the replaced project is lost.
  test("saving under a name that exists asks to replace it, and keeps its versions", async ({ page }, testInfo) => {
    const taken = uniqueName(testInfo, "Taken")
    const before = { name: taken, settings: { deviceName: "Before" }, screens: [] }
    expect((await page.request.post("/api/projects", { data: { name: taken, project: before } })).ok()).toBe(true)

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.keyboard.press("ControlOrMeta+s")
    // Picked from the list, in its own spelling.
    await page.getByRole("list", { name: "Saved projects" }).getByText(taken).click()
    await expect(page.locator("#save-project-name")).toHaveValue(taken)
    await page.getByRole("button", { name: "Save", exact: true }).click()

    const replaceHeading = page.getByRole("heading", { name: `Replace "${taken}"?` })
    await expect(replaceHeading).toBeVisible()
    // Cancel goes back to the dialog, not out of it.
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("heading", { name: "Save Project" })).toBeVisible()
    await expect(title(page)).toHaveText("• Untitled")

    // Typed in another case, it is the same project.
    await page.locator("#save-project-name").fill(taken.toUpperCase())
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(replaceHeading).toBeVisible()
    await page.getByRole("button", { name: "Replace" }).click()
    await expect(title(page)).toHaveText(taken)

    const versions = (await (await page.request.get(`/api/projects/${encodeURIComponent(taken)}/versions`)).json()).versions
    expect(versions).toHaveLength(2)
    const oldest = await (
      await page.request.get(`/api/projects/${encodeURIComponent(taken)}/versions/${versions[1].versionId}`)
    ).json()
    expect(oldest.project.settings.deviceName).toBe("Before")
    const newest = await (await page.request.get(`/api/projects/${encodeURIComponent(taken)}`)).json()
    expect(newest.project.screens.length).toBeGreaterThan(0)

    // From now on Ctrl+S saves into it without asking.
    await createScreen(page, "Edited", false)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(title(page)).toHaveText(taken)
    expect(await versionCount(page, taken)).toBe(3)

    await page.request.delete(`/api/projects/${encodeURIComponent(taken)}`)
  })

  test("Save As saves under another name and carries on there, leaving the first as it was", async ({ page }, testInfo) => {
    const first = uniqueName(testInfo, "first")
    const second = uniqueName(testInfo, "second")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, first)
    await createScreen(page, "Only in the second", false)

    await page.keyboard.press("ControlOrMeta+Shift+s")
    await expect(page.getByRole("heading", { name: "Save Project As" })).toBeVisible()
    await expect(page.locator("#save-project-name")).toHaveValue(first)
    await page.locator("#save-project-name").fill(second)
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(title(page)).toHaveText(second)

    const screenNames = async (name: string) =>
      (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project.screens.map(
        (s: { name: string }) => s.name,
      )
    expect(await screenNames(second)).toContain("Only in the second")
    expect(await screenNames(first)).not.toContain("Only in the second")
    expect(await versionCount(page, first)).toBe(1)

    // File > Save As... opens the same dialog, now on the second name.
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Save As... Ctrl+Shift+S", exact: true }).click()
    await expect(page.locator("#save-project-name")).toHaveValue(second)
    await page.getByRole("button", { name: "Cancel" }).click()

    await page.request.delete(`/api/projects/${encodeURIComponent(first)}`)
    await page.request.delete(`/api/projects/${encodeURIComponent(second)}`)
  })

  // Otherwise a Ctrl+S after File > Upload Project would write the uploaded
  // file into the project that was open before it.
  test("a project uploaded after a save has no name, and Ctrl+S asks again", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "before upload")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)

    await page.getByRole("button", { name: "File" }).click()
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("menuitem", { name: "Upload Project" }).click(),
    ])
    await chooser.setFiles(COMBINED_TEST_PROJECT)
    await expect(title(page)).toHaveText("• Untitled")

    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByRole("heading", { name: "Save Project" })).toBeVisible()
    expect(await versionCount(page, name)).toBe(1)

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("a save that fails says so and leaves the changes unsaved", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "fails")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    await createScreen(page, "Edited", false)

    await page.route("**/api/projects/*/versions", (route) => route.abort())
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByText("Could not save", { exact: true })).toBeVisible()
    await expect(title(page)).toHaveText(`• ${name}`)
    expect(await versionCount(page, name)).toBe(1)

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })
})
