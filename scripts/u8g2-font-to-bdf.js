#!/usr/bin/env node
//
// Converts a compiled U8g2 font (the C array shipped in u8g2_fonts.c, or one
// of upstream's single_font_files/*.c) into a BDF file.
//
// WHY THIS EXISTS
//
// A DDF ships .bdf files that the designer rasterises, while the firmware
// draws the same text from U8g2's own compiled font data. Those two have to
// produce identical pixels or the HIL comparisons the whole rendering stack
// rests on mean nothing.
//
// For the X11 families (helvR, courR, ncenB...) upstream publishes the
// original .bdf, so both sides trivially agree - that is where the existing
// DDF fonts come from. But those families stop at 24px, which is 2.8mm on a
// 800x480 4.3" panel and unreadable across a vehicle. Every larger U8g2 font
// (logisoso up to 92, FreeUniversal up to 49) is generated from TTF and only
// ever published as the compiled array.
//
// Regenerating those from the TTF with otf2bdf, using the parameters
// upstream documents in tools/font/build/build.c, would be a reproduction -
// but only as exact as the otf2bdf build being identical, which is a silent
// failure mode. Deriving the .bdf from the compiled bytes instead makes the
// two sides identical *by construction*: it is the same data the firmware
// renders, not a second rasterisation of the same outlines.
//
// FORMAT
//
// Read out of upstream's own decoder, csrc/u8g2_font.c, rather than from
// documentation:
//   header, 23 bytes: glyph_cnt, bbx_mode, bits_per_0, bits_per_1,
//     bits_per_char_width, _height, _x, _y, bits_per_delta_x,
//     max_char_width, max_char_height, x_offset, y_offset,
//     ascent_A, descent_g, ascent_para, descent_para,
//     start_pos_upper_A (word), start_pos_lower_a (word),
//     start_pos_unicode (word)
//   then glyph entries: [encoding][total size][data...], size 0 ends the run
//   per glyph: width, height (unsigned), x, y, delta_x (signed), then pairs
//     of (run of background, run of foreground) repeated while the next
//     single bit is 1, wrapping to the next row at glyph width.
//
// Usage:
//   node scripts/u8g2-font-to-bdf.js <font.c> <u8g2_font_name> [out.bdf]

const fs = require("fs")
const path = require("path")

// --------------------------------------------------------------- C literals

// U8g2 emits the font as one or more adjacent C string literals, using octal
// escapes for anything unprintable. Anything that is not an escape is its own
// byte, so this cannot go through JSON or a regex on \\d+ alone.
//
// Reads consecutive literals from `from` and stops at the first character
// that is neither whitespace nor a literal - i.e. the terminating semicolon.
// Deliberately NOT bounded by searching for that semicolon in the text: the
// font data contains printable bytes, ";" among them, so a textual search
// truncates the array. That cut this font off after 838 of 6839 bytes.
function parseCStringLiterals(source, from = 0) {
  const bytes = []
  let i = from
  for (;;) {
    while (i < source.length && /\s/.test(source[i])) i++
    if (source[i] !== '"') break
    i++ // opening quote
    while (i < source.length && source[i] !== '"') {
      if (source[i] === "\\") {
        i++
        const c = source[i]
        if (c >= "0" && c <= "7") {
          // Octal, one to three digits.
          let digits = ""
          while (digits.length < 3 && source[i] >= "0" && source[i] <= "7") {
            digits += source[i]
            i++
          }
          bytes.push(parseInt(digits, 8) & 0xff)
          continue
        }
        const simple = { n: 10, r: 13, t: 9, b: 8, f: 12, v: 11, a: 7, "\\": 92, '"': 34, "'": 39, "?": 63, "0": 0 }
        if (c === "x") {
          i++
          let hex = ""
          while (/[0-9a-fA-F]/.test(source[i])) {
            hex += source[i]
            i++
          }
          bytes.push(parseInt(hex, 16) & 0xff)
          continue
        }
        if (c in simple) {
          bytes.push(simple[c])
          i++
          continue
        }
        // Unknown escape: take the character itself, which is what C does
        // for implementation-defined escapes.
        bytes.push(c.charCodeAt(0) & 0xff)
        i++
        continue
      }
      bytes.push(source.charCodeAt(i) & 0xff)
      i++
    }
    i++ // closing quote
  }
  return Uint8Array.from(bytes)
}

function extractFont(cSource, fontName) {
  // The declaration runs from the array name to the terminating semicolon.
  // u8g2_fonts.c writes `name[] U8G2_FONT_SECTION(...) =` while the
  // single_font_files variants write an explicit length, `name[6839]`, so
  // both bracket forms have to match.
  const decl = new RegExp(`\\b${fontName}\\s*\\[\\s*\\d*\\s*\\]`)
  const match = decl.exec(cSource)
  if (!match) throw new Error(`font "${fontName}" not found in source`)
  const eq = cSource.indexOf("=", match.index)
  if (eq < 0) throw new Error(`malformed declaration for "${fontName}"`)
  return parseCStringLiterals(cSource, eq + 1)
}

// ------------------------------------------------------------------ decoding

function signed(byte) {
  return byte > 127 ? byte - 256 : byte
}

function readHeader(d) {
  return {
    glyphCount: d[0],
    bbxMode: d[1],
    bitsPer0: d[2],
    bitsPer1: d[3],
    bitsPerWidth: d[4],
    bitsPerHeight: d[5],
    bitsPerX: d[6],
    bitsPerY: d[7],
    bitsPerDeltaX: d[8],
    maxWidth: d[9],
    maxHeight: d[10],
    xOffset: signed(d[11]),
    yOffset: signed(d[12]),
    ascentA: signed(d[13]),
    descentG: signed(d[14]),
    ascentPara: signed(d[15]),
    descentPara: signed(d[16]),
  }
}

