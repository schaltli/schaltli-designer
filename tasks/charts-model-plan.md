# Plan: charts-model

Spec: `docs/2026-10-16-charts.md` (decisions 4, 5, 8, 10, 15 and «Data
model»). First of the chart plans: the designer knows the `chart` object
and a screen's time range, carries both to every device, gates Deploy on
them and works out what the recorder is to record. There is no drawing, no
property panel and no toolbar entry yet (`charts-designer`), no range
actions (`charts-actions`), no recorder (`charts-recorder`, beside this
one). After it, `charts-recorder` lays the wants worked out here.

Order of the chart plans: charts-model, charts-recorder (these two first),
then charts-designer, charts-actions, charts-firmware, charts-android,
charts-finish (conformance, handbook, starter project #56).

## Decisions taken here (to approve)

1. **One module for the model, `lib/chart.ts`.** The types of «Data model»
   (`ChartProperties`, `ChartAxis`, `ChartZone`, `ChartSeries`), the
   defaults by kind and `normalizeChart`. Every other place - export,
   panel, renderers - reads the model through it, as the energy diagram is
   read through `lib/energy-diagram-object.ts`.
2. **Invalid combinations are dropped where a chart is read, not refused.**
   `normalizeChart` removes `sum` from a series that is not `power`,
   `runtime` and `starts` from one that is not `state`, `bars` and
   `dailyValue` outside `per-day`, a `right` axis no series uses, and an
   `onMeans` on anything but a state. It runs on load (migration) and on
   export, so a hand-edited project cannot send a device what the spec
   says is never stored.
3. **A chart is a type the device declares, the range a feature.** A
   project with a chart needs `chart` in `supportedObjectTypes` - Deploy
   already gates on that by type. A project with a chart or a screen
   whose `timeRange` is set also needs the feature `charts`, gated as
   `local-topics` is (`chartsFeature(project)`, `lib/chart.ts`). No DDF
   declares either yet, so Deploy refuses a chart everywhere until
   `charts-firmware` and `charts-android`; that is intended.
4. **Colours go out as every `<part>Color` does.** A series' or zone's
   `color` is a role or a hex in the project; the export resolves it into
   a light and a dark hex (`color`, `colorDark`), as it does for the
   energy diagram's roles, so no device needs the theme to draw a chart.
5. **The wants are worked out in the model, published by the recorder
   plan.** `historyWants(project)` gives `{ series: [{ topic, kind,
   onMeans? }] }` for one display's project: every `topic` series of every
   chart on a screen the device gets, deduplicated by topic and kind.
   Left out: `balance` series (worked out by the display) and local topics
   (`lib/local-topics.ts`; never on the broker, so the recorder could
   never hear them).
6. **Until `charts-designer`, a chart on the canvas is a frame with its
   series' names.** Loaded from a file, it is selected, moved, resized,
   copied and deleted like any object; the general panel (frame only)
   shows. Nobody can place one yet, so the handbook needs nothing in this
   plan.
7. **The device contract is written now** (`docs/device-contract.md`): the
   `chart` object as exported, `timeRange` on a screen, the feature
   `charts`. The firmware and Android plans build against it.

## Tasks

- **M1 The model.** `lib/chart.ts` with the types, `defaultSeries(kind)`
  (level → line, `current`; power → area, `sum`; state → band,
  `runtime`), `normalizeChart`. `chart` in `OBJECT_TYPES`
  (`lib/object-types.ts`) with the label «Chart», not in the toolbar;
  `migrateObjects` normalizes it.
  Test: `e2e/chart-model.spec.ts` (pure): defaults per kind, every
  dropped combination of decision 2, a valid chart left as it is.
  Files: `lib/chart.ts`, `lib/object-types.ts`, `e2e/chart-model.spec.ts`.
- **M2 The screen's time range.** `timeRange?: "1h" | "6h" | "24h" | "7d"`
  on `ProjectScreen`; missing means 24h. Exported on the screen in the
  device zip and the Android bundle only where set, so a project without
  charts exports exactly as before.
  Test: `e2e/chart-export.spec.ts` (screen part).
  Files: `components/project-editor.tsx` (type), `lib/project-zip.ts`,
  `lib/android-export.ts`, `e2e/chart-export.spec.ts`.
- **M3 The chart in the export.** Device zip and Android bundle carry a
  chart normalized, colours resolved (decision 4), its font as the energy
  diagram's (`fontId`, font usage in `project-zip`). Every walk over
  objects that switches on type knows it: `object-order`, `screen-fields`,
  `render-screen`'s subscriptions (a chart subscribes to nothing on its
  own: it reads history topics, which `charts-designer` adds).
  Test: `e2e/chart-export.spec.ts`: a chart from the spec's water example
  exported, compared field by field, device and Android.
  Files: `lib/project-zip.ts`, `lib/android-export.ts`, `lib/object-order.ts`,
  `lib/screen-fields.ts`, `e2e/chart-export.spec.ts`.
- **M4 The canvas frame.** The canvas draws a chart as a frame with its
  series' names (decision 6); clipboard and object tree take it.
  Test: `e2e/chart-model.spec.ts`, a loaded project with a chart: the
  object is on the canvas, selectable and resizable, and survives copy and
  paste.
  Files: `components/canvas/canvas.tsx`,
  `components/canvas/renderers/render-chart.ts`,
  `components/icons/object-icons.tsx`, `e2e/chart-model.spec.ts`.
- **M5 Deploy's gate.** `chartsFeature(project)`; the deploy dialog adds it
  to the unsupported features as it does `localTopicsFeature`. A chart's
  type is gated by the existing type check.
  Test: `e2e/deploy-plan.spec.ts` (or the spec that covers
  `localTopicsFeature` today): a project with a chart is refused by a
  device without `charts`, deployed by one with it.
  Files: `lib/chart.ts`, `components/deploy-dialog.tsx`, the deploy spec.
- **M6 The wants.** `historyWants(project)` (decision 5).
  Test: `e2e/chart-model.spec.ts`: two charts sharing a topic give it
  once; a `#path` topic stays whole; a state carries its `onMeans`; a
  balance and a local topic are left out; a project without charts gives
  `{ series: [] }`.
  Files: `lib/chart.ts`, `e2e/chart-model.spec.ts`.
- **M7 The device contract.** `docs/device-contract.md`: the chart object,
  `timeRange`, the feature `charts`, the history topics a device
  subscribes to (from the spec's «What the recorder lays on the broker»).
  Files: `docs/device-contract.md`.
- **Checkpoint:** test:quick green; the user opens a project with a chart
  in it (a fixture from M3) and sees the frame.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A walk over objects that switches on type misses `chart` and drops or breaks it | Medium | grep every `"energy-diagram"` case as the list of places; M3's export test compares the whole object |
| The model changes once the renderers are built | Medium | the contract is the spec's, already worked through for five renderers; a change goes into spec and contract together |
| Colour resolution differs from the energy diagram's | Low | reuse its resolver; the export test checks light and dark |

## Not in this plan

Drawing, panel, toolbar, inferring the kind, proposing a history page
(`charts-designer`); pinch and the range actions (`charts-actions`); the
recorder and publishing the wants (`charts-recorder`).
