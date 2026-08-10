// Builds a single project.json + BDF fonts + hand-built 24bpp BMP icon
// assets covering every M5 Dial-supported object type that's tractable to
// hand-build directly, mirroring hil/epaper/fixtures/build-comprehensive-test.js's
// same rationale and its own "hand-built rather than exported from the
// running app" reasoning. Covers: box (with rounded corners + inset
// border), label, MqttDataField, level-indicator, line, icon, MQTTIconField
// - 7 of the 8 types public/ddf/m5stack-m5dial.ddf.zip's supportedObjectTypes
// declares.
//
// SoftwareButton is deliberately NOT covered here: ColorScreenRenderer.cpp's
// renderSoftwareButton() draws obj.pathNormal directly, and that bitmap is
// "already fully rendered by the designer's export (drop shadow, border,
// label text baked in)" per its own header comment - i.e. it's produced by
// lib/asset-export.ts's SoftwareButtonExport bake step, not something this
// hand-built fixture can reproduce byte-for-byte without driving the real
// app UI + export pipeline. Tracked as a known coverage gap, not silently
// skipped - revisit by driving a real "Export Project"/deploy flow through
// Playwright (see e2e/master-screen.spec.ts's own comment on
// buildDeviceProjectZip being "the only real path that serializes a
// project for a device to read") if SoftwareButton needs HIL coverage.
//
// "line" is deliberately built with strokeWidth 1, filletRadius 0, no
// arrowStart/arrowEnd (a single straight 2-point segment) - unlike the
// e-paper fixture's fillet/arrowhead-exercising line, because
// ColorScreenRenderer::renderLine() (2026-08-10) only implements the plain
// canvas_->drawLine() case so far ("no fillet/arrowhead/thick-line yet,
// tracked as follow-up work" per its own header comment) - testing the
// fancier line features here would just be asserting a real, known,
// already-documented gap as a failure. Revisit once that firmware gap
// closes.
//
// Color quantization: unlike the e-paper target (project.settings.colorDepth
// "1bit", which lib/color-depth.ts's applyColorDepth() already quantizes
// for in the shared renderer), there is no "16bit"/"rgb565" colorDepth mode
// in this codebase - the M5 Dial DDF declares colorDepth "24bit" (meaning:
// don't restrict the user's color choices at design time), but the actual
// hardware canvas (ClippedCanvas16/GFXcanvas16) is genuinely RGB565
// internally. ColorScreenRenderer::parseHexColor() truncates every color to
// 5/6/5 bits on the way in, and TestInterfaceServer::sendBMP() expands
// RGB565 back to 8-bit-per-channel via bit replication
// (r8=(r5<<3)|(r5>>2), not naive left-shift-only scaling) on the way out
// for the snapshot. Since the designer's headless reference render applies
// no quantization at all for colorDepth "24bit", every color used here is
// pre-passed through the exact same truncate+expand transform
// (rgb565Safe() below) so both sides already agree on a fixed point of
// that transform - not a workaround, just supplying colors that were
// always going to survive the hardware's real color depth unchanged.
//
// Run: node hil/m5dial/fixtures/build-comprehensive-test.js
// Produces: hil/m5dial/fixtures/comprehensive-test.zip
//
// Then: node hil/m5dial/orchestrator.js --project hil/m5dial/fixtures/comprehensive-test.zip --device <ip>

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const OUT_PATH = path.join(__dirname, "comprehensive-test.zip");

const FONTS = [
  { id: "font-helvR08", displayName: "Helvetica 8px", internalName: "u8g2_font_helvR08_tf", file: "fonts/helvR08.bdf", size: 12, ascent: 10, descent: 2 },
];

