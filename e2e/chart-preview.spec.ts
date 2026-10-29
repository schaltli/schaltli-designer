import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { chartPreview, historySubscriptions, simulatedData } from "../lib/chart-preview"
import { chartWindow, midnightOf } from "../lib/chart-window"
import { chooseDevice, createProject, loadProject, waitForDeviceGate, waitForEditorReady, getMainCanvas, devicePoint } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"

// What a chart draws in the designer (tasks/charts-designer-plan.md D5,
// decisions 5 and 6): Live the recorder's history or a word that there is
// none; Simulation a curve from the topics' examples.

const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
const NOON = DAY + 12 * 3600
const tank = { id: "s1", source: { kind: "topic", topic: "van/tank#level" }, name: "Tank", valueKind: "level", draw: "line", color: "#0000ff" } as any
const heater = { id: "h", source: { kind: "topic", topic: "van/heater" }, name: "Heizung", valueKind: "state", draw: "band", color: "#00aa00" } as any
const props = { mode: "time", series: [tank, heater] }
const topics = [
  { id: "t1", topic: "van/tank", type: "json", examples: ['{"level": 80}', '{"level": 40}'] },
  { id: "t2", topic: "van/heater", type: "text", examples: ["on", "off"] },
] as any
const now = JSON.stringify({ time: NOON, tz: TZ })

test.describe("a chart in the designer (D5)", () => {
  test("Live without a recorder says so; with one but nothing laid yet, that", () => {
    expect(chartPreview(props, { topics, live: {}, now: NOON }).message).toBe("No recorder on this broker")
    expect(chartPreview(props, { topics, live: { "schaltli/history/recorder": JSON.stringify({ state: "offline" }) }, now: NOON }).message).toBe("No recorder on this broker")
    const online = { "schaltli/history/recorder": JSON.stringify({ state: "online", id: "pi" }), "schaltli/history/now": now }
    expect(chartPreview(props, { topics, live: online, now: NOON }).message).toBe("No history yet")
  })

  test("Live draws the history laid under each series' name, in the recorder's zone", () => {
    const live = {
      "schaltli/history/recorder": JSON.stringify({ state: "online", id: "pi" }),
      "schaltli/history/now": JSON.stringify({ time: NOON, tz: "America/New_York" }),
      "schaltli/history/van/tank~level/day/2026-10-14": JSON.stringify({ date: "2026-10-14", step: 900, mean: [55, null], min: [50, null], max: [60, null] }),
    }
    // In New York noon in Zurich is 06:00 of the same day.
    const p = chartPreview(props, { topics, live, now: NOON })
    expect(p.message).toBeUndefined()
    expect(p.tz).toBe("America/New_York")
    expect(p.data.s1.steps).toEqual([{ t: midnightOf("2026-10-14", "America/New_York"), len: 900, mean: 55, min: 50, max: 60 }])
  })

  test("Simulation: a curve through the examples up to now, the same every time; a state on and off", () => {
    const w = chartWindow({ mode: "time" }, "24h", NOON, TZ)
    const a = simulatedData(tank, w, NOON, topics)
    expect(a.steps).toHaveLength(48)
    expect(a).toEqual(simulatedData(tank, w, NOON, topics))
    const means = a.steps.map((s) => s.mean)
    expect(Math.max(...means)).toBeLessThanOrEqual(80)
    expect(Math.min(...means)).toBeGreaterThanOrEqual(40)
    expect(means[0]).toBeGreaterThan(70)
    const h = simulatedData(heater, w, NOON, topics)
    expect(h.on).toEqual([
      [DAY, DAY + 6 * 3600],
      [DAY + 12 * 3600, DAY + 12 * 3600],
    ].filter(([a2, b]) => b > a2))
    expect(simulatedData({ ...tank, source: { kind: "topic", topic: "van/none" } }, w, NOON, topics).steps).toEqual([])
  })

  test("the Live preview subscribes to each series' history and the recorder", () => {
    expect(historySubscriptions([{ objects: [{ type: "group", children: [{ type: "chart", properties: props }] }] }])).toEqual([
      "schaltli/history/van/tank~level/#",
      "schaltli/history/van/heater/#",
      "schaltli/history/recorder",
      "schaltli/history/now",
    ])
    expect(historySubscriptions([{ objects: [{ type: "bar" }] }])).toEqual([])
  })
})

