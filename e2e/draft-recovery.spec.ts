import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, createScreen, loadProject, saveProjectAs } from "./helpers"

// The draft in the browser (docs/2026-09-23-explicit-save.md, "Draft in the
// browser"): unsaved work survives a reload, a closed or crashed tab, in the
// browser that made it - kept in IndexedDB, never on the server. A reload
// stands in for the crash here: the "leave site?" it raises is accepted
// (e2e/helpers.ts), which is exactly the work a draft has to save.

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e draft ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

const title = (page: Page) => page.getByTestId("project-title")
const screenNamed = (page: Page, name: string) => page.getByText(name, { exact: true }).first()

// The keys of this browser's drafts, straight from IndexedDB.
async function draftKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("schaltli", 1)
        open.onupgradeneeded = () => open.result.createObjectStore("drafts", { keyPath: "key" })
        open.onsuccess = () => {
          const request = open.result.transaction("drafts", "readonly").objectStore("drafts").getAllKeys()
          request.onsuccess = () => {
            resolve(request.result.map(String))
            open.result.close()
          }
        }
      }),
  )
}

test.describe("Draft in the browser", () => {
  test("an unsaved edit survives a reload, and comes back unsaved", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "reload")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    await createScreen(page, "Not saved yet", false)
    await expect.poll(() => draftKeys(page)).toHaveLength(1)

    await page.reload()
    await expect(title(page)).toHaveText(`• ${name}`, { timeout: 20_000 })
    await expect(screenNamed(page, "Not saved yet")).toBeVisible()
    // Not on the server: that still has only what was saved.
    const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
    expect(saved.screens.some((s: { name: string }) => s.name === "Not saved yet")).toBe(false)

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("the start page shows «Unsaved changes»; Open brings the draft; Discard changes drops it", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "start")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    await createScreen(page, "Not saved yet", false)
    await expect.poll(() => draftKeys(page)).toHaveLength(1)

    await page.goto("/")
    const entry = page.locator(`[data-project-name="${name}"]`)
    await expect(entry).toContainText("Unsaved changes")
    await entry.click()
    await expect(title(page)).toHaveText(`• ${name}`, { timeout: 20_000 })
    await expect(screenNamed(page, "Not saved yet")).toBeVisible()

    // Back on the start page, discarded from the menu: gone, and opening
    // gives the saved version.
    await page.goto("/")
    await entry.hover()
    await page.getByRole("button", { name: `Actions for ${name}` }).click()
    await page.getByRole("menuitem", { name: "Discard changes" }).click()
    await expect(entry).not.toContainText("Unsaved changes")
    expect(await draftKeys(page)).toEqual([])
    await entry.click()
    await expect(title(page)).toHaveText(name, { timeout: 20_000 })

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("saving, or undoing back to the saved state, removes the draft", async ({ page }, testInfo) => {
    const name = uniqueName(testInfo, "saved")
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    await expect.poll(() => draftKeys(page)).toEqual([])

    await createScreen(page, "Edited", false)
    await expect.poll(() => draftKeys(page)).toHaveLength(1)
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(() => draftKeys(page)).toEqual([])

    await createScreen(page, "Edited again", false)
    await expect.poll(() => draftKeys(page)).toHaveLength(1)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(title(page)).toHaveText(name)
    await expect.poll(() => draftKeys(page)).toEqual([])

    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("a project never saved comes back as «Untitled», and can be discarded", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "Never saved", false)
    await expect.poll(() => draftKeys(page)).toHaveLength(1)

    await page.goto("/")
    const untitled = page.locator("[data-draft-key]")
    await expect(untitled).toHaveCount(1)
    await expect(untitled).toContainText("Untitled")
    await expect(untitled).toContainText("MQTT ePaper Display (GDEY042T81)")
    await expect(untitled).toContainText("Unsaved changes")

    await untitled.click()
    await expect(title(page)).toHaveText("• Untitled", { timeout: 20_000 })
    await expect(screenNamed(page, "Never saved")).toBeVisible()

    await page.goto("/")
    await untitled.hover()
    await page.getByRole("button", { name: "Actions for Untitled" }).click()
    await page.getByRole("menuitem", { name: "Discard changes" }).click()
    await expect(untitled).toHaveCount(0)
    expect(await draftKeys(page)).toEqual([])
  })
})