// Quantizes an 8-bit-per-channel hex color to RGB565 (truncation, matching
// ColorScreenRenderer::parseHexColor()) and expands it straight back to
// 8-bit (bit replication, matching TestInterfaceServer::sendBMP()) - the
// fixed point of that round trip is what the real hardware will actually
// display and report back in a snapshot, regardless of what was asked for.
function rgb565Safe(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const r5 = r >> 3, g6 = g >> 2, b5 = b >> 3;
  const r8 = (r5 << 3) | (r5 >> 2);
  const g8 = (g6 << 2) | (g6 >> 4);
  const b8 = (b5 << 3) | (b5 >> 2);
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return { hex: `#${toHex(r8)}${toHex(g8)}${toHex(b8)}`, r: r8, g: g8, b: b8 };
}

const BLACK = rgb565Safe("#000000"); // already a fixed point (0,0,0)
const WHITE = rgb565Safe("#ffffff"); // already a fixed point (255,255,255)
const BOX_FILL = rgb565Safe("#e5e5e5");
const BORDER = rgb565Safe("#cccccc");
const LEVEL_FILL = rgb565Safe("#4caf50");

// Standard 24bpp BITMAPINFOHEADER, uncompressed, bottom-up, no palette -
// exactly what ColorAssetLoader::drawBMPToCanvas() requires (signature
// 'BM', dataOffset at byte 10, width/height at 18/22 as positive
// = bottom-up, bpp==24 at byte 28, rows padded to a 4-byte boundary,
// B/G/R byte order per pixel) - the same layout
// TestInterfaceServer::generateBMPHeader() produces for snapshots, just
// built by hand here since this is the input side, not the output side.
function buildBMP24(size, pixelFn) {
  const rowBytes = size * 3;
  const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
  const dataSize = paddedRowBytes * size;
  const fileSize = 54 + dataSize;
  const buf = Buffer.alloc(fileSize);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  buf.writeUInt32LE(40, 14); // DIB header size
  buf.writeInt32LE(size, 18);
  buf.writeInt32LE(size, 22); // positive height = bottom-up
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bpp
  buf.writeUInt32LE(0, 30); // no compression
  buf.writeUInt32LE(dataSize, 34);

  for (let row = 0; row < size; row++) {
    // BMP rows are stored bottom-up: file row 0 is image row (size - 1).
    const y = size - 1 - row;
    const rowOffset = 54 + row * paddedRowBytes;
    for (let x = 0; x < size; x++) {
      const { r, g, b } = pixelFn(x, y);
      const off = rowOffset + x * 3;
      buf[off] = b;
      buf[off + 1] = g;
      buf[off + 2] = r;
    }
  }
  return buf;
}

