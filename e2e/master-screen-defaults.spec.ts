import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { chooseDevice, M5DIAL_DEVICE_ID, createScreen, waitForDeviceGate } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// Default master screen + deletion guards (2026-08-17): every project now
// starts with one master screen ("Master 1") and its one regular screen
// ("Screen 1") already linked to it (project-editor.tsx's
// createDefaultProject) - previously a fresh project had no master at all
// until the user created one by hand. Deleting a master screen is now
// guarded in both places that offer it (screens-panel.tsx and
// project-settings-dialog.tsx's Manage Screens dialog, kept in sync by
// hand): the last remaining master can't be deleted, and a master still
// referenced by another screen's masterScreenId can't be deleted either -
// both surfaced as an error toast rather than silently orphaning/losing the
// last master. The left panel also marks every master row with a "Master"
// chip, and screens can be drag-and-dropped to reorder within their group
// (Masters / regular Screens).

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

async function createProject(page: Page): Promise<void> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
  await page.getByRole("button", { name: "Create Project" }).click()
  await page.waitForTimeout(1500)
}

async function openManageScreens(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
}

// Left-panel screen row, matched by its visible name text - not by
// data-screen-id, since the test doesn't know ids ahead of time (they're
// nextId-derived).
const screenRow = (page: Page, name: string) => page.locator("[data-screen-id]").filter({ hasText: name })

test.describe("Default master screen and deletion guards", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("a new project starts with one master screen and one regular screen already linked to it", async ({
    page,
  }) => {
    await createProject(page)

    await expect(page.getByText("Masters", { exact: true })).toBeVisible()
    await expect(screenRow(page, "Master 1").getByText("Master", { exact: true })).toBeVisible()

    // Screen thumbnails no longer show a numbering badge (dropped
    // 2026-08-17) - the row for "Screen 1" must not carry a standalone "1".
    await expect(screenRow(page, "Screen 1").getByText("1", { exact: true })).toHaveCount(0)

    const project = await downloadProjectJson(page)
    expect(project.screens).toHaveLength(2)
    const master = project.screens.find((s: any) => s.isMaster)
    const normal = project.screens.find((s: any) => !s.isMaster)
    expect(master?.name).toBe("Master 1")
    expect(normal?.masterScreenId).toBe(master.id)
  })

  test("the last master screen can't be deleted", async ({ page }) => {
    await createProject(page)
    await openManageScreens(page)

    await page.locator('[data-screen-name="Master 1"]').getByTitle("Delete screen").click()
    // Radix toast renders the same text twice (the visible toast plus an
    // aria-live announcer span) - .first() picks the visible one.
    await expect(page.getByText("Every project needs at least one master screen.").first()).toBeVisible()

    // Close the Manage Screens dialog first - it's still open and modal,
    // blocking the File menu downloadProjectJson() needs. Escape doesn't
    // close this dialog (confirmed live), so use its own Close button.
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
    const project = await downloadProjectJson(page)
    expect(project.screens.some((s: any) => s.isMaster)).toBe(true)
  })

  test("a master screen that still has children can't be deleted, even if it isn't the last master", async ({
    page,
  }) => {
    await createProject(page)
    // A second, empty master exists too, so "last master" alone doesn't
    // explain the block below - it has to be the "still has children" guard.
    await createScreen(page, "E2E Empty Master", true)
    await openManageScreens(page)

    await page.locator('[data-screen-name="Master 1"]').getByTitle("Delete screen").click()
    // .first() - see the same-text-twice note in the previous test.
    await expect(
      page.getByText("It still has screens assigned to it - reassign or delete those first.").first(),
    ).toBeVisible()

    // Close the Manage Screens dialog first - it's still open and modal,
    // blocking the File menu downloadProjectJson() needs. Escape doesn't
    // close this dialog (confirmed live), so use its own Close button.
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
    const project = await downloadProjectJson(page)
    expect(project.screens.some((s: any) => s.name === "Master 1")).toBe(true)
  })

  test("regular screens can be reordered by dragging them in the left panel", async ({ page }) => {
    await createProject(page)
    await createScreen(page, "E2E Second Screen", false)

    // Both are regular screens; "Screen 1" was created first so it starts
    // ahead of "E2E Second Screen" - drag the second one to just above the
    // first and confirm the export reflects the new order.
    await screenRow(page, "E2E Second Screen").dragTo(screenRow(page, "Screen 1"), {
      targetPosition: { x: 10, y: 2 },
    })

    const project = await downloadProjectJson(page)
    const normalNames = project.screens.filter((s: any) => !s.isMaster).map((s: any) => s.name)
    expect(normalNames).toEqual(["E2E Second Screen", "Screen 1"])
  })
})
