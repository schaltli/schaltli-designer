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

async function main() {
  const ddfBuf = fs.readFileSync(DDF_PATH);
  const ddfZip = await JSZip.loadAsync(ddfBuf);

  const project = {
    name: "HIL Comprehensive Test",
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

  zip.file("project.json", JSON.stringify(project, null, 2));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(OUT_PATH, buf);
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