class BitReader {
  constructor(data, offset) {
    this.data = data
    this.byte = offset
    this.bit = 0
  }
  unsigned(count) {
    // Mirrors u8g2_font_decode_get_unsigned_bits: little-endian within the
    // byte, spilling into the next one.
    let value = this.data[this.byte] >> this.bit
    const end = this.bit + count
    if (end >= 8) {
      this.byte++
      value |= this.data[this.byte] << (8 - this.bit)
      this.bit = end - 8
    } else {
      this.bit = end
    }
    return value & ((1 << count) - 1)
  }
  signed(count) {
    // u8g2_font_decode_get_signed_bits: unsigned value biased by half range.
    return this.unsigned(count) - (1 << (count - 1))
  }
}

function decodeGlyph(data, offset, header) {
  const r = new BitReader(data, offset)
  const width = r.unsigned(header.bitsPerWidth)
  const height = r.unsigned(header.bitsPerHeight)
  const x = r.signed(header.bitsPerX)
  const y = r.signed(header.bitsPerY)
  const deltaX = r.signed(header.bitsPerDeltaX)

  const rows = []
  for (let i = 0; i < height; i++) rows.push(new Uint8Array(width))

  if (width > 0 && height > 0) {
    let px = 0
    let py = 0
    const emit = (count, value) => {
      // Runs wrap at the glyph's right edge onto the next row, exactly as
      // u8g2_font_decode_len does.
      let remaining = count
      while (remaining > 0) {
        if (py >= height) return
        const room = width - px
        const take = remaining < room ? remaining : room
        if (value) for (let i = 0; i < take; i++) rows[py][px + i] = 1
        px += take
        remaining -= take
        if (px >= width) {
          px = 0
          py++
        }
      }
    }
    for (;;) {
      const a = r.unsigned(header.bitsPer0)
      const b = r.unsigned(header.bitsPer1)
      do {
        emit(a, 0)
        emit(b, 1)
      } while (r.unsigned(1) !== 0)
      if (py >= height) break
    }
  }

  return { width, height, x, y, deltaX, rows }
}

function decodeFont(data) {
  const header = readHeader(data)
  const glyphs = []
  let p = 23
  while (p < data.length) {
    const encoding = data[p]
    const size = data[p + 1]
    if (size === 0) break
    glyphs.push({ encoding, ...decodeGlyph(data, p + 2, header) })
    p += size
  }
  return { header, glyphs }
}

// ------------------------------------------------------------------- output

function toBdf(fontName, font) {
  const { header, glyphs } = font
  const ascent = header.ascentPara || header.ascentA
  const descent = header.descentPara || header.descentG
  const out = []
  out.push("STARTFONT 2.1")
  out.push(`COMMENT Generated by scripts/u8g2-font-to-bdf.js from ${fontName}.`)
  out.push("COMMENT Derived from the compiled U8g2 font data, not re-rasterised,")
  out.push("COMMENT so designer and firmware draw identical pixels by construction.")
  out.push(`FONT -u8g2-${fontName}-medium-r-normal--${header.maxHeight}-0-0-0-p-0-iso10646-1`)
  out.push(`SIZE ${header.maxHeight} 72 72`)
  out.push(
    `FONTBOUNDINGBOX ${header.maxWidth} ${header.maxHeight} ${header.xOffset} ${header.yOffset}`
  )
  out.push("STARTPROPERTIES 2")
  out.push(`FONT_ASCENT ${ascent}`)
  out.push(`FONT_DESCENT ${Math.abs(descent)}`)
  out.push("ENDPROPERTIES")
  out.push(`CHARS ${glyphs.length}`)

  for (const g of glyphs) {
    out.push(`STARTCHAR U+${g.encoding.toString(16).toUpperCase().padStart(4, "0")}`)
    out.push(`ENCODING ${g.encoding}`)
    out.push("SWIDTH 0 0")
    out.push(`DWIDTH ${g.deltaX} 0`)
    out.push(`BBX ${g.width} ${g.height} ${g.x} ${g.y}`)
    out.push("BITMAP")
    for (const row of g.rows) {
      const bytesPerRow = Math.ceil(g.width / 8)
      const bytes = new Uint8Array(bytesPerRow)
      for (let i = 0; i < g.width; i++) {
        if (row[i]) bytes[i >> 3] |= 0x80 >> (i & 7)
      }
      out.push(Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(""))
    }
    out.push("ENDCHAR")
  }
  out.push("ENDFONT")
  return out.join("\n") + "\n"
}

// --------------------------------------------------------------------- main

if (require.main === module) {
  const [source, fontName, outPath] = process.argv.slice(2)
  if (!source || !fontName) {
    console.error("usage: node scripts/u8g2-font-to-bdf.js <font.c> <u8g2_font_name> [out.bdf]")
    process.exit(2)
  }
  const data = extractFont(fs.readFileSync(source, "latin1"), fontName)
  const font = decodeFont(data)
  const bdf = toBdf(fontName, font)
  const target = outPath || path.join(path.dirname(source), fontName + ".bdf")
  fs.writeFileSync(target, bdf)
  console.log(
    `${fontName}: ${font.glyphs.length} glyphs, bbox ${font.header.maxWidth}x${font.header.maxHeight}, ` +
      `ascent ${font.header.ascentA}, descent ${font.header.descentG} -> ${target}`
  )
}

module.exports = { extractFont, decodeFont, toBdf, parseCStringLiterals }