// ---- in the preview, against the bench's broker

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const DEVICE_ID = "e2e-chart-preview-4v3b"
const SCREEN = { width: 800, height: 480 }

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  await page.keyboard.press("Escape")
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

/** Pixels of the series' blue inside the chart, on the main canvas. */
async function bluePixels(page: Page): Promise<number> {
  const { canvas, box } = await getMainCanvas(page)
  const a = devicePoint(box, 40, 40, SCREEN)
  const b = devicePoint(box, 760, 440, SCREEN)
  return canvas.evaluate(
    (c: HTMLCanvasElement, [x0, y0, x1, y1]) => {
      const r = c.getBoundingClientRect()
      const sx = c.width / r.width
      const sy = c.height / r.height
      const d = c.getContext("2d")!.getImageData(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] > 200) n++
      return n
    },
    [a.x - box.x, a.y - box.y, b.x - box.x, b.y - box.y],
  )
}

test.describe("a chart in the Live preview (D5)", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedWaveshare4v3bDdf(DEVICE_ID)), "schaltli-firmware not checked out alongside this repo")
  })

  test("no recorder: no curve; the recorder's history laid: the curve", async ({ page }) => {
    const prefix = `e2e-chart/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await mqtt.connectAsync(BROKER_URL, { reconnectPeriod: 0 })
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date())
    const dayTopic = `schaltli/history/${prefix}/level/day/${today}`
    try {
      await broker.publishAsync("schaltli/history/recorder", "", { retain: true, qos: 1 })
      await page.goto("/")
      await waitForDeviceGate(page)
      await chooseDevice(page, DEVICE_ID, "auto-discovered")
      await createProject(page)
      await waitForEditorReady(page)
      const saved = await downloadProjectJson(page)
      saved.screens.find((s: any) => !s.isMaster).objects.push({
        id: "c1",
        type: "chart",
        x: 0,
        y: 0,
        width: 800,
        height: 480,
        zIndex: 50,
        properties: { mode: "time", scroll: false, legend: "none", left: { scale: "fixed", min: 0, max: 100 }, series: [{ ...tank, source: { kind: "topic", topic: `${prefix}/level` } }] },
      })
      const zip = new JSZip()
      zip.file("project.json", JSON.stringify(saved))
      const file = path.join(os.tmpdir(), `chart-preview-${Date.now()}.zip`)
      fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
      await loadProject(page, file)

      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })
      await page.waitForTimeout(800)
      expect(await bluePixels(page), "no recorder: no curve").toBe(0)

      await broker.publishAsync("schaltli/history/now", JSON.stringify({ time: Math.floor(Date.now() / 1000), tz: "Europe/Zurich" }), { retain: true, qos: 1 })
      await broker.publishAsync("schaltli/history/recorder", JSON.stringify({ state: "online", id: "e2e" }), { retain: true, qos: 1 })
      await broker.publishAsync(dayTopic, JSON.stringify({ date: today, step: 900, mean: Array(96).fill(50), min: Array(96).fill(50), max: Array(96).fill(50) }), { retain: true, qos: 1 })
      await expect.poll(() => bluePixels(page), { timeout: 5000 }).toBeGreaterThan(100)
    } finally {
      for (const t of ["schaltli/history/recorder", "schaltli/history/now", dayTopic]) await broker.publishAsync(t, "", { retain: true, qos: 1 })
      await broker.endAsync()
    }
  })
})
