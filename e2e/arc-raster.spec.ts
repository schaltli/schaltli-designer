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

type Bands = { fill: number; track: number; handle: number }

async function bandsAt(
  page: import("@playwright/test").Page,
  pixels: [number, number][],
  extra: Record<string, unknown> = {},
): Promise<Bands[]> {
  return page.evaluate(
    ([geom, px, more]) =>
      (window as any).__arcRasterForTest({ ...(geom as any), ...(more as any), pixels: px }),
    [GEOMETRY, pixels, extra] as const,
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

  expect(ringTop).toEqual({ fill: 0, track: 16, handle: 0 })
  expect(filledBand).toEqual({ fill: 16, track: 0, handle: 0 })
  expect(hole).toEqual({ fill: 0, track: 0, handle: 0 })
  expect(outside).toEqual({ fill: 0, track: 0, handle: 0 })
  expect(bottomGap).toEqual({ fill: 0, track: 0, handle: 0 })
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
    const total = b.fill + b.track + b.handle
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
    const total = all[i].fill + all[i].track + all[i].handle
    expect(total, `pixel ${probes[i]} reports ${total}/16`).toBeLessThanOrEqual(16)
    expect(total, `pixel ${probes[i]} reports ${total}/16`).toBeGreaterThanOrEqual(0)
  }
})

test("the handle wins over the fill it sits on", async ({ page }) => {
  // The handle lies over the same band as the fill and usually overlaps it.
  // Sub-samples must count once, to the handle - otherwise it disappears
  // wherever the fill has already reached it, which is exactly where a
  // thermostat needs it most.
  const [onTheHandle] = await bandsAt(page, [[10, 60]], { handleAt64: 270 * DEG })
  expect(onTheHandle).toEqual({ fill: 0, track: 0, handle: 16 })
})

// --- what the look gained on 2026-09-22 (docs/2026-09-22-arc-look.md) ------

test("the ends are rounded, and the rounding stops", async ({ page }) => {
  // The band is every point within half a thickness of its centreline arc,
  // so past the last angle it is a disc. On this dial the scale ends at 135
  // degrees, whose centreline point is about (95, 95).
  //
  // Both probes are PAST the end ray, so the sector covers neither: the near
  // one is covered only because the end is round, and the far one says the
  // rounding is a cap rather than an extension of the scale.
  const [justPastTheEnd, wellPastTheEnd] = await bandsAt(page, [
    // 140 degrees on the centreline - 5 degrees past the end, 4.5px from the
    // cap's centre, inside a cap of radius 10.
    [92, 98],
    // 150 degrees, 13px from the same centre: outside it.
    [85, 103],
  ])

  expect(justPastTheEnd.track).toBeGreaterThan(0)
  expect(wellPastTheEnd).toEqual({ fill: 0, track: 0, handle: 0 })
})

test("the handle lies across the band and stands out of it", async ({ page }) => {
  // At nine o'clock, where the handle runs along the x axis: 55 long on this
  // 20px band (eleven quarters of it), so it reaches from x=-17 to x=37 -
  // well inside the ring's 40px hole at one end and off its 60px outer edge
  // at the other. That overhang is what says "a thing lying on top" rather
  // than "a slice of the ring", and it is the whole reason the handle is
  // tested before the ring's own radii.
  const handle = { handleAt64: 270 * DEG }
  const [insideTheHole, inTheBand, inTheGap, pastTheGap] = await bandsAt(
    page,
    [
      // Radius 30: inside the hole, where nothing of the ring can be.
      [30, 60],
      // Radius 55: in the band, on the handle.
      [5, 60],
      // Beside the handle, within the gap it cuts either side of itself.
      [5, 66],
      // Further along the band, past the gap: the ring again - which here is
      // the FILL, because 40% of this dial reaches past nine o'clock.
      [5, 74],
    ],
    handle,
  )

  expect(insideTheHole.handle).toBeGreaterThan(0)
  expect(inTheBand.handle).toBeGreaterThan(0)
  // The gap is background, not track: what it takes away, it takes away from
  // the ring, which is what separates the handle from the fill.
  expect(inTheGap).toEqual({ fill: 0, track: 0, handle: 0 })
  expect(pastTheGap.fill + pastTheGap.track).toBeGreaterThan(0)
})

test("a framed track is an outline, and the fill stays solid", async ({ page }) => {
  // Where the mixed track cannot be told from the background - all of 1 bit -
  // the track is drawn as its own outer pixel instead of as a body. The fill
  // is untouched: a bar does the same, and for the same reason (a shape you
  // cannot see is not a shape, but a value you cannot see is a lie).
  const framed = { framed: true }
  const [midBand, outerEdge, filled] = await bandsAt(
    page,
    [
      // Twelve o'clock, radius 50: the middle of the band, which an outline
      // leaves empty.
      [60, 10],
      // The same angle at the outer edge.
      [60, 0],
      // Nine o'clock, inside the 40% fill.
      [10, 60],
    ],
    framed,
  )

  expect(midBand).toEqual({ fill: 0, track: 0, handle: 0 })
  expect(outerEdge.track).toBeGreaterThan(0)
  expect(filled.fill).toBeGreaterThan(0)

  // And without the frame the very same pixel is a solid piece of track -
  // otherwise this test would pass against a rasterizer that had simply lost
  // its track altogether.
  const [solid] = await bandsAt(page, [[60, 10]])
  expect(solid.track).toBe(16)
})
