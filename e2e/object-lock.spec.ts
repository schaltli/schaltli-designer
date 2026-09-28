import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// An object locked in the object tree is left alone by the canvas: a click
// goes through it, a drag does not move it, and it is selected only from the
// tree. Made for a screen-sized icon at the bottom, which since the
// background image went (#16) is how a screen gets a picture behind it - and
// which would otherwise catch every click on the canvas (#24).

const OBJ_4 = { x: 100, y: 15 }

test.describe("locking an object in the tree", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
  })

  test("a locked object is neither selected nor moved on the canvas, and stays selectable in the tree", async ({
    page,
  }) => {
    const row = objectTreeRow(page, "obj-4")
    const lock = page.locator('[data-lock-toggle="obj-4"]')
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, OBJ_4.x, OBJ_4.y)

    await row.hover()
    await lock.click()
    await expect(lock).toHaveAttribute("aria-pressed", "true")

    // A click on it on the canvas does not select it.
    await page.mouse.click(at.x, at.y)
    await expect(row).not.toHaveClass(/bg-primary/)

    // Nor does a drag starting on it move it.
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 40, at.y + 30, { steps: 5 })
    await page.mouse.up()

    // Selected from the tree, it shows its properties - and it is where it was.
    await row.click()
    await expect(row).toHaveClass(/bg-primary/)
    await openFrameSection(page)
    await expect(page.locator("#x")).toHaveValue("11")

    // Unlocked, the canvas takes it again.
    await lock.click()
    await expect(lock).toHaveAttribute("aria-pressed", "false")
    await page.locator("[data-screen-root]").click()
    await expect(row).not.toHaveClass(/bg-primary/)
    await page.mouse.click(at.x, at.y)
    await expect(row).toHaveClass(/bg-primary/)
  })
})
