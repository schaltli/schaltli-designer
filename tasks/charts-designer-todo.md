# Todo: charts-designer

Plan: `tasks/charts-designer-plan.md`. Approved by the user on 2026-10-29 («1. ja»), all decisions as written; the history page is named «<page> history» («2. History»).

- [x] D1 The window and its history
  - lib/chart-window.ts: `chartWindow` (24 h today, 7 days to today, 1 h and 6 h to the step now is in, per day its last days), `historyTopicsFor`; days in a zone as the recorder counts them
  - e2e/chart-window.spec.ts (6), the recorder's days among them
- [ ] D2 The layout: axes and lines
- [ ] D3 The layout: bands, stacks, bars, legend
- [ ] D4 The painter
- [ ] D5 Live and Simulation
- [ ] D6 Inferring the kind
- [ ] D7 The tool
- [ ] D8 The panel: the chart
- [ ] D9 The panel: the series
- [ ] D10 Series from controls
- [ ] D11 «Add history below»
- [ ] D12 Handbook
- [ ] Checkpoint: test:quick green; the user builds a history page in the preview against the van's recorder
