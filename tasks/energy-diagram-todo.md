# Todo: the energy diagram

Plan: `tasks/energy-diagram-plan.md`. Spec: `docs/2026-10-11-energy-diagram.md`.

## Before anything is built
- [x] The user approves the target picture (artifact, spec «Target picture») - 2026-10-11, version 7

## energy-spike
- [x] S1 Tap latency on the 4.3B today, measured (baseline) - 2026-10-11: 20 taps, median 77 ms, p90 80.6 ms, worst 81 ms (firmware fw-2026.10.11.2 + tap latency, schaltli-firmware 4.3B commit)
- [x] S2 Polygon fill in the firmware - PolygonRaster (1/8 px grid, 4x4 coverage), 5 native tests
- [x] S3 The spike's motion loop behind `?set=energyspike=<n>` (firmware 43812fa: also blitRegions, rects owed once, MAX_DIRTY 255)
- [x] S4 Measured with motion; decision 14 written
  - round one 2026-10-11: dots x1.16, dots and wave x1.66 (taps at a fixed beat - too gloomy)
  - user chose another round: the wave painted straight into the framebuffers, taps at random intervals: dots and wave x1.05-1.06 at 9-9.4 steps/s (pass); the 4.3B moves both
  - in `npm run test:all` as waveshare-4v3b-energy-motion
  - moved on: the band's pixel diff -> energy-firmware (needs the designer's band renderer); the wave on the glass wants an eye
- [x] Checkpoint: numbers and decision shown to the user (decision: another round; it passed)

## For the user to look at
- The wave on the 4.3B's glass: `curl "http://192.168.1.117/api/debug?set=energyspike=5"`,
  then look - smooth, no stripes or leftovers? (`=0` stops it)

## energy-layout
- [x] L1 Types and the rest
- [x] L2 Sankey layout
- [x] L3 Flow layout
- [x] L4 Dots and waves
- [x] L5 Test vectors for the devices - lib/energy-diagram/vectors.json, worked out by hand
- [ ] Checkpoint: the four situations from the core, beside the target picture
  - drawn 2026-10-11 from lib/energy-diagram.ts alone: https://claude.ai/artifact/XGY37K5UZjn7AAzSyvisan - matches the target picture
  - found: in the Flow, the line of a node straight above the bus (Landstrom) ran down through its own label - decided by the user 2026-10-11: beside the circle when the line leaves downwards (core, vectors, spec decision 9, target picture v8)
