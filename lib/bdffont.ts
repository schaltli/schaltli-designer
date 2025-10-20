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
            glyph["BITMAP"].bits = line.length * 4
            glyph["BITMAP"].push(Number.parseInt(line, 16))
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

    for (let y = 0, len = b.length; y < len; y++) {
      const l = b[y]
      for (let i = b.bits, x = 0; i >= 0; i--, x++) {
        if ((l >> i) & (0x01 == 1)) {
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

