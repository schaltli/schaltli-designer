// Builds a single project.json + BDF fonts, zipped, covering every object
// type the e-paper firmware actually renders (see ScreenRenderer::
// renderObject()'s dispatch - no "SoftwareButton", that's a touch-device
// concept, not a physical-button one): box, label, MqttDataField,
// level-indicator, a segmented/filleted line (with arrowheads, 2026-07-31),
// and a data-bound MqttDataLine. Hand-built directly
// (not exported from the running app via a browser) because the firmware
// renders every object type live from project.json - unlike Android, there
// is no flattened background image this test needs to reproduce, so a
// plain Node script is enough to produce a project the real orchestrator
// can upload.
//
// Run: node hil/epaper/fixtures/build-comprehensive-test.js
// Produces: hil/epaper/fixtures/comprehensive-test.zip
//
// Then: node hil/epaper/orchestrator.js --project hil/epaper/fixtures/comprehensive-test.zip --device <ip>

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const DDF_PATH = path.join(__dirname, "../../../public/ddf/mqtt-epaper-display.ddf.zip");
const OUT_PATH = path.join(__dirname, "comprehensive-test.zip");

const FONTS = [
  { id: "font-helvR08", displayName: "Helvetica 8px", internalName: "u8g2_font_helvR08_tf", file: "fonts/helvR08.bdf", size: 12, ascent: 10, descent: 2 },
  { id: "font-helvR12", displayName: "Helvetica 12px", internalName: "u8g2_font_helvR12_tf", file: "fonts/helvR12.bdf", size: 18, ascent: 14, descent: 4 },
];

// A narrow ~28° "V" spike, not the gentler ~55-90° zigzag this fixture
// used originally - that shape never actually exercised the tangent-
// distance bug found 2026-07-30 (a fillet's tangent point sits at
// radius/tan(halfAngle) from the vertex, not `radius` itself; for a sharp
// acute angle that distance is *larger* than the radius, so a formula that
// assumed they were equal placed the tangent point too close to the
// vertex, and the straight run drawn "up to" it visibly overshot past it
// toward the tip once the curve was added on top). filletRadius (25) is
// deliberately large enough relative to the legs' length (~124px) that the
// correct tangent distance (25/tan(14°) ≈ 100px) still exceeds half a leg
// (~62px) and gets clamped down to a smaller effective radius - exercising
// both the corrected formula and its clamp in the same fixture, on real
// hardware. x/y/width/height are computed from the points themselves - the
// designer's own convention for a points-based line (canvas.tsx keeps this
// bounding box in sync on every points edit) - since the firmware only
// reads properties.points when it has 2+ entries, but leaving x/y/width/
// height inconsistent with the real shape would be confusing for anything
// else that reads them generically.
function buildLineObject() {
  const points = [
    { x: 300, y: 160 },
    { x: 330, y: 40 },
    { x: 360, y: 160 },
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    id: "obj-line", type: "line", zIndex: 5,
    x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY,
    // arrowStart/arrowEnd (2026-07-31) exercised on the same acute-spike
    // shape rather than a separate object - both ends get an arrowhead,
    // proving the new drawArrowhead() primitive works alongside the
    // fillet-arc geometry it's drawn on top of, not just a plain segment.
    properties: { color: "#000000", strokeWidth: 2, strokeStyle: "solid", filletRadius: 25, points, arrowStart: true, arrowEnd: true },
  };
}

// A flow-visualization line (MqttDataLine, 2026-07-31): bound to
// hil-test/current, a signed value whose magnitude drives stroke width
// (1px at 0A up to 16px at 80A+) and whose sign drives which end shows an
// arrow - negative -> start, positive -> end, matching a shunt-style
// current sensor (solar->battery positive, battery->solar negative). The
// topic's 5 examples deliberately mix sign and magnitude so the 5
// generated combinations exercise both arrow directions and a range of
// widths, not just one static case. The 16px max (not a more modest 6px)
// is deliberate: at that thickness the line body used to visibly poke out
// past the arrowhead triangle's tapering sides (its own straight edges
// wider than the triangle's shrinking width near the tip) - a real bug
// only large enough to notice at this thickness, fixed 2026-08-01 via
// shortenForArrow(). Keeping the fixture at a thickness that actually
// exercises it is the whole point of a regression test.
function buildMqttDataLineObject() {
  const points = [
    { x: 230, y: 220 },
    { x: 390, y: 220 },
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    id: "obj-mqtt-line", type: "MqttDataLine", zIndex: 6,
    x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys, minY + 1) - minY,
    properties: {
      topic: "hil-test/current", color: "#000000", filletRadius: 0, points,
      calibrationPoints: [{ value: 0, barSizePercent: 1 }, { value: 80, barSizePercent: 16 }],
      arrowStartOperator: "<", arrowStartValue: "0",
      arrowEndOperator: ">", arrowEndValue: "0",
    },
  };
}

