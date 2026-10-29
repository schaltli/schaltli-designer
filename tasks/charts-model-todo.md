# Todo: charts-model

Plan: `tasks/charts-model-plan.md`. Approved by the user on 2026-10-29 («ok, go!»), all decisions as written.

- [x] M1 The model
  - lib/chart.ts: types, `defaultSeries`, `defaultChart`, `normalizeSeries`, `normalizeChart`; `chart` in OBJECT_TYPES, label «Chart», normalized by `migrateObjects`; icon and order rank (typecheck asks for them)
  - e2e/chart-model.spec.ts «Chart model» (6)
- [x] M2 The screen's time range
  - `timeRange?: TimeRange` on ProjectScreen; device zip and Android bundle write it only where set
  - e2e/chart-export.spec.ts «charts in the device/android export» (time range)
- [ ] M3 The chart in the export
- [ ] M4 The canvas frame
- [ ] M5 Deploy's gate
- [ ] M6 The wants
- [ ] M7 The device contract
- [ ] Checkpoint: test:quick green; the user opens a project with a chart and sees the frame
