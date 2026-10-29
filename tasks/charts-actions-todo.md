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
- [ ] A4 The preview follows
- [ ] A5 The history page's defaults
- [ ] A6 Handbook
- [ ] Checkpoint: test:quick green; the user moves through a history page's days in the preview
