// Builds a single project.json + BDF fonts + hand-built 24bpp BMP icon
// assets covering every M5 Dial-supported object type that's tractable to
// hand-build directly, mirroring hil/epaper/fixtures/build-comprehensive-test.js's
// same rationale and its own "hand-built rather than exported from the
// running app" reasoning. Covers: box (with rounded corners + inset
// border), label, MqttDataField, level-indicator, line, icon, MQTTIconField,
// MqttDataLine, tab-control/panel - 10 of the 12 types
// the M5 Dial DDF's supportedObjectTypes declares (screenbee-m5dial/
// ddf-source/device.json, since 2026-08-16 - see docs/device-contract.md).
//
// SoftwareButton and Switch are deliberately NOT covered here:
// ColorScreenRenderer.cpp's renderSoftwareButton()/renderSwitch() draw
// pre-baked bitmaps (obj.pathNormal, SwitchState.iconPath/iconPathActive)
// that are "already fully rendered by the designer's export (drop shadow,
// border, label text baked in)" per their own header comments - i.e.
// produced by lib/asset-export.ts's bake steps, not something this
// hand-built fixture can reproduce byte-for-byte without driving the real
// app UI + export pipeline. Tracked as a known coverage gap, not silently
// skipped - revisit by driving a real "Export Project"/deploy flow through
// Playwright (see e2e/master-screen.spec.ts's own comment on
// buildDeviceProjectZip being "the only real path that serializes a
// project for a device to read") if either needs HIL coverage.
//
// "line" now exercises fillet + thick stroke + fixed arrowheads (2026-08-14,
// once ColorScreenRenderer::renderLine() gained parity with the e-paper
// reference - see its own header comment for what "no fillet/arrowhead/
// thick-line yet" used to mean here) - mirrors the acute-spike shape the
// e-paper fixture's buildLineObject() uses, since that's what originally
// exercised the tangent-distance fillet bug on that target; a straight
// unfilleted 2-point line wouldn't touch any of the new code paths at all.
//
// "MqttDataLine" and "tab-control"/"panel" (2026-08-14, once
// ColorScreenRenderer gained renderMqttDataLine/renderTabControl, ported
// from the e-paper reference) are new here - the e-paper fixture itself
// only covers MqttDataLine, not tab-control/panel (see
// hil/epaper/fixtures/build-comprehensive-test.js's own header comment),
// so the tab-control/panel object below has no e-paper-side fixture to
// mirror and was designed fresh for this file.
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
    // Matches the M5 Dial DDF's device.json (screenbee-m5dial/ddf-source/)
    // - lets the firmware's own DEVICE_ID compatibility check accept this
    // fixture.
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
      // MqttDataLine coverage - mirrors the e-paper fixture's own
      // hil-test/current exactly (same topic name, same 5 examples mixing
      // sign and magnitude) so both targets' HIL suites exercise the
      // identical data shape against their own renderMqttDataLine().
      { id: "topic-current", topic: "hil-test/current", type: "numeric", examples: ["-40", "-15", "0", "35", "70"] },
      // tab-control/panel coverage - text mode topic, "==" comparisonOperator
      // (evaluateVisibilityCondition's String-compare branch, not the
      // numeric one MqttDataLine's arrow conditions exercise above).
      { id: "topic-mode", topic: "hil-test/mode", type: "text", examples: ["a", "b"] },
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
            // A filleted acute "V" spike with an arrowhead at both ends -
            // scaled down from the e-paper fixture's own buildLineObject()
            // (same ~28-30° acute angle, so the fillet's tangent-distance
            // formula still clamps down from its requested radius, same as
            // there), exercising fillThickLine + renderFilletedLine +
            // drawArrowhead/shortenForArrow together, not just a plain
            // Bresenham segment.
            id: "obj-line", type: "line", zIndex: 5,
            x: 150, y: 10, width: 80, height: 70,
            properties: {
              color: BLACK.hex, strokeWidth: 2, strokeStyle: "solid", filletRadius: 15,
              points: [{ x: 150, y: 80 }, { x: 190, y: 10 }, { x: 230, y: 80 }],
              arrowStart: true, arrowEnd: true,
            },
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
          // A flow-visualization line bound to hil-test/current - magnitude
          // (via calibrationPoints) drives stroke width, sign drives which
          // end shows an arrow (negative -> start, positive -> end), same
          // shunt-current-sensor framing as the e-paper fixture's identical
          // object. Placed in the gap between the icon row (y150-190) and
          // the tab-control below (y205+).
          {
            id: "obj-mqtt-line", type: "MqttDataLine", zIndex: 8,
            x: 10, y: 195, width: 130, height: 1,
            properties: {
              topic: "hil-test/current", color: BLACK.hex, filletRadius: 0,
              points: [{ x: 10, y: 195 }, { x: 140, y: 195 }],
              calibrationPoints: [{ value: 0, barSizePercent: 1 }, { value: 80, barSizePercent: 6 }],
              arrowStartOperator: "<", arrowStartValue: "0",
              arrowEndOperator: ">", arrowEndValue: "0",
            },
          },
          // tab-control bound to hil-test/mode ("a"/"b", text) - two panels,
          // each a differently-colored box + label, "==" (String-compare)
          // matched against the tab-control's own topic value. Panel
          // children's x/y are relative to the tab-control's own origin
          // (not the panel's, which stays 0,0 filling the tab-control's own
          // box exactly) - see ColorScreenRenderer::renderTabControl()'s
          // header comment.
          {
            id: "obj-tabcontrol", type: "tab-control", zIndex: 9,
            x: 10, y: 210, width: 140, height: 28,
            properties: { topic: "hil-test/mode" },
            children: [
              {
                id: "obj-panel-a", type: "panel", zIndex: 1,
                x: 0, y: 0, width: 140, height: 28,
                properties: { comparisonOperator: "==", comparisonValue: "a" },
                children: [
                  {
                    id: "obj-panel-a-box", type: "box", zIndex: 1,
                    x: 0, y: 0, width: 140, height: 28,
                    properties: { fillColor: BOX_FILL.hex, strokeColor: BLACK.hex, strokeWidth: 2, cornerRadius: 4 },
                  },
                  {
                    // borderColor must be the literal string "transparent",
                    // not "" - found via this fixture's first HIL run
                    // (260/57600px failing, all inside this exact label's
                    // rect): lib/render-text-box.ts:96-97 only special-cases
                    // "transparent" as "no border"; an empty string isn't
                    // treated as undefined/null so it falls through to
                    // strokeStyle assignment instead of the "#cccccc"
                    // default OR a skip, drawing a border the firmware
                    // (correctly, `!borderColor.isEmpty()`) never does. Not a
                    // rendering bug in either side - just this fixture's own
                    // authoring mistake, since no other object here (or in
                    // any real designer-created project) ever leaves
                    // borderColor as bare "".
                    id: "obj-panel-a-label", type: "label", zIndex: 2,
                    x: 4, y: 8, width: 120, height: 12,
                    properties: {
                      text: "Panel A", fontId: "font-helvR08", fontSize: 8, color: BLACK.hex,
                      textAlign: "left", fontWeight: "normal", backgroundColor: "transparent", borderColor: "transparent",
                    },
                  },
                ],
              },
              {
                id: "obj-panel-b", type: "panel", zIndex: 2,
                x: 0, y: 0, width: 140, height: 28,
                properties: { comparisonOperator: "==", comparisonValue: "b" },
                children: [
                  {
                    id: "obj-panel-b-box", type: "box", zIndex: 1,
                    x: 0, y: 0, width: 140, height: 28,
                    properties: { fillColor: LEVEL_FILL.hex, strokeColor: BLACK.hex, strokeWidth: 2, cornerRadius: 4 },
                  },
                  {
                    id: "obj-panel-b-label", type: "label", zIndex: 2,
                    x: 4, y: 8, width: 120, height: 12,
                    properties: {
                      text: "Panel B", fontId: "font-helvR08", fontSize: 8, color: WHITE.hex,
                      textAlign: "left", fontWeight: "normal", backgroundColor: "transparent", borderColor: "transparent",
                    },
                  },
                ],
              },
            ],
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
  // straight from screenbee-m5dial/ddf-source/ (the firmware repo's own
  // canonical DDF source, checked out alongside this one) for its own
  // headless reference render, which is the only place that ever actually
  // needs glyph data.

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
