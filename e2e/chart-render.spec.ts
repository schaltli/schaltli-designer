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

async function draw(page: Page, colorDepth: string, probe: (l: any) => [number, number][], pulse?: number) {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const payloads = { t: [day(Object.fromEntries(Array.from({ length: 48 }, (_, i) => [i, 50])))], h: [{ date: "2026-10-14", on: [[60, 180]] }] }
  const first = await page.evaluate((req) => (window as any).__chartForTest({ ...req, probe: [] }), { obj, colorDepth, payloads, now: NOON, tz: TZ })
  return page.evaluate((req) => (window as any).__chartForTest(req), { obj, colorDepth, payloads, now: NOON, tz: TZ, probe: probe(first.layout), pulse })
}

test.describe("the chart's painter (D4)", () => {
  test("the NowPoint's pulse: a ring around it in its colour where the phase puts it, none without one, none on grey", async ({ page }) => {
    // Half way out the ring has a radius of 13.5 px (lib/chart-shapes.ts
    // pulseRing); up and to the right of the NowPoint is nothing else -
    // straight above it runs the line at now.
    const at = (l: any): [number, number][] => [[l.series[0].nowPoint[0] + 9.5, l.series[0].nowPoint[1] - 9.5]]
    const still = await draw(page, "24bit", at)
    const pulsing = await draw(page, "24bit", at, 0.5)
    const grey = await draw(page, "4bit", at, 0.5)
    expect(still.colours[0]).toBe("#ffffff")
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(pulsing.colours[0].slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r + 20)
    expect(b).toBeGreaterThan(g + 20)
    expect(grey.colours[0]).toBe(still.colours[0])
  })

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

  // 2026-10-30, after the van: the line at now and a stack's NowPoint in the
  // now colour, and a stacked area fading from zero outwards, as the artifact.
  test("the line at now and a stack's NowPoint in the now colour; a stacked area fades from zero outwards", async ({ page }) => {
    const stack = {
      ...obj,
      properties: {
        ...obj.properties,
        zones: [],
        left: { scale: "fixed", min: -400, max: 400 },
        nowColor: "#ff00ff",
        series: [{ id: "sun", source: { kind: "topic", topic: "van/sun" }, name: "Sonne", valueKind: "power", draw: "stacked", stack: "e", color: "#0000ff" }],
      },
    }
    const payloads = { sun: [day(Object.fromEntries(Array.from({ length: 48 }, (_, i) => [i, 380])))] }
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const req = { obj: stack, colorDepth: "24bit", payloads, now: NOON, tz: TZ }
    const { layout } = await page.evaluate((r) => (window as any).__chartForTest({ ...r, probe: [] }), req)
    const [nx, zero] = layout.series[0].nowPoint
    const x = Math.round(nx - 200)
    const top = layout.series[0].areas[0][0][1]
    const { colours } = await page.evaluate((r) => (window as any).__chartForTest(r), {
      ...req,
      probe: [
        [nx, layout.plot.y + 4], // the line at now, above everything
        [nx, zero], // the NowPoint, on zero
        [x, zero - 3], // the area just above zero
        [x, top + 4], // the area near its outer edge
      ],
    })
    const [line, point, low, high] = colours
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
    // A faint magenta over white: red and blue above green.
    expect(rgb(line)[0]).toBeGreaterThan(rgb(line)[1])
    expect(rgb(line)[2]).toBeGreaterThan(rgb(line)[1])
    expect(point).toBe("#ff00ff")
    // Blue over white: the further from zero, the less of the white is left.
    expect(rgb(high)[0]).toBeLessThan(rgb(low)[0] - 40)
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
