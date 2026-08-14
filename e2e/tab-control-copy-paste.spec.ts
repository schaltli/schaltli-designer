import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, getSelectedHeader, objectTreeRow, devicePoint } from "./helpers"

// Regression test for a bug reported 2026-07-26: copying a control from one
// tab-control panel, switching to a different panel, and right-clicking
// empty canvas space to paste silently failed - two compounding causes
// fixed together (commit "Fix right-click disrupting tab-control editing,
// and nested copy/paste"):
//
//   1. handleMouseDown didn't check e.button, so a right-click ran through
//      the same "empty space inside an open panel selects the container,
//      exits editing" logic a left-click uses - opening the context menu
//      inside a panel silently kicked you out of it first.
//   2. handleCopy/handlePaste predated nested objects: copy re-filtered
//      screen.objects (flat, top-level only) instead of the already-
//      correct recursive selectedObjects, so copying anything inside a
//      panel produced an empty clipboard (Paste looked permanently
//      disabled); paste always inserted at the screen's top level with no
//      way to target a panel at all.
//
// Uses the "tab-control-tests" screen's zone-level-control tab-control
// (panel-high containing high-label, panel-low containing low-label) from
// the combined test project - see test-projects/combined-test-project.zip.
test("copy a control from one tab-control panel and paste it into another", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByText("tab-control-tests", { exact: true }).click()
  await page.waitForTimeout(800)

  const { box } = await getMainCanvas(page)

  await test.step("open panel-high for editing and select its label", async () => {
    await objectTreeRow(page, "panel-high").click()
    await page.waitForTimeout(200)
    expect(await getSelectedHeader(page)).toContain("panel-high")

    await objectTreeRow(page, "high-label").click()
    await page.waitForTimeout(200)
    expect(await getSelectedHeader(page)).toContain("Label")
  })

  await test.step("copy, then switch to panel-low", async () => {
    await page.keyboard.press("Control+c")
    await page.waitForTimeout(200)

    await objectTreeRow(page, "panel-low").click()
    await page.waitForTimeout(200)
    expect(await getSelectedHeader(page)).toContain("panel-low")
  })

  await test.step("right-click on empty canvas space does not disrupt the open panel", async () => {
    const headerBeforeRightClick = await getSelectedHeader(page)

    // The screen's own center. Identical to the canvas-box center this used
    // to compute (the device block is centered in the box), but stated in
    // device pixels so it stays that point when the layout changes width -
    // see helpers.ts's devicePoint.
    const center = devicePoint(box, 200, 150)
    await page.mouse.click(center.x, center.y, { button: "right" })
    await page.waitForTimeout(300)

    expect(await getSelectedHeader(page)).toBe(headerBeforeRightClick)

    const pasteButton = page.getByRole("button", { name: "Paste", exact: true })
    await expect(pasteButton).toBeVisible()
    await expect(pasteButton).toBeEnabled()

    await pasteButton.click()
    await page.waitForTimeout(300)
  })

  await test.step("the pasted duplicate lands nested inside panel-low, not at the top level", async () => {
    const header = await getSelectedHeader(page)
    expect(header).toContain("Label")

    const pastedId = header.replace("Label", "").trim()
    const pastedRow = objectTreeRow(page, pastedId)
    await expect(pastedRow).toBeVisible()

    // panel-low's own children are drawn at tree depth 2 (tab-control ->
    // panel -> child), which the tree renders as paddingLeft: 36px (see
    // components/object-tree/object-tree-panel.tsx: 4 + depth * 16). A
    // top-level object would be depth 0 (paddingLeft: 4px) - this is what
    // actually distinguishes "landed in the panel" from "landed outside
    // the tab-control entirely", which the old bug did silently.
    await expect(pastedRow).toHaveAttribute("style", /padding-left:\s*36px/)
  })
})
