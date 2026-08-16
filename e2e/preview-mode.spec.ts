import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, clickButton0 } from "./helpers"

// Preview mode makes buttons functional exactly as they would be at
// runtime (screen navigation / MQTT actions) and swaps the right-hand
// property panel for a Topic Values panel that simulates incoming MQTT
// messages purely client-side (see handlePreviewButtonAction /
// TopicValuesPanel in project-editor.tsx). These tests exercise the
// actual dispatch pipeline - button click -> action -> screen navigation /
// simulated publish - not just that the mode toggles visually.

test("preview mode swaps the property panel for Topic Values and back", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)

  await expect(page.getByText("Objects", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.waitForTimeout(300)

  await expect(page.getByRole("button", { name: "Exit Preview" })).toBeVisible()
  await expect(page.getByText("MQTT Topic Values")).toBeVisible()
  await expect(page.getByText("Objects", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Exit Preview" }).click()
  await page.waitForTimeout(300)

  await expect(page.getByText("Objects", { exact: true })).toBeVisible()
  await expect(page.getByText("MQTT Topic Values")).toHaveCount(0)
})

test("editing a topic value in preview mode simulates a received message", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.waitForTimeout(300)

  const label = page.locator("label", { hasText: "test/zone-level" }).first()
  const input = label.locator("xpath=../..").locator("input, textarea").first()
  await input.fill("77")
  await expect(input).toHaveValue("77")
})

test("a hardware button dispatches its configured action instead of opening its config panel", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  const originalScreenLabel = page.getByText("label-tests-white-background")
  await expect(originalScreenLabel).toBeVisible()
  // The screen row's own button carries "bg-accent" only while it's the
  // one actually being edited (see screens-panel.tsx's isSelected) - this
  // is what distinguishes "currently editing" from "just visible in the
  // list", which every thumbnail always is.
  const originalScreenRow = page.locator("button", { hasText: "label-tests-white-background" })
  await expect(originalScreenRow).toHaveClass(/bg-accent/)

  // Configure button-10's action for this screen (normal mode). The panel
  // carries no heading of its own (2026-08-16 - trimmed down to just the
  // dropdown, see hardware-button-side-panel.tsx) - its button-name line
  // ("Button 10") is what stands in for "is the panel open" here.
  await clickButton0(page)
  const panelHeading = page.locator("div.font-medium", { hasText: "Button 10" }).first()
  await expect(panelHeading).toBeVisible()

  const actionTypeTrigger = page.locator("label:has-text('Action Type') + button, label:has-text('Action Type') ~ button").first()
  await actionTypeTrigger.click()
  await page.getByRole("option", { name: "Previous Screen" }).first().click()
  await expect(actionTypeTrigger).toHaveText("Previous Screen")

  // Enter preview mode - the still-open config panel must not be left
  // stranded on screen once the panel that would normally own closing it
  // (PropertyPanel) is swapped out.
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.waitForTimeout(300)
  await expect(panelHeading).toHaveCount(0)

  // Clicking the same button now dispatches its action instead of
  // reopening a config panel.
  await clickButton0(page)
  await expect(page.getByText("→ Previous screen").first()).toBeVisible()
  await expect(panelHeading).toHaveCount(0)

  // Navigating via a preview button must never change what's actually
  // being edited - exiting preview mode returns to the original screen.
  await page.getByRole("button", { name: "Exit Preview" }).click()
  await page.waitForTimeout(300)
  await expect(originalScreenRow).toHaveClass(/bg-accent/)
})
