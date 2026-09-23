// Records what the designer's pill rasterizer produces, so the Android port
// of it can be held to the same numbers by a plain JVM unit test.
//
// The sibling of build-arc-golden.js, written for the same reason. The pill
// rasterizer is the second piece of rendering that deliberately exists more
// than once - lib/pill-raster.ts here, PillRaster.kt in the Android app, and
// a copy in each firmware once the devices catch up - because "draw a rounded
// rectangle" cannot be made to agree across four platforms by itself. Every
// line of it is integer arithmetic so that the copies cannot disagree; this
// file is what makes that claim checkable rather than merely intended.
//
// What it covers is the geometry: how many of a pixel's 16 sub-samples fall
// into each run, and - the rule the whole thing exists for - WHICH run gets
// each one. A sub-sample belongs to the first run in the list that contains
// it and to no other, so the order the runs are given in IS the picture. A
// port that rasterized each run separately and painted them one over the
// other would look almost right and would leave a seam of the lower run's
// colour along every value edge (lib/pill-raster.ts says why in full).
//
// The colours are not recorded here. What a set of counts mixes into is
// arc-raster's own blendBands, which build-arc-golden.js already pins on this
// same target, and the one pill-specific rule on top of it - a pixel a single
// run covers outright keeps that run's colour exactly, without the trip
// through 5/6/5 - is checked on the Kotlin side by PillPaintTest.
//
// Run (needs the designer dev server, npm run dev):
//   node hil/android/fixtures/build-pill-golden.js
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
  "pill-raster-golden.json",
);

/** Coverage is a count out of 16, from a 4x4 lattice - PILL_COVERAGE_MAX. */
const COVERAGE_MAX = 16;

// How far outside the runs to sample. Two pixels of nothing on every side, so
// every case also records what the rasterizer says about a pixel no run
// reaches - which is the half a port with a broken bounds test gets wrong.
const MARGIN = 2;

