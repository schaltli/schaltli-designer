// Where this suite's BDF font bytes come from: the firmware repo's own
// ddf-source, which is what the device itself serves and loads.
//
// Two callers need this and they need the SAME answer. The orchestrator
// injects the bytes before rendering the designer's reference image, and
// the fixture builder injects them before the export bakes a SoftwareButton
// bitmap. When only one of them had them, the reference drew real helvR12
// glyphs while the baked bitmap fell back to a generic canvas font, and the
// device - which faithfully blits whatever was baked - differed from the
// reference by 698 pixels on the word "SENDEN" (2026-08-25). Neither side
// was wrong on its own; they were reading different fonts.
//
// The project's own font entries carry only metrics (id, internalName,
// size, ascent, descent) - the bytes live in the DDF, because that is where
// the device gets them and a project zip that also shipped them would be
// carrying a second copy of the same file.

const fs = require("fs")
const path = require("path")

const DDF_SOURCE_DIR = path.join(__dirname, "../../../screenbee-waveshare-1v8/ddf-source")

// Returns a copy of `fonts` with `data` filled in from the DDF source.
// Fonts that already carry their own bytes are left alone.
//
// Deliberately does NOT set `path`: lib/project-zip.ts only writes a font
// file into the export when BOTH data and path are present, so leaving it
// unset means the bake gets real glyphs while the zip stays free of fonts
// the device already has.
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
    if (!ddfFont) throw new Error(`Font "${font.id}" (internalName "${font.internalName}") is not in the DDF`)
    const fontPath = path.join(DDF_SOURCE_DIR, ddfFont.file)
    if (!fs.existsSync(fontPath)) throw new Error(`DDF source is missing "${ddfFont.file}" for font "${font.id}"`)
    return { ...font, data: fs.readFileSync(fontPath, "utf8") }
  })
}

module.exports = { DDF_SOURCE_DIR, withDdfFontData }
