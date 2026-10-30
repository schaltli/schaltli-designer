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

  // 2026-10-30: the days' names above the plot, larger, in a font of their own.
  test("over time a Date font for the days' names above the plot; per day none", async ({ page }) => {
    await withChart(page, { mode: "time", scroll: false, legend: "top-right", left: { scale: "auto" }, series: [] })
    const fonts = page.locator("#fontId")
    await expect(fonts).toHaveCount(2)
    await fonts.nth(1).click()
    const options = page.getByRole("option")
    const last = (await options.count()) - 2 // the last font, above «Manage fonts»
    const name = (await options.nth(last).innerText()).trim()
    await options.nth(last).click()
    await expect(fonts.nth(1)).toHaveText(name)
    const p = chartOf(await downloadProjectJson(page)).properties
    expect(typeof p.dateFontId).toBe("string")
    expect(p.dateFontId).not.toBe(p.fontId)
    await page.locator("#chart-mode").selectOption("per-day")
    await expect(fonts).toHaveCount(1)
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

test.describe("a chart's series in its panel (D9)", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedWaveshare4v3bDdf(DEVICE_ID)), "schaltli-firmware not checked out alongside this repo")
  })

  const topics = [
    { id: "t1", topic: "van/heater", type: "text", examples: ["on", "off"] },
    { id: "t2", topic: "van/tank", type: "json", examples: ['{"level": 80}'], subtopics: [{ id: "st1", path: "level", type: "numeric" }] },
  ]

  test("added from a topic its kind is guessed; switched to power, it offers what power has", async ({ page }) => {
    await withChart(page, { mode: "time", scroll: false, legend: "top-right", left: { scale: "auto" }, series: [] }, topics)
    await page.locator("#series-add").selectOption("van/heater")
    let s = chartOf(await downloadProjectJson(page)).properties.series[0]
    expect(s).toMatchObject({ id: "s1", source: { kind: "topic", topic: "van/heater" }, name: "heater", valueKind: "state", draw: "band", annotations: ["runtime"] })
    await expect(page.locator("#series-0-on")).toBeVisible()
    await expect(page.locator("#series-0-factor")).toHaveCount(0)

    await page.locator("#series-0-kind").selectOption("power")
    await expect(page.locator("#series-0-on")).toHaveCount(0)
    await expect(page.locator("#series-0-draw option")).toHaveText(["Line", "Area", "Steps", "Stacked"])
    await expect(page.getByText("Energy in the window")).toBeVisible()
    s = chartOf(await downloadProjectJson(page)).properties.series[0]
    expect(s).toMatchObject({ valueKind: "power", draw: "area", annotations: ["sum"] })
    expect(s.onMeans).toBeUndefined()
  })

  test("a JSON field is a series of its own; reordered, the series' order follows", async ({ page }) => {
    await withChart(page, { mode: "time", scroll: false, legend: "top-right", left: { scale: "auto" }, series: [] }, topics)
    await page.locator("#series-add").selectOption("van/tank#level")
    await page.locator("#series-add").selectOption("van/heater")
    let series = chartOf(await downloadProjectJson(page)).properties.series
    expect(series.map((x: any) => [x.name, x.valueKind, x.color])).toEqual([
      ["level", "level", "accent"],
      ["heater", "state", "energySun"],
    ])
    // Both closed, so both rows are in view.
    const openRows = page.locator('[data-list-row] [aria-expanded="true"]')
    while ((await openRows.count()) > 0) await openRows.first().click()
    const grip = page.locator('[data-list-row="1"]').getByRole("button", { name: "Move heater", exact: true })
    const target = page.locator('[data-list-row="0"]').getByRole("button", { name: "Move level", exact: true })
    const from = (await grip.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 })
    await page.mouse.up()
    series = chartOf(await downloadProjectJson(page)).properties.series
    expect(series.map((x: any) => x.name)).toEqual(["heater", "level"])
  })
})