function svgDataUrl(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${inner}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

// Both variants below are built from axis-aligned rectangles only, on
// purpose - the designer's generic icon renderer (render-icon.ts /
// render-mqtt-field.ts) draws the SVG via ctx.drawImage(), which is always
// anti-aliased for anything curved (unlike render-box.ts/render-line.ts's
// deliberately non-AA pixel-exact paths). A rect at integer coordinates is
// pixel-exact even through drawImage, so sticking to rects here is what
// keeps this comparable pixel-for-pixel against the firmware's raw BMP
// blit, same reasoning the e-paper fixture's own lock/unlock icons already
// rely on.
//
// Every pixel gets a real color (no transparency) - ColorAssetLoader::
// drawBMPToCanvas() blits every pixel of the bitmap unconditionally (BMP
// has no alpha channel), so the SVG side needs an opaque background fill
// too, not a transparent one, wherever the icon's own foreground shape
// doesn't cover - matching against this fixture's white (already
// RGB565-safe) screen background.
function iconIsBlack_lock(x, y) {
  return true; // solid square
}
function iconIsBlack_unlock(x, y) {
  // Black 20x20 square inset on a white background - matches the SVG
  // variant below exactly (a white rect, then a black rect drawn on top at
  // 10,10). This used to be inverted (`!(...)`, black everywhere EXCEPT a
  // white "cut out" square) - a real mismatch against its own SVG sibling,
  // caught by the M5 Dial HIL run itself (device correctly rendered the
  // BMP as built, black margin/white center; the designer reference
  // correctly rendered the SVG's actual white margin/black center - a bug
  // in this fixture script, not in either renderer).
  return x >= 10 && x < 30 && y >= 10 && y < 30;
}
// A plus/cross built from two overlapping axis-aligned bars - visually
// distinct from the lock/unlock squares, still rect-only.
function iconIsBlack_mark(x, y) {
  return (x >= 15 && x < 25) || (y >= 15 && y < 25);
}

function makeIconAssets() {
  const lock = {
    id: "icon-lock", name: "lock (solid)",
    bmp: buildBMP24(40, (x, y) => (iconIsBlack_lock(x, y) ? BLACK : WHITE)),
    svg: svgDataUrl(`<rect width="40" height="40" fill="${BLACK.hex}"/>`),
  };
  const unlock = {
    id: "icon-unlock", name: "unlock (inset)",
    bmp: buildBMP24(40, (x, y) => (iconIsBlack_unlock(x, y) ? BLACK : WHITE)),
    svg: svgDataUrl(`<rect width="40" height="40" fill="${WHITE.hex}"/><rect x="10" y="10" width="20" height="20" fill="${BLACK.hex}"/>`),
  };
  const mark = {
    id: "icon-mark", name: "mark (cross)",
    bmp: buildBMP24(40, (x, y) => (iconIsBlack_mark(x, y) ? BLACK : WHITE)),
    svg: svgDataUrl(`<rect width="40" height="40" fill="${WHITE.hex}"/><rect x="15" y="0" width="10" height="40" fill="${BLACK.hex}"/><rect x="0" y="15" width="40" height="10" fill="${BLACK.hex}"/>`),
  };
  return { lock, unlock, mark };
}

async function main() {
  const icons = makeIconAssets();

  const project = {
    name: "M5 Dial HIL Comprehensive Test",
    // Matches public/ddf/m5stack-m5dial.ddf.zip's device.json - lets the
    // firmware's own DEVICE_ID compatibility check accept this fixture.
    deviceId: "m5stack-m5dial-v1-1",
    screenWidth: 240,
    screenHeight: 240,
    settings: { colorDepth: "24bit" },
    topics: [
      { id: "topic-temp", topic: "hil-test/temperature", type: "numeric", examples: ["21.5", "23.0", "19.8"] },
      { id: "topic-level", topic: "Freshwater/Level", type: "numeric", examples: ["0", "25", "50", "75", "100"] },
      // Two-character zero-padded strings, not "0"/"1" - matches the exact
      // shape of data that exposed two real MQTTIconField bugs on the
      // e-paper target (see hil/epaper/fixtures/build-comprehensive-test.js's
      // own comment) - kept identical here since it's the same designer
      // code path (render-mqtt-field.ts) producing this data shape.
      { id: "topic-lock", topic: "hil-test/lock", type: "text", examples: ["00", "01"] },
    ],
    assets: [
      { id: icons.lock.id, name: icons.lock.name, type: "icon", data: icons.lock.svg },
      { id: icons.unlock.id, name: icons.unlock.name, type: "icon", data: icons.unlock.svg },
      { id: icons.mark.id, name: icons.mark.name, type: "icon", data: icons.mark.svg },
    ],
    hardwareButtons: [],
    fonts: FONTS.map(({ id, displayName, internalName, size, ascent, descent }) => ({
      id, name: displayName, displayName, internalName, size, ascent, descent,
    })),
    screens: [
      {
        id: "screen-1",
        name: "Screen 1",
        backgroundColor: WHITE.hex,
        buttonActions: [],
        objects: [
          {
            id: "obj-box", type: "box", zIndex: 1,
            x: 10, y: 10, width: 90, height: 50,
            properties: { fillColor: BOX_FILL.hex, strokeColor: BLACK.hex, strokeWidth: 3, cornerRadius: 8 },
          },
          {
            id: "obj-label", type: "label", zIndex: 2,
            x: 10, y: 68, width: 90, height: 12,
            properties: {
              text: "M5 HIL", fontId: "font-helvR08", fontSize: 8, color: BLACK.hex,
              textAlign: "left", fontWeight: "normal", backgroundColor: WHITE.hex, borderColor: BORDER.hex,
            },
          },
          {
            id: "obj-mqtt-temp", type: "MqttDataField", zIndex: 3,
            x: 10, y: 88, width: 90, height: 12,
            properties: {
              topic: "hil-test/temperature", displayAs: "Display as-is", fontId: "font-helvR08",
              backgroundColor: WHITE.hex, borderColor: BORDER.hex, textColor: BLACK.hex, textAlign: "left",
              prefix: "", postfix: "",
            },
          },
          {
            // fontId required - see the e-paper fixture's identical note
            // (render-level-indicator.ts only takes the pixel-exact BDF
            // path when fontId resolves to a real font).
            id: "obj-level", type: "level-indicator", zIndex: 4,
            x: 10, y: 118, width: 220, height: 24,
            properties: {
              topic: "Freshwater/Level", backgroundColor: WHITE.hex, borderColor: BORDER.hex,
              fillColor: LEVEL_FILL.hex, barDirection: "left-to-right", displayValue: "percentage",
              calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }],
              textColor: BLACK.hex, fontId: "font-helvR08",
            },
          },
          {
            // strokeWidth 1 / filletRadius 0 / no arrows / exactly 2 points
            // -> drawBresenhamLine only on both sides (see this file's
            // header comment for why nothing fancier is used here).
            id: "obj-line", type: "line", zIndex: 5,
            x: 150, y: 10, width: 80, height: 80,
            properties: { color: BLACK.hex, strokeWidth: 1, strokeStyle: "solid", filletRadius: 0, points: [{ x: 150, y: 10 }, { x: 230, y: 90 }] },
          },
          {
            id: "obj-icon", type: "icon", zIndex: 6,
            x: 150, y: 150, width: 40, height: 40,
            properties: { assetId: icons.mark.id, backgroundColor: "transparent" },
            path: `assets/${icons.mark.id}.bmp`,
          },
          {
            id: "obj-mqtt-icon", type: "MQTTIconField", zIndex: 7,
            x: 190, y: 150, width: 40, height: 40,
            properties: {
              topic: "hil-test/lock",
              backgroundColor: "transparent",
              valueIconPairs: [
                { id: "iconpair-locked", comparisonOperator: "=", value: "01", thenShowIcon: icons.lock.id, path: `assets/${icons.lock.id}.bmp` },
                { id: "iconpair-unlocked", comparisonOperator: "=", value: "00", thenShowIcon: icons.unlock.id, path: `assets/${icons.unlock.id}.bmp` },
              ],
            },
          },
        ],
      },
    ],
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const zip = new JSZip();
  // No fonts/*.bdf embedded in the zip, and no font.path field - matches
  // what lib/project-zip.ts's buildDeviceProjectZip() (the real "Export
  // Project"/deploy pipeline) actually produces: font entries carry only
  // metadata (internalName etc.), never file data or a path.
  // ColorScreenRenderer::getU8g2FontById() matches fonts by internalName
  // against compiled-in u8g2 font tables - it never reads a BDF file off
  // the device's flash at all. Embedding the BDF here (as the e-paper
  // fixture's own build script does, and this file used to) added ~97KB of
  // dead weight to the uploaded zip for a file the firmware would never
  // even open, and single-handedly pushed the whole zip's size well past
  // what ProjectInstaller::installProjectZipFromFile() can actually
  // malloc() in one contiguous block on this device (observed ceiling
  // ~31KB - see this file's own header comment on RGB565 color safety for
  // the general "designer vs. device reality" pattern this is another
  // instance of). The orchestrator instead resolves each font's BDF text
  // straight from public/ddf/m5stack-m5dial.ddf.zip for its own headless
  // reference render, which is the only place that ever actually needs
  // glyph data.

  const assetsFolder = zip.folder("assets");
  assetsFolder.file(`${icons.lock.id}.bmp`, icons.lock.bmp);
  assetsFolder.file(`${icons.unlock.id}.bmp`, icons.unlock.bmp);
  assetsFolder.file(`${icons.mark.id}.bmp`, icons.mark.bmp);

  zip.file("project.json", JSON.stringify(project, null, 2));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(OUT_PATH, buf);
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
