import { test, expect, type Page } from "@playwright/test"

// The Switch's marker, drawn through app/test-render rather than the editor
// canvas: no grid, no adornment, no zoom, no selection handles, so a pixel
// at (x, y) is exactly the pixel the firmware has to put there too. The
// editor-side behaviour (property panel, export) lives in
// switch-render.spec.ts; this file is only about what gets drawn.
//
// Covers the 2026-08-25 rebuild, in which the active state stopped being a
// filled segment and became a bar along the top edge. Two things made that
// worth pinning down in pixels rather than in a screenshot:
//
//   1. The outer border was being overpainted. renderSwitch stroked it
//      first and then filled each segment across the object's full height,
//      so every one of its pixels was erased - only the dividers survived,
//      because those came after their own segment's fill. It went unnoticed
//      for as long as a large coloured block made the control obvious
//      anyway. With the fill gone the border is the only thing left that
//      says where the object is, so its absence would have shipped as
//      "the Switch disappeared".
//
//   2. Every number in the marker's geometry also exists in
//      ColorScreenRenderer.cpp. A HIL run catches a disagreement, but only
//      once there is hardware in the loop and a firmware flashed; these
//      assertions catch it at the moment the constant is edited.

const SCREEN_W = 240
const SCREEN_H = 80

const SWITCH_X = 20
const SWITCH_Y = 10
const SWITCH_W = 200
const SWITCH_H = 60

const WHITE = "#ffffff"
const BORDER = "#ff0000"
const MARKER = "#0000ff"

// Geometry the renderer promises, restated here rather than imported: a
// test that imports the constant it is checking cannot fail when the
// constant changes, which is the one thing this test exists to notice.
const BAR_TOP = SWITCH_Y + 4
const BAR_BOTTOM = BAR_TOP + 10 - 1
const BAND_TOP = SWITCH_Y + 14

function switchProject(overrides: Record<string, any> = {}, states?: any[]) {
  return {
    name: "switch-marker",
    screenWidth: SCREEN_W,
    screenHeight: SCREEN_H,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [{ topic: "sw/state", examples: [] }],
    screens: [
      {
        id: "s1",
        name: "Screen 1",
        backgroundColor: WHITE,
        objects: [
          {
            id: "sw",
            type: "Switch",
            zIndex: 0,
            x: SWITCH_X,
            y: SWITCH_Y,
            width: SWITCH_W,
            height: SWITCH_H,
            properties: {
              topic: "sw/state",
              writeTopic: "sw/cmd",
              backgroundColor: WHITE,
              borderColor: BORDER,
              activeBackgroundColor: MARKER,
              textColor: "#008000",
              states: states ?? [
                { id: "s-on", label: "", readValue: "ON", writeValue: "ON" },
                { id: "s-off", label: "", readValue: "OFF", writeValue: "OFF" },
              ],
              ...overrides,
            },
          },
        ],
      },
    ],
  }
}

async function render(page: Page, project: any, value: string): Promise<void> {
  await page.evaluate(
    (req) => (window as any).__renderScreenForTest(req),
    { project, screenIndex: 0, topicOverrides: { "sw/state": value } },
  )
}

// Reads back from the harness canvas the render just drew into, rather than
// decoding the PNG data URL it returns - same pixels, no image decoder and
// no extra dependency to keep in step.
async function pixel(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(([px, py]) => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    const data = canvas.getContext("2d")!.getImageData(px as number, py as number, 1, 1).data
    const hex = (n: number) => n.toString(16).padStart(2, "0")
    return `#${hex(data[0])}${hex(data[1])}${hex(data[2])}`
  }, [x, y])
}

// Counts pixels of one exact colour, optionally excluding a column - the
// divider between segments is the same colour as the border and is the one
// part of the border that never had the bug.
async function countColor(page: Page, hex: string, excludeColumn?: number): Promise<number> {
  return page.evaluate(
    ([wanted, skipX]) => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement
      const { width, height } = canvas
      const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data
      const r = parseInt((wanted as string).slice(1, 3), 16)
      const g = parseInt((wanted as string).slice(3, 5), 16)
      const b = parseInt((wanted as string).slice(5, 7), 16)
      let count = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (skipX !== null && x === skipX) continue
          const i = (y * width + x) * 4
          if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++
        }
      }
      return count
    },
    [hex, excludeColumn ?? null],
  )
}

