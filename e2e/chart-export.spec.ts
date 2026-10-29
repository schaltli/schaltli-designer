import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"

// The chart and the screen's time range leave for a device
// (docs/2026-10-16-charts.md «Data model», tasks/charts-model-plan.md M2, M3):
// the device zip and the Android bundle carry them alike.

function project(screens: any[]): any {
  return {
    name: "chart-export",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [],
    screens: [{ id: "m", name: "Master", isMaster: true, objects: [] }, ...screens],
  }
}

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

const screenOf = (json: any, id: string) => json.screens.find((s: any) => s.id === id)

for (const kind of ["device", "android"] as const) {
  test.describe(`charts in the ${kind} export`, () => {
    test("a screen's time range goes out where it is set, and nowhere else", async ({ page }) => {
      const json = await exportedJson(
        page,
        project([
          { id: "a", name: "Wasser", masterScreenId: "m", objects: [] },
          { id: "b", name: "Wasser · Verlauf", masterScreenId: "m", objects: [], timeRange: "6h" },
        ]),
        kind,
      )
      expect(screenOf(json, "a")).not.toHaveProperty("timeRange")
      expect(screenOf(json, "b").timeRange).toBe("6h")
    })
  })
}
