// Builds the Android HIL fixture bundle - the project hil/android's
// orchestrator imports into the app and then compares, screen by screen,
// against the designer's own render of the same data.
//
// Built through the designer's OWN export, not by writing project.json by
// hand and zipping it, for the same reason hil/waveshare's fixture is: the
// bundle contains things no hand-written file can produce. Every screen's
// flattened background PNG is a canvas bake, master-screen inheritance is
// resolved during it, and each icon is tinted at export time by the
// designer's own rules. A hand-built fixture would describe a bundle no real
// export can produce, and the first run against a perfectly correct app
// would report a screen full of differing pixels.
//
// The cost: this needs the designer dev server running (npm run dev),
// because the bake is a canvas operation with no headless path. It is run
// rarely, and the orchestrator already needs that server anyway.
//
// Coverage is deliberately every object type the Android DDF declares
// (ddf-source/device.json in the schaltli-android repo), because that list
// is exactly what the designer will let someone place on this device:
//
//   screen-1  label, MqttDataField, level-indicator, MqttDataLine, box, line
//   screen-2  arc-level with a setpoint marker, SoftwareButton with an icon
//   screen-3  Switch in both modes - segmented with per-state icons, single
//   screen-4  tab-control whose panel holds a Switch and an MQTTIconField
//
// Every screen inherits a master, which is the only way the master path gets
// exercised at all; the master also carries the swipe bindings, so a run
// proves an inherited binding survives the export.
//
// Run: node hil/android/fixtures/build-android-test.js
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { chromium } = require("playwright");
const { execFile } = require("child_process");

const { allDdfFonts, phoneDdf } = require("../ddf-fonts");

// The name hil/test-all.js already looks for, matching the e-paper and M5
// Dial fixtures - "comprehensive" because coverage here is every object
// type the Android DDF declares, not a subset.
const OUT_PATH = path.join(__dirname, "comprehensive-test.zip");
const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000";

// The screen this fixture is built for, in project units - one of which is
// one dp in the app (ScreenRenderer.kt applies no fit step).
//
// It used to be a fixed 360x800, taken from `public/ddf/android-phone.ddf
// .zip` - one size declared for every Android phone there is. That file went
// on 2026-09-21 because no phone had that screen; this constant outlived it
// by a day. On the phone this suite runs against, 800 units is 2400 pixels
// against a display 2240 tall, so the fixture hung off both ends and every
// comparison was of a clipped picture.
//
// A phone's screen is a fact about the phone, so it is passed in:
//
//   node hil/android/fixtures/build-android-test.js --screen 360x679
//
// With a phone connected and the app running, leaving it out reads the
// number from the phone itself, over the USB cable - the app serves its own
// DDF, and `adb forward` reaches it whatever network either end is on.
// hil/android/orchestrator.js refuses to run a fixture whose screen is not
// the one the phone announces, so a stale one cannot quietly come back.
let SCREEN_W = 360;
let SCREEN_H = 679;

const WHITE = "#ffffff";
const BLACK = "#000000";
const DARK = "#101010";
const ACCENT = "#00aaff";
const TRACK = "#303030";
const FILL = "#4caf50";

// Two visibly different shapes, so a swapped icon is obvious in a diff
// rather than being "the same blob either way".
const svgAsset = (id, name, body) => ({
  id,
  name,
  type: "icon",
  data:
    "data:image/svg+xml;base64," +
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString(
      "base64",
    ),
});