// One entry per shape worth distinguishing. `bands` are in the rasterizer's
// own priority order: first in the list wins every sub-sample it contains.
const CASES = [
  {
    name: "a-track-round-at-both-ends",
    // The plainest pill there is, and the one e2e/pill-raster.spec.ts pins a
    // column of by hand. Recorded whole, so the left cap's [0,0,0,3,10,14,16]
    // is in here too and the port is held to it without a second spec.
    bands: [{ x: 10, y: 10, w: 100, h: 16, rLow: 8, rHigh: 8 }],
  },
  {
    name: "a-vertical-run-round-at-the-top-only",
    // A vertical run rounds its TOP and BOTTOM - not its sides - which is the
    // one place the two directions are not the same arithmetic with the axes
    // swapped. A port that forgets `vertical` draws this run round on its
    // long sides and square at its ends, which is a different shape entirely.
    bands: [{ x: 10, y: 10, w: 16, h: 100, rLow: 8, rHigh: 0, vertical: true }],
  },
  {
    name: "the-value-edge",
    // A bar reading 40%: the filled run round where the track starts and
    // square where the value cuts it, the unfilled run square where it was cut
    // and round at the far end. The two abut, so no pixel belongs to both -
    // and the edge between them is the one place on a bar anybody looks at.
    bands: [
      { x: 10, y: 10, w: 64, h: 16, rLow: 8, rHigh: 0 },
      { x: 74, y: 10, w: 96, h: 16, rLow: 0, rHigh: 8 },
    ],
  },
  {
    name: "a-radius-bigger-than-the-run",
    // fillRoundRect clamps an oversized radius to half the short side, so this
    // has to come out as exactly the first case above. A port that clamped to
    // half the LONG side, or not at all, draws a wedge here and nothing
    // anywhere else - the author never asks for 99, the arithmetic does when a
    // handle's radius meets a thin track.
    bands: [{ x: 10, y: 10, w: 100, h: 16, rLow: 99, rHigh: 99 }],
  },
  {
    name: "a-run-shorter-than-it-is-thick",
    // Fourteen long and twenty-four thick: the radius clamps to seven, the two
    // caps meet in the middle and the run is all corner. A bar dragged nearly
    // to zero is this shape, and so is the stub of track left beside a handle
    // that has run to one end.
    bands: [{ x: 10, y: 10, w: 14, h: 24, rLow: 12, rHigh: 12 }],
  },
  {
    name: "a-group-button-round-outside-square-inside",
    // A button in a connected button group: fully round on the end that faces
    // the container's edge, barely rounded where it faces its neighbour. Two
    // different radii on one run, which is the whole reason a band carries
    // rLow and rHigh rather than one r.
    bands: [{ x: 10, y: 10, w: 60, h: 40, rLow: 20, rHigh: 8 }],
  },
  {
    name: "a-handle-lying-across-its-track",
    // Priority, in the shape it was written for: the handle first, the track
    // under it. Every sub-sample the handle covers is the handle's, so the
    // track's counts have a hole in them exactly the handle's size. Painted
    // one over the other instead, the overlap would be mixed twice and leave a
    // rim of track colour around the handle.
    //
    // The handle lies ACROSS the bar, so its own long axis is the other one.
    bands: [
      { x: 60, y: 10, w: 6, h: 36, rLow: 3, rHigh: 3, vertical: true },
      { x: 10, y: 20, w: 120, h: 16, rLow: 8, rHigh: 8 },
    ],
    overlaps: true,
  },
  {
    name: "a-switch-knob-on-its-track",
    // The same rule on the other control: the knob is a circle (a pill as wide
    // as it is tall) standing in its slot, and the track it stands on comes
    // second. A white knob on a coloured track is where a rim of the wrong
    // colour would be most visible, which is what asked the question on
    // 2026-09-22 in the first place.
    bands: [
      { x: 38, y: 14, w: 24, h: 24, rLow: 12, rHigh: 12 },
      { x: 10, y: 10, w: 52, h: 32, rLow: 16, rHigh: 16 },
    ],
    overlaps: true,
  },
  {
    name: "an-outline-and-the-hole-in-it",
    // A ring: the inside first, taking its pixels without painting anything in
    // them, and the outer pill second. That is how every outline here is
    // described - a switch's container on a panel where its surface cannot be
    // told from the screen, a framed track on 1 bit - and it only works
    // because the inner run CLAIMS its sub-samples rather than being painted
    // over. Recorded as counts, so the hole is simply where the outer run's
    // count stops.
    bands: [
      { x: 11, y: 11, w: 98, h: 14, rLow: 7, rHigh: 7 },
      { x: 10, y: 10, w: 100, h: 16, rLow: 8, rHigh: 8 },
    ],
    overlaps: true,
  },
  {
    name: "a-long-track-sampled-at-its-ends",
    // Too big to record whole (see samplePixels). A long pill is whole pixels
    // everywhere except its two caps and its two long edges, so that is what
    // is recorded - and the caps are recorded completely, because a cap is
    // where every soft pixel of a pill lives.
    bands: [{ x: 0, y: 0, w: 480, h: 28, rLow: 14, rHigh: 14 }],
  },
  {
    name: "a-tall-track-sampled-at-its-ends",
    // The same, standing up: a vertical run big enough to be sampled rather
    // than recorded, so the reduced sampling is exercised on both axes. A port
    // that swapped the axes only in insidePillBand and not in the caps would
    // still pass every small vertical case by symmetry; this one is 420 long
    // and 28 across, where nothing is symmetric.
    bands: [{ x: 5, y: 0, w: 28, h: 420, rLow: 14, rHigh: 14, vertical: true }],
  },
];

// Below this many pixels a case is recorded whole, which is the only sampling
// that cannot miss anything. Above it the caps and the long edges are recorded
// and the middle is not: the inside of a pill is whole pixels and says nothing
// that its edge does not say better.
const SAMPLE_ALL_UP_TO = 6000;

/** The box the runs can touch, with room around it for the pixels they cannot. */
function boundsOf(bands) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const band of bands) {
    if (band.w <= 0 || band.h <= 0) continue;
    x0 = Math.min(x0, band.x);
    y0 = Math.min(y0, band.y);
    x1 = Math.max(x1, band.x + band.w);
    y1 = Math.max(y1, band.y + band.h);
  }
  if (!Number.isFinite(x0)) throw new Error("a case with no run in it");
  return { x: x0 - MARGIN, y: y0 - MARGIN, w: x1 - x0 + 2 * MARGIN, h: y1 - y0 + 2 * MARGIN };
}

/**
 * Which pixels to record.
 *
 * Small cases whole. Large ones: both ends completely, deep enough to hold the
 * whole cap and the margin beyond it, plus the two long edges from end to end.
 * That is every pixel of a pill that is not simply all sixteen sub-samples or
 * none - and it is the same split the arc recorder makes for the same reason,
 * with "the ends" standing in for its row, column and diagonal because a pill
 * has its soft pixels in two places rather than spread round a circle.
 */
