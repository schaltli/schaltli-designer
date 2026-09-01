import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

// scripts/u8g2-font-to-bdf.js turns a compiled U8g2 font (the C array the
// firmware links against) into a BDF the designer can rasterise. The point of
// deriving one from the other, rather than generating both from the original
// TTF, is that the two sides then cannot disagree: it is the same data, not a
// second rasterisation of the same outlines.
//
// That claim is only worth anything if the decoder is correct, and helvR24 is
// where it can be proved: upstream publishes both the compiled font and the
// original BDF it was built from. Every other font this converter will be
// used for - the large ones, FreeUniversal and logisoso, which exist only as
// compiled arrays and are the reason the converter exists at all - has no
// such reference. So this one font carries the whole guarantee.
//
// Fixtures are upstream's own files, taken from olikraus/u8g2 at
// tools/font/build/single_font_files/ and tools/font/bdf/. The reference is
// trimmed to the 191 glyphs the _tf subset carries, which is what can be
// compared, not weakened in any other way.
const { extractFont, decodeFont, toBdf } = require("../scripts/u8g2-font-to-bdf.js")

const FIXTURES = path.join(__dirname, "fixtures", "u8g2")

interface Glyph {
  enc: number
  w: number
  h: number
  x: number
  y: number
  rows: string[]
}

function parseBdf(text: string): Map<number, Glyph> {
  const glyphs = new Map<number, Glyph>()
  let cur: Partial<Glyph> & { rows: string[] } | null = null
  let inBitmap = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith("STARTCHAR")) {
      cur = { rows: [] }
      inBitmap = false
      continue
    }
    if (!cur) continue
    if (line.startsWith("ENCODING")) cur.enc = parseInt(line.split(/\s+/)[1], 10)
    else if (line.startsWith("BBX")) {
      const p = line.split(/\s+/)
      cur.w = +p[1]
      cur.h = +p[2]
      cur.x = +p[3]
      cur.y = +p[4]
    } else if (line === "BITMAP") inBitmap = true
    else if (line === "ENDCHAR") {
      if (cur.enc !== undefined) glyphs.set(cur.enc, cur as Glyph)
      cur = null
      inBitmap = false
    } else if (inBitmap && /^[0-9A-Fa-f]+$/.test(line)) cur.rows.push(line)
  }
  return glyphs
}

// Set of lit pixels in coordinates relative to the origin on the baseline.
//
// Compared this way rather than field by field on purpose: bdfconv trims
// empty rows and columns off a glyph when it compiles it, so the bounding
// boxes legitimately differ while the drawn result is the same. What has to
// match is where the ink lands, which is what a reader sees and what a HIL
// pixel comparison measures.
function ink(g: Glyph): Set<string> {
  const set = new Set<string>()
  for (let r = 0; r < g.rows.length; r++) {
    const bits = g.rows[r]
    for (let c = 0; c < g.w; c++) {
      const byte = parseInt(bits.substr((c >> 3) * 2, 2), 16)
      if ((byte >> (7 - (c & 7))) & 1) set.add(`${g.x + c},${g.y + g.h - 1 - r}`)
    }
  }
  return set
}

test.describe("u8g2 font to BDF", () => {
  test("every glyph decoded from the compiled font matches upstream's original BDF", () => {
    const cSource = fs.readFileSync(path.join(FIXTURES, "u8g2_font_helvR24_tf.c"), "latin1")
    const generated = parseBdf(toBdf("u8g2_font_helvR24_tf", decodeFont(extractFont(cSource, "u8g2_font_helvR24_tf"))))
    const reference = parseBdf(fs.readFileSync(path.join(FIXTURES, "helvR24-upstream.bdf"), "utf8"))

    // The count is asserted too: a decoder that silently stopped early would
    // otherwise pass by comparing only the glyphs it managed to read. The
    // first version of this converter did exactly that - a semicolon inside
    // the font's own printable bytes ended its scan for the end of the C
    // array, and it produced 27 of 191 glyphs, all of them correct.
    expect(generated.size).toBe(191)
    expect(reference.size).toBe(191)

    const differing: number[] = []
    for (const [enc, g] of generated) {
      const ref = reference.get(enc)
      expect(ref, `encoding ${enc} missing from the reference`).toBeDefined()
      const a = ink(g)
      const b = ink(ref!)
      let equal = a.size === b.size
      if (equal) for (const p of a) if (!b.has(p)) { equal = false; break }
      if (!equal) differing.push(enc)
    }
    expect(differing, `glyphs whose ink differs: ${differing.join(", ")}`).toEqual([])
  })

  test("header metrics survive the round trip", () => {
    const cSource = fs.readFileSync(path.join(FIXTURES, "u8g2_font_helvR24_tf.c"), "latin1")
    const font = decodeFont(extractFont(cSource, "u8g2_font_helvR24_tf"))
    // Values read straight out of the compiled header, which is what a DDF's
    // font entry has to declare for the designer to lay text out the same way
    // the firmware does.
    expect(font.header.glyphCount).toBe(191)
    expect(font.header.maxWidth).toBe(31)
    expect(font.header.maxHeight).toBe(38)
    expect(font.header.ascentA).toBe(25)
    expect(font.header.descentG).toBe(-7)
  })
})
