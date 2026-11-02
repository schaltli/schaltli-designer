import { fromRgb565, toRgb565, type Rgb565 } from "@/lib/arc-raster"
import { blendCoverage565 } from "@/lib/blend565"
import { rgb565FromBytes } from "@/lib/level-glow"

export class BDFFont {
  glyphs: any = {}
  properties: any = {}
  FONT?: string
  SIZE?: { size: number; xres: number; yres: number }
  FONTBOUNDINGBOX?: { w: number; h: number; x: number; y: number }
  CHARS?: number

  constructor(...args: any[]) {
    this.init(...args)
  }

  init(bdf?: string) {
    this.glyphs = {}
    this.properties = {}
    if (bdf) {
      this.parse(bdf)
    }
  }

  parse(bdf: string) {
    const lines = bdf.split(/\n/)
    let glyph: any = null
    let properties: any = null

    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i].trim()

      if (glyph) {
        if (line !== "ENDCHAR") {
          if (!glyph["BITMAP"]) {
            const d = line.split(" ")

            switch (d[0]) {
              case "ENCODING":
                glyph["ENCODING"] = +d[1]
                break

              case "SWIDTH":
                glyph["SWIDTH"] = {
                  x: +d[1],
                  y: +d[2],
                }
                break

              case "DWIDTH":
                glyph["DWIDTH"] = {
                  x: +d[1],
                  y: +d[2],
                }
                break

              case "BBX":
                glyph["BBw"] = +d[1]
                glyph["BBh"] = +d[2]
                glyph["BBox"] = +d[3]
                glyph["BBoy"] = +d[4]
                break

              case "ATTRIBUTES":
                break

              case "BITMAP":
                glyph["BITMAP"] = []
                break
            }
          } else {
            // Kept as the hex text, not a number: a row wider than 32 pixels
            // does not fit the 32 bits JavaScript's shift operators work on,
            // and a 40 px glyph came out with its left part missing - FreeUniversal
            // 42's "D", every digit of a 7-segment face (2026-09-30).
            glyph["BITMAP"].bits = line.length * 4
            glyph["BITMAP"].push(line)
          }
        } else {
          this.glyphs[glyph["ENCODING"]] = glyph
          glyph = null
        }
      } else if (properties) {
        if (line !== "ENDPROPERTIES") {
          const spaceIndex = line.indexOf(" ")
          if (spaceIndex > 0) {
            const key = line.substring(0, spaceIndex)
            const value = line.substring(spaceIndex + 1)

            // Check if value is quoted
            if (value.startsWith('"') && value.endsWith('"')) {
              // Remove quotes and store as string
              properties[key] = value.substring(1, value.length - 1)
            } else {
              // Try to parse as number
              const numValue = Number(value)
              properties[key] = isNaN(numValue) ? value : numValue
            }
            console.log(`[BDF Parser] Property: ${key} = ${properties[key]}`)
          }
        } else {
          console.log(`[BDF Parser] ENDPROPERTIES - storing ${Object.keys(properties).length} properties`)
          this.properties = properties
          properties = null
        }
      } else {
        const d = line.split(" ")

        switch (d[0]) {
          case "COMMENT":
            break

          case "FONT":
            this["FONT"] = line.substring(5).trim() // Everything after "FONT "
            break

          case "SIZE":
            this["SIZE"] = {
              size: +d[1],
              xres: +d[2],
              yres: +d[3],
            }
            break

          case "FONTBOUNDINGBOX":
            this["FONTBOUNDINGBOX"] = {
              w: +d[1],
              h: +d[2],
              x: +d[3],
              y: +d[4],
            }
            break

          case "STARTPROPERTIES":
            console.log("[BDF Parser] STARTPROPERTIES")
            properties = {}
            break

          case "CHARS":
            this["CHARS"] = +d[1]
            break

          case "STARTCHAR":
            glyph = {}
            break

          case "ENDCHAR":
            break
        }
      }
    }
  }

  // How far above the baseline the glyphs of *this string* reach.
  //
  // FONT_ASCENT is a typographic metric, not a promise about ink: in
  // helvR18 it is 22 while the dots on Ä Ö Ü reach 23. Clipping a text box
  // to the nominal ascent shaved the accents off every capital umlaut -
  // reported from hardware 2026-08-22, and true in the designer too, which
  // is why nothing caught it: both sides cut the same pixels.
  //
  // Measured per string rather than per font on purpose. helvR18's
  // font-wide maximum is 29, from some stacked diacritic in Latin
  // Extended, so a font-wide figure would grow every label's box by seven
  // pixels including pure ASCII ones that overhang by nothing. The
  // firmware computes the same thing from the same glyphs
  // (BdfFont::inkAscentOf) - if the two disagreed, every accented capital
  // would become a HIL pixel mismatch instead of a fix.
  inkAscentOf(text: string): number {
    let top = 0
    for (const ch of text) {
      const g = this.getGlyphOf(ch.codePointAt(0) ?? 0)
      if (!g || typeof g["BBh"] !== "number" || typeof g["BBoy"] !== "number") continue
      const glyphTop = g["BBh"] + g["BBoy"]
      if (glyphTop > top) top = glyphTop
    }
    return top
  }

  /**
   * How far the last glyph's ink reaches past its advance, in px: drawn at
   * bx + BBox + 1 to bx + BBox + BBw (drawChar's shift), against a cursor
   * that moves DWIDTH. A right-aligned text moves left by it, so its last
   * glyph is not shaved off at the box's edge - luRS10's «%» is 11 px of
   * ink on an advance of 9 (2026-10-30, «jetzt 2 %» in a chart's legend).
   * The firmware's BdfFont::inkRightOverhangOf says the same.
   */
  inkRightOverhangOf(text: string): number {
    const chars = [...text]
    if (chars.length === 0) return 0
    const g = this.getGlyphOf(chars[chars.length - 1].codePointAt(0) ?? 0)
    if (!g || !g["DWIDTH"] || typeof g["BBw"] !== "number" || typeof g["BBox"] !== "number") return 0
    return Math.max(0, g["BBox"] + g["BBw"] + 1 - g["DWIDTH"].x)
  }

  /**
   * 1 for every font until 2026-11-01; 4 for one with BITS_PER_PIXEL 4, whose
   * rows hold one pixel's coverage (0-15) per hex digit
   * (docs/device-contract.md, «Font depth»).
   */
  get bitsPerPixel(): 1 | 4 {
    return this.properties["BITS_PER_PIXEL"] === 4 ? 4 : 1
  }

  getGlyphOf(c: number) {
    const glyph = this.glyphs[c] || this.glyphs[this.properties["DEFAULT_CHAR"]]
    return glyph || null
  }

  drawChar(ctx: CanvasRenderingContext2D, c: number, bx: number, by: number, t?: (g: any) => any) {
    let g = this.getGlyphOf(c)

    if (!g || !g["DWIDTH"]) {
      return { x: bx, y: by }
    }

    if (t) {
      const f: any = () => {}
      f.prototype = g
      g = new f()
      g = t(g)
    }

    const n = g["BBw"]
    const b = g["BITMAP"]
    // Force integer coordinates for pixel-perfect rendering
    // Remove the +1 and -1 offsets that cause fractional positioning
    const ox = Math.round(bx + g["BBox"])
    const oy = Math.round(by - g["BBoy"] - g["BBh"])

    // Ensure pixel-perfect rendering
    ctx.imageSmoothingEnabled = false

    if (this.bitsPerPixel === 4) {
      drawCoverageRows(ctx, b, ox, oy)
      return { x: bx + g["DWIDTH"].x, y: by + g["DWIDTH"].y }
    }

    for (let y = 0, len = b.length; y < len; y++) {
      const row: string = b[y]
      // Bit i counted from the right of the padded row, as before: the loop
      // starts one above the row's width, so the leftmost pixel lands at
      // x = 1. The firmware's BdfFont mirrors that on purpose, and keeping it
      // keeps every existing project's pixels where they are.
      for (let i = b.bits, x = 0; i >= 0; i--, x++) {
        if (bitFromRight(row, i)) {
          ctx.fillRect(ox + x, oy + y, 1, 1)
        }
      }
    }

    return { x: bx + g["DWIDTH"].x, y: by + g["DWIDTH"].y }
  }

  measureText(text: string) {
    const ret = {
      width: 0,
      height: 0,
    }

    for (let i = 0, len = text.length; i < len; i++) {
      const c = text[i].charCodeAt(0)
      const g = this.getGlyphOf(c)
      if (g && g["DWIDTH"]) {
        ret.width += g["DWIDTH"].x
        ret.height += g["DWIDTH"].y
      }
    }

    return ret
  }

  drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t?: (g: any) => any) {
    // Save current canvas state
    ctx.save()
    
    // Set up pixel-perfect rendering
    ctx.imageSmoothingEnabled = false
    ctx.mozImageSmoothingEnabled = false
    ctx.webkitImageSmoothingEnabled = false
    ctx.msImageSmoothingEnabled = false
    
    for (let i = 0, len = text.length; i < len; i++) {
      const c = text[i].charCodeAt(0)
      const r = this.drawChar(ctx, c, x, y, t)
      x = r.x
      y = r.y
    }

    // Restore canvas state
    ctx.restore()

    return { x: x, y: y }
  }

  drawEdgeText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t?: (g: any) => any) {
    this.drawText(ctx, text, x, y, (g) => {
      const bitmap: any = new Array(g["BITMAP"].length + 2)
      bitmap.bits = g["BITMAP"].bits + 2

      for (let i = -1, len = bitmap.length; i < len; i++) {
        bitmap[i + 1] =
          g["BITMAP"][i] |
          (g["BITMAP"][i] >> 1) |
          (g["BITMAP"][i] >> 2) |
          g["BITMAP"][i + 1] |
          (g["BITMAP"][i + 1] >> 1) |
          (g["BITMAP"][i + 1] >> 2) |
          g["BITMAP"][i - 1] |
          (g["BITMAP"][i - 1] >> 1) |
          (g["BITMAP"][i - 1] >> 2)
      }

      g["BITMAP"] = bitmap
      g["BBox"] += -3
      g["BBoy"] += 1

      return g
    })
  }
}

