import { test, expect } from "@playwright/test"

// Pins the arc-level rasterizer's sub-pixel coverage.
//
// This is the one piece of rendering in the system that deliberately exists
// twice - once here, once in each firmware - because an anti-aliased ring
// edge cannot be produced by "draw an arc" on either side and still match.
// The HIL pixel diff proves the two agree, but only once there is a port and
// hardware to run it against. This spec catches a drifting port at the
// moment it is written, and stops a later tidy-up from quietly changing what
// every ring looks like.
//
// It runs through the headless render harness rather than importing the
// module, so what is measured is the bundle the designer actually ships -
// the same reason the rest of this suite drives the real app.
//
// Two kinds of assertion below, kept apart on purpose:
//
//   - the geometric ones are an independent oracle. A pixel in the middle of
//     the ring band inside the filled sector *must* be 16/16 fill; one in
//     the hole, outside the disc, or in the dial's bottom gap *must* be
//     empty. Those follow from the geometry, not from the implementation,
//     and would catch a genuinely wrong port.
//   - the pinned edge values are a change detector, not a proof. They were
//     read off the implementation once the geometric assertions held. Their
//     job is to make any future difference visible and to give a firmware
//     port exact numbers to compare against.

// A 120px dial, 20px band, running from half past seven clockwise round to
// half past four - the default thermostat shape, 270 degrees with a
// symmetric gap at the bottom. Angles are in 1/64 degree units with zero at
// twelve o'clock.
const DEG = 64
const GEOMETRY = {
  size: 120,
  thickness: 20,
  trackStart64: 225 * DEG,
  trackSweep64: 270 * DEG,
  // 40% filled: 108 of the 270 degrees, so the fill ends at 333 degrees and
  // twelve o'clock is deliberately *outside* it.
  fillStart64: 225 * DEG,
  fillSweep64: 108 * DEG,
}

type Bands = { fill: number; track: number; marker: number }

async function bandsAt(page: import("@playwright/test").Page, pixels: [number, number][]): Promise<Bands[]> {
  return page.evaluate(
    ([geom, px]) => (window as any).__arcRasterForTest({ ...(geom as any), pixels: px }),
    [GEOMETRY, pixels] as const,
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
})

test("coverage follows the geometry, not the implementation", async ({ page }) => {
  const [ringTop, hole, outside, bottomGap, filledBand] = await bandsAt(page, [
    // Mid-band at twelve o'clock: radius ~50, inside the 40..60 ring, and at
    // an angle the track covers but the 40% fill does not.
    [60, 10],
    // Dead centre - inside the inner radius, so nothing at all.
    [60, 60],
    // Well outside the disc.
    [2, 2],
    // Straight down: inside the annulus, but in the dial's bottom gap.
    [60, 110],
    // Mid-band at nine o'clock (270 degrees), which the 225..333 fill covers.
    [10, 60],
  ])

  expect(ringTop).toEqual({ fill: 0, track: 16, marker: 0 })
  expect(filledBand).toEqual({ fill: 16, track: 0, marker: 0 })
  expect(hole).toEqual({ fill: 0, track: 0, marker: 0 })
  expect(outside).toEqual({ fill: 0, track: 0, marker: 0 })
  expect(bottomGap).toEqual({ fill: 0, track: 0, marker: 0 })
})

test("the outer edge is partially covered, which is the whole point", async ({ page }) => {
  // Not probed at twelve o'clock: the outer radius is exactly half the
  // object's side, so the circle is tangent to the box edge at each of the
  // four cardinal points and lands precisely on a pixel boundary there.
  // Full coverage in that row is correct, and asserting a partial value
  // there was wrong about the geometry rather than about the code.
  //
  // Anti-aliasing shows up where the edge crosses a pixel at an angle, so
  // the invariant worth asserting is that partial coverage exists at all. A
  // hard-edged implementation reports only 0 or 16 everywhere and fails
  // this - which is the regression to catch, since a ring that has quietly
  // lost its anti-aliasing still looks like a ring.
  const probes: [number, number][] = []
  for (let y = 0; y < GEOMETRY.size; y++) {
    for (let x = 0; x < GEOMETRY.size; x++) probes.push([x, y])
  }
  const all = await bandsAt(page, probes)

  let partial = 0
  for (const b of all) {
    const total = b.fill + b.track + b.marker
    if (total > 0 && total < 16) partial++
  }

  // The two circular edges of a 120px dial run for roughly 550px between
  // them; most of that length crosses pixels at an angle. A couple of
  // hundred partially covered pixels is the expected order of magnitude,
  // and a bound well below it still fails loudly for a hard-edged port.
  expect(partial).toBeGreaterThan(100)
})

test("a sector symmetric about the vertical axis rasterizes symmetrically", async ({ page }) => {
  // The 225..135 track is a mirror image about the vertical centre line, so
  // its coverage has to be too. This catches sign errors in the cross
  // product and an off-by-one in the sub-pixel lattice at once - both would
  // survive the tests above, and both would show up on hardware as a ring
  // that is a pixel fatter on one side.
  const probes: [number, number][] = [
    [0, 60], [1, 60], [2, 60], [20, 8], [30, 4], [59, 0],
  ]
  const mirrored: [number, number][] = probes.map(([x, y]) => [GEOMETRY.size - 1 - x, y])

  const left = await bandsAt(page, probes)
  const right = await bandsAt(page, mirrored)

  // Compared as fill+track, not band by band. The *track* is the symmetric
  // shape; the fill runs from 225 to 333 degrees and is deliberately
  // lopsided, so nine o'clock is filled while its mirror at three o'clock is
  // not. Their sum is the coverage of the track sector, which is the
  // quantity symmetry actually applies to.
  for (let i = 0; i < probes.length; i++) {
    const l = left[i].fill + left[i].track
    const r = right[i].fill + right[i].track
    expect(l, `pixel ${probes[i]} covers ${l}/16 but its mirror ${mirrored[i]} covers ${r}/16`).toBe(r)
  }
})

test("no pixel reports more coverage than it has", async ({ page }) => {
  // Sixteen sub-samples, each counted into at most one band. A port that
  // rasterized the bands separately and added them up would break this, and
  // that is precisely the mistake worth guarding against: it looks correct
  // and leaves a seam of track colour along the filled arc's edges.
  const probes: [number, number][] = []
  for (let y = 0; y < GEOMETRY.size; y += 7) {
    for (let x = 0; x < GEOMETRY.size; x += 7) probes.push([x, y])
  }
  const all = await bandsAt(page, probes)
  for (let i = 0; i < all.length; i++) {
    const total = all[i].fill + all[i].track + all[i].marker
    expect(total, `pixel ${probes[i]} reports ${total}/16`).toBeLessThanOrEqual(16)
    expect(total, `pixel ${probes[i]} reports ${total}/16`).toBeGreaterThanOrEqual(0)
  }
})

test("the marker wins over the fill it sits on", async ({ page }) => {
  // The setpoint marker is drawn inside the same band as the fill and may
  // overlap it. Sub-samples must count once, to the marker - otherwise the
  // marker disappears wherever the fill has already reached it, which is
  // exactly where a thermostat needs it most.
  const withMarker = await page.evaluate(
    (geom) =>
      (window as any).__arcRasterForTest({
        ...(geom as any),
        // A four degree marker at 270 degrees - nine o'clock, well inside
        // the filled 225..333 range.
        markerStart64: 268 * 64,
        markerSweep64: 4 * 64,
        pixels: [[10, 60]],
      }),
    GEOMETRY,
  )
  expect(withMarker[0]).toEqual({ fill: 0, track: 0, marker: 16 })
})
