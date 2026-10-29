import { test, expect, type Page } from "@playwright/test"
import { midnightOf } from "../lib/chart-window"

// The painter holds to the layout (tasks/charts-designer-plan.md D4): a
// line, a band, a zone and the NowPoint are drawn where lib/chart-layout.ts
// puts them, in their colours; on a grey device a band is hatched, not
// filled.

const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
const NOON = DAY + 12 * 3600

const day = (at: Record<number, number>) => ({
  date: "2026-10-14",
  step: 900,
  mean: Array.from({ length: 96 }, (_, i) => (i in at ? at[i] : null)),
})

const obj = {
  id: "c",
  type: "chart",
  x: 0,
  y: 0,
  width: 800,
  height: 440,
  zIndex: 1,
  properties: {
    mode: "time",
    scroll: false,
    legend: "none",
    left: { scale: "fixed", min: 0, max: 100 },
    zones: [{ axis: "left", to: 25, color: "#ff0000" }],
    textColor: "#000000",
    mutedColor: "#666666",
    lineColor: "#cccccc",
    series: [
      { id: "t", source: { kind: "topic", topic: "van/tank" }, name: "Tank", valueKind: "level", draw: "steps", color: "#0000ff" },
      { id: "h", source: { kind: "topic", topic: "van/heater" }, name: "Heizung", valueKind: "state", draw: "band", color: "#00aa00" },
    ],
  },
}

async function draw(page: Page, colorDepth: string, probe: (l: any) => [number, number][]) {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const payloads = { t: [day(Object.fromEntries(Array.from({ length: 48 }, (_, i) => [i, 50])))], h: [{ date: "2026-10-14", on: [[60, 180]] }] }
  const first = await page.evaluate((req) => (window as any).__chartForTest({ ...req, probe: [] }), { obj, colorDepth, payloads, now: NOON, tz: TZ })
  return page.evaluate((req) => (window as any).__chartForTest(req), { obj, colorDepth, payloads, now: NOON, tz: TZ, probe: probe(first.layout) })
}

test.describe("the chart's painter (D4)", () => {
  test("a line, a band, a zone and the NowPoint where the layout puts them", async ({ page }) => {
    const { layout, colours } = await draw(page, "24bit", (l) => {
      const line = l.series[0].lines[0]
      const band = l.series[1].bands[0]
      const zone = l.zones[0]
      return [
        [(line[0][0] + line[1][0]) / 2, line[0][1]], // on the tank's line
        [band.x + band.w / 2, band.y + band.h / 2], // inside the band
        [l.plot.x + l.plot.w - 20, zone.y + zone.h / 2 - 20], // in the zone, over nothing else
        [l.series[0].nowPoint[0], l.series[0].nowPoint[1]], // the NowPoint
        [l.plot.x + l.plot.w - 20, l.plot.y + 30], // empty plot
      ]
    })
    expect(layout.series[0].nowPoint).toBeTruthy()
    const [line, band, zone, now, empty] = colours
    expect(line).toBe("#0000ff")
    expect(band).toBe("#00aa00")
    // A zone is a faint tint of its colour: red, lighter.
    expect(zone).not.toBe("#ffffff")
    expect(parseInt(zone.slice(1, 3), 16)).toBe(255)
    expect(parseInt(zone.slice(3, 5), 16)).toBeGreaterThan(150)
    expect(now).toBe("#0000ff")
    expect(empty).toBe("#ffffff")
  })

  test("on a grey device a band is hatched, not filled", async ({ page }) => {
    const { layout } = await draw(page, "4bit", () => [])
    const band = layout.series[1].bands[0]
    const probe: [number, number][] = []
    for (let dx = 4; dx < 40; dx++) probe.push([band.x + band.w / 2 + dx, band.y + band.h / 2])
    const { colours } = await draw(page, "4bit", () => probe)
    const white = colours.filter((c: string) => c === "#ffffff").length
    expect(white, "gaps between the hatching").toBeGreaterThan(5)
    expect(colours.length - white, "the hatching's lines").toBeGreaterThan(5)
  })

  test("an empty chart asks for a series", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const empty = { ...obj, properties: { ...obj.properties, series: [] } }
    const { layout, colours } = await page.evaluate((req) => (window as any).__chartForTest(req), {
      obj: empty,
      now: NOON,
      tz: TZ,
      // Across the plot's middle, where «Chart: add a series» is written.
      probe: Array.from({ length: 300 }, (_, i) => [250 + i, 214]),
    })
    expect(layout.series).toEqual([])
    expect(colours.some((c: string) => c !== "#ffffff" && c !== "#cccccc")).toBe(true)
  })
})
