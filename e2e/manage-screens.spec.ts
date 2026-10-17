import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { closeManageScreens, COMBINED_TEST_PROJECT, loadProject, manageScreensCard, openManageScreens } from "./helpers"

// «Manage Screens» (docs/2026-10-17-screen-graph.md decision 12;
// tasks/graph-surface-todo.md): the screens laid out as the device has them -
// the main row left to right, each page's screen above and below it, the
// hidden screens, popups and masters apart - and what the project settings'
// «Screens» tab did, for the screen selected.

// The combined project with A' above A (screen-3 above screen-1), B' above B
// (mqtt-black above mqtt-white) and one hidden screen.
async function combProject(testInfo: { outputPath: (name: string) => string }): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const screen = (id: string) => project.screens.find((s: any) => s.id === id)
  screen("screen-3").dock = { screenId: "screen-1", edge: "up" }
  screen("screen-mqtt-black").dock = { screenId: "screen-mqtt-white", edge: "up" }
  screen("screen-level-white").hidden = true
  zip.file("project.json", JSON.stringify(project))
  const out = testInfo.outputPath("comb.zip")
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

const view = (page: Page) => page.getByTestId("manage-screens")
const columns = (page: Page) => view(page).locator("[data-column]").evaluateAll((els) => els.map((e) => e.getAttribute("data-column")))
const columnCards = (page: Page, pageId: string) =>
  view(page)
    .locator(`[data-column="${pageId}"] > *`)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-screen-card") ?? e.getAttribute("data-empty-place") ?? "join"))

test.describe("Manage Screens", () => {
  test("lays the screens out as the device has them, and a double-click opens one", async ({ page }, testInfo) => {
    await loadProject(page, await combProject(testInfo))
    await openManageScreens(page)

    // The row in list order, the docked screens out of it.
    const row = await columns(page)
    expect(row.slice(0, 4)).toEqual(["screen-1", "screen-mqtt-white", "screen-level-black", "screen-line-tests"])
    expect(row).not.toContain("screen-3")
    expect(row).not.toContain("screen-mqtt-black")
    expect(row).not.toContain("screen-level-white")
    // A' above A, nothing below; B' above B.
    expect(await columnCards(page, "screen-1")).toEqual(["screen-3", "join", "screen-1", "join", "screen-1:down"])
    expect((await columnCards(page, "screen-mqtt-white"))[0]).toBe("screen-mqtt-black")
    // A' and B' stand in different columns: side by side, no neighbours.
    await expect(view(page).getByTestId("apart-hidden").locator("[data-screen-card]")).toHaveText(["level-indicator-tests-white-background"])
    await expect(view(page).getByTestId("apart-masters").locator("[data-screen-card]")).toHaveCount(1)

    await manageScreensCard(page, "mqtt-field-tests-white-background").dblclick()
    await expect(view(page)).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^mqtt-field-tests-white-background/ }).first()).toHaveClass(/bg-accent/)
  })

  test("the selected screen's settings: rename, move in the row, duplicate, delete", async ({ page }, testInfo) => {
    await loadProject(page, await combProject(testInfo))
    await openManageScreens(page)

    await manageScreensCard(page, "line-tests").click()
    const name = view(page).getByTestId("screen-name")
    await expect(name).toHaveValue("line-tests")
    await name.fill("Linien")
    await name.press("Tab")
    await expect(manageScreensCard(page, "Linien")).toHaveCount(1)

    const before = await columns(page)
    const at = before.indexOf("screen-line-tests")
    await view(page).getByRole("button", { name: "Move left" }).click()
    const after = await columns(page)
    expect(after.indexOf("screen-line-tests")).toBe(at - 1)
    expect(after[at]).toBe(before[at - 1])

    await view(page).getByRole("button", { name: "Duplicate" }).click()
    await expect(manageScreensCard(page, "Linien Copy")).toHaveCount(1)
    // The copy is selected; deleted, it is gone again.
    await expect(name).toHaveValue("Linien Copy")
    await view(page).getByRole("button", { name: "Delete" }).click()
    await expect(manageScreensCard(page, "Linien Copy")).toHaveCount(0)

    // A docked screen has no place in the row to move.
    await manageScreensCard(page, "label-tests-black-background").click()
    await expect(view(page).getByRole("button", { name: "Move left" })).toHaveCount(0)

    await closeManageScreens(page)
    await expect(page.getByRole("button", { name: "Manage Screens", exact: true })).toBeVisible()
  })
})
