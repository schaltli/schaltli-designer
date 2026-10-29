# Todo: charts-firmware

Plan: `tasks/charts-firmware-plan.md`. Approved by the user on 2026-10-29 («freigegeben, weiter»), all decisions as written.

- [x] F0 The designer first
  - recent6 the last 6 hours (recorder publishes and keeps 6 h at 5 min; `chartWindow` reads the days beyond; spec decision 7 and the payload table; recorder and range tests) - 741aa80
  - lib/chart-layout.ts gives every text as a box (`ChartText`: axis labels, times, days, marks, legend rows, the arrow) and each legend row its swatch; render-chart.ts draws them as Text objects in the chart's font through renderScreenObjects where it has the screen's options (canvas, thumbnails, test-render screens), the canvas's sans-serif only on a test's bare canvas
  - lib/chart/vectors.json (LF pinned in .gitattributes) written by e2e/chart-vectors.spec.ts (`HARVEST_CHART_VECTORS=1`): 10 windows, 22 range steps, 7 layouts
- [x] F1 The core in C++
  - found first: a device has no zone database - the recorder's `schaltli/history/now` now carries `days`, the last 31 days and tomorrow with where each began, and the designer's core counts days by a `Zone` that is a name or that table (lib/chart-window.ts DayTable); the vectors in tables; spec and contract say so (designer 85620a2)
  - schaltli-firmware src/project/ChartCore.{h,cpp}: calendar from the table, window, range steps, `chartFrom` (a chart's JSON), `seriesData` (day, recent, state, daily payloads), numbers and texts (`fixed` as JS toFixed), the layout with stacks, bands, bars, marks, legend and texts (firmware 8e6d58a)
  - test/test_chart against the vectors: windows and steps exact, texts exact, coordinates within one rounding step - ArduinoJson keeps few-digit numbers as float, as the device will; 94 native tests green; the knob builds
- [ ] F2 Parsing
- [ ] F3 The history
- [ ] F4 Drawn on the 4.3B and the knob
- [ ] F5 Drawn on the PaperS3, DDFs declare chart and charts
- [ ] F6 Range, pinch, ring, drag
- [ ] F7 Generation and handbook
- [ ] Checkpoint: test:quick green; the user deploys a history page to the 4.3B in the van and sees the recorder's curve
