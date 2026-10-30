import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { chooseDevice, createProject, loadProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"
import { withHistoryBelow } from "../lib/chart-from-controls"

// «Add history below» (tasks/charts-designer-plan.md D11, decision 10;
// docs/2026-10-16-charts.md decision 12): a page's history as a screen
// docked below it, made from its controls; and the screen's «Time range».

const DEVICE_ID = "e2e-chart-history-4v3b"

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  await page.keyboard.press("Escape")
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

const bar = (id: string, topic: string, y: number) => ({
  id,
  type: "bar",
  x: 20,
  y,
  width: 300,
  height: 40,
  zIndex: 1,
  properties: { topic, calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }] },
})

async function pageWith(page: Page, objects: any[]): Promise<void> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, DEVICE_ID, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)
  const saved = await downloadProjectJson(page)
  saved.screens.find((s: any) => !s.isMaster).objects.push(...objects)
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(saved))
  const file = path.join(os.tmpdir(), `chart-history-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, file)
  // The screen's own panel: the object tree's root.
  await page.getByText("Screen 1", { exact: true }).last().click()
}

test.describe("a page's history (D11)", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedWaveshare4v3bDdf(DEVICE_ID)), "schaltli-firmware not checked out alongside this repo")
  })

  test("two Bars and a Switch: a screen below with one chart of three series; its Time range lands in the project", async ({ page }) => {
    await pageWith(page, [
      bar("b1", "van/fresh", 20),
      bar("b2", "van/grey", 80),
      { id: "sw", type: "switch", x: 20, y: 140, width: 80, height: 40, zIndex: 1, properties: { topic: "van/pump", states: [{ readValue: "off" }, { readValue: "on", showAsOn: true }] } },
    ])
    await page.getByRole("button", { name: "Add history below" }).click()
    const project = await downloadProjectJson(page)
    const history = project.screens.find((s: any) => s.name === "Screen 1 history")
    expect(history, "the history screen").toBeTruthy()
    const pageId = project.screens.find((s: any) => s.name === "Screen 1").id
    expect(history.dock).toEqual({ screenId: pageId, edge: "down" })
    expect(history.timeRange).toBe("24h")
    expect(history.objects).toHaveLength(1)
    const chart = history.objects[0]
    expect([chart.type, chart.x, chart.y, chart.width]).toEqual(["chart", 0, 40, 800])
    expect(chart.properties.series.map((s: any) => [s.source.topic, s.valueKind])).toEqual([
      ["van/fresh", "level"],
      ["van/grey", "level"],
      ["van/pump", "state"],
    ])
    expect(chart.properties.left).toMatchObject({ scale: "fixed", min: 0, max: 100 })

    // The history is open now: its Time range.
    await page.locator(`#screen-time-range-${history.id}`).selectOption("6h")
    expect((await downloadProjectJson(page)).screens.find((s: any) => s.id === history.id).timeRange).toBe("6h")
  })

  test("a page of relays offers no history", async ({ page }) => {
    await pageWith(page, [{ id: "r", type: "switch", x: 20, y: 20, width: 80, height: 40, zIndex: 1, properties: { writeTopic: "relay/1", states: [] } }])
    await expect(page.locator('[data-testid="screen-name"]')).toBeVisible()
    await expect(page.getByRole("button", { name: "Add history below" })).toHaveCount(0)
  })

  test("a master with a navigator: the charts beside the strip, never under it", () => {
    const left = { id: "nav", type: "navigator", x: 0, y: 0, width: 120, height: 480 }
    const top = { id: "nav", type: "navigator", x: 0, y: 0, width: 800, height: 64 }
    const of = (nav: typeof left) =>
      withHistoryBelow(
        { nextId: 5, screenWidth: 800, screenHeight: 480, screens: [{ id: "m", name: "M", isMaster: true, objects: [nav] }, { id: "a", name: "Wasser", masterScreenId: "m", objects: [bar("b", "van/fresh", 0)] }] },
        "a",
      )!.project.screens[2].objects[0]
    expect(of(left)).toMatchObject({ x: 120, y: 40, width: 680, height: 440 })
    expect(of(top)).toMatchObject({ x: 0, y: 64, width: 800, height: 416 })
  })

  // 2026-10-30, the user: the date «sollte grösser sein».
  test("its charts' days' names in a larger font than their labels", () => {
    const fonts = [10, 14, 18, 22, 30].map((size) => ({ id: `f${size}`, size }))
    const { project } = withHistoryBelow(
      { nextId: 5, screenWidth: 800, screenHeight: 480, fonts, screens: [{ id: "a", name: "Wasser", masterScreenId: "m", objects: [bar("b", "van/fresh", 0)] }] },
      "a",
    )!
    expect(project.screens[1].objects[0].properties).toMatchObject({ fontId: "f14", dateFontId: "f22" })
  })

  test("a page that has a history below it is not offered a second", () => {
    const project = {
      nextId: 5,
      screenWidth: 800,
      screenHeight: 480,
      screens: [{ id: "a", name: "Wasser", masterScreenId: "m", objects: [bar("b", "van/fresh", 0)] }],
    }
    const once = withHistoryBelow(project, "a")!
    expect(once.project.screens[1]).toMatchObject({ name: "Wasser history", dock: { screenId: "a", edge: "down" } })
    expect(withHistoryBelow(once.project, "a")).toBeNull()
  })

  test("its gestures and keys from the start: pinch in widens, out narrows; the knob's ring moves (A5)", () => {
    const page = { id: "a", name: "Wasser", masterScreenId: "m", objects: [bar("b", "van/fresh", 0)] }
    const base = { nextId: 1, screenWidth: 480, screenHeight: 480 }
    const touch = withHistoryBelow({ ...base, hardwareButtons: [{ id: "swipe-up", name: "Swipe Up" }, { id: "pinch-in", name: "Pinch In" }, { id: "pinch-out", name: "Pinch Out" }], screens: [page] }, "a")!
    expect((touch.project.screens[1] as any).buttonActions).toEqual({ "pinch-in": { type: "widen-range" }, "pinch-out": { type: "narrow-range" } })
    const knob = withHistoryBelow({ ...base, hardwareButtons: [{ id: "button-0", name: "Rotate Right" }, { id: "button-1", name: "Rotate Left" }], screens: [page] }, "a")!
    expect((knob.project.screens[1] as any).buttonActions).toEqual({
      "button-0": { type: "move-range", rangeDirection: "later" },
      "button-1": { type: "move-range", rangeDirection: "earlier" },
    })
    const plain = withHistoryBelow({ ...base, hardwareButtons: [{ id: "swipe-up", name: "Swipe Up" }], screens: [page] }, "a")!
    expect(plain.project.screens[1]).not.toHaveProperty("buttonActions")
  })
})
