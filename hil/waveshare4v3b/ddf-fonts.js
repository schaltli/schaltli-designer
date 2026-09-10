// Where this board's BDF font bytes come from: the firmware repo's own
// ddf-source-4v3b, which is what the device serves and loads.
//
// A copy of hil/waveshare/ddf-fonts.js pointed at the other DDF, rather than
// a shared module taking a directory - the two boards' suites are meant to be
// readable one at a time, and the knob's file carries a paragraph of history
// about a 698-pixel difference that is about the knob and would only confuse
// a reader here.
//
// The project's own font entries carry only metrics (id, internalName, size,
// ascent, descent). The bytes live in the DDF, because that is where the
// device gets them and a project zip that also shipped them would be carrying
// a second copy of the same file.

const fs = require("fs")
const path = require("path")

const DDF_SOURCE_DIR = path.join(__dirname, "../../../screenbee-waveshare-1v8/ddf-source-4v3b")

// Returns a copy of `fonts` with `data` filled in from the DDF source.
// Fonts that already carry their own bytes are left alone.
function withDdfFontData(fonts) {
  const devicePath = path.join(DDF_SOURCE_DIR, "device.json")
  if (!fs.existsSync(devicePath)) {
    throw new Error(`DDF source not found at ${DDF_SOURCE_DIR} - check out screenbee-waveshare-1v8 alongside this repo`)
  }
  const ddfDevice = JSON.parse(fs.readFileSync(devicePath, "utf8"))
  const byInternalName = new Map((ddfDevice.fonts || []).map((f) => [f.internalName, f]))

  return (fonts || []).map((font) => {
    if (font.data) return font
    const ddfFont = byInternalName.get(font.internalName)
    if (!ddfFont) throw new Error(`Font "${font.id}" (internalName "${font.internalName}") is not in this board's DDF`)
    const fontPath = path.join(DDF_SOURCE_DIR, ddfFont.file)
    if (!fs.existsSync(fontPath)) throw new Error(`DDF source is missing "${ddfFont.file}" for font "${font.id}"`)
    return { ...font, data: fs.readFileSync(fontPath, "utf8") }
  })
}

module.exports = { DDF_SOURCE_DIR, withDdfFontData }
