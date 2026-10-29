# Todo: charts-model

Plan: `tasks/charts-model-plan.md`. Approved by the user on 2026-10-29 («ok, go!»), all decisions as written.

- [x] M1 The model
  - lib/chart.ts: types, `defaultSeries`, `defaultChart`, `normalizeSeries`, `normalizeChart`; `chart` in OBJECT_TYPES, label «Chart», normalized by `migrateObjects`; icon and order rank (typecheck asks for them)
  - e2e/chart-model.spec.ts «Chart model» (6)
- [x] M2 The screen's time range
  - `timeRange?: TimeRange` on ProjectScreen; device zip and Android bundle write it only where set
  - e2e/chart-export.spec.ts «charts in the device/android export» (time range)
- [x] M3 The chart in the export
  - device zip and Android bundle: a chart normalized (`normalizeChart`); its series' and zones' colours a role or hex, resolved to `color` and `colorDark` (lib/themes.ts); textColor, mutedColor, lineColor (grid) from the theme by default; `fontId` follows a device change (lib/project-device.ts)
  - object-order and screen-fields need nothing more: a chart has no live values; what it subscribes to is charts-designer's
  - e2e/chart-export.spec.ts «a chart goes out as stored, normalized, its colours light and dark» (device, Android)
- [x] M4 The canvas frame
  - components/canvas/renderers/render-chart.ts: frame, axes, each series' name in its colour; drawn by the canvas and render-screen (preview, thumbnails, test-render)
  - components/property-panel/chart-properties.tsx: «Frame» alone, for charts-designer to fill
  - e2e/chart-model.spec.ts «a chart on the canvas, before it is drawn (M4)»: loaded, selected, resized, copied and pasted
- [x] M5 Deploy's gate
  - `chartsFeature(project)` (lib/chart.ts): a chart at any depth, on a screen or popup, or a screen with a time range, needs «charts», the screens named; the deploy dialog adds it to the unsupported features
  - e2e/deploy-plan.spec.ts «a chart asks charts of the device»
- [x] M6 The wants
  - `historyWants(project)` (lib/chart.ts): every topic series of every chart on its screens and popups, at any depth, once per topic and kind; a state with its `onMeans`; no balance, no local topic
  - e2e/chart-model.spec.ts «what the recorder is asked to record (M6)» (2)
- [x] M7 The device contract
  - docs/device-contract.md §2.13 Charts: the object, a series, the screen's time range, the history topics a chart reads, the declaration, the wants on deploy
  - the spec's water example: «textMuted», a role, for «muted», which is none
- [ ] Checkpoint: test:quick green (2026-10-29: e2e 1955 passed, every lane PASS, recorder PASS); the user opens a project with a chart and sees the frame
