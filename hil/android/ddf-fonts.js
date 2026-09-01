// Where this suite's font bytes come from: the Android app's own
// ddf-source/, which is what the designer ships as this device's DDF and
// therefore what a real project on this device is built against.
//
// Same argument as hil/waveshare/ddf-fonts.js, one platform over. Two
// callers need the SAME answer: the fixture builder injects the bytes so the
// export writes a real assets/fonts/Roboto.ttf, and the orchestrator needs
// the same face registered before it renders the designer's reference image.
// When only one of them has it, the reference draws real Roboto glyphs while
// the other side falls back to a generic sans - neither is wrong on its own,
// they are reading different fonts, and every glyph differs.
//
// A project's own font entries carry only metrics (id, internalName, size,
// ascent, descent); the bytes live in the DDF. Unlike the firmware suites,
// the Android export DOES write the file into the bundle - the app has no
// compiled-in copy to fall back on, so `path` is what it loads from.

const fs = require("fs");
const path = require("path");

const DDF_SOURCE_DIR = path.join(__dirname, "../../../ScreensmithAndroid/ddf-source");

/**
 * Returns a copy of `fonts` with `data` filled in from the DDF source, as the
 * data: URL a real DDF-loaded ProjectFont carries. Fonts that already have
 * their own bytes are left alone.
 */
function withDdfFontData(fonts) {
  const devicePath = path.join(DDF_SOURCE_DIR, "device.json");
  if (!fs.existsSync(devicePath)) {
    throw new Error(
      `DDF source not found at ${DDF_SOURCE_DIR} - check out ScreensmithAndroid alongside this repo`,
    );
  }
  const ddfDevice = JSON.parse(fs.readFileSync(devicePath, "utf8"));
  const byId = new Map((ddfDevice.fonts || []).map((f) => [f.id, f]));

  return (fonts || []).map((font) => {
    if (font.data) return font;
    const ddfFont = byId.get(font.id);
    if (!ddfFont) {
      throw new Error(`font "${font.id}" is not declared in ${devicePath}`);
    }
    const filePath = path.join(DDF_SOURCE_DIR, ddfFont.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`font file ${ddfFont.file} for "${font.id}" is missing from the DDF source`);
    }
    const base64 = fs.readFileSync(filePath).toString("base64");
    return {
      ...font,
      name: ddfFont.internalName,
      internalName: ddfFont.internalName,
      displayName: ddfFont.displayName,
      size: ddfFont.size,
      ascent: ddfFont.ascent,
      descent: ddfFont.descent,
      format: "ttf",
      data: `data:font/ttf;base64,${base64}`,
    };
  });
}

/** Every font the DDF declares, as project font entries with their bytes attached. */
function allDdfFonts() {
  const devicePath = path.join(DDF_SOURCE_DIR, "device.json");
  if (!fs.existsSync(devicePath)) {
    throw new Error(
      `DDF source not found at ${DDF_SOURCE_DIR} - check out ScreensmithAndroid alongside this repo`,
    );
  }
  const ddfDevice = JSON.parse(fs.readFileSync(devicePath, "utf8"));
  return withDdfFontData((ddfDevice.fonts || []).map((f) => ({ id: f.id })));
}

module.exports = { withDdfFontData, allDdfFonts, DDF_SOURCE_DIR };
