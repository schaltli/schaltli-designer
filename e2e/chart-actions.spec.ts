import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { describeHardwareButtonAction } from "../components/project-editor"
import { chartsFeature, pinchFeature } from "../lib/chart"
import { deviceDescriptionToProjectFields, parseDeviceDescriptionFile } from "../lib/device-description"
import { planDeploy } from "../lib/deploy-plan"
import { chooseDevice, createProject, loadProject, waitForDeviceGate, waitForEditorReady, getMainCanvas, devicePoint } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"
import os from "os"

// The screen's time range in actions and gestures (tasks/charts-actions-plan.md
// A2-A4; docs/2026-10-16-charts.md decision 15).

async function exportedJson(page: Page, p: any, kind: "device" | "android"): Promise<any> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const base64: string = await page.evaluate(
    ([proj, k]) => (k === "device" ? (window as any).__buildDeviceZipForTest(proj) : (window as any).__buildAndroidZipForTest(proj)),
    [p, kind] as const,
  )
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  const name = Object.keys(zip.files).find((f) => f.endsWith("project.json"))!
  return JSON.parse(await zip.file(name)!.async("string"))
}

const historyProject = () => ({
  name: "range-actions",
  screenWidth: 800,
  screenHeight: 480,
  settings: { colorDepth: "24bit" },
  fonts: [],
  assets: [],
  topics: [],
  hardwareButtons: [
    { id: "pinch-in", name: "Pinch In" },
    { id: "pinch-out", name: "Pinch Out" },
    { id: "button-0", name: "Button" },
  ],
  screens: [
    { id: "m", name: "Master", isMaster: true, objects: [] },
    {
      id: "h",
      name: "Wasser history",
      masterScreenId: "m",
      timeRange: "24h",
      objects: [],
      buttonActions: {
        "pinch-in": { type: "widen-range" },
        "pinch-out": { type: "narrow-range", rangeDirection: "later" },
        "button-0": { type: "move-range", rangeDirection: "later", targetScreenId: "stray" },
      },
    },
  ],
})

test.describe("range actions: model and export (A2)", () => {
  test("their summaries", () => {
    expect(describeHardwareButtonAction({ type: "narrow-range" }, [])).toBe("Narrow the time range")
    expect(describeHardwareButtonAction({ type: "widen-range" }, [])).toBe("Widen the time range")
    expect(describeHardwareButtonAction({ type: "move-range" }, [])).toBe("Move the time range earlier")
    expect(describeHardwareButtonAction({ type: "move-range", rangeDirection: "later" }, [])).toBe("Move the time range later")
    expect(describeHardwareButtonAction({ type: "set-range", range: "7d" }, [])).toBe("Set the time range to 7 days")
  })

  for (const kind of ["device", "android"] as const) {
    test(`the ${kind} export carries each with its own fields only`, async ({ page }) => {
      const screen = (await exportedJson(page, historyProject(), kind)).screens.find((s: any) => s.id === "h")
      expect(screen.buttonActions).toEqual({
        "pinch-in": { type: "widen-range" },
        "pinch-out": { type: "narrow-range" },
        "button-0": { type: "move-range", rangeDirection: "later" },
      })
    })
  }

  test("pinch gestures come from a description that declares pinch, and only then", async () => {
    const bytes = fs.readFileSync(path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip"))
    const idsWith = async (features: string[]) => {
      const zip = await JSZip.loadAsync(bytes)
      const manifest = JSON.parse(await zip.file("device.json")!.async("string"))
      manifest.supportedFeatures = features
      zip.file("device.json", JSON.stringify(manifest))
      const changed = await zip.generateAsync({ type: "nodebuffer" })
      return deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(changed), changed.toString("base64")).hardwareButtons.map((b) => b.id)
    }
    expect(await idsWith(["pinch"])).toEqual(expect.arrayContaining(["pinch-in", "pinch-out"]))
    expect(await idsWith([])).not.toContain("pinch-in")
  })

  test("Deploy asks charts of a range action and pinch of a pinch gesture", () => {
    const p = historyProject()
    expect(chartsFeature(p as any)).toEqual({ feature: "charts", label: "charts (Wasser history)" })
    expect(chartsFeature({ screens: [{ name: "S", objects: [{ type: "button", properties: { action: { type: "set-range", range: "1h" } } }] }] })?.label).toBe("charts (S)")
    const pinch = pinchFeature(p as any)
    expect(pinch).toEqual({ feature: "pinch", label: "pinch gestures (Wasser history)" })
    const board = { name: "4.3B", platform: "esp32" as const, online: true, firmwareBuild: "x", systemGeneration: "1.7" }
    expect(planDeploy({ device: board as any, needs: [], unsupportedFeatures: [pinch!] })).toMatchObject({ kind: "blocked" })
  })
})

// ---- the pickers (A3)


const PINCH_DEVICE = "e2e-chart-pinch-4v3b"

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  await page.keyboard.press("Escape")
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

/** A new project on a 4.3B that reads two fingers, its screen given `objects`, loaded. */
async function projectWith(page: Page, objects: any[]): Promise<void> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, PINCH_DEVICE, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)
  const saved = await downloadProjectJson(page)
  saved.screens.find((s: any) => !s.isMaster).objects.push(...objects)
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(saved))
  const file = path.join(os.tmpdir(), `chart-actions-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, file)
}

const chart = { id: "c1", type: "chart", x: 0, y: 40, width: 800, height: 440, zIndex: 1, properties: { mode: "time", scroll: true, legend: "none", left: { scale: "auto" }, series: [] } }
const button = { id: "b1", type: "button", x: 600, y: 0, width: 150, height: 36, zIndex: 2, properties: { text: "1 h", action: { type: "next-screen" } } }
const screenOf = (p: any) => p.screens.find((s: any) => !s.isMaster)

test.describe("range actions: the pickers (A3)", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(PINCH_DEVICE, (m) => {
        m.supportedFeatures = [...(m.supportedFeatures ?? []), "pinch"]
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  test("a pinch among the screen's gestures, and a Button, each set to a range action", async ({ page }) => {
    await projectWith(page, [chart, button])
    await page.getByText("Screen 1", { exact: true }).last().click()
    await expect(page.getByRole("button", { name: /^Gestures/ })).toBeVisible()
    await page.locator("#pinch-in-actionType").selectOption("widen-range")
    await page.locator("#pinch-out-actionType").selectOption("move-range")
    await page.locator("#pinch-out-rangeDirection").selectOption("later")

    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, 675, 18, { width: 800, height: 480 })
    await page.mouse.click(at.x, at.y)
    await page.locator("#actionType").selectOption("set-range")
    await page.locator("#button-range").selectOption("1h")

    const s = screenOf(await downloadProjectJson(page))
    expect(s.buttonActions["pinch-in"]).toEqual({ type: "widen-range" })
    expect(s.buttonActions["pinch-out"]).toEqual({ type: "move-range", rangeDirection: "later" })
    expect(s.objects.find((o: any) => o.id === "b1").properties.action).toEqual({ type: "set-range", range: "1h" })
  })

  test("without a chart in the project no range action is offered", async ({ page }) => {
    await projectWith(page, [button])
    await page.getByText("Screen 1", { exact: true }).last().click()
    await expect(page.locator("#swipe-up-actionType option[value='set-range']")).toHaveCount(0)
  })
})