// Bit `i` of a hex row, counted from the right end (the last hex digit's
// lowest bit is 0); 0 beyond the row. Reads one digit, so a row may be as
// wide as a glyph is.
function bitFromRight(row: string, i: number): number {
  const digit = row.length - 1 - (i >> 2)
  if (i < 0 || digit < 0) return 0
  return (Number.parseInt(row[digit], 16) >> (i & 3)) & 1
}

/**
 * One 4-bit glyph's rows. Pixel i of a row lands at ox + 1 + i - the 1-bit
 * loop's one-to-the-right, so both kinds of font sit on the same pixels, and
 * the firmware's BdfFont::drawCoverageRow does the same.
 *
 * Where the canvas is drawn at 1:1 - the reference render every board is
 * compared against - an edge pixel is mixed into what is already there in
 * RGB565, as the board mixes it (blendCoverage565), and full coverage is the
 * ink as it is. The zoomed editor canvas cannot be read back pixel for pixel
 * and gets the ink at the coverage's opacity instead, as the pills' glow does
 * (paint-pills.ts, underOf).
 */
function drawCoverageRows(ctx: CanvasRenderingContext2D, rows: string[], ox: number, oy: number): void {
  const height = rows.length
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0)
  if (width === 0 || height === 0) return
  const style = ctx.fillStyle
  const alpha = ctx.globalAlpha
  const t = ctx.getTransform()
  const exact = t.a === 1 && t.d === 1 && t.b === 0 && t.c === 0 && Number.isInteger(t.e) && Number.isInteger(t.f)
  const ink = exact ? inkOf(style) : null
  const under = ink ? ctx.getImageData(ox + 1 + t.e, oy + t.f, width, height).data : null
  if (drawCoverageImage(ctx, rows, ox, oy, width, height, style, alpha, ink, under)) return
  for (let y = 0; y < height; y++) {
    const row = rows[y]
    for (let i = 0; i < row.length; i++) {
      const a = Number.parseInt(row[i], 16)
      if (!a) continue
      if (a === 15) {
        ctx.fillStyle = style
        ctx.globalAlpha = alpha
      } else if (ink && under) {
        const k = (y * width + i) * 4
        const mixed = blendCoverage565(rgb565FromBytes(under[k], under[k + 1], under[k + 2]), ink, a)
        ctx.fillStyle = hexOf(fromRgb565(mixed))
        ctx.globalAlpha = alpha
      } else {
        ctx.fillStyle = style
        ctx.globalAlpha = (alpha * a) / 15
      }
      ctx.fillRect(ox + 1 + i, oy + y, 1, 1)
    }
  }
  ctx.fillStyle = style
  ctx.globalAlpha = alpha
}

