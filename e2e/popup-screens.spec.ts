import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, createScreen } from "./helpers"
import { withScreenType, isPopup, isMainScreen } from "../lib/popup"

// Popup screens (docs/2026-10-06-popup-screens.md, tasks/popup-screens-todo.md):
// a screen whose type is «Popup» is out of navigation and opened over the
// current screen. It keeps a master for its theme only, «Show master» off.

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

async function addPopupScreen(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Add screen" }).click()
  await page.getByRole("menuitem", { name: "Add Popup Screen", exact: true }).click()
  await page.locator("#screenName").fill(name)
  await page.getByRole("button", { name: "Create Screen" }).click()
  await page.waitForTimeout(300)
}

test.describe("Popup screens: the type (pure)", () => {
  test("a popup turns «Show master» off and drops its swipe actions, keeping the others", () => {
    const screen: {
      id: string
      masterScreenId?: string
      showMaster?: boolean
      screenType?: "popup"
      isMaster?: boolean
      buttonActions?: Record<string, unknown>
    } = {
      id: "s",
      masterScreenId: "m",
      showMaster: true,
      buttonActions: {
        "swipe-left": { type: "next-screen" },
        "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
        "button-1": { type: "send-mqtt", mqttTopic: "t", mqttMessage: "1" },
      },
    }
    const popup = withScreenType(screen, "popup")
    expect(popup.screenType).toBe("popup")
    expect(popup.showMaster).toBe(false)
    expect(popup.masterScreenId).toBe("m")
    expect(Object.keys(popup.buttonActions ?? {})).toEqual(["button-1"])
    expect(isPopup(popup)).toBe(true)
    expect(isMainScreen(popup)).toBe(false)

    const back = withScreenType(popup, "main")
    expect("screenType" in back).toBe(false)
    expect(back.showMaster).toBe(false)
    expect(isMainScreen(back)).toBe(true)
    expect(isMainScreen({ isMaster: true })).toBe(false)
  })
})

test.describe("Popup screens: the type in the designer", () => {
  test("«Add Popup Screen» makes a popup in its own group, with a master for its theme and no «Show master»", async ({
    page,
  }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await addPopupScreen(page, "E2E Popup")

    const group = page.getByTestId("popup-screens")
    await expect(group.getByText("Popups", { exact: true })).toBeVisible()
    await expect(group.getByText("E2E Popup", { exact: true })).toBeVisible()
    await expect(group.getByText("Popup", { exact: true })).toBeVisible()

    // The screen's own properties: its type, a master select, no «Show master».
    await expect(page.getByLabel("Screen type")).toHaveValue("popup")
    await expect(page.getByText("Show master", { exact: true })).toHaveCount(0)

    const project = await downloadProjectJson(page)
    const popup = project.screens.find((s: any) => s.name === "E2E Popup")
    expect(popup.screenType).toBe("popup")
    expect(popup.showMaster).toBe(false)
    expect(project.screens.some((s: any) => s.isMaster && s.id === popup.masterScreenId)).toBe(true)
    // Every other screen is written as before: no screenType on them.
    expect(project.screens.filter((s: any) => "screenType" in s).map((s: any) => s.name)).toEqual(["E2E Popup"])
  })

  test("a main screen turned into a popup and back", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await createScreen(page, "E2E Turned", false)

    await page.getByLabel("Screen type").selectOption("popup")
    await expect(page.getByTestId("popup-screens").getByText("E2E Turned", { exact: true })).toBeVisible()
    let project = await downloadProjectJson(page)
    let screen = project.screens.find((s: any) => s.name === "E2E Turned")
    expect(screen.screenType).toBe("popup")
    expect(screen.showMaster).toBe(false)

    await page.getByLabel("Screen type").selectOption("main")
    await expect(page.getByTestId("popup-screens")).toHaveCount(0)
    await expect(page.getByText("Show master", { exact: true })).toBeVisible()
    project = await downloadProjectJson(page)
    screen = project.screens.find((s: any) => s.name === "E2E Turned")
    expect("screenType" in screen).toBe(false)
    expect(screen.showMaster).toBe(false)
  })
})
