import { test, expect, type Page } from "@playwright/test"
import { chooseDevice, createProject, devicePoint, getMainCanvas, ROUND_FIXTURE_DEVICE_ID, ROUND_FIXTURE_SCREEN, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// A Text or Button just drawn has its text field focused with the whole text
// selected, so typing replaces it and Enter finishes it (the user,
// 2026-10-07: draw, type, Enter - no click into the panel first).
// property-panel.tsx FOCUS_ON_CREATE; Enter in text-field.tsx and
// placeholder-text-field.tsx.

async function draw(page: Page, tool: string): Promise<void> {
  await page.getByRole("button", { name: tool, exact: true }).first().click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, 80, 140, ROUND_FIXTURE_SCREEN)
  const to = devicePoint(box, 280, 190, ROUND_FIXTURE_SCREEN)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

const selection = (page: Page) =>
  page.locator("#text").evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd, input.value.length])

test.describe("focus on create", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
  })

  for (const tool of ["Text", "Button"]) {
    test(`a ${tool} just drawn: its text focused and selected, typed over, Enter finishes it`, async ({ page }) => {
      if (tool === "Button") {
        // The Button tool shows once the project allows software buttons.
        await page.getByRole("button", { name: "Settings" }).click()
        await page.locator("#software-buttons").check()
        await page.keyboard.press("Escape")
      }
      await draw(page, tool)

      const field = page.locator("#text")
      await expect(field).toBeFocused()
      const [start, end, length] = await selection(page)
      expect(length).toBeGreaterThan(0)
      expect([start, end]).toEqual([0, length])

      await page.keyboard.type("Wassertank")
      await page.keyboard.press("Enter")
      await expect(field).not.toBeFocused()
      await expect(field).toHaveValue("Wassertank")
      // Still the object just drawn, its text as typed.
      await expect(page.locator("h3").first()).toContainText(tool)
    })
  }

  test("Esc lets go of the field and keeps the text; a second Esc clears the selection", async ({ page }) => {
    await draw(page, "Text")
    const field = page.locator("#text")
    await expect(field).toBeFocused()
    await page.keyboard.type("Grauwasser")
    await page.keyboard.press("Escape")
    await expect(field).not.toBeFocused()
    await expect(field).toHaveValue("Grauwasser")
    // The keyboard is the canvas's again.
    expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-canvas-keys"))).toBe(true)
    await expect(page.locator("h3").first()).toContainText("Text")
    await page.keyboard.press("Escape")
    await expect(page.locator("#text")).toHaveCount(0)
  })

  test("after Enter, Delete removes the object just written", async ({ page }) => {
    await draw(page, "Text")
    await page.keyboard.type("weg")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Delete")
    await expect(page.locator("#text")).toHaveCount(0)
    const tree = page.getByText("weg", { exact: true })
    await expect(tree).toHaveCount(0)
  })

  test("a Box just drawn leaves the focus where it was", async ({ page }) => {
    await draw(page, "Box")
    await expect(page.locator("h3").first()).toContainText("Box")
    await expect(page.locator("#text")).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT")
  })
})
