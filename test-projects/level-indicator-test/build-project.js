// Builds a level-indicator HIL test project mirroring the rigor applied to
// the label/MQTT-field tests: a 4-column x 3-row grid per screen covering
// all 4 bar directions, all 3 display modes (percentage/value/none), both
// fill/bg color polarities, transparent vs colored vs black borders, 4 font
// sizes, and two custom (non-linear) calibration-point curves - alongside
// the default linear 0-100 curve. All 12 indicators per screen are bound to
// a single shared topic so one screenshot exercises every combination at
// once, same convention as the label/MQTT-field tests.
const fs = require("fs");
const path = require("path");
const JSZip = require("C:/GitHub/v0-screenman-editor-design/node_modules/jszip");

const FONTS = [
  { id: "font-helvR08", name: "u8g2_font_helvR08_tf", displayName: "Helvetica 8px", path: "fonts/helvR08.bdf", size: 12, internalName: "u8g2_font_helvR08_tf", ascent: 10, descent: 2 },
  { id: "font-helvR12", name: "u8g2_font_helvR12_tf", displayName: "Helvetica 12px", path: "fonts/helvR12.bdf", size: 18, internalName: "u8g2_font_helvR12_tf", ascent: 14, descent: 4 },
  { id: "font-helvR18", name: "u8g2_font_helvR18_tf", displayName: "Helvetica 18px", path: "fonts/helvR18.bdf", size: 27, internalName: "u8g2_font_helvR18_tf", ascent: 22, descent: 5 },
  { id: "font-helvR24", name: "u8g2_font_helvR24_tf", displayName: "Helvetica 24px", path: "fonts/helvR24.bdf", size: 35, internalName: "u8g2_font_helvR24_tf", ascent: 28, descent: 7 },
];

const SHARED_TOPIC = "test/level-value";
const TOPICS = [
  {
    id: "topic_shared",
    topic: SHARED_TOPIC,
    type: "number",
    // Wrap-around test values: exact ends, an odd fraction (rounding /
    // interpolation stress), and a value below the lowest calibration point
    // (clamp-to-lowest coverage).
    examples: ["0", "25", "50", "75", "100", "12.3"],
  },
];

const DEFAULT_CALIBRATION = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
];
const CALIBRATION_A = [
  { value: 0, barSizePercent: 0 },
  { value: 50, barSizePercent: 20 },
  { value: 100, barSizePercent: 100 },
];
const CALIBRATION_B = [
  { value: 0, barSizePercent: 10 },
  { value: 50, barSizePercent: 50 },
  { value: 100, barSizePercent: 90 },
];

// indicator(id, x, y, w, h, barDirection, displayValue, fillColor, bgColor, borderColor, fontId, zIndex, calibrationPoints)
function indicator(id, x, y, w, h, barDirection, displayValue, fillColor, bgColor, borderColor, fontId, zIndex, calibrationPoints) {
  return {
    type: "level-indicator",
    x, y, width: w, height: h, zIndex, id,
    properties: {
      topic: SHARED_TOPIC,
      barDirection, displayValue, fillColor,
      backgroundColor: bgColor, borderColor,
      fontId,
      calibrationPoints: calibrationPoints || DEFAULT_CALIBRATION,
    },
  };
}

// 4-column x 3-row grid, cell 90x90 with 5px gaps: x in {5,105,205,305}, y in {5,105,205}.
function buildGrid(idPrefix, xs, ys) {
  return [
    // row 0: percentage display, default calibration
    indicator(`${idPrefix}-00`, xs[0], ys[0], 90, 90, "left-to-right", "percentage", "#000000", "#ffffff", "#cccccc", "font-helvR08", 1),
    indicator(`${idPrefix}-01`, xs[1], ys[0], 90, 90, "right-to-left", "percentage", "#000000", "#ffffff", "transparent", "font-helvR12", 2),
    indicator(`${idPrefix}-02`, xs[2], ys[0], 90, 90, "top-to-bottom", "percentage", "#FFFFFF", "#000000", "#000000", "font-helvR18", 3),
    indicator(`${idPrefix}-03`, xs[3], ys[0], 90, 90, "bottom-to-top", "percentage", "#FFFFFF", "#000000", "#cccccc", "font-helvR24", 4),
    // row 1: value display, default calibration except last cell (custom curve A)
    indicator(`${idPrefix}-10`, xs[0], ys[1], 90, 90, "left-to-right", "value", "#000000", "#ffffff", "#000000", "font-helvR12", 5),
    indicator(`${idPrefix}-11`, xs[1], ys[1], 90, 90, "right-to-left", "value", "#000000", "#ffffff", "#cccccc", "font-helvR08", 6),
    indicator(`${idPrefix}-12`, xs[2], ys[1], 90, 90, "top-to-bottom", "value", "#FFFFFF", "#000000", "transparent", "font-helvR18", 7),
    indicator(`${idPrefix}-13`, xs[3], ys[1], 90, 90, "bottom-to-top", "value", "#000000", "#ffffff", "#000000", "font-helvR12", 8, CALIBRATION_A),
    // row 2: none display (bar only) except last cell (percentage, custom curve B)
    indicator(`${idPrefix}-20`, xs[0], ys[2], 90, 90, "left-to-right", "none", "#000000", "#ffffff", "#cccccc", "font-helvR08", 9),
    indicator(`${idPrefix}-21`, xs[1], ys[2], 90, 90, "right-to-left", "none", "#FFFFFF", "#000000", "#000000", "font-helvR08", 10),
    indicator(`${idPrefix}-22`, xs[2], ys[2], 90, 90, "top-to-bottom", "none", "#000000", "#ffffff", "transparent", "font-helvR08", 11),
    indicator(`${idPrefix}-23`, xs[3], ys[2], 90, 90, "bottom-to-top", "percentage", "#000000", "#ffffff", "#cccccc", "font-helvR08", 12, CALIBRATION_B),
  ];
}

const whiteScreen = {
  id: "screen-level-white",
  name: "level-indicator-tests-white-background",
  objects: buildGrid("w", [5, 105, 205, 305], [5, 105, 205]),
};

const blackScreen = {
  id: "screen-level-black",
  name: "level-indicator-tests-black-background",
  backgroundColor: "#000000",
  gridColor: "#787878",
  objects: buildGrid("b", [3, 103, 203, 303], [3, 103, 203]),
};

const project = {
  name: "Level Indicator Test",
  screenWidth: 400,
  screenHeight: 300,
  screens: [whiteScreen, blackScreen],
  assets: [],
  fonts: FONTS,
  hardwareButtons: [],
  snapGuides: [],
  settings: {
    exportFormat: "esp32",
    gridSize: 20,
    snapTolerance: 8,
    snapGrid: '{"horizontal":[], "vertical":[]}',
    colorDepth: "1bit",
    deviceId: "mqtt-epaper-display-2",
    deviceName: "MQTT ePaper Display (GDEY042T81)",
    supportedObjectTypes: ["MqttDataField", "MQTTIconField", "label", "level-indicator"],
  },
  topics: TOPICS,
  nextId: 100,
  exportedAt: new Date().toISOString(),
  version: "1.0.0",
};

async function main() {
  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(project, null, 2));
  for (const f of FONTS) {
    const bdfPath = path.join("C:/GitHub/v0-screenman-editor-design/public/fonts/bdf", path.basename(f.path));
    zip.file(f.path, fs.readFileSync(bdfPath));
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(path.join(__dirname, "level-indicator-test.zip"), buf);
  console.log("Wrote level-indicator-test.zip");
}

main();
