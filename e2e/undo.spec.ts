import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, createScreen, devicePoint, getMainCanvas, loadProject, objectTreeRow } from "./helpers"

// Undo and redo (docs/2026-09-23-undo.md, issue #5). Driven through the real
// keys and the real delete paths - canvas Delete, the screens panel menu,
// the Topics tab - because history records whatever the editor commits, and
// only the real paths show whether a change lands as the one step the user
// made.
//
// COMBINED_TEST_PROJECT's first screen stacks text objects down its left
// edge: obj-4 at y 9-25, obj-5 at y 25-48.

const OBJ_4 = { x: 100, y: 15 }
const OBJ_5 = { x: 100, y: 35 }

async function deleteOnCanvas(page: Page, at: { x: number; y: number }): Promise<void> {
  const { box } = await getMainCanvas(page)
  const point = devicePoint(box, at.x, at.y)
  await page.mouse.click(point.x, point.y)
  await page.keyboard.press("Delete")
}

// The object tree lists objects in drawing order, so its data-object-id
// sequence is what "put back at the same position" is checked against.
async function treeOrder(page: Page): Promise<string[]> {
  return page.locator("[data-object-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-object-id")!))
}

async function screenOrder(page: Page): Promise<string[]> {
  return page.locator("[data-screen-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-screen-id")!))
}

test.describe("Undo and redo", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
  })

  test("a deleted object comes back with its id and drawing-order place, and goes again on redo", async ({ page }) => {
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    const before = await treeOrder(page)

    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    expect(await treeOrder(page)).toEqual(before)

    await page.keyboard.press("ControlOrMeta+y")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    // The other redo chord does the same.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
  })

  test("a deleted screen comes back in its place", async ({ page }) => {
    const before = await screenOrder(page)
    const row = page.locator('[data-screen-id="screen-box-black"]')
    await row.hover()
    await row.locator("button").last().click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(row).toHaveCount(1)
    expect(await screenOrder(page)).toEqual(before)
  })

  // The editor looks the current screen up with a non-null assertion; undoing
  // the screen it stands on must move it off first, not crash the page.
  test("undoing a new screen while it is shown moves to a screen that exists", async ({ page }) => {
    const before = await screenOrder(page)
    await createScreen(page, "undo-me", false)
    await expect(page.locator("[data-screen-id]")).toHaveCount(before.length + 1)

    await page.keyboard.press("ControlOrMeta+z")
    expect(await screenOrder(page)).toEqual(before)
    await expect(page.getByRole("button", { name: "File" })).toBeVisible()
    await getMainCanvas(page)
  })

  test("a deleted topic comes back", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Topics", exact: true }).click()
    const deletes = dialog.getByRole("button", { name: "Delete", exact: true })
    const count = await deletes.count()
    expect(count).toBeGreaterThan(0)

    await deletes.first().click()
    await expect(deletes).toHaveCount(count - 1)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(deletes).toHaveCount(count)
    await expect(dialog.getByText("Freshwater/Level").first()).toBeVisible()
  })

  test("a new edit after undo throws away what could have been redone", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)

    await deleteOnCanvas(page, OBJ_5)
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+y")
    // Nothing to redo: obj-4 stays, obj-5 stays deleted.
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(0)
  })

  test("Ctrl+Z inside a text field is the field's own, not the project's", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.locator("input:visible").first().focus()
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    // Out of the field, the same key undoes the delete.
    const { box } = await getMainCanvas(page)
    const empty = devicePoint(box, -20, -20)
    await page.mouse.click(empty.x, empty.y)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
  })

  test("undo does nothing in preview", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.getByRole("button", { name: "Preview" }).click()
    await expect(page.getByRole("button", { name: "Exit Preview" })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+z")
    await page.getByRole("button", { name: "Exit Preview" }).click()
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
  })
})
