import { test, expect, type Page } from "@playwright/test"
import { levelTrackLook, levelTrackRect } from "../lib/level-shape"

// What each type draws before its topic has a value (docs/2026-09-15-live-data.md,
// decision 6): nothing of the value. A device starts every topic empty and the
// designer's live preview shows what the device will show, so a tank must not
// read as full, a relay as on or a flow as flowing before anything has said so.
//
// Drawn through app/test-render with an explicit "" override - the same
// request hil/conformance makes for its "before any value" case, where the
// device's photograph is compared against exactly these renders. This file
// pins the designer side down without hardware; conformance holds the
// firmware to it.
//
// Every test also renders a real value first, so "nothing drawn" cannot pass
// because the object failed to draw at all.

const W = 240
const H = 120
const WHITE = "#ffffff"
const BORDER = "#808080"
const FILL = "#00ff00"
// Colours an RGB565 round trip leaves exact - the arc is rasterised in 565.
const TRACK = "#00ffff"
const MARKER = "#ff00ff"
const LINE = "#0000ff"

function project(objects: any[], topics: string[]) {
  return {
    name: "empty-values",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: topics.map((topic) => ({ topic, examples: ["42"] })),
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: WHITE, objects }],
  }
}

async function render(page: Page, p: any, overrides: Record<string, string>): Promise<void> {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: p,
    screenIndex: 0,
    topicOverrides: overrides,
  })
}

async function countColor(page: Page, hex: string): Promise<number> {
  return page.evaluate((wanted) => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
    const r = parseInt(wanted.slice(1, 3), 16)
    const g = parseInt(wanted.slice(3, 5), 16)
    const b = parseInt(wanted.slice(5, 7), 16)
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++
    }
    return count
  }, hex)
}

// Reddish ink, tolerant of the fallback font's anti-aliasing: "was any text
// drawn", not a glyph shape.
async function redInk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 150 && data[i + 1] < 110 && data[i + 2] < 110) count++
    }
    return count
  })
}

