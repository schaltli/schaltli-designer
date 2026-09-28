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
  "schaltli-android",
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
// The handle is the fill's own colour since 2026-09-22 - handle and
// filled track are one object that the gap separates.
//
// The pointer, since 2026-09-28, is the text's colour on a gauge - which has
// no handle - and a light grey that survives nothing unchanged either.
const COLOURS = { track: "#2a5c2c", fill: "#4caf50", handle: "#4caf50", pointer: "#d8ded8", background: "#101010" };

// One entry per shape worth distinguishing.
const CASES = [
  {
    name: "pointer-outside-a-gauge",
    // A gauge cannot be moved, so its setpoint is a triangle outside the ring,
    // its tip towards the centre, in the room the inset keeps - no handle and
    // no gap in the band. At an angle no axis runs along, so both of its
    // slanted edges are anti-aliased and neither is a row or a column.
    size: 76,
    thickness: 12,
    inset: 11,
    trackStart64: 225 * DEG,
    trackSweep64: 270 * DEG,
    fillStart64: 225 * DEG,
    fillSweep64: 150 * DEG,
    pointerAt64: 225 * DEG + 200 * DEG + 17,
    startCapFilled: true,
  },
  {
    name: "pointer-on-a-framed-gauge",
    // The same on 1 bit, where the track is an outline: the pointer stands
    // clear of the frame, which runs on unbroken past it.
    size: 70,
    thickness: 10,
    inset: 9,
    trackStart64: 225 * DEG,
    trackSweep64: 270 * DEG,
    fillStart64: 225 * DEG,
    fillSweep64: 60 * DEG,
    pointerAt64: 0,
    startCapFilled: true,
    framed: true,
  },
  {
    name: "rounded-ends-of-an-empty-scale",
    // Nothing reported: the track alone, and both of its ends rounded. The
    // caps are half-discs on the centreline at the scale's own angles, so a
    // port that draws the band as a plain sector differs along two short
    // curves and nowhere else - a handful of pixels that a line sample can
    // miss entirely, which is why this one is recorded whole.
    size: 120,
    thickness: 20,
    trackStart64: 225 * DEG,
    trackSweep64: 270 * DEG,
    fillStart64: 225 * DEG,
    fillSweep64: 0,
  },
  {
    name: "handle-standing-out-of-the-ring",
    // The setpoint handle: a pill lying across the band, standing out of it
    // on both sides, with a gap cut either side. Everything about it follows
    // from the thickness (eleven quarters long, an eleventh of that wide,
    // three twenty-seconds of gap), so a port that keeps the old wedge, or
    // clips the handle back into the ring, differs here by hundreds of
    // pixels.
    size: 76,
    thickness: 12,
    // The ring sits inside the object's edge by half the handle's overhang,
    // which is what keeps the handle inside the object on every platform.
    inset: 11,
    trackStart64: 270 * DEG,
    trackSweep64: 180 * DEG,
    fillStart64: 270 * DEG,
    fillSweep64: 60 * DEG,
    handleAt64: 270 * DEG + 120 * DEG,
    startCapFilled: true,
  },
  {
    name: "framed-track-for-one-bit",
    // Where the mixed track cannot be told from the background - all of 1
    // bit - the track is drawn as its own outline instead of as a body, one
    // pixel along each radius and around each cap. The fill and the handle
    // stay solid. Same rule as the bar's levelFrameInner.
    size: 78,
    thickness: 12,
    inset: 11,
    trackStart64: 225 * DEG,
    trackSweep64: 270 * DEG,
    fillStart64: 225 * DEG,
    fillSweep64: 100 * DEG,
    handleAt64: 225 * DEG + 190 * DEG,
    startCapFilled: true,
    framed: true,
  },
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
    handleAt64: 225 * DEG + 200 * DEG,
    startCapFilled: true,
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
    name: "handle-only-tiny",
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
    handleAt64: 34 * DEG,
  },
  {
    name: "sub-degree-fill-edge",
    // A fill edge at a fraction of a degree: the linear interpolation
    // between two sine-table entries, which is the only place the table is
    // not read verbatim.
    //
    // An odd side, so the centre sits on a half pixel and the sampled row,
    // column and diagonal all cross the band at a fraction of one - with an
    // even side they crossed it squarely and the case recorded no partial
    // coverage at all, which the check below refused (2026-09-22).
    size: 301,
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
    handleAt64: 193 * DEG + 18,
  },
];