function samplePixels(box, bands) {
  const pixels = [];
  const push = (x, y) => pixels.push([x, y]);
  if (box.w * box.h <= SAMPLE_ALL_UP_TO) {
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) push(box.x + x, box.y + y);
    }
    return pixels;
  }

  const vertical = bands.some((b) => b.vertical);
  const depth = Math.max(...bands.map((b) => Math.max(b.rLow, b.rHigh))) + MARGIN + 1;
  const seen = new Set();
  const once = (x, y) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    push(x, y);
  };

  const along = vertical ? box.h : box.w;
  const across = vertical ? box.w : box.h;
  const at = (a, c) => (vertical ? once(box.x + c, box.y + a) : once(box.x + a, box.y + c));
  for (let a = 0; a < Math.min(depth, along); a++) {
    for (let c = 0; c < across; c++) at(a, c);
  }
  for (let a = Math.max(0, along - depth); a < along; a++) {
    for (let c = 0; c < across; c++) at(a, c);
  }
  for (let a = 0; a < along; a++) {
    at(a, 0);
    at(a, across - 1);
  }
  return pixels;
}

/** counts[pixel][band] from the probe, as one array per band. */
function perBand(counts, bandCount) {
  return Array.from({ length: bandCount }, (_, b) => counts.map((c) => c[b]));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const cases = [];
  const problems = [];
  try {
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 30000 });

    for (const testCase of CASES) {
      const box = boundsOf(testCase.bands);
      const pixels = samplePixels(box, testCase.bands);
      const raw = await page.evaluate(
        (req) => window.__pillRasterForTest(req),
        { bands: testCase.bands, pixels },
      );
      const counts = perBand(raw, testCase.bands.length);

      // A recording nobody reads is a recording nobody checks. The arc's
      // colour recording was written as 34608 zeroes through four
      // re-recordings because the recorder only ever reported that it had
      // written a file (2026-09-22). Everything below refuses to write one.
      const fail = (why) => problems.push(`${testCase.name}: ${why}`);
      const total = raw.map((c) => c.reduce((a, b) => a + b, 0));

      if (total.some((t) => t > COVERAGE_MAX)) {
        fail("a pixel is counted into more than sixteen sub-samples - a sub-sample reached two runs");
      }
      const covered = total.filter((t) => t > 0).length;
      if (covered === 0) fail("no pixel touches any run at all");
      const partial = total.filter((t) => t > 0 && t < COVERAGE_MAX).length;
      if (partial === 0) {
        fail("no pixel is partially covered - it would pass against a port with no anti-aliasing at all");
      }
      const untouched = total.filter((t) => t === 0).length;
      if (untouched === 0) fail("nothing outside the runs was sampled - the margin is not in the recording");
      counts.forEach((band, b) => {
        if (band.every((c) => c === 0)) fail(`run ${b} claims no sub-sample anywhere - the case says nothing about it`);
      });

      // Priority, proved rather than assumed: the lower run on its own has to
      // want sub-samples that the higher one took off it. Without this a case
      // whose runs happen not to overlap would stand in for one that does, and
      // the one rule this rasterizer exists for would go unrecorded.
      let stolen = 0;
      if (testCase.overlaps) {
        const last = testCase.bands.length - 1;
        const alone = await page.evaluate(
          (req) => window.__pillRasterForTest(req),
          { bands: [testCase.bands[last]], pixels },
        );
        stolen = alone.filter((c, i) => c[0] > counts[last][i]).length;
        if (stolen === 0) fail("the runs were declared as overlapping but none takes a sub-sample off another");
      }

      cases.push({ ...testCase, box, pixels, counts });
      console.log(
        `  ${testCase.name}: ${pixels.length} pixels, ${covered} touch a run, ${partial} partially` +
          (testCase.overlaps ? `, ${stolen} taken off the run below` : ""),
      );
    }
  } catch (error) {
    console.error(
      `Could not reach the designer at ${DESIGNER_URL} - start it with "npm run dev" first.\n${error.stack || error.message}`,
    );
    await browser.close();
    process.exit(1);
  }
  await browser.close();

  if (problems.length > 0) {
    console.error("\nrefusing to write a degenerate recording:");
    for (const problem of problems) console.error(`  FAIL ${problem}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  // One line per case rather than pretty-printed throughout, like the arc's:
  // the payload is parallel arrays of tens of thousands of small integers, and
  // an indented one puts each of them on its own line. Nobody reads a diff of
  // a golden file; they regenerate it and look at what the test says.
  const body = cases.map((c) => "    " + JSON.stringify(c)).join(",\n");
  fs.writeFileSync(OUT_PATH, `{\n  "cases": [\n${body}\n  ]\n}\n`);
  console.log(`\nwrote ${OUT_PATH}`);
  console.log("run the Kotlin side with: gradle test --tests '*PillRasterGoldenTest'");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
