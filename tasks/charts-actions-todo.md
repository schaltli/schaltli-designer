# Todo: charts-actions

Plan: `tasks/charts-actions-plan.md`. Approved by the user on 2026-10-29 («ok, go!»), all decisions as written.

- [x] A1 The range steps
  - lib/chart-range.ts: a screen's `RangeView` {range, back}; `openView`, `narrowed`, `widened` (stopping at their ends), `moved` (by one range; later stops at now), `set` (back at now), `dragged`, `settled` (from 24 h up a window within 6 h of a midnight settles on it)
  - lib/chart-window.ts `chartWindow(…, back)`: the window moved back; days recomputed; an hour further back than recent keeps (6 h than recent6) read from the days
  - e2e/chart-range.spec.ts (5)
- [x] A2 The model and the export
  - `narrow-range`, `widen-range`, `move-range` (`rangeDirection`), `set-range` (`range`) in HardwareButtonAction; summaries «Narrow the time range», «Widen the time range», «Move the time range earlier/later», «Set the time range to 24 hours» (`RANGE_LABELS`)
  - `pinch-in` and `pinch-out` buttons from a description declaring `pinch` (lib/device-description.ts)
  - the export writes each with its own fields only (lib/hardware-button-actions.ts), device zip and Android alike
  - Deploy: `chartsFeature` also for a range action on a screen or a Button; `pinchFeature` for a pinch gesture (lib/chart.ts)
  - e2e/chart-actions.spec.ts «model and export (A2)» (5)
- [x] A3 The pickers
  - components/property-panel/range-action-fields.tsx: the four in both pickers (a key's or gesture's, a Button's), «Which way» Earlier/Later and «Span» 1 hour … 7 days; offered only in a project with a chart or a time range (`projectHasCharts`)
  - the screen's panel: «Pinch in» and «Pinch out» where the device reads two fingers, the section then «Gestures» instead of «Swipe navigation»
  - e2e/chart-actions.spec.ts «the pickers (A3)» (2)
- [x] A4 The preview follows
  - project-editor: `rangeViews` per screen while the preview runs, forgotten when it ends; a range action from a Button, key or gesture steps the shown screen's view (lib/chart-range.ts)
  - canvas: the chart drawn with the view's range and `back`; a horizontal drag on a chart with Scrolling owns the gesture (no page swipe), moves the window, and let go settles on whole days
  - `chartPreview` and `renderChart` take `back`
  - e2e/chart-actions.spec.ts «the preview follows (A4)» (2): a Button set to 1 hour, a drag to yesterday - each a curve the whole width; A4 seeds a device id of its own (A3's with pinch raced it)
- [x] A5 The history page's defaults
  - `historyActions` (lib/chart-from-controls.ts): pinch in widens, pinch out narrows where the device reads two fingers; the knob's ring (its keys «Rotate Right», «Rotate Left») moves later and earlier; `withHistoryBelow` writes them on the new screen
  - the knob's description has no press among its keys (button-0 and button-1 are the ring's two directions), so the spec's «press → Set the time range 24 h» has nothing to sit on; left to the author where a device has a key for it
  - e2e/chart-history-page.spec.ts (A5)
- [ ] A6 Handbook
- [ ] Checkpoint: test:quick green; the user moves through a history page's days in the preview