// MQTTIconField coverage (2026-08-02): missing from this fixture entirely
// until a real project reported a live bug that only manifested on real
// hardware, never in the designer's own preview - exactly the parity gap
// this suite exists to catch. Two firmware bugs, both in how
// valueIconPairs get matched: (1) ScreenRenderer::evaluateCondition only
// recognized "==" for equality, but the designer emits a bare "=" for this
// specific feature (tab-control/panel visibility genuinely does use "==",
// a real second convention, not a typo); (2) ProjectLoader::
// parseValueIconPairs used `pairJson["value"] | 0.0f` - ArduinoJson's `|`
// only substitutes when is<float>() is false, and the designer stores
// these values as JSON *strings* ("00", "01"), which never satisfies
// is<float>() regardless of content, so every pair's threshold silently
// became 0.0f no matter what the string said. Deliberately uses "=" (not
// "==") and two-character zero-padded string values ("00"/"01", not "0"/
// "1") to reproduce the exact shape of data that exposed both bugs, not a
// simplified stand-in for it.
//
// Builds a real PBM (P4) bitmap by hand for the firmware side and a
// pixel-matching SVG for the designer's own reference render - two
// visually distinct shapes (solid square vs. a smaller centered square)
// so a wrong-icon-selected regression shows up as a real pixel diff, not
// just "something rendered".
function buildPBM(size, isBlack) {
  const rowBytes = Math.ceil(size / 8);
  const buf = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isBlack(x, y)) {
        const byteIndex = y * rowBytes + (x >> 3);
        const bitMask = 0x80 >> (x & 7);
        buf[byteIndex] |= bitMask;
      }
    }
  }
  const header = Buffer.from(`P4\n${size} ${size}\n`, "ascii");
  return Buffer.concat([header, buf]);
}

const ICON_SIZE = 40;
const ICON_LOCK_PBM = buildPBM(ICON_SIZE, () => true); // solid square ("locked")
const ICON_UNLOCK_PBM = buildPBM(ICON_SIZE, (x, y) => {
  // smaller centered square ("unlocked") - visually distinct from the
  // solid square, not just an inverse/border variant that could mask a
  // "picked the wrong pair" bug behind a similar-looking silhouette.
  const inset = ICON_SIZE / 4;
  return x >= inset && x < ICON_SIZE - inset && y >= inset && y < ICON_SIZE - inset;
});

