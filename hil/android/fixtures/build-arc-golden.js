// Records what the designer's arc rasterizer produces, so the Android port
// of it can be held to the same numbers by a plain JVM unit test.
//
// Why a golden file and not a HIL run: the arc rasterizer is the one piece
// of rendering that exists three times over (lib/arc-raster.ts here,
// ArcRaster.cpp in each firmware, ArcRaster.kt in the Android app), and its
// whole reason for being written in integer arithmetic is that the copies
// must not be able to disagree. A HIL run would eventually notice a
// disagreement - as a handful of stray pixels along one edge, after a phone
// is connected, a broker is up and a bundle has been imported by hand. This
// notices it in milliseconds, on any machine, with no hardware at all, and
// says which pixel.
//
// It covers both halves of the rasterizer:
//   - the geometry: how many of a pixel's 16 sub-samples fall in each band,
//     which is where the sine table, the 1/8-pixel lattice and the
//     cross-product sector test all land.
//   - the colour: what those counts mix into, which is where the 5/6/5
//     quantisation, the explicit rounding and the bit-replication back to 8
//     bits land. That half is worth pinning precisely because an Android
//     phone has 8-bit colour and could "correctly" skip all of it - and
//     would then differ from both other copies.
//
// Pixels are not sampled at random. Each case walks a full row and a full
// column through the ring, which crosses every boundary that exists: the
// outer edge, the inner edge, the fill's leading edge, the setpoint marker,
// and the gap at the bottom of a partial dial.
//
// Run (needs the designer dev server, npm run dev):
//   node hil/android/fixtures/build-arc-golden.js
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
  "arc-raster-golden.json",
);

const DEG = 64; // 1/64 degree units, the rasterizer's own scale

// Colours a real project would use, not round numbers: #4caf50 and #303030
// are the arc's own defaults, and neither survives the 5/6/5 round trip
// unchanged - which is the point. A palette of RGB565 fixed points would
// let a port skip the quantisation entirely and still match.
const COLOURS = { track: "#303030", fill: "#4caf50", marker: "#ffffff", background: "#101010" };

// One entry per shape worth distinguishing.
const CASES = [
  {
    name: "thermostat-cw-half-full",
    // 225deg to 135deg clockwise: the default dial, a 270deg sweep with a
    // gap at the bottom. Half filled, with a setpoint marker further round.
    size: 360,
    thickness: 22,
    trackStart64: 225 * DEG,
    trackSweep64: 270 * DEG,
    fillStart64: 225 * DEG,
    fillSweep64: 135 * DEG,
    markerStart64: 225 * DEG + 200 * DEG - 2 * DEG,
    markerSweep64: 4 * DEG,
  },
  {
    name: "full-ring",
    // Equal min and max means a full turn - the `full` short circuit in
    // makeArcSector, which no cross product is ever asked about.
    size: 200,
    thickness: 16,
    trackStart64: 0,
    trackSweep64: 360 * DEG,
    fillStart64: 0,
    fillSweep64: 90 * DEG,
  },
  {
    name: "wide-sweep-over-half-turn",
    // Over 180deg, so the sector test switches from intersecting two
    // half-planes to unioning them. A port that misses `wide` draws the
    // complement of the arc and looks spectacularly wrong exactly here.
    size: 240,
    thickness: 30,
    trackStart64: 300 * DEG,
    trackSweep64: 300 * DEG,
    fillStart64: 300 * DEG,
    fillSweep64: 250 * DEG,
  },
  {
    name: "ccw-filled-from-the-other-end",
    // A counter-clockwise dial is the same clockwise sector filled from its
    // far end - the branch resolveArcSweep takes for direction "ccw".
    // Recorded whole (see SAMPLE_ALL_UP_TO), since getting the fill's origin
    // wrong shows up as the arc filling from the opposite side, which a line
    // sample can easily agree with by accident.
    size: 72,
    thickness: 12,
    trackStart64: 90 * DEG,
    trackSweep64: 180 * DEG,
    fillStart64: 90 * DEG + 180 * DEG - 70 * DEG,
    fillSweep64: 70 * DEG,
  },
  {
    name: "thin-ring-odd-size",
    // An odd side length puts the centre on a half pixel, and a 1px
    // thickness leaves the inner and outer edges one pixel apart - the two
    // places integer division is most likely to be rounded differently by
    // two languages. Recorded whole: a thin ring has so little of itself on
    // any one line that a line sample proves nearly nothing about it.
    size: 61,
    thickness: 1,
    trackStart64: 45 * DEG,
    trackSweep64: 200 * DEG,
    fillStart64: 45 * DEG,
    fillSweep64: 100 * DEG,
  },
  {
    name: "marker-only-tiny",
    // A setpoint marker with no fill behind it, on a small ring recorded
    // whole - the marker band is tested before the fill band in
    // arcPixelBands, and a port that got that order wrong would still look
    // right anywhere the two do not overlap.
    size: 64,
    thickness: 10,
    trackStart64: 0,
    trackSweep64: 360 * DEG,
    fillStart64: 0,
    fillSweep64: 0,
    markerStart64: 30 * DEG,
    markerSweep64: 8 * DEG,
  },
  {
    name: "sub-degree-fill-edge",
    // A fill edge at a fraction of a degree: the linear interpolation
    // between two sine-table entries, which is the only place the table is
    // not read verbatim.
    size: 300,
    thickness: 20,
    trackStart64: 225 * DEG,
    trackSweep64: 270 * DEG,
    fillStart64: 225 * DEG,
    fillSweep64: 137 * DEG + 37,
  },
  {
    name: "fractional-angles-tiny",
    // Every boundary at a fraction of a degree, on a ring small enough to
    // record whole.
    //
    // This case exists because of a mutation test, not because of a theory:
    // dropping the `+ 32` rounding term from arcDirection's interpolation -
    // the single most likely thing for a port to leave out - changed nothing
    // in any other case here, and all three golden tests passed against a
    // rasterizer that was measurably not the reference. The reason is that
    // every other case puts its boundaries on whole degrees, where `frac` is
    // zero and the rounding term cannot matter. A golden file that never
    // asks a fractional angle cannot notice a fractional-angle bug.
    size: 78,
    thickness: 14,
    trackStart64: 12 * DEG + 19,
    trackSweep64: 233 * DEG + 41,
    fillStart64: 12 * DEG + 19,
    fillSweep64: 151 * DEG + 7,
    markerStart64: 190 * DEG + 53,
    markerSweep64: 5 * DEG + 29,
  },
];

