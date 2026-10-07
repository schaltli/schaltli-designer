import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// An icon can be Fixed or Live (docs/2026-10-07-live-values.md, decision 9;
// tasks/live-values-todo.md, Task 9): Live, its one live value's results are
// icons, picked in the icon library, and the canvas draws the one that
// applies. The frost warning of mockup R1, at test size.

const svg = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`
const THERMO = svg("M10 2h4v14a4 4 0 1 1-4 0z")
const FLAKE = svg("M11 1h2v22h-2zM1 11h22v2H1z")
const ALERT = svg("M11 2h2v14h-2zM11 19h2v3h-2z")

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

async function upload(page: Page, name: string, data: string) {
  await page.getByTestId("icon-upload").setInputFiles({ name, mimeType: "image/svg+xml", buffer: Buffer.from(data) })
  await expect(page.getByTestId("icon-upload")).toHaveCount(0)
}

const editor = (page: Page) => page.getByTestId("live-value-editor")

async function drawThermometer(page: Page) {
  await page.getByRole("button", { name: "Icon", exact: true }).first().click()
  const { box } = await getMainCanvas(page)
  const at = devicePoint(box, 200, 150)
  await page.mouse.click(at.x, at.y)
  await upload(page, "thermometer.svg", THERMO)
  await expect(page.locator("h3").first()).toContainText("Icon")
}

test.describe("a live icon", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
  })

  test("Live keeps the fixed icon as Otherwise; a rule's icon comes from the library; This rule can show lists both", async ({ page }) => {
    await drawThermometer(page)
    await page.getByRole("radio", { name: "Live" }).click()
    await expect(editor(page)).toContainText("Live icon")
    await editor(page).getByLabel("Reads").selectOption("topic:test/fan-setpoint")
    await expect(editor(page).getByRole("button", { name: "Otherwise" })).toContainText("thermometer")

    await editor(page).getByRole("button", { name: "+ Add rule" }).click()
    await editor(page).getByLabel("Rule 1 comparison").selectOption("<")
    await editor(page).getByLabel("Rule 1 value").fill("50")
    await editor(page).getByRole("button", { name: "Rule 1 shows" }).click()
    await upload(page, "snowflake.svg", FLAKE)
    await expect(editor(page).getByRole("button", { name: "Rule 1 shows" })).toContainText("snowflake")
    await expect(page.getByTestId("live-icon-can-show").locator("span[title]")).toHaveCount(2)

    const project = await downloadProjectJson(page)
    const icon = project.screens.flatMap((s: any) => s.objects).find((o: any) => o.type === "icon")
    const asset = (name: string) => project.assets.find((a: any) => a.name.startsWith(name))?.id
    expect(icon.properties.liveIconId).toBe("lv1")
    expect(icon.properties.liveValues[0]).toMatchObject({
      source: { namespace: "topic", path: "test/fan-setpoint" },
      rules: [{ op: "<", operand: "50", result: { kind: "icon", icon: asset("snowflake") } }],
      otherwise: { kind: "icon", icon: asset("thermometer") },
    })
  })

  test("back to Fixed, the Otherwise icon is the icon", async ({ page }) => {
    await drawThermometer(page)
    await page.getByRole("radio", { name: "Live" }).click()
    await editor(page).getByRole("button", { name: "Otherwise" }).click()
    await upload(page, "alert.svg", ALERT)
    await page.getByRole("radio", { name: "Fixed" }).click()
    await expect(editor(page)).toHaveCount(0)
    const project = await downloadProjectJson(page)
    const icon = project.screens.flatMap((s: any) => s.objects).find((o: any) => o.type === "icon")
    expect(icon.properties.liveIconId).toBeUndefined()
    expect(icon.properties.assetId).toBe(project.assets.find((a: any) => a.name.startsWith("alert")).id)
  })
})

// The drawing itself, through test-render as every renderer draws: a live
// icon at a value looks exactly like the fixed icon its rule picks.
test.describe("a live icon is drawn", () => {
  const project = (properties: Record<string, unknown>) => ({
    name: "live-icon",
    screenWidth: 64,
    screenHeight: 64,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [
      { id: "a-thermo", name: "thermometer", type: "icon", data: THERMO },
      { id: "a-flake", name: "snowflake", type: "icon", data: FLAKE },
      { id: "a-alert", name: "alert", type: "icon", data: ALERT },
    ],
    topics: [{ id: "t", topic: "outside_temp", type: "numeric", examples: ["10"] }],
    screens: [{ id: "s1", name: "S", backgroundColor: "#ffffff", objects: [{ id: "i", type: "icon", x: 8, y: 8, width: 48, height: 48, zIndex: 1, properties: { iconColor: "#000000", ...properties } }] }],
  })
  const live = {
    assetId: "a-thermo",
    liveIconId: "lv1",
    liveValues: [
      {
        id: "lv1",
        source: { namespace: "topic", path: "outside_temp" },
        rules: [
          { op: "<", operand: "0", result: { kind: "icon", icon: "a-alert" } },
          { op: "<", operand: "3", result: { kind: "icon", icon: "a-flake" } },
        ],
        otherwise: { kind: "icon", icon: "a-thermo" },
      },
    ],
  }

  test("each value draws the icon its rule gives", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const render = (p: unknown, overrides: Record<string, string> = {}) =>
      page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: p, screenIndex: 0, topicOverrides: overrides })
    for (const [value, asset] of [["-2", "a-alert"], ["1.5", "a-flake"], ["10", "a-thermo"]] as const) {
      expect(await render(project(live), { outside_temp: value }), value).toBe(await render(project({ assetId: asset })))
    }
  })
})