function svgDataUrl(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">${inner}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}
const ICON_LOCK_SVG = svgDataUrl(`<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="#000"/>`);
const ICON_UNLOCK_SVG = svgDataUrl(
  `<rect x="${ICON_SIZE / 4}" y="${ICON_SIZE / 4}" width="${ICON_SIZE / 2}" height="${ICON_SIZE / 2}" fill="#000"/>`,
);

function buildMqttIconFieldObject() {
  return {
    id: "obj-mqtt-icon", type: "MQTTIconField", zIndex: 7,
    x: 20, y: 250, width: ICON_SIZE, height: ICON_SIZE,
    properties: {
      topic: "hil-test/lock",
      backgroundColor: "transparent",
      valueIconPairs: [
        { id: "iconpair-locked", comparisonOperator: "=", value: "01", thenShowIcon: "icon-lock", path: "assets/icon-lock.pbm" },
        { id: "iconpair-unlocked", comparisonOperator: "=", value: "00", thenShowIcon: "icon-unlock", path: "assets/icon-unlock.pbm" },
      ],
    },
  };
}

async function main() {
  const ddfBuf = fs.readFileSync(DDF_PATH);
  const ddfZip = await JSZip.loadAsync(ddfBuf);

  const project = {
    name: "HIL Comprehensive Test",
    // Matches public/ddf/mqtt-epaper-display.ddf.zip's device.json - lets
    // --deploy-flow (orchestrator.js) discover this exact device type via
    // its retained MQTT "hello", and lets the firmware's own compatibility
    // check (DeviceInfo.h's DEVICE_ID) accept this fixture as a real
    // deploy target instead of rejecting it as "unknown device".
    deviceId: "mqtt-epaper-display-2",
    screenWidth: 400,
    screenHeight: 300,
    // The designer's headless reference render (app/test-render/page.tsx)
    // reads project.settings.colorDepth to decide whether to quantize down
    // to pure black/white before comparing - without it, the reference
    // shows full, unquantized color (e.g. this box's #e5e5e5 fill as an
    // actual light gray) while the real 1-bit e-paper device correctly
    // quantizes it away to white, producing a large, entirely spurious
    // diff that has nothing to do with any real rendering bug (2026-07-30
    // finding, this fixture's own first HIL run).
    settings: { colorDepth: "1bit" },
    topics: [
      { id: "topic-temp", topic: "hil-test/temperature", type: "numeric", examples: ["21.5", "23.0", "19.8"] },
      { id: "topic-level", topic: "Freshwater/Level", type: "numeric", examples: ["0", "25", "50", "75", "100"] },
      { id: "topic-current", topic: "hil-test/current", type: "numeric", examples: ["-40", "-15", "0", "35", "70"] },
      // Two-character zero-padded strings, not "0"/"1" - see
      // buildMqttIconFieldObject()'s comment for why that shape matters.
      { id: "topic-lock", topic: "hil-test/lock", type: "text", examples: ["00", "01"] },
    ],
    // Referenced by valueIconPairs[].thenShowIcon for the designer's own
    // reference render (app/test-render/page.tsx passes project.assets
    // through as projectAssets) - the firmware instead reads
    // valueIconPairs[].path directly, so both need to point at
    // pixel-matching content (see buildPBM/svgDataUrl above).
    assets: [
      { id: "icon-lock", name: "lock (solid)", type: "icon", data: ICON_LOCK_SVG },
      { id: "icon-unlock", name: "unlock (inset)", type: "icon", data: ICON_UNLOCK_SVG },
    ],
    hardwareButtons: [],
    fonts: FONTS.map(({ id, displayName, internalName, size, ascent, descent }) => ({
      id, name: displayName, displayName, internalName, size, ascent, descent,
    })),
    screens: [
      {
        id: "screen-1",
        name: "Screen 1",
        backgroundColor: "#ffffff",
        buttonActions: [],
        objects: [
          {
            id: "obj-box", type: "box", zIndex: 1,
            x: 20, y: 20, width: 160, height: 50,
            properties: { fillColor: "#e5e5e5", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 0 },
          },
          {
            id: "obj-label", type: "label", zIndex: 2,
            x: 20, y: 90, width: 160, height: 16,
            properties: {
              text: "Label", fontId: "font-helvR08", fontSize: 12, color: "#000000",
              textAlign: "left", fontWeight: "normal", backgroundColor: "#ffffff", borderColor: "#cccccc",
            },
          },
          {
            id: "obj-mqtt-temp", type: "MqttDataField", zIndex: 3,
            x: 20, y: 120, width: 160, height: 22,
            properties: {
              topic: "hil-test/temperature", displayAs: "Display as-is", fontId: "font-helvR08",
              backgroundColor: "#ffffff", borderColor: "#cccccc", textColor: "#000000", textAlign: "left",
              prefix: "", postfix: "",
            },
          },
          {
            // fontId is required, not optional - render-level-indicator.ts
            // only uses the pixel-exact BDF text path when
            // `fontId && fonts.find(f => f.id === fontId)` resolves; without
            // it, it silently falls back to a generic 14px Arial canvas
            // font, while the firmware's getU8g2FontById(obj.properties.
            // fontId) always resolves *some* compiled-in font regardless -
            // omitting fontId here (this fixture's original oversight) made
            // the designer and device render completely different fonts/
            // sizes for the level-indicator text, not a rendering bug at all
            // (2026-07-31 finding, reported as "font size doesn't match").
            id: "obj-level", type: "level-indicator", zIndex: 4,
            x: 20, y: 160, width: 200, height: 30,
            properties: {
              topic: "Freshwater/Level", backgroundColor: "#ffffff", borderColor: "#cccccc",
              fillColor: "#4CAF50", barDirection: "left-to-right", displayValue: "percentage",
              calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }],
              textColor: "#000000", fontId: "font-helvR08",
            },
          },
          buildLineObject(),
          buildMqttDataLineObject(),
          buildMqttIconFieldObject(),
        ],
      },
    ],
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const zip = new JSZip();
  const fontsFolder = zip.folder("fonts");
  for (const font of FONTS) {
    const entry = ddfZip.file(font.file);
    if (!entry) throw new Error(`DDF is missing ${font.file}`);
    const bdfText = await entry.async("string");
    fontsFolder.file(path.basename(font.file), bdfText);
  }
  // project.json's font entries need a `path` (relative to the zip root)
  // pointing at the embedded BDF - matches the shape a real "Export
  // Project" download produces, and what hil/epaper/orchestrator.js's
  // loadProjectFromZip() expects (inline `data` or a `path` it can read).
  project.fonts = project.fonts.map((f, i) => ({ ...f, path: `fonts/${path.basename(FONTS[i].file)}` }));

  const assetsFolder = zip.folder("assets");
  assetsFolder.file("icon-lock.pbm", ICON_LOCK_PBM);
  assetsFolder.file("icon-unlock.pbm", ICON_UNLOCK_PBM);

  zip.file("project.json", JSON.stringify(project, null, 2));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(OUT_PATH, buf);
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
