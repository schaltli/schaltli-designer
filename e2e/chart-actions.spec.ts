import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { describeHardwareButtonAction } from "../components/project-editor"
import { chartsFeature, pinchFeature } from "../lib/chart"
import { deviceDescriptionToProjectFields, parseDeviceDescriptionFile } from "../lib/device-description"
import { planDeploy } from "../lib/deploy-plan"

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
