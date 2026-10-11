# Todo: the energy diagram

Plan: `tasks/energy-diagram-plan.md`. Spec: `docs/2026-10-11-energy-diagram.md`.

## Before anything is built
- [x] The user approves the target picture (artifact, spec «Target picture») - 2026-10-11, version 7

## energy-spike
- [x] S1 Tap latency on the 4.3B today, measured (baseline) - 2026-10-11: 20 taps, median 77 ms, p90 80.6 ms, worst 81 ms (firmware fw-2026.10.11.2 + tap latency, schaltli-firmware 4.3B commit)
- [x] S2 Polygon fill in the firmware - PolygonRaster (1/8 px grid, 4x4 coverage), 5 native tests
- [x] S3 The spike's motion loop behind `?set=energyspike=<n>` (firmware 43812fa: also blitRegions, rects owed once, MAX_DIRTY 255)
- [ ] S4 Measured with motion; band pixel diff; decision 14 written
  - measured 2026-10-11, in the spec under decision 14: dots alone x1.16 (pass), dots and wave x1.66 (fail)
  - STOPPED here: the wave on the 4.3B needs the user's decision (see «Waiting for the user»)
  - band pixel diff not yet done
- [ ] Checkpoint: numbers and decision shown to the user

## Waiting for the user (2026-10-11)
The Sankey's wave costs the 4.3B's taps ~50 ms (x1.66, limit x1.2); the
Flow's dots are fine (x1.16). Choices:
1. Accept it: a tap ~50 ms slower while a Sankey moves.
2. The 4.3B draws the Sankey still (no wave); Flow moves; Android and the
   designer move both (decision 14's fallback).
3. Another spike round: write the wave's rows straight into the three
   framebuffers from one row of colours in fast memory, so no present owes
   the band - may bring it within the limit; not measured yet.
Meanwhile energy-layout (L1-L5) goes on; it does not depend on this.

## energy-layout
- [x] L1 Types and the rest
- [x] L2 Sankey layout
- [x] L3 Flow layout
- [ ] L4 Dots and waves
- [ ] L5 Test vectors for the devices
- [ ] Checkpoint: the four situations from the core, beside the target picture
