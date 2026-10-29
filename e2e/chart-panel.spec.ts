import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { chooseDevice, createProject, devicePoint, getMainCanvas, loadProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"

// A chart's panel (tasks/charts-designer-plan.md D8, D9): every field lands
// in the project, and only what fits the kind and the mode is offered.

const DEVICE_ID = "e2e-chart-panel-4v3b"
const SCREEN = { width: 800, height: 480 }

export async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  await page.keyboard.press("Escape")
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

const chartOf = (project: any) => project.screens.flatMap((s: any) => s.objects).find((o: any) => o.type === "chart")

/** A new project with one chart on its screen, loaded and the chart selected. */
async function withChart(page: Page, properties: Record<string, unknown>, topics: unknown[] = []): Promise<void> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, DEVICE_ID, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)
  const saved = await downloadProjectJson(page)
  saved.topics = [...(saved.topics ?? []), ...topics]
  saved.screens.find((s: any) => !s.isMaster).objects.push({ id: "c1", type: "chart", x: 100, y: 100, width: 500, height: 300, zIndex: 50, properties })
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(saved))
  const file = path.join(os.tmpdir(), `chart-panel-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, file)
  const { box } = await getMainCanvas(page)
  const inside = devicePoint(box, 350, 250, SCREEN)
  await page.mouse.click(inside.x, inside.y)
  await expect(page.getByText("Chart c1")).toBeVisible()
}

const section = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^${title}`) })

test.describe("a chart's panel (D8)", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedWaveshare4v3bDdf(DEVICE_ID)), "schaltli-firmware not checked out alongside this repo")
  })

  test("the chart as a whole, its axis and a zone land in the project; per day offers Days", async ({ page }) => {
    await withChart(page, { mode: "time", scroll: false, legend: "top-right", left: { scale: "auto" }, series: [] })
    await expect(page.locator("#chart-days")).toHaveCount(0)
    await page.locator("#chart-mode").selectOption("per-day")
    await expect(page.locator("#chart-days")).toBeVisible()
    await page.locator("#chart-days").fill("5")
    await page.locator("#chart-legend").selectOption("bottom")
    await page.getByText("A swipe moves through time").click()
    await section(page, "Left axis").click()
    await page.locator("#left-scale").selectOption("fixed")
    await page.getByLabel("Min", { exact: true }).fill("0")
    await page.getByLabel("Max", { exact: true }).fill("100")
    await page.locator("#left-unit").fill("%")
    await section(page, "Zones").click()
    await page.getByRole("button", { name: "Add zone" }).click()
    await page.getByLabel("To", { exact: true }).fill("20")
    await page.locator("#left-unit").click()

    const p = chartOf(await downloadProjectJson(page)).properties
    expect(p).toMatchObject({ mode: "per-day", days: 5, legend: "bottom", scroll: true, left: { scale: "fixed", min: 0, max: 100, unit: "%" } })
    expect(p.zones).toEqual([{ axis: "left", to: 20, color: "track" }])
  })

  test("the right axis is offered once a series is on it", async ({ page }) => {
    const s = { id: "s1", source: { kind: "topic", topic: "van/x" }, name: "X", valueKind: "level", draw: "line", color: "accent" }
    await withChart(page, { mode: "time", scroll: false, legend: "none", left: { scale: "auto" }, series: [s] })
    await expect(section(page, "Right axis")).toHaveCount(0)
  })

  test("a chart with a series on the right shows its axis", async ({ page }) => {
    const s = { id: "s1", source: { kind: "topic", topic: "van/x" }, name: "X", valueKind: "level", draw: "line", color: "accent", axis: "right" }
    await withChart(page, { mode: "time", scroll: false, legend: "none", left: { scale: "auto" }, series: [s] })
    await expect(section(page, "Right axis")).toBeVisible()
  })
})
