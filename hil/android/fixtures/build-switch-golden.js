// Records what the designer makes of a Switch, so the Android port of the
// same rules can be held to it by a plain JVM unit test.
//
// The companion of build-level-golden.js, and for the same reason: these
// rules exist twice over (lib/switch-shape.ts here, SwitchShape.kt in the
// app), and two copies of a rule are two chances to disagree. A HIL run
// notices - the Switches screen differs by 8% of its pixels while the port is
// missing - but only with a phone connected, and then only as a percentage.
// This names the number, in milliseconds, on any machine.
//
// Geometry AND colour, because on this control the colours are most of it:
// everything is derived from ONE colour the author sets and from what the
// control stands on. The container is that colour blended a quarter of the
// way into the background, the ink on it is black or white by Material's own
// tone rule, and the quiet pair is the slider's own tint - so a port that
// gets a derivation wrong draws the right shapes in the wrong colours, which
// a geometry-only check cannot see at all.
//
// Text is not measured here: where a label sits depends on how wide it is,
// and that is Skia's answer in the app and the browser's here. The width is
// an input, so what is compared is the layout rule rather than two font
// engines.
//
// Cases are not decoration. Each is a branch a port can get wrong while
// passing every other case:
//
//   - two and three buttons in a group: the outer ends are fully round and
//     the corners where two buttons face each other are not, which is the
//     whole shape of a Material connected button group. A port that gives
//     every button the same radius draws a row of pills with gaps.
//   - a container as tall as it is wide: the corner rule switches from "half
//     the height" to "a third of the short side", or a two-button group comes
//     out as two circles.
//   - filled and tonal: which colour the chosen button takes.
//   - a light background and a dark one: the container is blended INTO the
//     background, and the ink on it flips from black to white at Material's
//     tone 60. Same object, two different sets of colours.
//   - no colour set at all: the palette's own, which both sides have to agree
//     on to the digit.
//   - the knob form, on and off: the track is two thirds of the height, the
//     knob stands in one of n slots, and off is the quiet pair rather than a
//     grey that no palette here has.
//   - a knob switch too narrow for the track it wants: the clamp.
//   - content in a strip and in a tile: icon beside the label when the box is
//     wider than tall, above it when it is not.
//   - a real project font: the icon is a capital's height, so the whole
//     content block follows from the font's measure.
//   - a button that is at once the reported state AND the one a finger just
//     asked for. A ring is its outer pill with the inside taken back, so what
//     lies under it is decided rather than inherited (switchRingFill), and
//     this is the only arrangement where the answer is the button's OWN
//     colour: everywhere else it is the container, or nothing. The designer
//     drew the container's surface there until 2026-09-22, which made the
//     chosen button look as though the selection had already moved. No case
//     had both indexes on the same button, so nothing could tell.
//
// Run (needs the designer dev server, npm run dev):
//   node hil/android/fixtures/build-switch-golden.js

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000";
const OUT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "schaltli-android",
  "app",
  "src",
  "test",
  "resources",
  "switch-shape-golden.json",
);

// Real colours, not round numbers: none of these is a fixed point of the
// blend or of the tone rule, so a port cannot match by skipping the
// arithmetic.
const PURPLE = "#6750A4";
const TEAL = "#00796B";
const DARK = "#101010";
const LIGHT = "#ffffff";

// What the phone's own DDF declares (schaltli-android's DdfBuilder). A
// TTF's line is what the browser measured when the font was added, or four
// fifths of the size when nothing did - NOT the ascent the entry carries.
const DDF_FONT = {
  id: "font-roboto-16",
  name: "Roboto",
  displayName: "Roboto 16px",
  internalName: "Roboto",
  size: 16,
  ascent: 15,
  descent: 4,
  format: "ttf",
};

const TWO_STATES = [
  { id: "st-on", label: "An", readValue: "ON", writeValue: "ON", showAsOn: true },
  { id: "st-off", label: "Aus", readValue: "OFF", writeValue: "OFF" },
];
const THREE_STATES = [
  { id: "st-a", label: "Auto", readValue: "AUTO", writeValue: "AUTO" },
  { id: "st-b", label: "Manuell", readValue: "MANUAL", writeValue: "MANUAL" },
  { id: "st-c", label: "Aus", readValue: "OFF", writeValue: "OFF", showAsOn: false },
];

