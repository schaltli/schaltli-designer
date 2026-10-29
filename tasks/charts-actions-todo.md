# Todo: charts-actions

Plan: `tasks/charts-actions-plan.md`. Approved by the user on 2026-10-29 («ok, go!»), all decisions as written.

- [x] A1 The range steps
  - lib/chart-range.ts: a screen's `RangeView` {range, back}; `openView`, `narrowed`, `widened` (stopping at their ends), `moved` (by one range; later stops at now), `set` (back at now), `dragged`, `settled` (from 24 h up a window within 6 h of a midnight settles on it)
  - lib/chart-window.ts `chartWindow(…, back)`: the window moved back; days recomputed; an hour further back than recent keeps (6 h than recent6) read from the days
  - e2e/chart-range.spec.ts (5)
- [ ] A2 The model and the export
- [ ] A3 The pickers
- [ ] A4 The preview follows
- [ ] A5 The history page's defaults
- [ ] A6 Handbook
- [ ] Checkpoint: test:quick green; the user moves through a history page's days in the preview
