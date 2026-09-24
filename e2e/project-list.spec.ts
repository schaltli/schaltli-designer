import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, createScreen, loadProject, saveProjectAs } from "./helpers"

// The Projects panel and its list (docs/2026-09-23-explicit-save.md,
// "Project list", "Projects panel"): open, rename in place, delete - flat,
// like an explorer without folders.

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e list ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

const list = (page: Page) => page.getByRole("list", { name: "Projects" })
const entry = (page: Page, name: string) => page.locator(`[data-project-name="${name}"]`)
const title = (page: Page) => page.getByTestId("project-title")

// A second project on the server, made from the one open in the page - as if
// saved in another browser.
async function copyOnServer(page: Page, from: string, to: string, screenName: string) {
  const source = (await (await page.request.get(`/api/projects/${encodeURIComponent(from)}`)).json()).project
  const project = { ...source, screens: source.screens.map((s: { name: string }, i: number) => (i === 0 ? { ...s, name: screenName } : s)) }
  expect((await page.request.post("/api/projects", { data: { name: to, project } })).ok()).toBe(true)
}

async function openMenu(page: Page, name: string) {
  await entry(page, name).hover()
  await page.getByRole("button", { name: `Actions for ${name}` }).click()
}

test.describe("Projects panel", () => {
  test("lists what is on the server; clicking one opens its newest version, highlighted", async ({ page }, testInfo) => {
    const mine = uniqueName(testInfo, "mine")
    const other = uniqueName(testInfo, "other")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, mine)
    await copyOnServer(page, mine, other, "From elsewhere")

    // Saved elsewhere meanwhile: shows up once the list reloads (a save here).
    await page.keyboard.press("ControlOrMeta+s")
    await expect(entry(page, other)).toBeVisible()
    await expect(entry(page, mine)).toHaveAttribute("aria-current", "true")

    await entry(page, other).click()
    await expect(title(page)).toHaveText(other)
    await expect(entry(page, other)).toHaveAttribute("aria-current", "true")
    await expect(page.getByText("From elsewhere", { exact: true }).first()).toBeVisible()

    for (const name of [mine, other]) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("with unsaved changes, opening another asks first", async ({ page }, testInfo) => {
    const mine = uniqueName(testInfo, "mine")
    const other = uniqueName(testInfo, "other")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, mine)
    await copyOnServer(page, mine, other, "Other")
    await page.keyboard.press("ControlOrMeta+s")
    await createScreen(page, "Unsaved", false)

    await entry(page, other).click()
    await expect(page.getByRole("heading", { name: `Save changes to "${mine}"?` })).toBeVisible()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(title(page)).toHaveText(`• ${mine}`)

    await entry(page, other).click()
    await page.getByRole("button", { name: "Don't Save" }).click()
    await expect(title(page)).toHaveText(other)

    for (const name of [mine, other]) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("Rename, from the menu or with F2, renames in place and refuses a taken or invalid name", async ({ page }, testInfo) => {
    const mine = uniqueName(testInfo, "mine")
    const other = uniqueName(testInfo, "other")
    const renamed = uniqueName(testInfo, "renamed")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, mine)
    await copyOnServer(page, mine, other, "Other")
    await page.keyboard.press("ControlOrMeta+s")
    await createScreen(page, "Unsaved", false)

    await openMenu(page, mine)
    await page.getByRole("menuitem", { name: "Rename" }).click()
    const field = page.getByRole("textbox", { name: "New name" })
    await expect(field).toBeFocused()

    await field.fill("Van Knob.")
    await expect(list(page).getByRole("alert")).toHaveText("A name cannot end with a dot.")
    await field.fill(other.toUpperCase())
    await expect(list(page).getByRole("alert")).toHaveText(`"${other.toUpperCase()}" already exists.`)
    await field.press("Enter")
    await expect(field).toBeVisible()

    await field.fill(renamed)
    await field.press("Enter")
    await expect(entry(page, renamed)).toBeVisible()
    await expect(entry(page, mine)).toHaveCount(0)
    // The open project took the new name; its unsaved change stayed unsaved.
    await expect(title(page)).toHaveText(`• ${renamed}`)
    expect((await page.request.get(`/api/projects/${encodeURIComponent(mine)}`)).status()).toBe(404)

    // F2 on a focused entry, Escape to leave it as it was.
    await entry(page, other).focus()
    await page.keyboard.press("F2")
    await expect(field).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(entry(page, other)).toBeVisible()

    for (const name of [renamed, other]) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("Delete removes a project at once; the Delete key does not; the open one cannot be deleted", async ({ page }, testInfo) => {
    const mine = uniqueName(testInfo, "mine")
    const other = uniqueName(testInfo, "other")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, mine)
    await copyOnServer(page, mine, other, "Other")
    await page.keyboard.press("ControlOrMeta+s")
    await expect(entry(page, other)).toBeVisible()

    // The Delete key on a focused entry: nothing.
    await entry(page, other).focus()
    await page.keyboard.press("Delete")
    await page.waitForTimeout(500)
    await expect(entry(page, other)).toBeVisible()
    expect((await page.request.get(`/api/projects/${encodeURIComponent(other)}`)).ok()).toBe(true)

    // The open project: an error, nothing deleted.
    await openMenu(page, mine)
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(page.getByText(`"${mine}" is open. Open another project to delete it.`, { exact: true })).toBeVisible()
    expect((await page.request.get(`/api/projects/${encodeURIComponent(mine)}`)).ok()).toBe(true)

    // Another one: gone at once, no dialog.
    await openMenu(page, other)
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(entry(page, other)).toHaveCount(0)
    expect((await page.request.get(`/api/projects/${encodeURIComponent(other)}`)).status()).toBe(404)

    await page.request.delete(`/api/projects/${encodeURIComponent(mine)}`)
  })

  test("collapses to a strip, and stays collapsed after a reload", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Hide projects" }).click()
    await expect(page.getByRole("complementary", { name: "Projects panel" })).toHaveCount(0)

    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(page.getByRole("button", { name: "Show projects" })).toBeVisible()
    await page.getByRole("button", { name: "Show projects" }).click()
    await expect(page.getByRole("complementary", { name: "Projects panel" })).toBeVisible()
  })
})
