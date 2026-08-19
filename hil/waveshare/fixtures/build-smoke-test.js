// Builds a device-export project zip for the Waveshare Knob-1.8, used to
// verify the ported project stack (ProjectInstaller -> ProjectLoader ->
// ColorScreenRenderer) on real hardware.
//
// Hand-built rather than exported from the running app, for the same reason
// hil/m5dial/fixtures/build-comprehensive-test.js is: it has to be
// reproducible from a script with no browser in the loop. Deliberately
// narrower than the M5 Dial's comprehensive fixture - this one only needs to
// prove the stack runs end to end on a new board. Object-type coverage grows
// with the HIL orchestrator (step 6 of the port), not here.
//
// Only metadata is written for fonts, never the BDF bytes: the firmware
// resolves fonts through ColorScreenRenderer::getU8g2FontById(), which
// matches `internalName` against compiled-in u8g2 tables and never opens a
// font file. Embedding one would add ~100KB of dead weight to the upload
// that the device would never read.
//
// Colors are picked to be *fixed points* of the RGB565 round trip, so a
// pixel comparison can assert exact values instead of a tolerance. Note that
// "low bits zero" is NOT the right rule and was the first guess here: the
// device expands 5/6-bit channels back by bit replication
// (r8 = (r5<<3)|(r5>>2)), so e.g. #00a8f8 comes back as #00aaff and #808080
// as #848284. A value only survives untouched if it is already the output of
// that expansion - which every constant below is.

const fs = require("fs")
const path = require("path")
const JSZip = require("jszip")

const OUT_PATH = path.join(__dirname, "smoke-test.zip")

const WHITE = "#ffffff"
const BLACK = "#000000"
const BOX_FILL = "#00aaff" // fixed point: r5=0, g6=42, b5=31
const LEVEL_FILL = "#00fb00" // fixed point: g6=62
const BORDER = "#848284" // fixed point: r5=16, g6=32, b5=16

const FONTS = [
  { id: "font-helvR12", displayName: "Helvetica 12px", internalName: "u8g2_font_helvR12_tf", size: 18, ascent: 14, descent: 4 },
  { id: "font-helvR18", displayName: "Helvetica 18px", internalName: "u8g2_font_helvR18_tf", size: 27, ascent: 22, descent: 5 },
]

const project = {
  name: "Waveshare Knob Smoke Test",
  // Must match ddf-source/device.json's device.id, or the firmware's own
  // DEVICE_ID check rejects the upload before touching /PROJECT.
  deviceId: "waveshare-knob-1v8",
  // The single version number shared by project file, export and DDF
  // (lib/system-generation.ts). The firmware peeks its major before
  // installing.
  systemGeneration: "1.0",
  screenWidth: 360,
  screenHeight: 360,
  settings: { colorDepth: "24bit" },
  // Several examples per topic, because the orchestrator runs one comparison
  // per combination (hil/combinations.js) - a single example would only ever
  // exercise one appearance of each MQTT-bound object. The level values are
  // chosen to land on distinctly different bar widths rather than adjacent
  // ones, so an off-by-a-few-pixels bar is visible as a real diff.
  topics: [
    { id: "topic-temp", topic: "hil-test/temperature", type: "numeric", examples: ["21.5", "-4.0", "100.0"] },
    { id: "topic-level", topic: "hil-test/level", type: "numeric", examples: ["0", "37", "100"] },
  ],
  assets: [],
  hardwareButtons: [],
  fonts: FONTS.map(({ id, displayName, internalName, size, ascent, descent }) => ({
    id,
    name: displayName,
    displayName,
    internalName,
    size,
    ascent,
    descent,
  })),
  screens: [
    {
      id: "screen-1",
      name: "Screen 1",
      backgroundColor: WHITE,
      buttonActions: [],
      objects: [
        // Everything sits inside the r=180 inscribed circle - this panel is
        // round, so anything in the square's corners is unobservable and
        // would make a snapshot assertion untestable.
        {
          id: "obj-box",
          type: "box",
          zIndex: 1,
          x: 100,
          y: 60,
          width: 160,
          height: 60,
          properties: { fillColor: BOX_FILL, strokeColor: BLACK, strokeWidth: 3, cornerRadius: 8 },
        },
        {
          id: "obj-label",
          type: "label",
          zIndex: 2,
          x: 100,
          y: 140,
          width: 160,
          height: 27,
          properties: {
            text: "Waveshare",
            fontId: "font-helvR18",
            fontSize: 18,
            color: BLACK,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: WHITE,
            borderColor: BORDER,
          },
        },
        {
          id: "obj-mqtt-temp",
          type: "MqttDataField",
          zIndex: 3,
          x: 100,
          y: 180,
          width: 160,
          height: 18,
          properties: {
            topic: "hil-test/temperature",
            displayAs: "Display as-is",
            fontId: "font-helvR12",
            backgroundColor: WHITE,
            borderColor: BORDER,
            textColor: BLACK,
            textAlign: "left",
            prefix: "",
            postfix: " C",
          },
        },
        {
          // fontId is required, not optional: the level indicator only takes
          // the pixel-exact BDF path when it resolves to a real font.
          id: "obj-level",
          type: "level-indicator",
          zIndex: 4,
          x: 90,
          y: 220,
          width: 180,
          height: 30,
          properties: {
            topic: "hil-test/level",
            backgroundColor: WHITE,
            borderColor: BORDER,
            fillColor: LEVEL_FILL,
            barDirection: "left-to-right",
            displayValue: "percentage",
            calibrationPoints: [
              { value: 0, barSizePercent: 0 },
              { value: 100, barSizePercent: 100 },
            ],
            textColor: BLACK,
            fontId: "font-helvR12",
          },
        },
      ],
    },
    {
      // A second screen exists purely so POST /api/screen has somewhere to
      // switch to - a one-screen project cannot prove the switch worked.
      id: "screen-2",
      name: "Screen 2",
      backgroundColor: BLACK,
      buttonActions: [],
      objects: [
        {
          id: "obj-label-2",
          type: "label",
          zIndex: 1,
          x: 110,
          y: 165,
          width: 140,
          height: 27,
          properties: {
            text: "Screen Two",
            fontId: "font-helvR18",
            fontSize: 18,
            color: WHITE,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: BLACK,
            borderColor: BLACK,
          },
        },
      ],
    },
  ],
}

async function main() {
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(project, null, 2))
  // DEFLATE unconditionally - every device zip has been compressed since
  // 2026-08-14 and the firmware's extraction path must handle it (see the
  // designer's docs/device-contract.md).
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  })
  fs.writeFileSync(OUT_PATH, buf)
  console.log(`Wrote ${OUT_PATH} (${buf.length} bytes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
