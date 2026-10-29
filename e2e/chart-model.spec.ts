import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { chooseDevice, createProject, devicePoint, getMainCanvas, loadProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"
import { defaultSeries, normalizeChart, type ChartSeries } from "../lib/chart"
import { migrateObjects, OBJECT_TYPES, objectTypeLabel } from "../lib/object-types"

// The chart's model (docs/2026-10-16-charts.md «Data model»,
// tasks/charts-model-plan.md M1, M4, M6): its defaults, what is never
// stored, and what the recorder is asked to record.

const series = (s: Partial<ChartSeries>): ChartSeries => ({
  id: "s1",
  source: { kind: "topic", topic: "van/x" },
  name: "X",
  valueKind: "level",
  draw: "line",
  color: "accent",
  ...s,
})

// The spec's example: the water page's history.
const water = {
  mode: "time",
  scroll: true,
  legend: "top-right",
  left: { scale: "fixed", min: 0, max: 100, unit: "%" },
  zones: [{ axis: "left", to: 15, color: "track" }],
  series: [
    series({ id: "s1", source: { kind: "topic", topic: "schaltli/state/tank/1/level" }, name: "Frischwasser", unit: "%", draw: "steps", annotations: ["current"] }),
    series({ id: "s2", source: { kind: "topic", topic: "schaltli/state/tank/2/level" }, name: "Grauwasser", unit: "%", draw: "steps", color: "textMuted", annotations: ["current"] }),
  ],
}

test.describe("Chart model", () => {
  test("chart is an object type, labelled Chart", () => {
    expect(OBJECT_TYPES).toContain("chart")
    expect(objectTypeLabel("chart")).toBe("Chart")
  })

  test("the kind decides the defaults", () => {
    expect(defaultSeries("level")).toEqual({ draw: "line", annotations: ["current"] })
    expect(defaultSeries("power")).toEqual({ draw: "area", annotations: ["sum"] })
    expect(defaultSeries("state")).toEqual({ draw: "band", annotations: ["runtime"] })
  })

  test("a valid chart is left as it is", () => {
    expect(normalizeChart(structuredClone(water))).toEqual(water)
  })

  test("what the spec says is never stored is dropped", () => {
    const out = normalizeChart({
      mode: "time",
      scroll: false,
      legend: "none",
      left: { scale: "auto" },
      right: { scale: "auto" },
      zones: [{ axis: "right", from: 1, color: "accent" }],
      days: 7,
      series: [
        series({ id: "a", annotations: ["current", "sum", "runtime"], dailyValue: "mean", onMeans: [{ op: "==", value: "on" }] }),
        series({ id: "b", valueKind: "state", draw: "line", annotations: ["sum", "starts"], onMeans: [{ op: "=" as never, value: 1 as never }] }),
        series({ id: "c", valueKind: "power", draw: "bars", annotations: ["sum"], stack: "x" }),
      ],
    })
    const [a, b, c] = out.series
    expect(a.annotations).toEqual(["current"])
    expect(a.dailyValue).toBeUndefined()
    expect(a.onMeans).toBeUndefined()
    expect(b.draw).toBe("band")
    expect(b.annotations).toEqual(["starts"])
    expect(b.onMeans).toEqual([{ op: "==", value: "1" }])
    expect(c.draw).toBe("area")
    expect(c.stack).toBeUndefined()
    expect(out.right).toBeUndefined()
    expect(out.zones).toEqual([])
    expect(out.days).toBeUndefined()
  })

  test("in per-day mode a series is bars, with a daily value of its kind", () => {
    const out = normalizeChart({ mode: "per-day", days: 7, series: [series({ dailyValue: "decline" }), series({ id: "p", valueKind: "power", dailyValue: "runtime" })] })
    expect(out.days).toBe(7)
    expect(out.series.map((s) => s.draw)).toEqual(["bars", "bars"])
    expect(out.series[0].dailyValue).toBe("decline")
    expect(out.series[1].dailyValue).toBeUndefined()
  })

  test("a project's chart is normalized when it is opened, and only then reported changed", () => {
    const objects = [{ id: "c", type: "chart", properties: { ...structuredClone(water), series: [series({ annotations: ["sum"] })] } }]
    expect(migrateObjects(objects)).toBe(true)
    expect(objects[0].properties.series[0].annotations).toEqual([])
    expect(migrateObjects(objects)).toBe(false)
  })
})

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  await page.keyboard.press("Escape")
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

const DEVICE_ID = "e2e-chart-4v3b"
const SCREEN_43B = { width: 800, height: 480 }
const chartsOf = (project: any) => project.screens.flatMap((s: any) => s.objects).filter((o: any) => o.type === "chart")

test.describe("a chart on the canvas, before it is drawn (M4)", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedWaveshare4v3bDdf(DEVICE_ID)), "schaltli-firmware not checked out alongside this repo")
  })

  test("loaded from a file, a chart is a frame to select, resize, copy and paste", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    const saved = await downloadProjectJson(page)
    const screen = saved.screens.find((s: any) => !s.isMaster)
    screen.objects.push({ id: "c1", type: "chart", x: 100, y: 100, width: 400, height: 240, zIndex: 5, properties: structuredClone(water) })
    const zip = new JSZip()
    zip.file("project.json", JSON.stringify(saved))
    const file = path.join(os.tmpdir(), `chart-model-${Date.now()}.zip`)
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    await loadProject(page, file)

    const { box } = await getMainCanvas(page)
    const inside = devicePoint(box, 300, 300, SCREEN_43B)
    await page.mouse.click(inside.x, inside.y)
    await expect(page.getByText("Chart c1")).toBeVisible()
    await page.locator("#width").fill("500")
    const resized = chartsOf(await downloadProjectJson(page))
    expect(resized).toHaveLength(1)
    expect(resized[0].width).toBe(500)
    expect(resized[0].properties.series.map((s: any) => s.name)).toEqual(["Frischwasser", "Grauwasser"])

    await page.mouse.click(inside.x, inside.y)
    await page.keyboard.press("Control+c")
    await page.keyboard.press("Control+v")
    const pasted = chartsOf(await downloadProjectJson(page))
    expect(pasted).toHaveLength(2)
    expect(pasted[1].properties).toEqual(pasted[0].properties)
  })
})
