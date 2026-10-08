import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { combinedUsage, renameCombined } from "../lib/combined-topics"
import { exportedTopics } from "../lib/render-screen"
import { iconAsDrawn } from "../lib/object-text"
import { screenIconObject, withFixedIcon, withLiveIcon } from "../lib/screen-icon"

// The screen icon can be Fixed or Live (docs/2026-10-08-navigator.md
// decision 6, tasks/navigator-todo.md Task 2): the bulb lit while any light
// is on. Set on the screen; the navigator draws it (Task 5).

const bulb = (lit: boolean) => ({ id: lit ? "bulb-on" : "bulb-off", name: lit ? "bulb on" : "bulb off", type: "icon", data: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='8'/></svg>" })

const liveScreen = {
  id: "licht",
  name: "Licht",
  objects: [],
  iconAssetId: "bulb-off",
  iconLive: {
    id: "lv1",
    source: { namespace: "combined" as const, path: "anyLight" },
    rules: [{ op: "yes" as const, result: { kind: "icon" as const, icon: "bulb-on" } }],
    otherwise: { kind: "icon" as const, icon: "bulb-off" },
  },
}

test.describe("the screen icon, live (pure)", () => {
  test("drawn as the icon object it amounts to: the lit bulb on yes, the dark one otherwise", () => {
    const scope = (value: string | undefined) => ({ lookup: () => undefined, combined: () => value }) as any
    expect(iconAsDrawn(screenIconObject(liveScreen), scope("true")).properties.assetId).toBe("bulb-on")
    expect(iconAsDrawn(screenIconObject(liveScreen), scope("false")).properties.assetId).toBe("bulb-off")
    expect(screenIconObject({ id: "x", iconAssetId: "bulb-off" }).properties.liveIconId).toBeUndefined()
  })

  test("Live keeps the fixed icon as Otherwise; Fixed takes it back", () => {
    const live = withLiveIcon({ id: "s", iconAssetId: "bulb-off" }, { namespace: "topic", path: "van/light" })
    expect(live.iconLive?.otherwise).toEqual({ kind: "icon", icon: "bulb-off" })
    const fixed = withFixedIcon({ ...live, iconLive: { ...live.iconLive!, otherwise: { kind: "icon", icon: "bulb-on" } } })
    expect(fixed.iconLive).toBeUndefined()
    expect(fixed.iconAssetId).toBe("bulb-on")
  })

  test("a combined topic a screen icon reads is in use, and renamed in it", () => {
    const project = { combinedTopics: [{ id: "c1", name: "anyLight", mode: "any" as const, conditions: [] }], screens: [liveScreen] }
    expect(combinedUsage(project, "anyLight")).toEqual(["the screen icon of Licht"])
    const renamed = renameCombined(project, "anyLight", "lichtAn")
    expect(renamed.screens[0].iconLive.source.path).toBe("lichtAn")
    expect(project.screens[0].iconLive.source.path).toBe("anyLight")
  })

  test("its topic goes out with the project's", () => {
    const screen = { ...liveScreen, iconLive: { ...liveScreen.iconLive, source: { namespace: "topic" as const, path: "van/light#on" } } }
    expect(exportedTopics({ topics: [], screens: [screen as any] }).map((t) => t.topic)).toEqual(["van/light"])
  })
})

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

async function project(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const p = JSON.parse(await zip.file("project.json")!.async("string"))
  p.assets = [...(p.assets ?? []), bulb(false), bulb(true)]
  p.topics = [{ id: "t1", topic: "van/light", type: "text", examples: ["true"] }]
  p.screens = [{ id: "licht", name: "Licht", iconAssetId: "bulb-off", objects: [] }]
  zip.file("project.json", JSON.stringify(p))
  const out = path.join(os.tmpdir(), `screen-live-icon-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

test.describe("the screen icon, live (panel)", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("«Live» opens the rule editor, keeps the icon as Otherwise; «Fixed» takes it back", async ({ page }) => {
    await loadProject(page, await project())
    const mode = page.getByRole("radiogroup", { name: "Screen icon" })
    await mode.getByRole("radio", { name: "Live" }).click()
    await expect(page.getByText("Live screen icon")).toBeVisible()
    let saved = await downloadProjectJson(page)
    expect(saved.screens[0].iconLive.otherwise).toEqual({ kind: "icon", icon: "bulb-off" })
    expect(saved.screens[0].iconLive.source).toEqual({ namespace: "topic", path: "van/light" })

    await page.keyboard.press("Escape")
    await mode.getByRole("radio", { name: "Fixed" }).click()
    await expect(page.getByText("Live screen icon")).toHaveCount(0)
    saved = await downloadProjectJson(page)
    expect(saved.screens[0].iconLive).toBeUndefined()
    expect(saved.screens[0].iconAssetId).toBe("bulb-off")
  })
})
