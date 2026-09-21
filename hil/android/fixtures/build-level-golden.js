// Records what the designer makes of a level indicator, so the Android port
// of the same rules can be held to it by a plain JVM unit test.
//
// Why a golden file and not a HIL run: these rules exist twice over now
// (lib/level-shape.ts here, LevelShape.kt in the app), and two copies of a
// rule are two chances to disagree. A HIL run does notice - it is the 2.2%
// of differing pixels the Android suite reports today - but only once a
// phone is connected and a fixture installed, and then only as a percentage.
// This notices in milliseconds, on any machine, and says which number.
//
// Geometry and colour together, because on this control they are not
// separable: the unfilled part of the track is the fill's own colour mixed
// into the background the whole thing stands on (docs/2026-09-19-slider-look
// .md, decision 12), so a port that gets the background wrong changes the
// colours and nothing else - which is invisible in a geometry-only check.
//
// Cases are not decoration. Each one exists because it is a branch somewhere
// in the rules, and a port that misses the branch passes every other case:
//
//   - a bar at 0, 45 and 100 percent: the two segments either side of the
//     edge, and the degenerate ends where one of them has no width at all.
//   - no value at all: the track alone, no fill. "Nothing reported" is not
//     "empty" (docs/2026-09-15-live-data.md), and a port that draws a
//     zero-width fill instead of nothing looks right until the tank is
//     genuinely empty.
//   - a slider: the handle, and the track split around it rather than
//     drawn through it.
//   - vertical, and filling from the far end: which coordinate the edge
//     moves along, and from which side.
//   - a header with a name and a number: where the track starts once
//     something is written above it.
//   - a dark background and a light one: levelTrackLook mixes towards the
//     background, so the same fill gives two different empty tracks.
//   - a real project font, with and without a measured baseline: the header
//     is exactly one line of the FONT, and a TTF's line is not the numbers
//     the DDF declares - it is what the browser measured when the font was
//     added, or four fifths of the size when nothing did. A port that reads
//     the declared ascent instead puts every header off by a row or two,
//     and only a case carrying a font can tell.
//
// Run (needs the designer dev server, npm run dev):
//   node hil/android/fixtures/build-level-golden.js

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
  "ScreensmithAndroid",
  "app",
  "src",
  "test",
  "resources",
  "level-shape-golden.json",
);

// A real project's colours, not round numbers: #4CAF50 is the bar's own
// default and neither it nor what it mixes into is a fixed point of
// anything, so a port cannot match by skipping the arithmetic.
const GREEN = "#4CAF50";
const DARK = "#101010";
const LIGHT = "#ffffff";

// What the phone's own DDF declares (ScreensmithAndroid's DdfBuilder): a
// Roboto at four sizes, each with the ascent/descent the designer lays text
// out with. Note what the rules do NOT do with them - a TTF's line comes from
// `baselineOffset`, which a DDF font does not have, so ascent 15 here does
// not make a 15-pixel ascent. That trap is the reason this case exists.
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

// A font added through the designer's own TTF dialog, which measures the face
// in the browser and remembers the figure. 14.2 is deliberately not four
// fifths of 20 (16), so the two branches cannot be confused for each other.
const MEASURED_FONT = {
  ...DDF_FONT,
  id: "font-measured-20",
  displayName: "Roboto 20px",
  size: 20,
  ascent: 19,
  descent: 5,
  baselineOffset: 14.2,
};

