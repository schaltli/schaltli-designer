import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"

// Covers the server-side autosave + "continue where you left off" recovery
// flow (project-editor.tsx, app/api/projects/[projectId]/autosave/route.ts,
// added 2026-08-02). Before this, the designer had zero persistence for the
// project itself (only the MQTT broker URL lived in localStorage) - closing
// the tab or crashing before an explicit Export lost the work, even if it
// had already been successfully deployed to a real device.

test.describe("Autosave recovery", () => {
  test("autosaves after loading a project, and offers to restore it on a fresh reload", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    // Autosave is debounced 3s after any project change (project-editor.tsx) -
    // wait for the real request rather than a fixed sleep, and capture the
    // projectId it fires under. This fixture predates the projectId field, so
    // one is generated fresh on every load (see project-editor.tsx's "exported
    // before 2026-08-02" upload-path comment) - can't be hardcoded.
    //
    // Waits for the POST's *response*, not just for it to be sent: the
    // readback below is a second, independent request, so observing only the
    // send let it race ahead of the server actually finishing the write.
    //
    // The window is generous rather than just-over-the-debounce too, because
    // the 3s clock starts when the project actually finishes loading -
    // whenever that happens to be, not when loadProject's fixed wait
    // returns. Under the suite's parallel workers both effects together made
    // this fail intermittently while always passing when run alone.
    const autosaveResponse = await page.waitForResponse(
      (res) => /\/api\/projects\/.+\/autosave$/.test(res.url()) && res.request().method() === "POST",
      { timeout: 20000 },
    )
    expect(autosaveResponse.ok()).toBe(true)
    const projectId = autosaveResponse.url().match(/\/api\/projects\/([^/]+)\/autosave$/)![1]

    // Actually persisted server-side, not just fired-and-forgotten.
    const saved = await page.request.get(`/api/projects/${projectId}/autosave`)
    expect(saved.ok()).toBe(true)
    expect((await saved.json()).name).toBe("Combined Test Project")

    // A fresh reload (same origin, same localStorage) should offer to
    // restore via the last-project-id pointer, not silently reopen the
    // empty device gate as if this were a brand new session.
    await page.goto("/")
    await expect(page.getByText("Continue where you left off?")).toBeVisible()
    await expect(page.getByText(/Combined Test Project/)).toBeVisible()

    await page.getByRole("button", { name: "Restore Project" }).click()
    await expect(page.getByText("Continue where you left off?")).not.toBeVisible()
    // The recovered project's own screens are back, not the blank default.
    await expect(page.getByText("tab-control-tests", { exact: true })).toBeVisible()
  })

  test("Start Fresh Instead dismisses the recovered autosave and falls back to the normal device gate", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    // Response, not request, and a window sized for parallel-worker drift -
    // same reasoning as the test above, which had the identical race: the
    // reload below can otherwise beat the server's write, leaving no
    // last-project pointer for the gate to offer.
    const autosaved = await page.waitForResponse(
      (res) => /\/api\/projects\/.+\/autosave$/.test(res.url()) && res.request().method() === "POST",
      { timeout: 20000 },
    )
    expect(autosaved.ok()).toBe(true)

    await page.goto("/")
    await expect(page.getByText("Continue where you left off?")).toBeVisible()

    await page.getByRole("button", { name: "Start Fresh Instead" }).click()
    await expect(page.getByText("Continue where you left off?")).not.toBeVisible()
    await expect(page.getByRole("button", { name: "Choose File..." })).toBeVisible()
  })
})