function buildProject(fonts) {
  return {
    name: "android-hil",
    screenWidth: SCREEN_W,
    screenHeight: SCREEN_H,
    settings: { colorDepth: "24bit" },
    fonts,
    assets: [
      svgAsset("icon-circle", "circle", `<circle cx="12" cy="12" r="8" fill="${BLACK}"/>`),
      svgAsset("icon-square", "square", `<rect x="4" y="4" width="16" height="16" fill="${BLACK}"/>`),
      svgAsset(
        "icon-triangle",
        "triangle",
        `<polygon points="12,3 21,20 3,20" fill="${BLACK}"/>`,
      ),
    ],
    topics: [
      // Several examples per topic: hil/combinations.js runs one screenshot
      // per index across them, so a topic with three examples is three
      // comparisons of the objects bound to it.
      { id: "t-level", topic: "hil/level", type: "numeric", examples: ["0", "42", "100"] },
      { id: "t-target", topic: "hil/target", type: "numeric", examples: ["75", "20", "60"] },
      { id: "t-text", topic: "hil/text", type: "text", examples: ["OK", "WARN", "FAIL"] },
      { id: "t-mode", topic: "hil/mode", type: "text", examples: ["AUTO", "MANUAL", "AUTO"] },
      { id: "t-power", topic: "hil/power", type: "text", examples: ["ON", "OFF", "ON"] },
    ],
    screens: [
      {
        id: "master-1",
        name: "Master",
        isMaster: true,
        backgroundColor: DARK,
        // Bound only here. Every screen below inherits all three, which is
        // what makes a run prove that inheritance reached the export.
        buttonActions: {
          "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
          "swipe-left": { type: "next-screen" },
          "swipe-right": { type: "previous-screen" },
        },
        objects: [
          // Merged into every screen with {project:name} written in by the
          // export. It read {screen} until 2026-09-25, resolved per screen;
          // that token was never released and is gone
          // (docs/2026-09-25-text-placeholders.md).
          {
            id: "m-title",
            type: "text",
            zIndex: 0,
            x: 12,
            y: 8,
            width: 336,
            height: 24,
            properties: {
              text: "{project:name}",
              fontId: "font-roboto-20",
              color: WHITE,
              backgroundColor: "transparent",
              borderColor: "transparent",
            },
          },
          {
            id: "m-rule",
            type: "line",
            zIndex: 1,
            x: 12,
            y: 40,
            width: 336,
            height: 1,
            properties: { strokeColor: ACCENT, strokeWidth: 1 },
          },
        ],
      },

      {
        id: "screen-1",
        name: "Readouts",
        masterScreenId: "master-1",
        objects: [
          {
            id: "s1-box",
            type: "box",
            zIndex: 0,
            x: 12,
            y: 60,
            width: 336,
            height: 120,
            properties: { fillColor: "#202020", strokeColor: ACCENT, strokeWidth: 1, cornerRadius: 8 },
          },
          {
            id: "s1-field",
            type: "live-text",
            zIndex: 1,
            x: 24,
            y: 76,
            width: 200,
            height: 24,
            properties: {
              topic: "hil/text",
              fontId: "font-roboto-24",
              color: WHITE,
              backgroundColor: "transparent",
              borderColor: "transparent",
              textAlign: "left",
            },
          },
          // A static icon: nothing about it is live, so it is baked into the
          // screen's background and the app never draws it at all. Here to
          // prove exactly that - the bake and the reference have to agree on
          // an icon's ink, which is trimmed of its own margin on both sides.
          {
            id: "s1-icon",
            type: "icon",
            zIndex: 2,
            x: 300,
            y: 68,
            width: 32,
            height: 32,
            properties: { assetId: "icon-triangle", iconColor: ACCENT },
          },
          {
            id: "s1-level",
            type: "bar",
            zIndex: 2,
            x: 24,
            y: 120,
            width: 312,
            height: 44,
            properties: {
              topic: "hil/level",
              backgroundColor: "#202020",
              borderColor: ACCENT,
              fillColor: FILL,
              displayValue: "percentage",
              barDirection: "left-to-right",
              fontId: "font-roboto-16",
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
            },
          },
          // The bar's settable form. Everything the bar has plus a handle,
          // which is its own arithmetic (the track is split around it and
          // the gap is cut out of both runs), and a header line, which is
          // laid out from the font rather than from the object.
          {
            id: "s1-slider",
            type: "slider",
            zIndex: 4,
            x: 24,
            y: 270,
            width: 312,
            height: 64,
            properties: {
              topic: "hil/level",
              setpointTopic: "hil/target",
              // Where a tap would write. Never fired by this suite - it
              // swipes and compares pictures - but its presence is what
              // makes the object a slider rather than a bar, so it has to
              // be here. `hil/` by rule: the orchestrator refuses a fixture
              // that binds anything a real installation listens to.
              writeTopic: "hil/set-level",
              label: "Frischwasser",
              // The header's icon: as tall as a capital of the object's own
              // font and trimmed to its ink, so it stands on the name's
              // baseline. The one part of a level indicator the app drew
              // nothing for until 2026-09-22.
              iconAssetId: "icon-circle",
              iconColor: FILL,
              displayValue: "percentage",
              fillColor: FILL,
              fontId: "font-roboto-16",
              textColor: WHITE,
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
            },
          },
          {
            id: "s1-line",
            type: "live-line",
            zIndex: 3,
            x: 24,
            y: 200,
            width: 312,
            height: 40,
            properties: {
              topic: "hil/level",
              strokeColor: ACCENT,
              calibrationPoints: [
                { value: 0, barSizePercent: 1 },
                { value: 100, barSizePercent: 12 },
              ],
            },
          },
        ],
      },

      {
        id: "screen-2",
        name: "Ring",
        masterScreenId: "master-1",
        objects: [
          // The one object whose pixels come from the shared integer
          // rasterizer rather than from each platform's own drawing calls.
          // Its anti-aliased outer edge at this radius is the longest
          // shallow edge anywhere in the fixture, which is exactly where two
          // independently-computed sines would stop agreeing.
          {
            id: "s2-arc",
            type: "gauge",
            zIndex: 1,
            x: 0,
            y: 60,
            width: 360,
            height: 360,
            properties: {
              topic: "hil/level",
              setpointTopic: "hil/target",
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness: 22,
              markerWidth: 4,
              trackColor: TRACK,
              fillColor: FILL,
              markerColor: WHITE,
              backgroundColor: "transparent",
              displayValue: "percentage",
              fontId: "font-roboto-24",
              textColor: WHITE,
            },
          },
          // Counter-clockwise, and filled from the other end - the branch
          // resolveArcSweep takes only when `direction` is "ccw", which is
          // where a port most easily gets the sector backwards.
          {
            id: "s2-arc-ccw",
            type: "gauge",
            zIndex: 2,
            x: 100,
            y: 160,
            width: 160,
            height: 160,
            properties: {
              topic: "hil/target",
              minAngle: 270,
              maxAngle: 90,
              direction: "ccw",
              thickness: 12,
              trackColor: TRACK,
              fillColor: ACCENT,
              backgroundColor: "transparent",
              displayValue: "none",
            },
          },
          // The ring's settable form, and the smallest one in the fixture:
          // a marker on a thin ring is where two rasterisers disagree first.
          {
            id: "s2-dial",
            type: "dial",
            zIndex: 4,
            x: 120,
            y: 545,
            width: 120,
            height: 120,
            properties: {
              topic: "hil/target",
              setpointTopic: "hil/level",
              writeTopic: "hil/set-target",
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness: 12,
              markerWidth: 4,
              trackColor: TRACK,
              fillColor: ACCENT,
              markerColor: WHITE,
              backgroundColor: "transparent",
              displayValue: "value",
              fontId: "font-roboto-16",
              textColor: WHITE,
            },
          },
          {
            id: "s2-button",
            type: "button",
            zIndex: 3,
            x: 60,
            y: 470,
            width: 240,
            height: 56,
            properties: {
              text: "Senden",
              fontId: "font-roboto-16",
              backgroundColor: "#202020",
              borderColor: ACCENT,
              borderWidth: 1,
              cornerRadius: 6,
              textColor: WHITE,
              // The half of a SoftwareButton this target could not draw at
              // all until now.
              iconAssetId: "icon-triangle",
              iconColor: ACCENT,
              action: { type: "send-mqtt", mqttTopic: "hil/cmd", mqttMessage: "go" },
            },
          },
        ],
      },

      {
        id: "screen-3",
        name: "Switches",
        masterScreenId: "master-1",
        objects: [
          // Segmented: n segments, the active one carrying the marker bar.
          // Two states with icons and a third without, so the "no icon"
          // layout (label centred in the band rather than below an icon) is
          // covered by the same screenshot.
          {
            id: "s3-segmented",
            type: "button-group",
            zIndex: 1,
            x: 12,
            y: 70,
            width: 336,
            height: 90,
            properties: {
              topic: "hil/mode",
              writeTopic: "hil/mode/set",
              mode: "segmented",
              backgroundColor: "#202020",
              activeBackgroundColor: ACCENT,
              borderColor: "#404040",
              textColor: WHITE,
              iconColor: WHITE,
              fontId: "font-roboto-16",
              cornerRadius: 8,
              states: [
                {
                  id: "st-auto",
                  label: "Auto",
                  readValue: "AUTO",
                  writeValue: "AUTO",
                  iconAssetId: "icon-circle",
                  activeIconAssetId: "icon-square",
                },
                {
                  id: "st-manual",
                  label: "Manual",
                  readValue: "MANUAL",
                  writeValue: "MANUAL",
                  iconAssetId: "icon-square",
                },
                { id: "st-off", label: "Aus", readValue: "OFF", writeValue: "OFF" },
              ],
            },
          },
          // Single: one surface showing whichever state is active. Its
          // marker is per state (showMarker), and a value matching nothing
          // draws "?" - which is what the third example below produces.
          {
            id: "s3-single",
            type: "switch",
            zIndex: 2,
            x: 12,
            y: 190,
            width: 160,
            height: 90,
            properties: {
              topic: "hil/power",
              writeTopic: "hil/power/set",
              mode: "single",
              backgroundColor: "#202020",
              activeBackgroundColor: ACCENT,
              borderColor: "#404040",
              textColor: WHITE,
              iconColor: WHITE,
              fontId: "font-roboto-16",
              states: [
                {
                  id: "st-on",
                  label: "An",
                  readValue: "ON",
                  writeValue: "OFF",
                  iconAssetId: "icon-circle",
                  showMarker: true,
                },
                {
                  id: "st-off2",
                  label: "Aus",
                  readValue: "OFF",
                  writeValue: "ON",
                  iconAssetId: "icon-square",
                },
              ],
            },
          },
          // A label sharing a zIndex with the Switch above and overlapping
          // it. The firmware's own draw order broke exactly here on
          // 2026-08-25: two objects with equal zIndex, each side drawing the
          // other on top, 1533 differing pixels. The tie is broken by object
          // id everywhere, and "s3-single" sorts before "s3-zlabel".
          {
            id: "s3-zlabel",
            type: "text",
            zIndex: 2,
            x: 120,
            y: 250,
            width: 160,
            height: 20,
            properties: {
              text: "ueberlappt",
              fontId: "font-roboto-12",
              color: BLACK,
              backgroundColor: WHITE,
              borderColor: "transparent",
            },
          },
        ],
      },

      {
        id: "screen-4",
        name: "Panels",
        masterScreenId: "master-1",
        objects: [
          {
            id: "s4-tabs",
            type: "switcher",
            zIndex: 1,
            x: 12,
            y: 70,
            width: 336,
            height: 300,
            properties: { topic: "hil/mode" },
            children: [
              {
                id: "s4-panel-auto",
                type: "panel",
                zIndex: 0,
                x: 0,
                y: 0,
                width: 336,
                height: 300,
                properties: { comparisonOperator: "==", comparisonValue: "AUTO" },
                children: [
                  // Both halves of the export have to reach an object this
                  // deep: the icon has to be written, and the path to it has
                  // to be written back onto the state.
                  {
                    id: "s4-nested-switch",
                    type: "button-group",
                    zIndex: 1,
                    x: 8,
                    y: 8,
                    width: 320,
                    height: 90,
                    properties: {
                      topic: "hil/power",
                      writeTopic: "hil/power/set",
                      mode: "segmented",
                      backgroundColor: "#202020",
                      activeBackgroundColor: FILL,
                      borderColor: "#404040",
                      textColor: WHITE,
                      iconColor: FILL,
                      fontId: "font-roboto-16",
                      states: [
                        { id: "st-n-on", label: "Ein", readValue: "ON", writeValue: "ON", iconAssetId: "icon-circle" },
                        { id: "st-n-off", label: "Aus", readValue: "OFF", writeValue: "OFF", iconAssetId: "icon-square" },
                      ],
                    },
                  },
                  {
                    id: "s4-nested-icon",
                    type: "live-icon",
                    zIndex: 2,
                    x: 8,
                    y: 120,
                    width: 64,
                    height: 64,
                    properties: {
                      topic: "hil/text",
                      iconColor: ACCENT,
                      backgroundColor: "transparent",
                      valueIconPairs: [
                        { id: "p-ok", value: "OK", thenShowIcon: "icon-circle" },
                        { id: "p-warn", value: "WARN", thenShowIcon: "icon-triangle" },
                        { id: "p-fail", value: "FAIL", thenShowIcon: "icon-square" },
                      ],
                    },
                  },
                ],
              },
              {
                id: "s4-panel-manual",
                type: "panel",
                zIndex: 1,
                x: 0,
                y: 0,
                width: 336,
                height: 300,
                properties: { comparisonOperator: "==", comparisonValue: "MANUAL" },
                children: [
                  {
                    id: "s4-manual-label",
                    type: "text",
                    zIndex: 1,
                    x: 8,
                    y: 8,
                    width: 320,
                    height: 24,
                    properties: {
                      text: "Handbetrieb",
                      fontId: "font-roboto-20",
                      color: WHITE,
                      backgroundColor: "transparent",
                      borderColor: "transparent",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Every object in the tree, containers included. */
const flatten = (list) => (list || []).flatMap((o) => [o, ...flatten(o.children)]);

function fail(message) {
  console.error(`  FAIL ${message}`);
  process.exitCode = 1;
}

/** `--screen 360x679`, or the connected phone's own answer. */
async function resolveScreen() {
  const arg = process.argv.indexOf("--screen");
  if (arg >= 0 && process.argv[arg + 1]) {
    const m = /^(\d+)x(\d+)$/.exec(process.argv[arg + 1]);
    if (!m) throw new Error(`--screen wants WIDTHxHEIGHT, got "${process.argv[arg + 1]}"`);
    return { width: Number(m[1]), height: Number(m[2]), from: "--screen" };
  }
  const ddf = await phoneDdf();
  return { width: ddf.screen.width, height: ddf.screen.height, from: "the connected phone" };
}

async function main() {
  const screen = await resolveScreen();
  SCREEN_W = screen.width;
  SCREEN_H = screen.height;
  console.log(`Building for a ${SCREEN_W}x${SCREEN_H} screen (from ${screen.from}).`);

  const project = buildProject(await allDdfFonts());

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`  [page] ${msg.text()}`);
  });

  let zipBase64;
  try {
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 30000 });
    zipBase64 = await page.evaluate((p) => window.__buildAndroidZipForTest(p), project);
  } catch (error) {
    console.error(
      `Could not reach the designer at ${DESIGNER_URL} - start it with "npm run dev" first.\n${error.message}`,
    );
    await browser.close();
    process.exit(1);
  }
  await browser.close();

  const bytes = Buffer.from(zipBase64, "base64");
  fs.writeFileSync(OUT_PATH, bytes);
  // The icons as the DESIGNER holds them, beside the bundle rather than in
  // it. The bundle carries baked bitmaps for anything whose ink or colour is
  // decided here (a Switch's states, a SoftwareButton, a level's header
  // icon); the reference image is the designer drawing the same project, and
  // for that it needs the sources. A phone has no use for them, so they do
  // not travel in the deploy - see iconAssetsFor in the orchestrator.
  const assetsPath = OUT_PATH.replace(/\.zip$/, ".assets.json");
  fs.writeFileSync(assetsPath, JSON.stringify(project.assets, null, 2));

  console.log(`wrote ${OUT_PATH} (${bytes.length} bytes)`);
  console.log(`wrote ${assetsPath} (${project.assets.length} icon source(s) for the reference render)`);

  // Everything below checks the bundle the export actually produced, not the
  // project that went in. A fixture that looks right on the way in and
  // arrives incomplete is the failure mode this whole file exists to avoid -
  // the run would then report a correct app as broken.
  const zip = await JSZip.loadAsync(bytes);
  const exported = JSON.parse(await zip.file("project.json").async("string"));
  const objects = exported.screens.flatMap((s) => flatten(s.objects));

  console.log(`  ${exported.screens.length} screen(s), ${objects.length} object(s)`);

  if (exported.screens.some((s) => s.id === "master-1")) {
    fail("the master screen came out as a screen of its own");
  }
  for (const screen of exported.screens) {
    if (!screen.backgroundImage || !zip.file(screen.backgroundImage)) {
      fail(`${screen.id}: no flattened background in the bundle`);
    }
    if (screen.backgroundColor !== DARK) {
      fail(`${screen.id}: background colour ${screen.backgroundColor} was not inherited from the master`);
    }
    const inherited = Object.keys(screen.buttonActions || {}).sort();
    if (inherited.join(",") !== "swipe-left,swipe-right,swipe-up") {
      fail(`${screen.id}: expected the master's three swipe bindings, got [${inherited}]`);
    }
    const title = flatten(screen.objects).find((o) => o.id === "m-title");
    if (!title) fail(`${screen.id}: the master's title label was not merged in`);
    else if (title.properties.text !== exported.name) {
      fail(`${screen.id}: {project:name} exported as "${title.properties.text}", not "${exported.name}"`);
    }
  }

  // Fonts: the app loads the file, so a missing one means every label falls
  // back to a system face and the whole comparison is meaningless.
  for (const font of exported.fonts) {
    if (font.path && !zip.file(font.path)) fail(`font ${font.id} points at a missing ${font.path}`);
  }

  const buttons = objects.filter((o) => o.type === "button");
  for (const button of buttons) {
    if (!button.path) fail(`SoftwareButton ${button.id} carries no icon path`);
    else if (!zip.file(button.path)) fail(`SoftwareButton ${button.id} points at a missing ${button.path}`);
  }
  console.log(`  ${buttons.length} SoftwareButton(s) with a resolved icon`);

  const states = objects
    .filter((o) => ["switch", "button-group"].includes(o.type))
    .flatMap((o) => (o.properties.states || []).map((st) => ({ obj: o.id, st })));
  let withIcon = 0;
  for (const { obj, st } of states) {
    for (const key of ["path", "activePath"]) {
      if (!st[key]) continue;
      withIcon++;
      if (!zip.file(st[key])) fail(`Switch ${obj}/${st.id}: ${key} points at a missing ${st[key]}`);
    }
  }
  console.log(`  ${states.length} Switch state(s), ${withIcon} icon file(s) resolved`);

  const pairs = objects
    .filter((o) => o.type === "live-icon")
    .flatMap((o) => (o.properties.valueIconPairs || []).map((p) => ({ obj: o.id, p })));
  for (const { obj, p } of pairs) {
    if (!p.path) fail(`MQTTIconField ${obj}: rule ${p.id} carries no icon path`);
    else if (!zip.file(p.path)) fail(`MQTTIconField ${obj}: ${p.path} is not in the bundle`);
  }
  console.log(`  ${pairs.length} MQTTIconField rule(s) resolved`);

  // Types are the point of the fixture: it exists to cover what the DDF
  // says this device can render, so a type quietly dropping out of the
  // export has to stop the build rather than shrink the next run's coverage.
  //
  // Held to the phone's OWN list rather than to a list written here, since
  // 2026-09-22. The hand-written one named seven types and the DDF declared
  // sixteen, so slider, dial and icon were never in a fixture at all - three
  // types the suite reported nothing about, which reads exactly like three
  // types that work. A list kept by hand cannot notice what was added to the
  // other end.
  const placed = new Set(objects.map((o) => o.type));
  const declared = (await phoneDdf()).supportedObjectTypes;
  const missing = declared.filter((type) => !placed.has(type));
  if (missing.length > 0) {
    fail(
      `the phone declares [${missing.join(", ")}] and the fixture has none of them. ` +
        "Add one of each to a screen, or the run reports nothing about them at all."
    );
  }
  console.log(
    `  types present: ${[...placed].sort().join(", ")} ` +
      `(${declared.filter((t) => placed.has(t)).length} of the ${declared.length} the phone declares)`
  );

  if (process.exitCode) {
    console.error("\nfixture is incomplete - do not run the orchestrator against it");
  } else {
    console.log("\nfixture OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
