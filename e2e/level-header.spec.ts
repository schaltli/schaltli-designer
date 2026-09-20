import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import {
  LEVEL_HEADER_GAP,
  levelFontMetrics,
  levelHandleRect,
  levelHeaderHeight,
  levelLayout,
} from "../lib/level-shape"
import { levelSubFont } from "../components/canvas/renderers/render-level-indicator"

// The header line of a level indicator: icon, name and numbers above the bar
// (docs/2026-09-19-slider-look.md, decisions 9 and 13).
//
// Every case here is one the user found on the designer's screen on
// 2026-09-19, with helvR24 on a 237x49 bar:
//
// - "wird sie abgeschnitten oben und unten": the header was sized from the
//   object's `fontSize`, which the font picker never updates - 12, for a font
//   whose line is 35 px. It is sized from the font itself now.
// - "der marker berührt den buchstaben. es soll 1px abstand haben": the header
//   ended where the bar began, and the handle overhangs to the bar's top edge.
// - "das icon muss die gleiche höhe haben wie der font (es sitzt auf der
//   grundlinie)": the icon's box was centred in the line, and its artwork has a
//   margin inside that box.
// - "beim ziehen erscheint eine zahl in klammern. diese ist clipped": the
//   bracketed number had a reserve guessed from `fontSize` and was written in
//   helvR24 because no font "smaller than 8" existed.
//
// The pixel checks count ink rather than compare pictures: every black pixel a
// BDF string can put down is known from the font file, so "nothing was cut off"
// is an exact number.

const FONT_DIR = path.join(__dirname, "..", "public", "fonts", "bdf")
const bdf = (file: string) => fs.readFileSync(path.join(FONT_DIR, file), "utf8")

// The project font entries exactly as a real project carries them (checked
// against the user's own project): `size` is ascent plus descent.
const FONTS = [
  { id: "font-helvR08", name: "helvR08", displayName: "helvR08", path: "fonts/helvR08.bdf", size: 12, ascent: 10, descent: 2, data: bdf("helvR08.bdf"), format: "bdf" as const },
  { id: "font-helvR12", name: "helvR12", displayName: "helvR12", path: "fonts/helvR12.bdf", size: 18, ascent: 14, descent: 4, data: bdf("helvR12.bdf"), format: "bdf" as const },
  { id: "font-helvR24", name: "helvR24", displayName: "helvR24", path: "fonts/helvR24.bdf", size: 35, ascent: 28, descent: 7, data: bdf("helvR24.bdf"), format: "bdf" as const },
]

// mdi:water, as the user's project has it: a drop that fills 16.75 of its
// 24-unit box and ends 4 units above the bottom.
const WATER = {
  id: "icon-water",
  type: "icon",
  name: "mdi:water",
  data:
    "data:image/svg+xml;base64," +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20a6 6 0 0 1-6-6c0-4 6-10.75 6-10.75S18 10 18 14a6 6 0 0 1-6 6"/></svg>',
    ).toString("base64"),
}

const W = 360
const H = 240
const FILL = "#6495ED"

function header(extra: Record<string, unknown> = {}, box = { x: 20, y: 60, width: 320, height: 80 }): any {
  return {
    id: "bar",
    type: "level-indicator",
    zIndex: 0,
    ...box,
    properties: {
      topic: "t/level",
      writeTopic: "t/level",
      setpointTopic: "t/set",
      barDirection: "left-to-right",
      displayValue: "value",
      calibrationPoints: [
        { value: 0, barSizePercent: 0 },
        { value: 100, barSizePercent: 100 },
      ],
      fillColor: FILL,
      textColor: "#000000",
      // Stale on purpose: what the font picker leaves behind when it switches
      // an object to helvR24. Nothing on the header may be sized from it.
      fontSize: 12,
      fontId: "font-helvR24",
      label: "Wasser",
      iconAssetId: WATER.id,
      iconColor: "#ff0000",
      ...extra,
    },
  }
}

function project(obj: any) {
  return {
    name: "level-header",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: "24bit" },
    fonts: FONTS,
    assets: [WATER],
    topics: [
      { topic: "t/level", examples: ["45"] },
      { topic: "t/set", examples: ["80"] },
    ],
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: "#ffffff", objects: [obj] }],
  }
}

/** How many pixels a BDF string sets, straight from the glyph bitmaps. */
function inkOf(font: string, text: string): number {
  let total = 0
  for (const ch of text) {
    const start = new RegExp(`^ENCODING ${ch.codePointAt(0)}\\r?$`, "m").exec(font)
    if (!start) throw new Error(`no glyph for ${ch}`)
    const block = font.slice(start.index, font.indexOf("ENDCHAR", start.index))
    const width = Number(/^BBX (\d+)/m.exec(block)![1])
    for (const row of block.split("BITMAP")[1].trim().split(/\s+/)) {
      const bits = Number.parseInt(row, 16).toString(2).padStart(row.length * 4, "0").slice(0, width)
      total += [...bits].filter((b) => b === "1").length
    }
  }
  return total
}