// The glyph as one picture, put down with one drawImage: what the loop below
// draws pixel by pixel - a fillRect and a colour string for every edge pixel
// - made a large project's preview miss its 1000 ms for a click at 10x CPU
// once its texts were in 4-bit faces (2026-11-02: 2283 ms, test:all). The
// pixels are the same: at 1:1 full coverage is the text colour and an edge
// the RGB565 mix, each opaque, and a pixel without ink is left clear, so
// drawImage copies them exactly and keeps to the clip; zoomed, the ink at
// the coverage's opacity, without smoothing. Where there is no canvas to
// draw the picture on (a test's stand-in), or the colour is not a plain
// opaque one, false, and the loop draws.
let scratch: HTMLCanvasElement | OffscreenCanvas | null | undefined
function scratchOf(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (scratch === undefined) {
    scratch =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : null
  }
  if (!scratch) return null
  if (scratch.width < width) scratch.width = width
  if (scratch.height < height) scratch.height = height
  return scratch
}

function drawCoverageImage(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  ox: number,
  oy: number,
  width: number,
  height: number,
  style: string | CanvasGradient | CanvasPattern,
  alpha: number,
  ink: Rgb565 | null,
  under: Uint8ClampedArray | null,
): boolean {
  if (typeof ctx.drawImage !== "function") return false
  const colour = opaqueBytesOf(style)
  if (!colour) return false
  const canvas = scratchOf(width, height)
  const sctx = canvas?.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
  if (!canvas || !sctx) return false
  const image = sctx.createImageData(width, height)
  const px = image.data
  for (let y = 0; y < height; y++) {
    const row = rows[y]
    for (let i = 0; i < row.length; i++) {
      const a = Number.parseInt(row[i], 16)
      if (!a) continue
      const k = (y * width + i) * 4
      if (a === 15 || !(ink && under)) {
        px[k] = colour.r
        px[k + 1] = colour.g
        px[k + 2] = colour.b
        px[k + 3] = a === 15 ? 255 : Math.round((a * 255) / 15)
      } else {
        const mixed = fromRgb565(blendCoverage565(rgb565FromBytes(under[k], under[k + 1], under[k + 2]), ink, a))
        px[k] = mixed.r
        px[k + 1] = mixed.g
        px[k + 2] = mixed.b
        px[k + 3] = 255
      }
    }
  }
  sctx.putImageData(image, 0, 0)
  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha = alpha
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, width, height, ox + 1, oy, width, height)
  ctx.imageSmoothingEnabled = smoothing
  return true
}

// A plain opaque colour's bytes: "#rrggbb", or "rgb(r, g, b)" / "rgba(r, g, b, 1)".
function opaqueBytesOf(style: string | CanvasGradient | CanvasPattern): { r: number; g: number; b: number } | null {
  if (typeof style !== "string") return null
  if (/^#[0-9a-f]{6}$/i.test(style)) {
    return { r: parseInt(style.slice(1, 3), 16), g: parseInt(style.slice(3, 5), 16), b: parseInt(style.slice(5, 7), 16) }
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(style)
  if (!m || (m[4] !== undefined && Number(m[4]) !== 1)) return null
  return { r: +m[1], g: +m[2], b: +m[3] }
}

// The text colour as the board holds it: a canvas reports an opaque colour as
// "#rrggbb", a translucent one as "rgba(r, g, b, a)".
function inkOf(style: string | CanvasGradient | CanvasPattern): Rgb565 | null {
  if (typeof style !== "string") return null
  if (style.startsWith("#")) return toRgb565(style)
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style)
  return m ? rgb565FromBytes(+m[1], +m[2], +m[3]) : null
}

function hexOf(c: { r: number; g: number; b: number }): string {
  return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")
}
