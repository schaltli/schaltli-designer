# Todo: the energy diagram

Plan: `tasks/energy-diagram-plan.md`. Spec: `docs/2026-10-11-energy-diagram.md`.

## Before anything is built
- [x] The user approves the target picture (artifact, spec «Target picture») - 2026-10-11, version 7

## energy-spike
- [x] S1 Tap latency on the 4.3B today, measured (baseline) - 2026-10-11: 20 taps, median 77 ms, p90 80.6 ms, worst 81 ms (firmware fw-2026.10.11.2 + tap latency, schaltli-firmware 4.3B commit)
- [x] S2 Polygon fill in the firmware - PolygonRaster (1/8 px grid, 4x4 coverage), 5 native tests
- [ ] S3 The spike's motion loop behind `?set=energyspike=<n>`
- [ ] S4 Measured with motion; band pixel diff; decision 14 written
- [ ] Checkpoint: numbers and decision shown to the user

## energy-layout
- [ ] L1 Types and the rest
- [ ] L2 Sankey layout
- [ ] L3 Flow layout
- [ ] L4 Dots and waves
- [ ] L5 Test vectors for the devices
- [ ] Checkpoint: the four situations from the core, beside the target picture
