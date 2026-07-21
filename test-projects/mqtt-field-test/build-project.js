// Builds a project.json mirroring the exact layout of the already-verified
// (0/0 diff) label test screens, but using MqttDataField objects bound to
// a single shared MQTT topic instead of static label text - all 12 fields
// per screen show the SAME live value, cycling (wrap-around) through 5 test
// strings: empty, whitespace-only (1 and 2 spaces), a short word, and a
// long UTF-8/umlaut-heavy string that overflows every box. Same positions,
// colors, borders as the label test, so any pixel diff is attributable to
// the MQTT-field code path specifically.
const fs = require("fs");
const path = require("path");
const JSZip = require("C:/GitHub/v0-screenman-editor-design/node_modules/jszip");

const FONTS = [
  { id: "font-helvR08", name: "u8g2_font_helvR08_tf", displayName: "Helvetica 8px", path: "fonts/helvR08.bdf", size: 12, internalName: "u8g2_font_helvR08_tf", ascent: 10, descent: 2 },
  { id: "font-helvR12", name: "u8g2_font_helvR12_tf", displayName: "Helvetica 12px", path: "fonts/helvR12.bdf", size: 18, internalName: "u8g2_font_helvR12_tf", ascent: 14, descent: 4 },
  { id: "font-helvR18", name: "u8g2_font_helvR18_tf", displayName: "Helvetica 18px", path: "fonts/helvR18.bdf", size: 27, internalName: "u8g2_font_helvR18_tf", ascent: 22, descent: 5 },
  { id: "font-helvR24", name: "u8g2_font_helvR24_tf", displayName: "Helvetica 24px", path: "fonts/helvR24.bdf", size: 35, internalName: "u8g2_font_helvR24_tf", ascent: 28, descent: 7 },
];

const SHARED_TOPIC = "test/field-value";
const TOPICS = [
  {
    id: "topic_shared",
    topic: SHARED_TOPIC,
    type: "string",
    examples: ["", " ", "  ", "Hello", "Hello, Wörld, grüessgott und auf wiedersehen, mit freundliche Grüssen"],
  },
];

const FONT_SIZE_PX = { "font-helvR08": 14, "font-helvR12": 18, "font-helvR18": 27, "font-helvR24": 35 };

// field(id, x, y, width, height, align, fontId, color, bg, border, zIndex)
function field(id, x, y, width, height, textAlign, fontId, color, backgroundColor, borderColor, zIndex) {
  return {
    type: "MqttDataField",
    x, y, width, height, zIndex, id,
    properties: {
      topic: SHARED_TOPIC,
      displayAs: "Display as-is",
      fontId,
      fontSize: FONT_SIZE_PX[fontId],
      color, backgroundColor, borderColor, textAlign,
      fontWeight: "normal",
      prefix: "", postfix: "", numberOfDecimals: 0, thousandsSeparator: "",
    },
  };
}

const whiteScreen = {
  id: "screen-mqtt-white",
  name: "mqtt-field-tests-white-background",
  objects: [
    // LEFT group (mirrors obj-4..7 from the label test)
    field("obj-l1", 11, 9, 303, 16, "left", "font-helvR08", "#000000", "#ffffff", "#cccccc", 1),
    field("obj-l2", 11, 25, 303, 23, "left", "font-helvR12", "#000000", "#ffffff", "transparent", 2),
    field("obj-l3", 10, 46, 305, 35, "left", "font-helvR18", "#000000", "#ffffff", "#000000", 3),
    field("obj-l4", 9, 76, 307, 46, "left", "font-helvR24", "#FFFFFF", "#000000", "#cccccc", 4),
    // CENTER group (mirrors obj-9..12)
    field("obj-c1", 6, 114, 303, 16, "center", "font-helvR08", "#000000", "#ffffff", "#cccccc", 5),
    field("obj-c2", 6, 130, 303, 23, "center", "font-helvR12", "#000000", "#ffffff", "transparent", 6),
    field("obj-c3", 5, 151, 305, 35, "center", "font-helvR18", "#000000", "#ffffff", "#000000", 7),
    field("obj-c4", 4, 181, 307, 46, "center", "font-helvR24", "#FFFFFF", "#000000", "#cccccc", 8),
    // RIGHT group (mirrors obj-13..16)
    field("obj-r1", 2, 220, 303, 16, "right", "font-helvR08", "#000000", "#ffffff", "#cccccc", 9),
    field("obj-r2", 2, 236, 303, 23, "right", "font-helvR12", "#000000", "#ffffff", "transparent", 10),
    field("obj-r3", 2, 257, 305, 35, "right", "font-helvR18", "#000000", "#ffffff", "#000000", 11),
    field("obj-r4", 2, 287, 307, 46, "right", "font-helvR24", "#FFFFFF", "#000000", "#cccccc", 12),
  ],
};

const blackScreen = {
  id: "screen-mqtt-black",
  name: "mqtt-field-tests-black-background",
  backgroundColor: "#000000",
  gridColor: "#787878",
  objects: [
    // LEFT group (mirrors obj-24..27)
    field("obj-bl1", 15, 3, 303, 16, "left", "font-helvR08", "#FFFFFF", "transparent", "transparent", 1),
    field("obj-bl2", 15, 19, 303, 23, "left", "font-helvR12", "#000000", "#ffffff", "transparent", 2),
    field("obj-bl3", 14, 40, 305, 35, "left", "font-helvR18", "#000000", "#ffffff", "#000000", 3),
    field("obj-bl4", 13, 70, 307, 46, "left", "font-helvR24", "#FFFFFF", "#000000", "#cccccc", 4),
    // CENTER group (mirrors obj-28,17,18,19)
    field("obj-bc1", 10, 108, 303, 16, "center", "font-helvR08", "#000000", "#ffffff", "#cccccc", 5),
    field("obj-bc2", 10, 124, 303, 23, "center", "font-helvR12", "#000000", "#ffffff", "transparent", 6),
    field("obj-bc3", 9, 145, 305, 35, "center", "font-helvR18", "#000000", "#ffffff", "#000000", 7),
    field("obj-bc4", 8, 175, 307, 46, "center", "font-helvR24", "#FFFFFF", "#000000", "#cccccc", 8),
    // RIGHT group (mirrors obj-20..23)
    field("obj-br1", 6, 214, 303, 16, "right", "font-helvR08", "#000000", "#ffffff", "#cccccc", 9),
    field("obj-br2", 6, 230, 303, 23, "right", "font-helvR12", "#000000", "#ffffff", "transparent", 10),
    field("obj-br3", 6, 251, 305, 35, "right", "font-helvR18", "#000000", "#ffffff", "#000000", 11),
    field("obj-br4", 6, 281, 307, 46, "right", "font-helvR24", "#FFFFFF", "#000000", "#cccccc", 12),
  ],
};

const project = {
  name: "MQTT Field Test",
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
  fs.writeFileSync(path.join(__dirname, "mqtt-field-test.zip"), buf);
  console.log("Wrote mqtt-field-test.zip");
}

main();
