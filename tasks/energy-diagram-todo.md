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

- [x] The wave on the 4.3B's glass, looked at by the user 2026-10-12: «sieht sehr gut aus auf dem Gerät»

## energy-layout
- [x] L1 Types and the rest
- [x] L2 Sankey layout
- [x] L3 Flow layout
- [x] L4 Dots and waves
- [x] L5 Test vectors for the devices - lib/energy-diagram/vectors.json, worked out by hand
- [ ] Checkpoint: the four situations from the core, beside the target picture
  - drawn 2026-10-11 from lib/energy-diagram.ts alone: https://claude.ai/artifact/XGY37K5UZjn7AAzSyvisan - matches the target picture
  - found: in the Flow, the line of a node straight above the bus (Landstrom) ran down through its own label - decided by the user 2026-10-11: beside the circle when the line leaves downwards (core, vectors, spec decision 9, target picture v8)
- [x] user said «weiter» 2026-10-12

## energy-designer
- [x] D1 The object: type, tool, defaults, theme roles
  - `{watts}` in a node's line instead of `{live:w}` (the rest has no topic) - spec decision 11
- [x] D2 Drawn still: both modes on the canvas
  - looked at in light and dark, both modes, with the demo's fonts and icons: as the target picture
  - on the way: two tests the screens' «Copy» (5195b7e) had broken, fixed apart (clipboard, navigator)
- [x] D3 Motion in the preview
  - in the preview's simulation (the examples) or live; ~30 frames/s, one loop per screen, `window.__energyFrozenPhase` holds it
- [x] D4 Property panel: the diagram and its nodes
  - the node's «Tap» (action) is already in its fields; D6 makes the preview run it
  - the Text panel's live-text block became `live-text-editor.tsx`, used by both
- [x] D5 Dragging nodes in Flow
  - (halted once 2026-10-12 on a hung dev server; the user restarted it)
- [x] D6 A tap on a node runs its action
  - popups are cleaned at export, not when one is deleted (as for buttons): a node's dead «Open a popup» is dropped there; the deploy's warning names nodes
- [x] D7 Copy and paste, topic usage
- [x] D8 Handbook
  - a section «Energy diagram» in objekte/anzeigen.md (the reference's place for it), not a page of its own; overview updated; an info box (no issue) says it is the designer's alone for now
- [x] Checkpoint, tests: test:all twice 2026-10-12
  - run 1: 7 e2e red (no-van-words, font-select, three «Settings» locators, the D6 tap tests under load) and android-HIL (the app could not rename its project folder until force-stopped) - all fixed or explained, each green alone
  - run 2: e2e 1482 passed; project-list (2) and one android case red only under the full load - green alone (10/10, 16/16)
- [ ] Checkpoint, the user: builds their van's diagram in the designer and watches it in the preview with the broker's values
