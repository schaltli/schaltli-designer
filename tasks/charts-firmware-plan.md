# Plan: charts-firmware

Spec: `docs/2026-10-16-charts.md` (decisions 7, 9, 10, 15, 16); what a
device gets: device contract §2.13 (charts-model M7). After charts-designer
and charts-actions. The 4.3B, the knob and the PaperS3 draw a chart from the
recorder's history, follow the screen's time range and its actions, and
declare `chart`, `charts` and (4.3B, PaperS3) `pinch`. As the energy
diagram did (tasks/energy-devices-plan.md): the designer's pure core ported
function by function, held to a `vectors.json` the designer writes, then
drawn and compared on the glass by the HIL. Android is its own plan after
this one (charts-android).

## Decisions taken here (to approve)

1. **`recent6` holds the last 6 hours, not 48.** At 5-minute steps with
   mean, min and max, 48 hours are 576 steps, about 10 KB - too much for a
   device's MQTT buffer and its RAM. 6 hours are 72 steps, under 2 KB. A 6-hour
   window moved further back reads the days' quarter hours instead, which
   `chartWindow` already does (charts-actions A1). The recorder, the spec
   and the contract change with it (F0).
2. **The firmware's MQTT buffer grows from 1024 to 4096 bytes.** A day's
   payload stays under 4 KB (asserted in `e2e/recorder-history.spec.ts`),
   `recent` with its 120 steps about 2.5 KB. Measured on the knob with
   `hil/internal-heap.js` before it is kept.
3. **The designer's chart draws its labels in the device's font.** Until now
   `render-chart.ts` writes them in the canvas's sans-serif, which no pixel
   comparison with a device can match (noted at charts-designer D4). The
   labels become text drawn as a Text object draws its own, in the chart's
   font (`fontId`), as the energy diagram's labels are. F0, before any port.
4. **The core is held to vectors.** `e2e/chart-vectors.spec.ts` writes
   `e2e/fixtures/chart-vectors.json` (with `HARVEST_CHART_VECTORS=1`):
   windows, range steps and layouts for a set of charts and payloads, every
   number the C++ must reproduce. The firmware's `test/test_chart` reads a
   byte-for-byte copy and fails when it differs from the designer's,
   skipped without the designer beside it (as test_energy_diagram).
5. **A device keeps only the shown screen's history.** It subscribes to the
   topics `historyTopicsFor` names for the charts on the screen shown (and
   its master), plus `schaltli/history/now` and `…/recorder`; leaving the
   screen unsubscribes and frees them. Its clock is the recorder's `now`
   plus the milliseconds since it arrived; without one, a chart says «No
   recorder» as the preview does.
6. **How it moves** (decision 9): the 4.3B follows a finger on a scrolling
   chart and settles on whole days when let go, no coasting in the first
   version; the PaperS3 draws once when the finger lets go, already
   settled, and otherwise only when a new step arrives; the knob moves by
   its ring. Pinch on the 4.3B and the PaperS3 through the existing
   `PinchDetector`.
7. **The DDFs declare in the task that makes it true**: `chart` and
   `charts` with F5 (drawn on all three), `pinch` with F6 (4.3B, PaperS3).
   The designer's DDF copies are regenerated then, so Deploy opens.
8. **No release, no push of firmware, no van** without the user: the desk's
   boards are flashed as the HIL does.

## Tasks

- **F0 The designer first** (`schaltli-designer`): the recorder's
  `recent6` 6 hours (decision 1; spec, contract, recorder tests);
  `render-chart.ts` labels in the chart's font (decision 3; chart-render
  spec); `e2e/chart-vectors.spec.ts` and the fixture (decision 4).
- **F1 The core in C++** (`schaltli-firmware`): `src/project/ChartWindow.h`,
  `ChartRange.h`, `ChartLayout.{h,cpp}` - window, steps, layout (axes,
  ticks, time, zones, lines, areas, steps, ranges, bands, stacks with the
  balance, bars, marks, legend figures, NowPoint), pure, no Arduino.
  `test/test_chart` against the vectors. Verify: `pio test -e native`.
- **F2 Parsing.** `ProjectLoader` reads a chart's properties and series,
  a screen's `timeRange` and the four range actions; `ThemeVariant` swaps
  the series', zones' and the chart's `…Dark`. Native test on the contract's
  example.
- **F3 The history.** Subscriptions per shown screen (decision 5), the
  payloads parsed into the core's steps, periods and days, the clock from
  `now`, the buffer (decision 2). Native test of the parsing; HIL: a
  board subscribes to exactly the shown screen's topics (heard on the
  broker), and the knob's heap holds (`hil/internal-heap.js`).
- **F4 Drawn on the 4.3B and the knob.** `ColorScreenRendererChart.cpp`:
  zones, grid, labels, lines, areas, bands, stacks, bars, marks, legend,
  NowPoint, the messages. HIL: a conformance specimen with a fake
  recorder's retained history, pixel diff within the usual threshold; a
  screen in the 4.3B's orchestrator.
- **F5 Drawn on the PaperS3.** Greys, hatching and dashes as the
  designer's (charts-designer decision 4); redrawn only when a step
  arrives. The three DDFs declare `chart` and `charts` (decision 7).
  HIL: the specimen on the PaperS3.
- **F6 Range, pinch, ring, drag.** The four actions on the screen's range
  (`ChartRange`), pinch through `PinchDetector` (DDFs declare `pinch`),
  the knob's ring, a drag on a scrolling chart (decision 6). HIL: a pinch
  narrows (4.3B, PaperS3: synthetic touch through the test interface), a
  ring step moves a day (knob), a drag shows yesterday (4.3B).
- **F7 Generation and handbook.** The firmware's changelog line; the
  designer's handbook drops the «Geräte» warning for the three boards
  (`objekte/anzeigen.md`), the device pages say they draw charts; through
  maettel-humanizer.
- **Checkpoint:** test:quick green; the user deploys a history page to the
  4.3B in the van and sees the recorder's curve.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The knob's RAM with a 4 KB buffer and a day's payloads | High | decision 5 keeps only the shown screen's; heap measured in F3; a day per series at most |
| The C++ layout drifts from the TypeScript | Medium | vectors byte for byte (decision 4) |
| Drawing a chart is slow on the knob | Medium | redraw only when a step arrives or the range changes; measured with the existing RenderProfile |
| PaperS3 refreshes too often | Low | decision 6: only on a new step or a let-go |
| Synthetic pinch through the test interface not there yet | Medium | added in F6 to the test interface, as taps are |

## Not in this plan

The Android app (charts-android), conformance across all four devices and
the starter project (charts-finish).
