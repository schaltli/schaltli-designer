import { test, expect, type Locator, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { closeManageScreens, COMBINED_TEST_PROJECT, loadProject, manageScreensCard, openManageScreens, saveProjectAs } from "./helpers"

// «Manage Screens» (docs/2026-10-17-screen-graph.md decision 12;
// tasks/graph-surface-todo.md): the screens laid out as the device has them -
// the main row left to right, each page's screen above and below it, the
// hidden screens, popups and masters apart - and what the project settings'
// «Screens» tab did, for the screen selected.

// The combined project with A' above A (screen-3 above screen-1), B' above B
// (mqtt-black above mqtt-white) and one hidden screen.
async function combProject(testInfo: { outputPath: (name: string) => string }, more?: (screen: (id: string) => any, project: any) => void): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const screen = (id: string) => project.screens.find((s: any) => s.id === id)
  screen("screen-3").dock = { screenId: "screen-1", edge: "up" }
  screen("screen-mqtt-black").dock = { screenId: "screen-mqtt-white", edge: "up" }
  screen("screen-level-white").hidden = true
  more?.(screen, project)
  zip.file("project.json", JSON.stringify(project))
  const out = testInfo.outputPath("comb.zip")
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

const view = (page: Page) => page.getByTestId("manage-screens")
const columns = (page: Page) => view(page).locator("[data-column]").evaluateAll((els) => els.map((e) => e.getAttribute("data-column")))
const columnCards = (page: Page, pageId: string) =>
  view(page)
    .locator(`[data-column="${pageId}"] > :is([data-screen-card], [data-empty-place], [data-join])`)
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
    // The join from A' to A runs from thumbnail to thumbnail, under the name
    // between them.
    const frame = async (id: string) => (await view(page).locator(`[data-screen-card="${id}"] > div`).first().boundingBox())!
    const joinLine = (await view(page).locator('[data-column="screen-1"] [data-join-line]').boundingBox())!
    const above = await frame("screen-3")
    expect(Math.abs(joinLine.y - (above.y + above.height))).toBeLessThan(1)
    expect(Math.abs(joinLine.y + joinLine.height - (await frame("screen-1")).y)).toBeLessThan(1)
    // A' and B' stand in different columns: side by side, no neighbours.
    await expect(view(page).getByTestId("apart-hidden").locator("[data-screen-card]")).toHaveText(["level-indicator-tests-white-background"])
    await expect(view(page).getByTestId("apart-masters").locator("[data-screen-card]")).toHaveCount(1)

    await manageScreensCard(page, "mqtt-field-tests-white-background").dblclick()
    await expect(view(page)).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^mqtt-field-tests-white-background/ }).first()).toHaveClass(/bg-accent/)
  })

  test("covers the screens list, not the projects, and greys out the tools; the keys for objects rest", async ({ page }, testInfo) => {
    await loadProject(page, await combProject(testInfo))
    await openManageScreens(page)

    await expect(page.getByRole("complementary", { name: "Projects panel" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Manage Screens", exact: true })).toHaveCount(0)
    await expect(page.getByTestId("tools-ribbon")).toHaveAttribute("aria-disabled", "true")

    // Select all and Delete would empty the screen being edited, out of sight.
    const count = view(page).getByText(/^\d+ objects?$/)
    const before = await count.textContent()
    expect(before).not.toBe("0 objects")
    await view(page).locator("h2").click()
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Delete")
    await expect(count).toHaveText(before!)

    await closeManageScreens(page)
    await expect(page.getByRole("button", { name: "Manage Screens", exact: true })).toHaveCount(1)
    await expect(page.getByTestId("tools-ribbon")).not.toHaveAttribute("aria-disabled")
  })

  test("another project opened from the projects list shows its screens in the view", async ({ page }, testInfo) => {
    const tag = `${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
    const mine = `e2e manage mine ${tag}`
    const other = `e2e manage other ${tag}`
    await loadProject(page, await combProject(testInfo))
    await saveProjectAs(page, mine)
    // Saved elsewhere, its first screen renamed; the list shows it after a save.
    const source = (await (await page.request.get(`/api/projects/${encodeURIComponent(mine)}`)).json()).project
    const project = { ...source, screens: source.screens.map((s: { name: string }, i: number) => (i === 0 ? { ...s, name: "From elsewhere" } : s)) }
    expect((await page.request.post("/api/projects", { data: { name: other, project } })).ok()).toBe(true)
    await page.keyboard.press("ControlOrMeta+s")

    await openManageScreens(page)
    await expect(manageScreensCard(page, "From elsewhere")).toHaveCount(0)
    await page.locator(`[data-project-name="${other}"]`).click()
    await expect(page.getByTestId("project-title")).toHaveText(other)
    await expect(view(page)).toBeVisible()
    await expect(manageScreensCard(page, "From elsewhere")).toBeVisible()

    for (const name of [mine, other]) await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
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

// Dragging (tasks/graph-surface-plan.md S3): into the row, onto a free place,
// onto «Hidden»; a drop where the screen may not go says why, and Ctrl+Z
// takes one drag back.
test.describe("Manage Screens: dragging", () => {
  const byId = (page: Page, id: string) => view(page).locator(`[data-screen-card="${id}"]`)
  // A drop on a target out of sight: dragTo scrolls the view after the
  // drag has begun, which loses it, so the events go in by hand - the same
  // ones the browser sends, through the same handlers.
  const dragFar = async (page: Page, sourceId: string, target: Locator) => {
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
    await byId(page, sourceId).dispatchEvent("dragstart", { dataTransfer })
    await target.scrollIntoViewIfNeeded()
    await target.dispatchEvent("dragover", { dataTransfer })
    await target.dispatchEvent("drop", { dataTransfer })
    await byId(page, sourceId).dispatchEvent("dragend", { dataTransfer }).catch(() => {})
  }
  const hiddenCards = (page: Page) =>
    view(page).getByTestId("apart-hidden").locator("[data-screen-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-screen-card")))

  test("B before A, a hidden screen below B, A' into the row; Ctrl+Z takes one drag back", async ({ page }, testInfo) => {
    await loadProject(page, await combProject(testInfo))
    await openManageScreens(page)

    // B before A: B takes B' along.
    await byId(page, "screen-mqtt-white").dragTo(view(page).locator('[data-row-gap="screen-1"]'))
    expect((await columns(page)).slice(0, 2)).toEqual(["screen-mqtt-white", "screen-1"])
    expect((await columnCards(page, "screen-mqtt-white"))[0]).toBe("screen-mqtt-black")

    // The hidden screen onto the free place below B: shown, docked there.
    await byId(page, "screen-level-white").dragTo(view(page).locator('[data-empty-place="screen-mqtt-white:down"]'))
    expect((await columnCards(page, "screen-mqtt-white")).at(-1)).toBe("screen-level-white")
    expect(await hiddenCards(page)).toEqual([])

    // A' into the row, at its end.
    await dragFar(page, "screen-3", view(page).locator('[data-row-gap="end"]'))
    const row = await columns(page)
    expect(row.at(-1)).toBe("screen-3")
    expect(await columnCards(page, "screen-1")).toEqual(["screen-1:up", "join", "screen-1", "join", "screen-1:down"])

    // Ctrl+Z takes back the last drag only.
    await page.keyboard.press("Control+z")
    expect(await columns(page)).not.toContain("screen-3")
    expect((await columnCards(page, "screen-1"))[0]).toBe("screen-3")
    expect((await columnCards(page, "screen-mqtt-white")).at(-1)).toBe("screen-level-white")
  })

  test("B onto «Hidden» hides B' too; a drop where a screen may not go is refused", async ({ page }, testInfo) => {
    await loadProject(page, await combProject(testInfo))
    await openManageScreens(page)

    await dragFar(page, "screen-mqtt-white", view(page).getByTestId("apart-hidden"))
    expect(await columns(page)).not.toContain("screen-mqtt-white")
    expect(await hiddenCards(page)).toEqual(
      expect.arrayContaining(["screen-mqtt-white", "screen-mqtt-black", "screen-level-white"]),
    )
    await expect(page.getByText("A screen is hidden now", { exact: true })).toBeVisible()

    // A has A' above it: it stays in the main row. While it is dragged the
    // place below another page is not lit, a row gap is.
    await byId(page, "screen-1").hover()
    await page.mouse.down()
    await view(page).locator('[data-empty-place="screen-level-black:down"]').hover()
    await view(page).locator('[data-empty-place="screen-level-black:down"]').hover({ position: { x: 10, y: 10 } })
    await expect(view(page).locator('[data-empty-place="screen-level-black:down"]')).not.toHaveAttribute("data-lit")
    await expect(view(page).locator('[data-row-gap="end"]')).toHaveAttribute("data-lit", "true")
    // No hint where it may not go; over a row gap that gap's line alone, as
    // a new column of a table on the canvas.
    await expect(view(page).locator("[data-hint]")).toHaveCount(0)
    const gap = view(page).locator('[data-row-gap="screen-line-tests"]')
    await gap.hover()
    await gap.hover({ position: { x: 12, y: 250 } })
    await expect(view(page).locator("[data-hint]")).toHaveAttribute("data-hint", "row:screen-line-tests")
    await view(page).locator('[data-empty-place="screen-level-black:down"]').hover()
    await page.mouse.up()
    await expect(page.getByText(/stays in the main row/).first()).toBeVisible()
    expect(await columnCards(page, "screen-level-black")).toEqual(["screen-level-black:up", "join", "screen-level-black", "join", "screen-level-black:down"])
    expect((await columnCards(page, "screen-1"))[0]).toBe("screen-3")
  })
})

// The screens list (tasks/graph-surface-plan.md S4): the main row in its
// order, each page followed by the screens above and below it, indented and
// marked ↑ and ↓; then the hidden screens.
test.describe("the screens list and the screen graph", () => {
  const listed = (page: Page) =>
    page.locator("[data-screen-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-screen-id")))
  const row = (page: Page, id: string) => page.locator(`[data-screen-id="${id}"]`)
  // The list scrolls, and dragTo loses a drag that scrolls: the events go in
  // by hand, as in «Manage Screens: dragging».
  const dragInList = async (page: Page, sourceId: string, targetId: string) => {
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
    await row(page, sourceId).dispatchEvent("dragstart", { dataTransfer })
    await row(page, targetId).dispatchEvent("dragover", { dataTransfer, clientY: 0 })
    await row(page, targetId).dispatchEvent("drop", { dataTransfer })
    await row(page, sourceId).dispatchEvent("dragend", { dataTransfer })
  }

  test("a page's screens above and below stand indented under it, go along with it, and take a drop for it", async ({ page }, testInfo) => {
    await loadProject(
      page,
      await combProject(testInfo, (screen) => {
        screen("screen-box-black").dock = { screenId: "screen-1", edge: "down" }
      }),
    )

    const order = await listed(page)
    const at = (id: string) => order.indexOf(id)
    expect(order.slice(at("screen-1"), at("screen-1") + 5)).toEqual([
      "screen-1",
      "screen-3",
      "screen-box-black",
      "screen-mqtt-white",
      "screen-mqtt-black",
    ])
    // The hidden screen after the row.
    expect(at("screen-level-white")).toBeGreaterThan(at("screen-box-white"))
    await expect(row(page, "screen-3")).toHaveAttribute("data-dock", "up")
    await expect(row(page, "screen-box-black")).toHaveAttribute("data-dock", "down")
    await expect(row(page, "screen-3").getByTitle('Above "label-tests-white-background"')).toHaveCount(1)
    await expect(row(page, "screen-3")).toHaveAttribute("draggable", "false")
    await expect(row(page, "screen-1")).toHaveAttribute("draggable", "true")

    // B before A: B' comes along.
    await dragInList(page, "screen-mqtt-white", "screen-1")
    const moved = await listed(page)
    expect(moved.slice(moved.indexOf("screen-mqtt-white"), moved.indexOf("screen-mqtt-white") + 5)).toEqual([
      "screen-mqtt-white",
      "screen-mqtt-black",
      "screen-1",
      "screen-3",
      "screen-box-black",
    ])

    // A drop on A' goes after A and what hangs from it.
    await dragInList(page, "screen-level-black", "screen-3")
    const after = await listed(page)
    expect(after.slice(after.indexOf("screen-1"), after.indexOf("screen-1") + 4)).toEqual([
      "screen-1",
      "screen-3",
      "screen-box-black",
      "screen-level-black",
    ])

    // A hidden screen dropped on a page goes into the row, shown.
    await dragInList(page, "screen-level-white", "screen-1")
    const shown = await listed(page)
    expect(shown[shown.indexOf("screen-1") - 1]).toBe("screen-level-white")
    await expect(row(page, "screen-level-white").getByText("Hidden", { exact: true })).toHaveCount(0)
  })
})

// The warning (tasks/graph-surface-plan.md S5, docs/2026-10-17-screen-graph.md
// decision 9): a screen's own swipe that takes a neighbour's direction cuts
// the neighbour off; the swipe settings say so, and the view draws the join
// amber.
test.describe("a neighbour cut off by a swipe of the screen's own", () => {
  test("swipe up set to an MQTT message on a page with a screen below: a note, and the join marked", async ({ page }, testInfo) => {
    await loadProject(
      page,
      await combProject(testInfo, (screen, project) => {
        // Swipes are set on a touch device only.
        project.settings.supportsSoftwareButtons = true
        screen("screen-box-black").dock = { screenId: "screen-1", edge: "down" }
        screen("screen-1").buttonActions = { ...screen("screen-1").buttonActions, "swipe-up": { type: "send-mqtt", mqttTopic: "t", mqttMessage: "m" } }
      }),
    )
    const note = /^Swipe up on "label-tests-white-background" does not lead to ".+" below it: its own action comes first\.$/
    await expect(page.locator('[data-cut-off="swipe-up"]')).toHaveText(note)

    await openManageScreens(page)
    const cut = view(page).locator("[data-cut-off]")
    await expect(cut).toHaveCount(1)
    await expect(cut).toHaveAttribute("title", note)
    // The join above screen-1 to screen-3 is not marked: swipe down still leads there.
    const top = async (l: Locator) => (await l.boundingBox())!.y
    expect(await top(cut)).toBeGreaterThan(await top(view(page).locator('[data-screen-card="screen-1"]')))
    await closeManageScreens(page)

    // Back to «Go to the screen beside»: the note goes, and the join is grey.
    await page.locator("#swipe-up-actionType").selectOption("goto-neighbour")
    await expect(page.locator("[data-cut-off]")).toHaveCount(0)
    await openManageScreens(page)
    await expect(view(page).locator("[data-cut-off]")).toHaveCount(0)
  })
})