async function draw(page: Page, obj: any, overrides: Record<string, string>): Promise<void> {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: project(obj),
    screenIndex: 0,
    topicOverrides: overrides,
  })
}

/** Every pixel of the canvas, as a lookup. */
async function snapshot(page: Page) {
  const data: number[] = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)
  })
  const at = (x: number, y: number) => {
    const i = (y * W + x) * 4
    return [data[i], data[i + 1], data[i + 2]] as [number, number, number]
  }
  return { at }
}

const isBlack = ([r, g, b]: number[]) => r === 0 && g === 0 && b === 0
const isRed = ([r, g, b]: number[]) => r > 150 && g < 120 && b < 120

test.describe("the header is measured from the font", () => {
  test("its height is the font's own line, whatever `fontSize` says", () => {
    const obj = header()
    expect(levelFontMetrics(obj, FONTS)).toEqual({ ascent: 28, descent: 7, capHeight: 25 })
    // 18 was 1.5 x the stale 12, which is what cut helvR24 off top and bottom.
    expect(levelHeaderHeight(obj, FONTS)).toBe(35)
  })

  test("the bar starts one empty row below it, and the handle with it", () => {
    const obj = header()
    const layout = levelLayout(obj, FONTS)
    expect(layout.bar.y).toBe(layout.header!.y + layout.header!.h + LEVEL_HEADER_GAP)
    expect(LEVEL_HEADER_GAP).toBe(1)
    expect(levelHandleRect(obj, 80, FONTS).y).toBe(layout.bar.y)
  })

  test("the icon is a capital's height and stands on the baseline", () => {
    const layout = levelLayout(header(), FONTS)
    expect(layout.icon!.h).toBe(25)
    expect(layout.icon!.w).toBe(25)
    expect(layout.icon!.y + layout.icon!.h).toBe(layout.baseline)
  })

  test("the bracketed number is written one size down, from the font's own line", () => {
    expect(levelSubFont(FONTS as any, header())?.id).toBe("font-helvR12")
    expect(levelSubFont(FONTS as any, header({ fontId: "font-helvR12" }))?.id).toBe("font-helvR08")
  })
})

test.describe("what the header draws", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("no letter and no number is cut off, the bracketed one included", async ({ page }) => {
    // Reported 45, asked for 80: the state a drag is in, which is when the
    // bracketed number appears.
    const obj = header()
    await draw(page, obj, { "t/level": "45", "t/set": "80" })
    const { at } = await snapshot(page)
    let black = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isBlack(at(x, y))) black++

    const expected = inkOf(FONTS[2].data, "Wasser") + inkOf(FONTS[2].data, "80") + inkOf(FONTS[1].data, "(45)")
    expect(black, "every pixel the three strings set, and nothing else").toBe(expected)
  })

  test("the row between the text and the handle is empty, and the text reaches down to it", async ({ page }) => {
    // Descenders, so the header's last row actually carries ink - otherwise a
    // missing gap could not show.
    const obj = header({ label: "gpq" })
    await draw(page, obj, { "t/level": "45", "t/set": "80" })
    const { at } = await snapshot(page)
    const layout = levelLayout(obj, FONTS)
    const gapRow = layout.header!.y + layout.header!.h
    const handle = levelHandleRect(obj, 80, FONTS)

    let inkAbove = 0
    for (let x = obj.x; x < obj.x + obj.width; x++) {
      expect(at(x, gapRow), `the gap row at x=${x}`).toEqual([255, 255, 255])
      if (isBlack(at(x, gapRow - 1))) inkAbove++
    }
    expect(inkAbove, "descenders reach the header's last row").toBeGreaterThan(0)

    // The handle begins on the very next row.
    const hx = handle.x + Math.trunc(handle.w / 2)
    expect(at(hx, handle.y)).toEqual([0x64, 0x95, 0xed])
    expect(at(hx, handle.y - 1)).toEqual([255, 255, 255])
  })

  test("the icon's ink is a capital tall and stands on the baseline", async ({ page }) => {
    const obj = header()
    await draw(page, obj, { "t/level": "45", "t/set": "80" })
    const { at } = await snapshot(page)
    const layout = levelLayout(obj, FONTS)

    let top = Infinity
    let bottom = -Infinity
    for (let y = obj.y; y < obj.y + obj.height; y++) {
      for (let x = obj.x; x < obj.x + 40; x++) {
        if (!isRed(at(x, y))) continue
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    // Its last row is the one above the baseline, the same row a capital ends
    // on - and nothing of it is below.
    expect(bottom).toBe(layout.baseline - 1)
    // Its first row is where a capital's first row is, give or take the one
    // anti-aliased row the drop's point makes.
    expect(Math.abs(top - (layout.baseline - 25))).toBeLessThanOrEqual(1)
  })
})