const CASES = [
  {
    name: "bar-45-percent",
    type: "bar",
    box: { x: 20, y: 40, width: 280, height: 40 },
    properties: { fillColor: GREEN },
    percent: 45,
    background: DARK,
  },
  {
    name: "bar-empty",
    type: "bar",
    box: { x: 20, y: 40, width: 280, height: 40 },
    properties: { fillColor: GREEN },
    percent: 0,
    background: DARK,
  },
  {
    name: "bar-full",
    type: "bar",
    box: { x: 20, y: 40, width: 280, height: 40 },
    properties: { fillColor: GREEN },
    percent: 100,
    background: DARK,
  },
  {
    name: "bar-on-white",
    // The same bar on the other kind of background: the empty track is mixed
    // towards whatever it stands on, so this is a different colour entirely.
    type: "bar",
    box: { x: 20, y: 40, width: 280, height: 40 },
    properties: { fillColor: GREEN },
    percent: 45,
    background: LIGHT,
  },
  {
    name: "bar-with-name-and-number",
    type: "bar",
    box: { x: 12, y: 12, width: 320, height: 64 },
    properties: { fillColor: GREEN, label: "Frischwasser", displayValue: "percentage" },
    percent: 62,
    background: DARK,
  },
  {
    name: "slider-with-handle",
    type: "slider",
    box: { x: 20, y: 40, width: 280, height: 48 },
    properties: { fillColor: GREEN, writeTopic: "hil/target" },
    percent: 30,
    setpointPercent: 70,
    background: DARK,
  },
  {
    name: "bar-vertical",
    type: "bar",
    box: { x: 40, y: 20, width: 48, height: 220 },
    properties: { fillColor: GREEN, barDirection: "bottom-to-top" },
    percent: 35,
    background: DARK,
  },
  {
    name: "bar-right-to-left",
    // Horizontal, but the fill grows from the far end - the other branch of
    // levelFillsFromEnd, and the one a port gets backwards.
    type: "bar",
    box: { x: 20, y: 40, width: 280, height: 40 },
    properties: { fillColor: GREEN, barDirection: "right-to-left" },
    percent: 25,
    background: DARK,
  },
  {
    name: "bar-with-ddf-font",
    // A header laid out from a real project font. What is being checked is
    // the ascent: 13 (four fifths of 16, rounded), not the 15 the font entry
    // carries - so the header is 16 tall and the baseline sits at y+13.
    type: "bar",
    box: { x: 16, y: 24, width: 300, height: 56 },
    properties: {
      fillColor: GREEN,
      label: "Frischwasser",
      displayValue: "percentage",
      fontId: DDF_FONT.id,
    },
    fonts: [DDF_FONT],
    percent: 62,
    background: DARK,
  },
  {
    name: "slider-with-measured-font",
    // The other branch: a font that was measured when it was added, and a
    // handle, so the header, the two numbers' room and the split track are
    // all decided at once.
    type: "slider",
    box: { x: 16, y: 24, width: 300, height: 72 },
    properties: {
      fillColor: GREEN,
      label: "Dimmer",
      displayValue: "percentage",
      fontId: MEASURED_FONT.id,
      writeTopic: "hil/target",
    },
    fonts: [MEASURED_FONT],
    percent: 40,
    setpointPercent: 55,
    background: DARK,
  },
  {
    name: "bar-vertical-with-header",
    // Vertical AND named: the number goes below the bar rather than beside
    // it, which is the one place the two axes are laid out differently.
    type: "bar",
    box: { x: 40, y: 20, width: 90, height: 240 },
    properties: {
      fillColor: GREEN,
      label: "Tank",
      displayValue: "percentage",
      fontId: DDF_FONT.id,
      barDirection: "bottom-to-top",
    },
    fonts: [DDF_FONT],
    percent: 35,
    background: DARK,
  },
  {
    name: "bar-thick",
    // A thickness the object is too small to honour, which is where the
    // clamps live.
    type: "bar",
    box: { x: 20, y: 40, width: 120, height: 24 },
    properties: { fillColor: GREEN, barThickness: 40 },
    percent: 50,
    background: DARK,
  },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[designer page error]", err.message));
  await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__levelShapeForTest !== undefined, { timeout: 20000 });

  const golden = { generated: new Date().toISOString(), cases: {} };
  for (const testCase of CASES) {
    const shape = await page.evaluate(
      (req) => window.__levelShapeForTest(req),
      {
        type: testCase.type,
        ...testCase.box,
        properties: testCase.properties,
        fonts: testCase.fonts ?? [],
        percent: testCase.percent,
        setpointPercent: testCase.setpointPercent ?? -1,
        background: testCase.background,
        colorDepth: "24bit",
      },
    );
    golden.cases[testCase.name] = {
      input: {
        type: testCase.type,
        ...testCase.box,
        properties: testCase.properties,
        // Recorded as the app's own project.json carries them, not as the
        // designer holds them: the export writes `path` for a TTF and no
        // `format` field at all, and the port decides which branch it is in
        // by that path. Recording the designer's shape instead would let a
        // port pass here and be laid out differently on the phone.
        fonts: (testCase.fonts ?? []).map((font) => ({
          id: font.id,
          displayName: font.displayName,
          size: font.size,
          ascent: font.ascent,
          descent: font.descent,
          ...(font.format === "ttf" ? { path: `assets/fonts/${font.internalName}.ttf` } : {}),
          ...(font.baselineOffset !== undefined ? { baselineOffset: font.baselineOffset } : {}),
        })),
        percent: testCase.percent,
        setpointPercent: testCase.setpointPercent ?? -1,
        background: testCase.background,
        // Always 24 bit on this platform (the app's DdfBuilder says so), so
        // the designer's quantiser is the identity and the Kotlin port has no
        // copy of it. Recorded anyway, so that a case added later at another
        // depth fails loudly in the test rather than silently comparing
        // unquantised colours.
        colorDepth: "24bit",
      },
      shape,
    };
    console.log(
      `${testCase.name}: track ${shape.track.w}x${shape.track.h} r${shape.track.r}, ` +
        `${shape.segments.length} segment(s), empty track ${shape.trackLook.track}`,
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
