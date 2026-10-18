import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { SCREEN_MENU_GONE, usesScreenMenu, withoutScreenMenu } from "../lib/screen-menu"

// The screen menu is gone (docs/2026-10-17-screen-graph.md decision 6, device
// contract §2.10; tasks/graph-firmware-plan.md decision 7): a project that
// binds «Show Screen Menu» loses the binding when it is opened, and the editor
// says so once.

const MENU = { type: "device-action", deviceActionId: "showScreenMenu" }

test.describe("the screen menu, taken out", () => {
  test("from a swipe, a software button and an energy node, and from the offered actions; anything else stays", () => {
    const project: any = {
      settings: { deviceActions: ["showScreenMenu", "displayOff"] },
      screens: [
        { id: "m", isMaster: true, buttonActions: { "swipe-up": MENU, "swipe-left": { type: "next-screen" } }, objects: [] },
        {
          id: "a",
          buttonActions: { "button-0": { type: "device-action", deviceActionId: "displayOff" } },
          objects: [
            { id: "b", type: "button", properties: { action: MENU } },
            { id: "g", type: "group", properties: {}, children: [{ id: "e", type: "energy-diagram", properties: { nodes: [{ id: "n", action: MENU }, { id: "k" }] } }] },
          ],
        },
      ],
    }
    expect(usesScreenMenu(project)).toBe(true)
    withoutScreenMenu(project)
    expect(usesScreenMenu(project)).toBe(false)
    expect(project.screens[0].buttonActions).toEqual({ "swipe-left": { type: "next-screen" } })
    expect(project.screens[1].buttonActions).toEqual({ "button-0": { type: "device-action", deviceActionId: "displayOff" } })
    expect(project.screens[1].objects[0].properties.action).toBeUndefined()
    expect(project.screens[1].objects[1].children[0].properties.nodes[0].action).toBeUndefined()
    expect(project.settings.deviceActions).toEqual(["displayOff"])
  })

  test("opening a project that binds it: the binding is gone, and the editor says so once", async ({ page }, testInfo) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const screen = project.screens.find((s: any) => s.id === "screen-1")
    screen.buttonActions = { ...screen.buttonActions, "button-10": MENU }
    zip.file("project.json", JSON.stringify(project))
    const out = testInfo.outputPath("with-menu.zip")
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))

    await loadProject(page, out)
    await expect(page.getByText(SCREEN_MENU_GONE)).toHaveCount(1)

    // Saved without it: what the editor holds no longer names it.
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
    const saved = await JSZip.loadAsync(fs.readFileSync(await download.path()))
    const json = await saved.file("project.json")!.async("string")
    expect(json).not.toContain("showScreenMenu")
  })

  test("a project without it opens without a word about it", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(page.getByText(SCREEN_MENU_GONE)).toHaveCount(0)
  })
})