test.describe("before any value", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  test("a data field shows nothing - no prefix, no unit", async ({ page }) => {
    const p = project(
      [
        {
          id: "f",
          type: "live-text",
          zIndex: 0,
          x: 10,
          y: 10,
          width: 200,
          height: 30,
          properties: {
            topic: "t/field",
            displayAs: "Display as-is",
            backgroundColor: WHITE,
            borderColor: "transparent",
            textColor: "#ff0000",
            color: "#ff0000",
            prefix: "Temp ",
            postfix: " °C",
          },
        },
      ],
      ["t/field"],
    )
    await render(page, p, { "t/field": "21" })
    expect(await redInk(page), "a value is drawn with its prefix and unit").toBeGreaterThan(0)

    await render(page, p, { "t/field": "" })
    expect(await redInk(page), "no value: no text at all").toBe(0)
  })

  test("a level indicator keeps its track and draws neither bar nor text", async ({ page }) => {
    const barObject = {
      id: "l",
      type: "bar",
      zIndex: 0,
      x: 20,
      y: 20,
      width: 200,
      height: 40,
      properties: {
        topic: "t/level",
        fillColor: FILL,
        textColor: "#ff0000",
        barDirection: "left-to-right",
        displayValue: "percentage",
        calibrationPoints: [
          { value: 0, barSizePercent: 0 },
          { value: 100, barSizePercent: 100 },
        ],
      },
    }
    const p = project([barObject], ["t/level"])
    await render(page, p, { "t/level": "50" })
    expect(await countColor(page, FILL), "a value fills the bar").toBeGreaterThan(0)

    await render(page, p, { "t/level": "" })
    expect(await countColor(page, FILL), "no value: no bar - an empty bar would be an empty tank").toBe(0)
    // The track is what stays: mixed from the bar's colour and the screen's
    // background (docs/2026-09-19-slider-look.md, decision 12), so it is asked
    // of the same function the renderer asks rather than written out here - the
    // arithmetic itself is pinned down in level-track.spec.ts. How much of it
    // must be there follows from the track's own size; a fixed count went stale
    // the moment the track got Material's proportions and a column for its
    // number.
    const track = levelTrackRect(barObject as any)
    const { track: mixed } = levelTrackLook(FILL, WHITE, "24bit")
    expect(mixed, "a colour that can be told from the fill").not.toBe(FILL)
    expect(await countColor(page, mixed), `the empty track stays (${track.w}x${track.h})`).toBeGreaterThan(
      Math.trunc((track.w * track.h) / 2),
    )
  })

  test("an arc level draws its track only - no fill, no marker, no number", async ({ page }) => {
    const p = project(
      [
        {
          id: "a",
          type: "gauge",
          zIndex: 0,
          x: 60,
          y: 0,
          width: 120,
          height: 120,
          properties: {
            topic: "t/arc",
            setpointTopic: "t/setpoint",
            minAngle: 225,
            maxAngle: 135,
            direction: "cw",
            thickness: 12,
            markerWidth: 4,
            backgroundColor: "transparent",
            trackColor: TRACK,
            fillColor: FILL,
            markerColor: MARKER,
            textColor: "#ff0000",
            displayValue: "value",
            calibrationPoints: [
              { value: 0, barSizePercent: 0 },
              { value: 100, barSizePercent: 100 },
            ],
          },
        },
      ],
      ["t/arc", "t/setpoint"],
    )
    await render(page, p, { "t/arc": "50", "t/setpoint": "80" })
    expect(await countColor(page, FILL), "a value fills the arc").toBeGreaterThan(0)
    expect(await countColor(page, MARKER), "and places the marker").toBeGreaterThan(0)
    expect(await redInk(page), "and shows the number").toBeGreaterThan(0)

    await render(page, p, { "t/arc": "", "t/setpoint": "80" })
    expect(await countColor(page, FILL), "no value: no fill, not even the old stand-in of 50").toBe(0)
    expect(await countColor(page, MARKER), "no value: no marker, even with a setpoint").toBe(0)
    expect(await redInk(page), "no value: no number").toBe(0)
    expect(await countColor(page, TRACK), "the track stays").toBeGreaterThan(0)
  })

  test("a data line is not drawn at all", async ({ page }) => {
    const p = project(
      [
        {
          id: "d",
          type: "live-line",
          zIndex: 0,
          x: 10,
          y: 60,
          width: 220,
          height: 1,
          properties: {
            topic: "t/flow",
            color: LINE,
            filletRadius: 0,
            points: [
              { x: 10, y: 60 },
              { x: 230, y: 60 },
            ],
            calibrationPoints: [
              { value: 0, barSizePercent: 1 },
              { value: 80, barSizePercent: 16 },
            ],
            arrowStartOperator: "<",
            arrowStartValue: "0",
            arrowEndOperator: ">",
            arrowEndValue: "0",
          },
        },
      ],
      ["t/flow"],
    )
    await render(page, p, { "t/flow": "0" })
    expect(await countColor(page, LINE), "a value of 0 is still the thinnest line").toBeGreaterThan(0)

    await render(page, p, { "t/flow": "" })
    expect(await countColor(page, LINE), "no value: no line, which would read as nothing flowing").toBe(0)
  })

  test("a switch marks no segment, not even one that reads an empty value", async ({ page }) => {
    const p = project(
      [
        {
          id: "sw",
          type: "button-group",
          zIndex: 0,
          x: 20,
          y: 30,
          width: 200,
          height: 60,
          properties: {
            topic: "t/switch",
            writeTopic: "t/switch/set",
            // One colour since 2026-09-20; the chosen state's pill is drawn in
            // it (docs/2026-09-20-switch-look.md).
            switchColor: MARKER,
            states: [
              { id: "s-on", label: "", readValue: "ON", writeValue: "ON" },
              { id: "s-blank", label: "", readValue: "", writeValue: "OFF" },
            ],
          },
        },
      ],
      ["t/switch"],
    )
    await render(page, p, { "t/switch": "ON" })
    expect(await countColor(page, MARKER), "a value gives its state the pill").toBeGreaterThan(0)

    await render(page, p, { "t/switch": "" })
    expect(await countColor(page, MARKER), "no value: no state is chosen").toBe(0)
  })

  test("a tab control shows its first panel, whatever the panels' conditions", async ({ page }) => {
    const box = (id: string, color: string) => ({
      id,
      type: "box",
      zIndex: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      properties: { fillColor: color, strokeColor: color, strokeWidth: 1 },
    })
    const p = project(
      [
        {
          id: "tabs",
          type: "switcher",
          zIndex: 0,
          x: 20,
          y: 20,
          width: 100,
          height: 60,
          properties: { topic: "t/tabs" },
          children: [
            // Listed out of drawing order on purpose: "first" is the lowest
            // zIndex, the order the firmware and the Android app walk too.
            {
              id: "p-low",
              type: "panel",
              zIndex: 1,
              x: 0,
              y: 0,
              width: 100,
              height: 60,
              // An empty value reads as 0, so without the rule this panel
              // would win by accident.
              properties: { comparisonOperator: "<", comparisonValue: "5" },
              children: [box("b-low", LINE)],
            },
            {
              id: "p-first",
              type: "panel",
              zIndex: 0,
              x: 0,
              y: 0,
              width: 100,
              height: 60,
              properties: { comparisonOperator: "==", comparisonValue: "10" },
              children: [box("b-first", FILL)],
            },
          ],
        },
      ],
      ["t/tabs"],
    )
    await render(page, p, { "t/tabs": "3" })
    expect(await countColor(page, LINE), "a value picks the panel whose condition matches").toBeGreaterThan(0)
    expect(await countColor(page, FILL)).toBe(0)

    await render(page, p, { "t/tabs": "" })
    expect(await countColor(page, FILL), "no value: the first panel").toBeGreaterThan(0)
    expect(await countColor(page, LINE)).toBe(0)
  })
})