const CASES = [
  {
    name: "group-two-buttons",
    type: "button-group",
    box: { x: 20, y: 40, width: 200, height: 48 },
    properties: { switchColor: PURPLE, states: TWO_STATES },
    stateCount: 2,
    activeIndex: 0,
    textWidth: 18,
    background: LIGHT,
  },
  {
    name: "group-three-buttons",
    // The middle button is round on neither side - the case that tells a port
    // reading "first and last" apart from one reading "every button".
    type: "button-group",
    box: { x: 20, y: 40, width: 300, height: 48 },
    properties: { switchColor: PURPLE, states: THREE_STATES },
    stateCount: 3,
    activeIndex: 1,
    textWidth: 44,
    background: LIGHT,
  },
  {
    name: "group-square",
    // As tall as it is wide: the corner rule changes, or two buttons come out
    // as two circles inside a pill.
    type: "button-group",
    box: { x: 20, y: 40, width: 96, height: 96 },
    properties: { switchColor: PURPLE, states: TWO_STATES },
    stateCount: 2,
    activeIndex: 1,
    textWidth: 18,
    hasIcon: true,
    background: LIGHT,
  },
  {
    name: "group-tonal-on-dark",
    // Tonal on a dark ground: the chosen button takes the tint rather than
    // the colour, and the ink on the container flips to white.
    type: "button-group",
    box: { x: 20, y: 40, width: 220, height: 44 },
    properties: { switchColor: TEAL, switchStyle: "tonal", states: TWO_STATES },
    stateCount: 2,
    activeIndex: 0,
    askedIndex: 1,
    textWidth: 26,
    background: DARK,
  },
  {
    name: "group-default-colour",
    // No colour set: the palette's own, which is the one number a port is
    // most likely to invent for itself.
    type: "button-group",
    box: { x: 12, y: 12, width: 180, height: 40 },
    properties: { states: TWO_STATES },
    stateCount: 2,
    activeIndex: -1,
    textWidth: 18,
    background: LIGHT,
  },
  {
    name: "group-with-font",
    // Laid out from a real project font: the icon is a capital's height, so
    // the content block and the baseline follow from the font's measure.
    type: "button-group",
    box: { x: 16, y: 24, width: 240, height: 56 },
    properties: { switchColor: PURPLE, states: TWO_STATES, fontId: DDF_FONT.id },
    fonts: [DDF_FONT],
    stateCount: 2,
    activeIndex: 0,
    hasIcon: true,
    textWidth: 22,
    background: LIGHT,
  },
  {
    name: "group-asked-for-what-is-already-chosen",
    // The same button reported and asked for: a finger back on the state the
    // installation is already in, or a tap whose answer has not come back yet.
    // It gets the ring AND keeps its own colour under it. Three buttons, so
    // the two that are neither are recorded beside it, and on a dark ground so
    // the container's surface is plainly a different colour from the chosen
    // pill - which is what the ring used to show through.
    type: "button-group",
    box: { x: 20, y: 40, width: 300, height: 48 },
    properties: { switchColor: PURPLE, states: THREE_STATES },
    stateCount: 3,
    activeIndex: 1,
    askedIndex: 1,
    textWidth: 44,
    background: DARK,
  },
  {
    name: "knob-off",
    type: "switch",
    box: { x: 24, y: 60, width: 200, height: 48 },
    properties: { switchColor: PURPLE, states: TWO_STATES },
    stateCount: 2,
    activeIndex: 1,
    textWidth: 30,
    background: LIGHT,
  },
  {
    name: "knob-on",
    // The same object in the state that counts as on: the track takes the
    // colour and the knob takes the ink on it.
    type: "switch",
    box: { x: 24, y: 60, width: 200, height: 48 },
    properties: { switchColor: PURPLE, states: TWO_STATES },
    stateCount: 2,
    activeIndex: 0,
    textWidth: 22,
    background: LIGHT,
  },
  {
    name: "knob-three-slots-on-dark",
    type: "switch",
    box: { x: 24, y: 60, width: 260, height: 52 },
    properties: { switchColor: TEAL, states: THREE_STATES },
    stateCount: 3,
    activeIndex: 2,
    askedIndex: 1,
    textWidth: 52,
    background: DARK,
  },
  {
    name: "knob-too-narrow",
    // Narrower than the track wants: the clamp, and a label box with nothing
    // left in it.
    type: "switch",
    box: { x: 24, y: 60, width: 40, height: 48 },
    properties: { switchColor: PURPLE, states: TWO_STATES },
    stateCount: 2,
    activeIndex: 0,
    textWidth: 22,
    background: LIGHT,
  },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[designer page error]", err.message));
  await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__switchShapeForTest !== undefined, { timeout: 20000 });

  const golden = { generated: new Date().toISOString(), cases: {} };
  for (const testCase of CASES) {
    const request = {
      type: testCase.type,
      ...testCase.box,
      properties: testCase.properties,
      fonts: testCase.fonts ?? [],
      stateCount: testCase.stateCount,
      activeIndex: testCase.activeIndex ?? -1,
      askedIndex: testCase.askedIndex ?? -1,
      pressedIndex: testCase.pressedIndex ?? -1,
      textWidth: testCase.textWidth ?? 0,
      hasIcon: testCase.hasIcon ?? false,
      background: testCase.background,
      colorDepth: "24bit",
    };
    const shape = await page.evaluate((req) => window.__switchShapeForTest(req), request);
    golden.cases[testCase.name] = {
      // Recorded as the app's own project.json carries them: the export
      // writes `path` for a TTF and no `format` at all, and the port decides
      // which branch of the font rules it is in by that path.
      input: {
        ...request,
        fonts: (testCase.fonts ?? []).map((font) => ({
          id: font.id,
          displayName: font.displayName,
          size: font.size,
          ascent: font.ascent,
          descent: font.descent,
          ...(font.format === "ttf" ? { path: `assets/fonts/${font.internalName}.ttf` } : {}),
          ...(font.baselineOffset !== undefined ? { baselineOffset: font.baselineOffset } : {}),
        })),
      },
      shape,
    };
    const seg = shape.segments[0];
    console.log(
      `${testCase.name}: ${shape.form}, ${shape.segments.length} segment(s) ` +
        `first ${seg.w}x${seg.h} r${seg.r}/${seg.rRight ?? seg.r}, track ${shape.track.w}x${shape.track.h}, ` +
        `surface ${shape.look.surface}, chosen ${shape.look.chosen}, ink ${shape.look.onSurface}, ` +
        `under a ring ${shape.ringFills.map((c) => c ?? "nothing").join("/")}`,
    );
  }

  await browser.close();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(golden, null, 2));
  console.log(`\nwrote ${OUT_PATH} (${CASES.length} case(s))`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