// Below this side length every pixel of the object is recorded; above it,
// only a row, a column and a diagonal. A 360px ring is 129600 pixels and
// would make a golden file nobody wants to read a diff of, while a 79px one
// is 6241 - cheap enough to pin completely.
// A ring's gradient and glow (designer lib/level-glow.ts, 2026-09-28): per
// pixel the gradient step and the glow level, which is everything a port has
// to agree on before it mixes a colour. Recorded under "glowCases".
const GLOW_CASES = [
  {
    // A full ring, filled most of the way round: the gradient wraps the whole
    // turn, and the glow's end disc lies where the steps are highest.
    name: "full-ring-glowing",
    size: 200,
    thickness: 16,
    inset: 8,
    start64: 0,
    sweep64: 360 * DEG,
    fromEnd: false,
    filled64: 250 * DEG,
    levels: 8,
  },
  {
    // The default dial: the gap at the bottom, where a point takes the
    // nearer end of the scale rather than wrapping to its far end.
    name: "dial-gap-takes-nearer-end",
    size: 78,
    thickness: 12,
    inset: 11,
    start64: 225 * DEG,
    sweep64: 270 * DEG,
    fromEnd: false,
    filled64: 137 * DEG + 37,
    levels: 8,
  },
  {
    // Counter-clockwise: filled from the scale's other end, steps reversed.
    name: "ccw-steps-from-the-other-end",
    size: 72,
    thickness: 12,
    inset: 8,
    start64: 90 * DEG,
    sweep64: 180 * DEG,
    fromEnd: true,
    filled64: 70 * DEG,
    levels: 8,
  },
  {
    // Nothing filled: steps, but no glow anywhere.
    name: "empty-no-glow",
    size: 64,
    thickness: 10,
    inset: 8,
    start64: 12 * DEG + 19,
    sweep64: 233 * DEG + 41,
    fromEnd: false,
    filled64: 0,
    levels: 8,
  },
];

// Colours through the gradient and the glow's mix, in 5/6/5 channels.
const GLOW_COLOUR_SAMPLES = [
  { from: [0, 0, 0], to: [31, 63, 31], step: 0, steps: 128, alpha: 128, under: [0, 0, 0] },
  { from: [0, 0, 0], to: [31, 63, 31], step: 127, steps: 128, alpha: 7, under: [31, 63, 31] },
  { from: [28, 10, 5], to: [3, 50, 27], step: 64, steps: 128, alpha: 100, under: [2, 2, 2] },
  { from: [9, 43, 15], to: [19, 22, 27], step: 13, steps: 311, alpha: 56, under: [31, 0, 16] },
  { from: [31, 20, 0], to: [0, 20, 31], step: 310, steps: 311, alpha: 15, under: [12, 40, 20] },
  { from: [5, 5, 5], to: [5, 5, 5], step: 3, steps: 7, alpha: 26, under: [30, 60, 30] },
];

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
  let glowCases;
  let glowColours;
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
        handle: bands.map((b) => b.handle),
        pointer: bands.map((b) => b.pointer),
        rgb: argb,
      });
      // A recording nobody reads is a recording nobody checks. Between
      // 2026-09-22's rename and this line, __arcBlendForTest read a band that
      // no longer existed, every channel went NaN, and all 34608 colours were
      // written as 0 - four times over, because the recorder only ever
      // reported that it had written a file. A pixel no band touches has to
      // come out as the background, and the background here is #101010.
      const untouched = argb.filter((_, i) => bands[i].fill + bands[i].track + bands[i].handle + bands[i].pointer === 0);
      if (untouched.length > 0) {
        if (untouched.some((v) => v !== untouched[0])) {
          throw new Error(`${testCase.name}: pixels outside the ring came out in different colours`);
        }
        if (untouched[0] === 0) {
          throw new Error(
            `${testCase.name}: pixels outside the ring came out black, but the background is ` +
              `${COLOURS.background} - the blend probe is reading a band that does not exist`,
          );
        }
      }

      const covered = bands.filter((b) => b.fill + b.track + b.handle + b.pointer > 0).length;
      const partial = bands.filter((b) => {
        const c = b.fill + b.track + b.handle + b.pointer;
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
    glowCases = [];
    for (const glowCase of GLOW_CASES) {
      const pixels = samplePixels(glowCase.size);
      const out = await page.evaluate((req) => window.__levelGlowForTest(req), { ...glowCase, pixels });
      const glowing = out.filter((o) => o.level > 0).length;
      console.log(`  ${glowCase.name}: ${pixels.length} pixels, ${glowing} in the glow`);
      if (glowCase.filled64 > 0 && glowing === 0) {
        console.error(`  FAIL ${glowCase.name} samples no glow - it would pass against a port without one`);
        process.exitCode = 1;
      }
      glowCases.push({ ...glowCase, pixels, step: out.map((o) => o.step), level: out.map((o) => o.level) });
    }
    glowColours = (
      await page.evaluate((req) => window.__levelGlowColourForTest(req), { samples: GLOW_COLOUR_SAMPLES })
    ).map((o, i) => ({ ...GLOW_COLOUR_SAMPLES[i], ...o }));
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
    `{\n  "colours": ${JSON.stringify(COLOURS)},\n  "cases": [\n${body}\n  ],\n` +
      `  "glowCases": [\n${glowCases.map((c) => "    " + JSON.stringify(c)).join(",\n")}\n  ],\n` +
      `  "glowColours": ${JSON.stringify(glowColours)}\n}\n`,
  );
  console.log(`\nwrote ${OUT_PATH}`);
  console.log("run the Kotlin side with: gradle test --tests '*ArcRasterGoldenTest'");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