test.describe("Switch marker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  // The regression that made the rebuild urgent. Before the fix this count
  // was exactly zero: every border pixel outside the divider column had
  // been painted over by the segment fills.
  test("the outer border survives the segment backgrounds", async ({ page }) => {
    await render(page, switchProject(), "ON")

    const dividerColumn = SWITCH_X + SWITCH_W / 2
    const borderPixels = await countColor(page, BORDER, dividerColumn)

    // A complete 200x60 perimeter is 2*200 + 2*60 - 4 = 512 pixels, minus
    // the two the excluded divider column contributes to the top and bottom
    // edges. Asserted as a floor rather than an exact figure so that adding
    // a state (and with it another divider) does not need this number
    // edited - the point is that hundreds of border pixels are present,
    // where there used to be none at all.
    expect(borderPixels).toBeGreaterThanOrEqual(500)

    // And the perimeter specifically, not merely a lot of red somewhere:
    // all four edges, sampled away from the corners.
    expect(await pixel(page, SWITCH_X, SWITCH_Y + 30)).toBe(BORDER)
    expect(await pixel(page, SWITCH_X + SWITCH_W - 1, SWITCH_Y + 30)).toBe(BORDER)
    expect(await pixel(page, SWITCH_X + 50, SWITCH_Y)).toBe(BORDER)
    expect(await pixel(page, SWITCH_X + 50, SWITCH_Y + SWITCH_H - 1)).toBe(BORDER)
  })

  test("the active segment is marked by a bar, and nothing is filled", async ({ page }) => {
    await render(page, switchProject(), "ON")

    // Sampled at the horizontal middle of the first segment, clear of the
    // bar's 3px corner radius.
    const midFirstSegment = SWITCH_X + 50

    expect(await pixel(page, midFirstSegment, BAR_TOP + 4), "inside the bar").toBe(MARKER)
    expect(await pixel(page, midFirstSegment, SWITCH_Y + 1), "above the bar, in the 4px top inset").toBe(WHITE)
    expect(await pixel(page, midFirstSegment, BAR_BOTTOM + 3), "below the bar").toBe(WHITE)
    expect(await pixel(page, SWITCH_X + 2, BAR_TOP + 4), "left of the bar, in the 6px side inset").toBe(WHITE)

    // The point of the whole change: the segment body stays background
    // coloured. A returning fill would show up here first.
    expect(await pixel(page, midFirstSegment, SWITCH_Y + 40), "segment body must not be filled").toBe(WHITE)

    // The inactive segment carries no marker at all.
    expect(await pixel(page, SWITCH_X + 150, BAR_TOP + 4), "inactive segment").toBe(WHITE)
  })

  test("the marker follows the active state, and disappears when nothing matches", async ({ page }) => {
    const project = switchProject()
    const firstSegment = SWITCH_X + 50
    const secondSegment = SWITCH_X + 150

    await render(page, project, "OFF")
    expect(await pixel(page, secondSegment, BAR_TOP + 4), "second state active").toBe(MARKER)
    expect(await pixel(page, firstSegment, BAR_TOP + 4), "first state no longer active").toBe(WHITE)

    // No retained value yet, or a value matching no state: no segment is
    // marked. Deliberately not "the first one wins" - a Switch showing a
    // state nobody reported is worse than one showing none.
    await render(page, project, "something-else")
    expect(await countColor(page, MARKER)).toBe(0)
  })

  // Objects saved before the designer clamped Switch sizes can still be
  // narrow enough that segW - 2*6 reaches zero. drawBar's max(4, ...) is
  // what keeps those drawing a visible marker instead of nothing at all,
  // which is the reason no warning UI was needed for them.
  test("a segment too narrow for the side insets still shows a marker", async ({ page }) => {
    const project = switchProject()
    const sw = project.screens[0].objects[0]
    sw.width = 60
    sw.properties.states = [0, 1, 2, 3, 4].map((i) => ({
      id: `s${i}`,
      label: "",
      readValue: `v${i}`,
      writeValue: `v${i}`,
    }))

    await render(page, project, "v2")

    // 60px over five states is 12px per segment; 12 - 12 would be a bar of
    // no width whatsoever.
    expect(await countColor(page, MARKER)).toBeGreaterThan(0)
  })

  // The design sheets that led to the marker rebuild drew their tiles with
  // rounded corners - but those were `box` objects standing in for a Switch,
  // and the Switch itself had no such property, so the shipped control came
  // out square and nobody said so out loud (2026-08-25). The property exists
  // now; these pin down that it defaults to off and that the corner is
  // genuinely cut when it is on.
  test.describe("corner radius", () => {
    test("defaults to square, so nothing already built changes", async ({ page }) => {
      await render(page, switchProject(), "ON")

      // The very corner pixel of the object belongs to the border.
      expect(await pixel(page, SWITCH_X, SWITCH_Y)).toBe(BORDER)
      expect(await pixel(page, SWITCH_X + SWITCH_W - 1, SWITCH_Y)).toBe(BORDER)
      expect(await pixel(page, SWITCH_X, SWITCH_Y + SWITCH_H - 1)).toBe(BORDER)
      expect(await pixel(page, SWITCH_X + SWITCH_W - 1, SWITCH_Y + SWITCH_H - 1)).toBe(BORDER)
    })

    test("a radius cuts the corner away and leaves the edges intact", async ({ page }) => {
      await render(page, switchProject({ cornerRadius: 10 }), "ON")

      // Corner pixel now shows the screen behind the object, on all four.
      expect(await pixel(page, SWITCH_X, SWITCH_Y), "top left cut").toBe(WHITE)
      expect(await pixel(page, SWITCH_X + SWITCH_W - 1, SWITCH_Y), "top right cut").toBe(WHITE)
      expect(await pixel(page, SWITCH_X, SWITCH_Y + SWITCH_H - 1), "bottom left cut").toBe(WHITE)
      expect(await pixel(page, SWITCH_X + SWITCH_W - 1, SWITCH_Y + SWITCH_H - 1), "bottom right cut").toBe(WHITE)

      // ... while the straight runs between the corners still carry the
      // border. A radius that ate the whole edge would pass the assertions
      // above and be completely wrong.
      // x + 50, not x + 100: with two segments the divider sits exactly at
      // x + 100 and is the same colour as the border, so sampling there
      // would pass whether the edge survived or not.
      expect(await pixel(page, SWITCH_X + 50, SWITCH_Y), "top edge").toBe(BORDER)
      expect(await pixel(page, SWITCH_X, SWITCH_Y + 30), "left edge").toBe(BORDER)

      // And the border is a real ring, not a filled shape: just inside it,
      // the body is still background coloured. This is the assertion that
      // fails if the two nested fills ever get their order or their inset
      // wrong - which is how a rounded border has to be drawn with an
      // integer primitive that cannot stroke a curve.
      expect(await pixel(page, SWITCH_X + 50, SWITCH_Y + 1), "just inside the top edge").toBe(WHITE)
    })
  })

  test.describe("single-area mode", () => {
    const singleStates = [
      { id: "s-on", label: "Kitchen on", readValue: "ON", writeValue: "ON", showMarker: true },
      { id: "s-off", label: "Kitchen off", readValue: "OFF", writeValue: "OFF", showMarker: false },
    ]

    test("shows the bar only for states that carry it", async ({ page }) => {
      const project = switchProject({ mode: "single" }, singleStates)
      const middle = SWITCH_X + SWITCH_W / 2

      await render(page, project, "ON")
      expect(await pixel(page, middle, BAR_TOP + 4), "marked state shows the bar").toBe(MARKER)
      expect(await pixel(page, middle, SWITCH_Y + 40), "still nothing filled").toBe(WHITE)

      // The state that is deliberately not marked. This is the half a
      // positional convention ("states[0] is the marked one") would have
      // got wrong for anyone who happened to add their off state first -
      // and with no reordering UI in the panel, could not have corrected.
      await render(page, project, "OFF")
      expect(await countColor(page, MARKER)).toBe(0)
    })

    test("draws no divider - there is only one surface", async ({ page }) => {
      const project = switchProject({ mode: "single" }, singleStates)
      await render(page, project, "ON")

      // Segmented mode would put a divider down the middle in the border
      // colour. Sampled below the bar band so the marker cannot be mistaken
      // for one.
      expect(await pixel(page, SWITCH_X + SWITCH_W / 2, SWITCH_Y + 40)).toBe(WHITE)
    })

    test("shows only a question mark when no state matches", async ({ page }) => {
      const project = switchProject({ mode: "single" }, singleStates)
      await render(page, project, "no-such-value")

      // No marker: nothing has been confirmed, and nothing has been asked
      // for either (pending and pressed are live device states the canvas
      // deliberately never simulates).
      expect(await countColor(page, MARKER)).toBe(0)

      // Something is drawn, in the text colour, inside the content band -
      // the "?". Every label belongs to a state, so with no active state
      // there is no name to show; an empty tile would read as a broken
      // configuration rather than as "waiting for a value".
      const inkPixels = await page.evaluate(
        ([top, bottom]) => {
          const canvas = document.querySelector("canvas") as HTMLCanvasElement
          const { width } = canvas
          const data = canvas.getContext("2d")!.getImageData(0, 0, width, canvas.height).data
          let count = 0
          for (let y = top as number; y < (bottom as number); y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4
              // Greenish ink (#008000), tolerant of the fallback font's
              // anti-aliasing - this asserts "something was drawn", not a
              // glyph shape.
              if (data[i] < 128 && data[i + 1] > 40 && data[i + 2] < 128) count++
            }
          }
          return count
        },
        [BAND_TOP, SWITCH_Y + SWITCH_H],
      )
      expect(inkPixels, "a question mark should be drawn in the content band").toBeGreaterThan(0)
    })
  })
})