// Below this side length every pixel of the object is recorded; above it,
// only a row, a column and a diagonal. A 360px ring is 129600 pixels and
// would make a golden file nobody wants to read a diff of, while a 79px one
// is 6241 - cheap enough to pin completely.
const SAMPLE_ALL_UP_TO = 80;

/**
 * Which pixels to record.
 *
 * Small cases are recorded whole, which is the only sampling that cannot
 * miss anything: a line through a ring crosses each edge exactly twice, and
 * a thin ring at an odd size - the case most likely to expose a rounding
 * difference - has almost nothing on any given line to cross. The first
 * version of this file sampled three lines through a 61px ring and touched
 * three pixels of it, which would have passed against very nearly any port.
 *
 * Large cases keep the row/column/diagonal: the row and column cross the
 * ring where its edge is steepest, the diagonal where it is shallow, and a
 * shallow edge is the harder one for two sub-pixel counters to agree on.
 */
function samplePixels(size) {
  const pixels = [];
  if (size <= SAMPLE_ALL_UP_TO) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) pixels.push([x, y]);
    }
    return pixels;
  }
  const mid = Math.floor(size / 2);
  for (let x = 0; x < size; x++) pixels.push([x, mid]);
  for (let y = 0; y < size; y++) pixels.push([mid, y]);
  for (let i = 0; i < size; i++) pixels.push([i, i]);
  return pixels;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let cases;
  try {
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 30000 });

    cases = [];
    for (const testCase of CASES) {
      const pixels = samplePixels(testCase.size);
      const bands = await page.evaluate(
        (req) => window.__arcRasterForTest(req),
        { ...testCase, pixels },
      );
      const argb = await page.evaluate(
        (req) => window.__arcBlendForTest(req),
        { ...COLOURS, bands },
      );
      cases.push({
        ...testCase,
        pixels,
        // Flattened to three parallel arrays: the file is read by a Kotlin
        // test with no JSON object mapping beyond the basics, and this keeps
        // it to plain numbers.
        fill: bands.map((b) => b.fill),
        track: bands.map((b) => b.track),
        marker: bands.map((b) => b.marker),
        rgb: argb,
      });
      const covered = bands.filter((b) => b.fill + b.track + b.marker > 0).length;
      const partial = bands.filter((b) => {
        const c = b.fill + b.track + b.marker;
        return c > 0 && c < 16;
      }).length;
      console.log(
        `  ${testCase.name}: ${pixels.length} pixels, ${covered} touch the ring, ${partial} partially`,
      );
      if (partial === 0) {
        console.error(
          `  FAIL ${testCase.name} samples no anti-aliased pixel - it would pass against a port with no anti-aliasing at all`,
        );
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(
      `Could not reach the designer at ${DESIGNER_URL} - start it with "npm run dev" first.\n${error.message}`,
    );
    await browser.close();
    process.exit(1);
  }
  await browser.close();

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  // One line per case rather than pretty-printed throughout: the payload is
  // four parallel arrays of tens of thousands of small integers, and an
  // indented one puts each of them on its own line - 1.6MB of file to say
  // 400KB of numbers, with no more readability for it. Nobody reads a diff
  // of a golden file; they regenerate it and look at what the test says.
  const body = cases.map((c) => "    " + JSON.stringify(c)).join(",\n");
  fs.writeFileSync(
    OUT_PATH,
    `{\n  "colours": ${JSON.stringify(COLOURS)},\n  "cases": [\n${body}\n  ]\n}\n`,
  );
  console.log(`\nwrote ${OUT_PATH}`);
  console.log("run the Kotlin side with: gradle test --tests '*ArcRasterGoldenTest'");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
