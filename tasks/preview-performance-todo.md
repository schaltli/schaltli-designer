# Tasks: preview performance (`preview-performance`, #58)

Plan: `tasks/preview-performance-plan.md` · Spec: `docs/2026-10-09-preview-performance.md`.
Chat German, docs English.

## Task 1: The test

**Description:** `e2e/preview-performance.spec.ts`, as in the spec's decision 6.

**Acceptance criteria:**
- [x] Red before any change: 787 ms, then -1 (never within 20 s), 2026-10-09.

**Scope:** S

## Task 2: Coverage cache

**Description:** `pillCoverage` in `lib/pill-raster.ts`, bounded cache;
`softPills` reads from it (decisions 1-3).

**Acceptance criteria:**
- [x] For a set of shapes (pill, rounded ends of different radii, vertical,
      tips, several bands by priority, a shape moved by whole pixels) the
      cache's counts equal `pillPixelBands` pixel for pixel.
- [x] A repeated shape is a hit; past 512 entries the oldest goes.
- [x] The pill and arc goldens and the switch/level specs pass unchanged.

Done 2026-10-09. The test's first click: 787 -> 322 ms at 6x.

**Verification:** new `e2e/pill-coverage-cache.spec.ts` (node-side, like the
raster specs); existing pill/level/switch specs.

**Scope:** M

## Task 3: Resize on a size change only

**Description:** decision 4 in `components/canvas/canvas.tsx`.

**Acceptance criteria:**
- [x] Resizing the window or the right panel still resizes and redraws the canvas
      (a `ResizeObserver` on the container, which the window listener was not).
- [x] One draw per change of what is drawn: `resizeCanvas` is gone from the profile.

**Verification:** canvas, zoom, preview and live specs; profile.

**Scope:** S

## Task 4: Live values once per frame

**Description:** decision 5 in `components/project-editor.tsx`.

**Acceptance criteria:**
- [x] A burst of values is one update; the last value of a topic wins.
- [x] An asked value still ends on its answer (`asked-value.spec.ts`, 277 related specs green).

**Verification:** `live-preview.spec.ts`, `asked-value.spec.ts`, `live-value*.spec.ts`.

**Scope:** S

## Task 6: Values for screens out of view without a redraw

**Description:** `previewHeardTopics` (lib/render-screen.ts): what the view
reads - the screen, its master, a popup and the screen under it - plus every
combined topic's sources and every screen's live icon. A value for any other
topic reaches `liveValues` within `LIVE_QUIET_MS` (500 ms) without a redraw of
its own; a change of view takes in everything at once. Added 2026-10-09 on the
user's word, after the profile.

**Acceptance criteria:**
- [x] A value only screen 2 reads is drawn the moment screen 2 is shown, and
      stands in the topic list (second test in `e2e/preview-performance.spec.ts`;
      fails with the flush on a view change taken out).

**Scope:** S

## Task 7: A hover draws once

**Description:** the canvas's own hover effect drew a second time beside the
`[draw]` effect; removed.

- [x] Done 2026-10-09.

**Scope:** XS

## Task 5: Measure, green, test:all

**Acceptance criteria:**
- [x] `e2e/preview-performance.spec.ts` green. Without a responder the
      test measured a Switch waiting for its answer, not the preview; it now
      answers like the bridge. At 6x the old code then took 0.76 s and did
      not separate, so the test runs at 10x: 1.7 s before, 0.6 s after
      (limit 1 s).
- [x] A second profile (6 s, 30 values/s, unthrottled, `next dev`): busy
      ~400 ms instead of ~650, `drawObject` 85 ms instead of 361, the pills
      49 instead of 317, `resizeCanvas` gone. React's own rendering
      (~140 ms in dev) is now the largest part - the next candidate if a
      tablet still lags.
- [x] `npm run test:all` 2026-10-09: e2e 1346 green, 3 red under full load
      and green alone (`undo.spec.ts` heap, `project-list.spec.ts` rename, and
      the timing test at 1.2 s - now tagged @alone and run on one worker as
      its own step in `hil/test-all.js`). HIL green on the knob and PaperS3;
      the 4.3B was on `fw-2026.10.04.2` (unknown why), flashed with `a236b4f`
      and its suites rerun green; Android HIL 16/16 once the phone was back
      on the home broker. Conformance 51/51 visual but exits 1: `navigator`
      has no specimen yet (the navigator work, not this one).

**Scope:** S
