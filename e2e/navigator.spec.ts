import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// The navigator (docs/2026-10-08-navigator.md, tasks/navigator-todo.md):
// a bar along one edge with every screen, placed on a master. This file
// grows with the plan; it starts with «Hide screen» (Task 1).

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
// The fixture project says 240x240; the seeded round DDF makes it 360x360.
const FIXTURE_SCREEN = { width: 360, height: 360 }
const BUTTON = { x: 100, y: 100, width: 40, height: 20 }

const button = (id: string, action: Record<string, unknown>) => ({
  id,
  type: "button",
  ...BUTTON,
  zIndex: 1,
  properties: { text: "Go", iconAssetId: null, buttonStyle: "tonal", buttonColor: "#6750A4", action },
})

async function projectWith(screens: any[]): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.settings.supportsSoftwareButtons = true
  project.screens = screens
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `navigator-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function clickFixtureButton(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  const at = devicePoint(box, BUTTON.x + BUTTON.width / 2, BUTTON.y + BUTTON.height / 2, FIXTURE_SCREEN)
  await page.mouse.click(at.x, at.y)
}

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

test.describe("Hide screen", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("paging passes over a hidden screen; «Go to a screen» still opens it", async ({ page }) => {
    await loadProject(
      page,
      await projectWith([
        { id: "a", name: "Screen A", objects: [button("next-a", { type: "next-screen" })] },
        { id: "b", name: "Screen B", hidden: true, objects: [button("next-b", { type: "next-screen" })] },
        { id: "c", name: "Screen C", objects: [button("goto-c", { type: "goto-screen", targetScreenId: "b" })] },
      ]),
    )
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    await clickFixtureButton(page)
    await expect(page.getByRole("button", { name: "Screen C" })).toHaveClass(/bg-accent/)
    await clickFixtureButton(page)
    await expect(page.getByRole("button", { name: "Screen B" })).toHaveClass(/bg-accent/)
  })

  test("a project whose first screen is hidden opens on the next", async ({ page }) => {
    await loadProject(
      page,
      await projectWith([
        { id: "a", name: "Screen A", hidden: true, objects: [] },
        { id: "b", name: "Screen B", objects: [] },
      ]),
    )
    await expect(page.getByRole("button", { name: "Screen B" })).toHaveClass(/bg-accent/)
  })

  test("the checkbox is on a main screen only, and is saved", async ({ page }) => {
    await loadProject(
      page,
      await projectWith([
        { id: "m", name: "Master M", isMaster: true, objects: [] },
        { id: "a", name: "Screen A", masterScreenId: "m", objects: [] },
        { id: "p", name: "Popup P", screenType: "popup", showMaster: false, objects: [] },
      ]),
    )
    await page.getByRole("button", { name: "Screen A" }).click()
    const hide = page.getByLabel("Hide screen")
    await expect(hide).toBeVisible()
    await hide.check()
    await expect(page.getByRole("button", { name: "Screen A" }).getByText("Hidden")).toBeVisible()
    const saved = await downloadProjectJson(page)
    expect(saved.screens.find((s: any) => s.id === "a").hidden).toBe(true)

    await page.getByRole("button", { name: "Master M" }).click()
    await expect(page.getByLabel("Hide screen")).toHaveCount(0)
    await page.getByRole("button", { name: "Popup P" }).click()
    await expect(page.getByLabel("Hide screen")).toHaveCount(0)
  })
})
