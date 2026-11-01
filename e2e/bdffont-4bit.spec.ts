import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { BDFFont } from "../lib/bdffont"
import { blendCoverage565 } from "../lib/blend565"

// The designer's side of 4-bit fonts (docs/2026-11-01-4bit-fonts.md, T4;
// docs/device-contract.md, «Font depth»): the blend against the worked values
// the firmware's native test also checks, and a 4-bit glyph drawn onto a
// stand-in canvas - pixel i of a row at ox + 1 + i like the 1-bit path, full
// coverage in the ink, an edge pixel mixed in RGB565 into what lies under it.
// The HIL checkpoint after T4 proves the same against a board.

type Rgb565 = { r: number; g: number; b: number }
type Case = { under: Rgb565; ink: Rgb565; coverage: number; out: Rgb565; note: string }
const cases: Case[] = JSON.parse(readFileSync(path.join(__dirname, "..", "lib", "fixtures", "blend565-cases.json"), "utf8"))

test("blendCoverage565 gives every worked value", () => {
  for (const c of cases) expect(blendCoverage565(c.under, c.ink, c.coverage), c.note).toEqual(c.out)
})

// One glyph, three pixels wide: coverage 0, 8 and 15. Baseline at its
// bottom row, so the box spans y = 8..9 for a baseline at 10.
const FONT = `STARTFONT 2.1
FONT test-4bit
SIZE 10 75 75
FONTBOUNDINGBOX 3 2 0 0
STARTPROPERTIES 4
FONT_ASCENT 8
FONT_DESCENT 2
CAP_HEIGHT 7
BITS_PER_PIXEL 4
ENDPROPERTIES
CHARS 1
STARTCHAR A
ENCODING 65
SWIDTH 500 0
DWIDTH 5 0
BBX 3 2 0 0
BITMAP
08F
F00
ENDCHAR
ENDFONT
`

// The canvas a renderer draws on, reduced to what drawText touches: pixels
// that fillRect paints, read back by getImageData, an editable transform.
function standIn(width: number, height: number, background: [number, number, number], scale = 1) {
  const px = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) px.set([...background, 255], i * 4)
  const painted: { x: number; y: number; style: string; alpha: number }[] = []
  const ctx: any = {
    fillStyle: "#000000",
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }),
    getImageData(x: number, y: number, w: number, h: number) {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const sx = x + xx
          const sy = y + yy
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
          data.set(px.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4), (yy * w + xx) * 4)
        }
      return { data, width: w, height: h }
    },
    fillRect(x: number, y: number) {
      painted.push({ x, y, style: String(ctx.fillStyle), alpha: ctx.globalAlpha })
    },
  }
  return { ctx: ctx as CanvasRenderingContext2D, painted }
}

const hex = (c: { r: number; g: number; b: number }) =>
  "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")
// 5/6/5 expanded by bit replication, as fromRgb565 and the firmware's BMP do.
const expand = (c: Rgb565) => ({ r: (c.r << 3) | (c.r >> 2), g: (c.g << 2) | (c.g >> 4), b: (c.b << 3) | (c.b >> 2) })

test("a 4-bit font is read as one", () => {
  const font = new BDFFont(FONT)
  expect(font.bitsPerPixel).toBe(4)
  expect(new BDFFont(FONT.replace("BITS_PER_PIXEL 4\n", "").replace("STARTPROPERTIES 4", "STARTPROPERTIES 3")).bitsPerPixel).toBe(1)
})

test("at 1:1 full coverage is the ink and an edge pixel is mixed in RGB565, one to the right", () => {
  const under: [number, number, number] = [31, 37, 45]
  const ink = "#f1f4f7"
  const { ctx, painted } = standIn(20, 20, under)
  ctx.fillStyle = ink
  new BDFFont(FONT).drawText(ctx, "A", 4, 10)
  // Box: ox = 4 + 0, top = 10 - 0 - 2 = 8; pixel i at 4 + 1 + i.
  const at = (x: number, y: number) => painted.filter((p) => p.x === x && p.y === y)
  expect(painted.length).toBe(3)
  expect(at(5, 8)).toEqual([])
  const half = blendCoverage565({ r: 31 >> 3, g: 37 >> 2, b: 45 >> 3 }, { r: 0xf1 >> 3, g: 0xf4 >> 2, b: 0xf7 >> 3 }, 8)
  expect(at(6, 8).map((p) => p.style)).toEqual([hex(expand(half))])
  // Full coverage is the ink as given, as a 1-bit pixel is; the comparison
  // with a board reads both in RGB565.
  expect(at(7, 8).map((p) => p.style)).toEqual([ink])
  expect(at(5, 9).map((p) => p.style)).toEqual([ink])
  expect(painted.every((p) => p.alpha === 1)).toBe(true)
})

test("zoomed, an edge pixel is the ink at its coverage's opacity", () => {
  const { ctx, painted } = standIn(20, 20, [0, 0, 0], 3)
  ctx.fillStyle = "#ffffff"
  new BDFFont(FONT).drawText(ctx, "A", 4, 10)
  const edge = painted.find((p) => p.x === 6 && p.y === 8)
  expect(edge?.alpha).toBeCloseTo(8 / 15, 5)
  expect(painted.find((p) => p.x === 7 && p.y === 8)?.alpha).toBe(1)
})

test("1-bit fonts draw as before", () => {
  const oneBit = FONT.replace("BITS_PER_PIXEL 4\n", "").replace("STARTPROPERTIES 4", "STARTPROPERTIES 3")
    .replace("08F\nF00", "20\nC0")
  const { ctx, painted } = standIn(20, 20, [0, 0, 0])
  ctx.fillStyle = "#ffffff"
  new BDFFont(oneBit).drawText(ctx, "A", 4, 10)
  // "20" = 0010 0000, "C0" = 1100 0000: bits from the left at x = 1 + i.
  expect(painted.map((p) => [p.x, p.y]).sort()).toEqual([[5, 9], [6, 9], [7, 8]].sort())
})
