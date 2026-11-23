import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { instrumentFeature } from "../lib/instrument-export"
import { planDeploy } from "../lib/deploy-plan"

// A styled gauge and bar leave the designer for a device
// (docs/device-contract.md §2.15, tasks/instrument-styles-todo.md I7): the
// face as an S565 file named by its content, the needle, how a value turns
// or moves it, the spring.

function project() {
  const gauge = (id: string, x: number, props: Record<string, any> = {}) => ({
    id,
    type: "gauge",
    zIndex: 1,
    x,
    y: 20,
    width: 160,
    height: 160,
    properties: {
      topic: "t/level",
      calibrationPoints: [
        { value: 0, barSizePercent: 0 },
        { value: 100, barSizePercent: 100 },
      ],
      style: "fuel",
      zones: [{ from: 0, to: 12, kind: "danger" }],
      ...props,
    },
  })
  return {
    name: "instrument-export",
    screenWidth: 480,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [],
    screens: [
      {
        id: "s1",
        name: "One",
        backgroundColor: "#ffffff",
        objects: [
          gauge("g1", 20),
          // The same gauge again: one face file for both.
          gauge("g2", 200),
          gauge("g3", 20, { motion: "direct", caption: "FRESH WATER" }),
          {
            id: "b1",
            type: "bar",
            zIndex: 1,
            x: 20,
            y: 300,
            width: 300,
            height: 100,
            properties: {
              topic: "t/level",
              direction: "left-to-right",
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
              style: "fuel",
            },
          },
          // A flat gauge carries nothing new.
          {
            id: "flat",
            type: "gauge",
            zIndex: 1,
            x: 300,
            y: 300,
            width: 120,
            height: 120,
            properties: { topic: "t/level", calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }] },
          },
        ],
      },
    ],
  }
}

test("styled gauges and bars carry their face, needle, sweep or travel, and spring", async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project())
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
  const json = JSON.parse(await zip.file("project.json")!.async("string"))
  const objects: any[] = json.screens.find((s: any) => s.id === "s1").objects
  const byId = (id: string) => objects.find((o) => o.id === id)

  const g1 = byId("g1")
  expect(g1.instrument.style).toBe("fuel")
  expect(g1.instrument.sweep).toEqual({ from: -55, to: 55 })
  expect(g1.instrument.spring).toEqual({ frequency: 0.45, damping: 1 })
  // The pivot of a 160 px fuel gauge: (100, 150) of 200 units, in eighths.
  expect(g1.instrument.needle.pivot).toEqual({ x: 640, y: 960 })
  expect(g1.instrument.needle.layers.some((l: any) => l.motion === "rotate")).toBe(true)
  // The flat look's properties stay, for a device that reads none of this.
  expect(g1.properties.calibrationPoints).toBeTruthy()

  expect(byId("g2").instrument.face, "two identical gauges share one face").toBe(g1.instrument.face)
  const g3 = byId("g3")
  expect(g3.instrument.face, "a caption is another face").not.toBe(g1.instrument.face)
  expect(g3.instrument.spring, "motion direct: no spring").toBeUndefined()

  const b1 = byId("b1")
  // 300 px along, the scale from 10 % to 90 %: 240 px = 1920 eighths.
  expect(b1.instrument.travel).toEqual({ x: 1920, y: 0 })
  expect(b1.instrument.needle.layers.every((l: any) => l.motion === "translate")).toBe(true)
  expect(byId("flat").instrument).toBeUndefined()

  // The face file: S565, version 1, the gauge's size, pixels and a mask.
  const face = await zip.file(g1.instrument.face)!.async("uint8array")
  expect(Array.from(face.slice(0, 5))).toEqual([0x53, 0x35, 0x36, 0x35, 1])
  const w = face[5] | (face[6] << 8)
  const h = face[7] | (face[8] << 8)
  expect([w, h]).toEqual([160, 160])
  expect(face.length).toBe(9 + w * h * 2 + Math.ceil((w * h) / 8))
  const maskAt = 9 + w * h * 2
  const drawn = (x: number, y: number) => (face[maskAt + ((y * w + x) >> 3)] >> ((y * w + x) & 7)) & 1
  expect(drawn(80, 80), "the middle is face").toBe(1)
  expect(drawn(0, 0), "a round face's corner is not").toBe(0)
  // The middle of the fuel gauge's dark face: near black in RGB565.
  const c = face[9 + (80 * w + 80) * 2] | (face[10 + (80 * w + 80) * 2] << 8)
  expect((c >> 11) & 31).toBeLessThan(4)

  const bar = await zip.file(b1.instrument.face)!.async("uint8array")
  expect([bar[5] | (bar[6] << 8), bar[7] | (bar[8] << 8)]).toEqual([300, 100])
  // Three distinct faces: g1/g2, g3, b1.
  expect(Object.keys(zip.files).filter((n) => n.endsWith(".s565")).length).toBe(3)
})

test("a device without the feature is told which objects it cannot show", () => {
  const need = instrumentFeature(project())!
  expect(need).toEqual({ feature: "instrument-styles", label: "styled gauges and bars (4)" })
  const plan = planDeploy({
    device: { name: "Knob", platform: "firmware", online: true, firmwareBuild: "fw-2026.11.22.2" },
    needs: [],
    unsupportedFeatures: [need],
  })
  expect(plan.kind).toBe("blocked")
  expect((plan as any).reason).toContain("styled gauges and bars (4)")
  expect(instrumentFeature({ screens: [{ objects: [{ type: "gauge", properties: {} }] }] })).toBeNull()
})

test("the Android bundle carries the same instrument, its face as a PNG", async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate((p) => (window as any).__buildAndroidZipForTest(p), project())
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
  const json = JSON.parse(await zip.file("project.json")!.async("string"))
  const objects: any[] = json.screens.find((s: any) => s.id === "s1").objects
  const g1 = objects.find((o) => o.id === "g1")
  expect(g1.instrument.face).toMatch(/^assets\/faces\/[0-9a-f]{8}\.png$/)
  expect(g1.instrument.sweep).toEqual({ from: -55, to: 55 })
  expect(objects.find((o) => o.id === "g2").instrument.face).toBe(g1.instrument.face)
  expect(objects.find((o) => o.id === "b1").instrument.travel).toEqual({ x: 1920, y: 0 })
  expect(objects.find((o) => o.id === "flat").instrument).toBeUndefined()
  const png = await zip.file(g1.instrument.face)!.async("uint8array")
  // PNG signature, then IHDR's width and height (big-endian).
  expect(Array.from(png.slice(1, 4))).toEqual([0x50, 0x4e, 0x47])
  const be = (i: number) => (png[i] << 24) | (png[i + 1] << 16) | (png[i + 2] << 8) | png[i + 3]
  expect([be(16), be(20)]).toEqual([160, 160])
})
