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

// The spec's example, the water page's history, with one thing the spec
// says is never stored (a sum on a level).
const waterChart = {
  id: "obj-42",
  type: "chart",
  x: 0,
  y: 40,
  width: 800,
  height: 440,
  zIndex: 1,
  properties: {
    mode: "time",
    scroll: true,
    legend: "top-right",
    left: { scale: "fixed", min: 0, max: 100, unit: "%" },
    zones: [{ axis: "left", to: 15, color: "track" }],
    series: [
      { id: "s1", source: { kind: "topic", topic: "schaltli/state/tank/1/level" }, name: "Frischwasser", valueKind: "level", unit: "%", draw: "steps", color: "accent", annotations: ["current", "sum"] },
      { id: "s2", source: { kind: "topic", topic: "schaltli/state/tank/2/level" }, name: "Grauwasser", valueKind: "level", unit: "%", draw: "steps", color: "#336699", annotations: ["current"] },
    ],
  },
}
const HEX = /^#[0-9a-f]{6}$/i

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

    test("a chart goes out as stored, normalized, its colours light and dark", async ({ page }) => {
      const json = await exportedJson(page, project([{ id: "a", name: "Wasser · Verlauf", masterScreenId: "m", objects: [waterChart], timeRange: "24h" }]), kind)
      const chart = screenOf(json, "a").objects.find((o: any) => o.id === "obj-42")
      expect(chart.type).toBe("chart")
      expect([chart.x, chart.y, chart.width, chart.height]).toEqual([0, 40, 800, 440])
      const p = chart.properties
      expect(p.mode).toBe("time")
      expect(p.scroll).toBe(true)
      expect(p.legend).toBe("top-right")
      expect(p.left).toEqual({ scale: "fixed", min: 0, max: 100, unit: "%" })
      const [fresh, grey] = p.series
      expect(fresh.source).toEqual({ kind: "topic", topic: "schaltli/state/tank/1/level" })
      expect([fresh.name, fresh.valueKind, fresh.unit, fresh.draw]).toEqual(["Frischwasser", "level", "%", "steps"])
      // A sum is power's alone: never stored, never sent.
      expect(fresh.annotations).toEqual(["current"])
      // A role resolved, light and dark apart; a hex stays itself.
      expect(fresh.color).toMatch(HEX)
      expect(fresh.colorDark).toMatch(HEX)
      expect(fresh.colorDark).not.toBe(fresh.color)
      expect(grey.color).toBe("#336699")
      expect(p.zones[0]).toMatchObject({ axis: "left", to: 15 })
      expect(p.zones[0].color).toMatch(HEX)
      // Axis labels, quiet text and grid from the theme.
      for (const key of ["textColor", "mutedColor", "lineColor"]) {
        expect(p[key]).toMatch(HEX)
        expect(p[`${key}Dark`]).toMatch(HEX)
      }
    })
  })
}
