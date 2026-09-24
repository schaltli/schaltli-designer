import { test, expect, type Page } from "@playwright/test"
import { WAVESHARE_DEVICE_ID, chooseDevice, createProject, waitForDeviceGate, waitForEditorReady } from "./helpers"

// The New Project dialog (docs/2026-09-23-explicit-save.md, "A project's
// life"): device type, then name, from the start page and from File > New
// Project. Create Project saves the project as its first version, so it is
// on the server under its name from the start.

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e new ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true })
const nameField = (page: Page) => page.locator("#new-project-name")

test.describe("New Project", () => {
  test("device first, then a name; Back keeps the device; Create opens the project saved", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "created")
    await page.goto("/")
    await waitForDeviceGate(page)
    await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible()
    await expect(next(page)).toBeDisabled()

    await chooseDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await next(page).click()
    await expect(nameField(page)).toBeVisible()
    await page.getByRole("button", { name: "Back", exact: true }).click()
    // Still chosen: Next lets you straight through again.
    await expect(next(page)).toBeEnabled()
    await next(page).click()

    await createProject(page, name)
    await waitForEditorReady(page)
    await expect(page.getByTestId("project-title")).toHaveText(name)

    const saved = await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()
    expect(saved.project.settings.deviceId).toBe(WAVESHARE_DEVICE_ID)
    expect(saved.project.name).toBe(name)
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("an invalid or taken name is refused inline, with no Replace", async ({ page }, testInfo) => {
    const taken = uniqueName(testInfo, "Taken")
    expect((await page.request.post("/api/projects", { data: { name: taken, project: { settings: {} } } })).ok()).toBe(true)

    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await next(page).click()
    const create = page.getByRole("button", { name: "Create Project", exact: true })

    await nameField(page).fill("Van Knob.")
    await expect(page.getByRole("alert")).toHaveText("A name cannot end with a dot.")
    await expect(create).toBeDisabled()

    await nameField(page).fill(taken.toLowerCase())
    await expect(page.getByRole("alert")).toHaveText(`"${taken}" already exists.`)
    await expect(create).toBeDisabled()

    await page.request.delete(`/api/projects/${encodeURIComponent(taken)}`)
  })

  test("Cancel creates nothing", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "cancelled")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await next(page).click()
    await nameField(page).fill(name)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()

    await expect(page.getByRole("heading", { name: "Welcome to Schaltli" })).toBeVisible()
    expect((await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).status()).toBe(404)
  })

  test("File > New Project opens the same dialog from the editor", async ({ page }, testInfo) => {
    const first = uniqueName(testInfo, "first")
    const second = uniqueName(testInfo, "second")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await createProject(page, first)
    await waitForEditorReady(page)

    // Saved, so nothing to ask before leaving it.
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "New Project" }).click()
    await expect(page.getByText("Choose the device this project is for.")).toBeVisible()
    await waitForDeviceGate(page)
    await chooseDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await createProject(page, second)
    await expect(page.getByTestId("project-title")).toHaveText(second)

    await page.request.delete(`/api/projects/${encodeURIComponent(first)}`)
    await page.request.delete(`/api/projects/${encodeURIComponent(second)}`)
  })
})
