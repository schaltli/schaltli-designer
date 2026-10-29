# Plan: charts-designer

Spec: `docs/2026-10-16-charts.md` (decisions 5, 8, 9, 11, 12, 13 and «Data
model»: «What a control gives», «The kind decides the defaults»). After
charts-model and charts-recorder: the chart is drawn - on the canvas, in the
thumbnails and in the preview, Live from the recorder's history and in
Simulation from the topics' examples - placed with its tool, set up in its
panel, and proposed as a history page under a page. The range actions and
pinch (`charts-actions`) and the devices (`charts-firmware`,
`charts-android`) come after; until then Deploy refuses a chart, as
charts-model decided.

## Decisions taken here (to approve)

1. **The window a chart shows** comes from its screen's time range
   (decision 15), without scrolling in the designer yet (that comes with the
   range actions):
   - **24 h**: today, midnight to midnight; the NowPoint at the clock's time
     and the rest of the day empty (decision 9).
   - **7 days**: the last seven calendar days, today the last.
   - **1 h and 6 h**: the last hour or six, ending with the step now is in.
   - **per day**: the last `days` days as bars.
2. **Which history a range reads** (decision 7): 1 h `recent`, 6 h
   `recent6`, 24 h and 7 days the `day/<date>` topics of the days shown,
   per day `daily`. One pure function names them
   (`historyTopicsFor(chart, range, now)`), so the preview, the firmware
   and the app subscribe to the same.
3. **Drawing is a pure layout plus a painter.** `lib/chart-layout.ts`
   works out everything a renderer needs - plot area, axis ranges
   (`auto` from 0 where every value is ≥ 0, `fixed`, `at-least`), ticks,
   the time axis with midnights and day names, each series as points,
   steps, bands or bars, the stacks with a balance, zones, the legend
   rows with their annotations, the NowPoint - from the chart, the window,
   the history payloads and the screen size. `render-chart.ts` only paints
   it. The firmware and the app port the same layout and are checked
   against its numbers (later plans), as the energy diagram was.
4. **On a grey or black-and-white device series differ by hatching and
   dash** (decision 8, «Colour»): an area or band gets one of four
   hatchings, a line one of three dashes, in series order; the preview of
   a PaperS3 shows it.
5. **Simulation draws from the topics' examples** (decision 11): a level
   or power series a smooth curve through its topic's numeric examples
   over the window, the same every time (no random); a state alternating
   on and off through its examples. A series whose topic has no examples
   is drawn empty.
6. **Live without a recorder says so** (decision 11): when
   `schaltli/history/recorder` is not «online», the chart shows «No
   recorder on this broker» in its middle and nothing else. With a
   recorder but no history yet: «No history yet».
7. **The kind is inferred when a series is made** (decision 5): from a
   Home Assistant `device_class` where the topic was announced with one
   (`power` → power; `temperature`, `humidity`, `battery` → level; a
   binary sensor or switch → state), else from the unit (`W`, `kW` →
   power), else from the topic's examples (`on`/`off`, `true`/`false` →
   state), else level. `lib/chart-infer.ts`, pure.
8. **The tool places an empty chart**; its panel's first line asks for a
   series. Width and height as drawn, the font near 14 px.
9. **The panel** follows the spec's list (decision 8): «Chart» (Mode, Days,
   Scrolling, Legend), «Left axis», «Right axis» (shown once a series uses
   it), «Zones», then «Series» - one collapsible block per series, added
   with a topic picker, ordered by dragging, each with Source, Name, Kind,
   On means (state), Factor, Unit, Decimals, Drawn as, Stack, Axis,
   Colour, Range, Daily value (per day), Annotations. Only what fits the
   kind and mode is offered (decision 8, «Invalid combinations»), the
   model's `normalizeChart` deciding.
10. **«Add history below»** on a page in the screen's panel and in Manage
    Screens (decision 12): a new screen docked below it
    (`docs/2026-10-17-screen-graph.md`) named «<page> history», time range
    24 h, with one chart the full width under a pull tab's height, its
    series from the page's controls as «What a control gives» says: a Bar
    or Gauge a level with the axis fixed to its outermost calibration
    points, a Slider or Dial a stepped «Target», a Switch a band, a value
    in a Text a level with its decimals, an energy diagram stacked power
    with its balance. Two units give the chart a right axis; a third unit
    starts a second chart below. Relays and dimmers (switches without a
    state topic) give nothing; a page that gives nothing is not offered
    the button. Scrolling on (decision 12). The pinch defaults come with
    charts-actions.
11. **A topic only a chart reads still counts as used**: «unused topics»
    and the topic clean-up do not offer to remove it.

## Tasks

- **D1 The window and its history.** `lib/chart-window.ts`:
  `chartWindow(range, now, tz)` (decision 1) and
  `historyTopicsFor(chart, window)` (decision 2, using `historyName`).
  Test: `e2e/chart-window.spec.ts` (pure): each range's from and to,
  the clock-change day, the topics named for each.
  Files: `lib/chart-window.ts`, `e2e/chart-window.spec.ts`.
- **D2 The layout: axes and lines.** `lib/chart-layout.ts`: plot area,
  axes (auto, fixed, at-least, two axes), ticks, time axis with
  midnights, level and power series as line, area and steps, factor and
  invert, gaps where a step is null, the NowPoint, zones.
  Test: `e2e/chart-layout.spec.ts` (pure): the water example's numbers;
  auto from 0; a gap; a fixed axis clips.
  Files: `lib/chart-layout.ts`, `e2e/chart-layout.spec.ts`.
- **D3 The layout: bands, stacks, bars, legend.** States as bands with
  the starts' triangles; stacks above and below zero with a balance;
  per-day bars; the legend rows with current («jetzt»), min, max, sum (in
  and out for a signed series, the window's bounds beside it), run time
  and starts, worked out from the window.
  Test: `e2e/chart-layout.spec.ts`: a heater band and its run time; a
  battery's in and out; a balance; seven bars; the legend's figures.
  Files: `lib/chart-layout.ts`, `e2e/chart-layout.spec.ts`.
- **D4 The painter.** `render-chart.ts` paints the layout, at the device's
  resolution, with hatching and dashes on grey and 1-bit (decision 4);
  canvas, thumbnails, preview and test-render.
  Test: `e2e/chart-render.spec.ts` through test-render: pixels of a line,
  a band, a zone and the NowPoint where the layout puts them; a PaperS3
  render hatched.
  Files: `components/canvas/renderers/render-chart.ts`,
  `app/test-render/page.tsx` (if needed), `e2e/chart-render.spec.ts`.
- **D5 Live and Simulation.** The preview subscribes to
  `historyTopicsFor` of the charts on view and to the recorder's
  presence, and hands the payloads to the layout; Simulation makes
  history from examples (decision 5); the two messages of decision 6.
  Test: `e2e/chart-preview.spec.ts` with an own broker
  (`e2e/own-broker.ts`): retained history drawn; no recorder → the
  message; Simulation draws a curve from examples.
  Files: `lib/chart-simulation.ts`, `components/project-editor.tsx` or the
  preview's MQTT hook, `lib/render-screen.ts`, `e2e/chart-preview.spec.ts`.
- **D6 Inferring the kind.** `lib/chart-infer.ts` (decision 7).
  Test: `e2e/chart-infer.spec.ts` (pure): each rule, and its order.
  Files: `lib/chart-infer.ts`, `e2e/chart-infer.spec.ts`.
- **D7 The tool.** «Chart» in the toolbar's Show group; drawn, an empty
  chart (decision 8); topics a chart reads count as used (decision 11).
  Test: `e2e/chart-model.spec.ts`: drawn with the tool, a chart of the
  drawn size; its topic not offered for removal.
  Files: `components/toolbar/toolbar.tsx`, `components/canvas/canvas.tsx`,
  `lib/topic-usage.ts`, `e2e/chart-model.spec.ts`.
- **D8 The panel: the chart.** Chart, axes, zones (decision 9).
  Test: `e2e/chart-panel.spec.ts`: each field lands in the export;
  per day offers Days, time does not; the right axis appears with a
  series on it.
  Files: `components/property-panel/chart-properties.tsx`,
  `e2e/chart-panel.spec.ts`, `e2e/fixtures/property-panel-controls.json`.
- **D9 The panel: the series.** Add by topic (kind inferred, D6),
  remove, reorder, every field; only what fits offered.
  Test: `e2e/chart-panel.spec.ts`: a series added from a topic with a
  unit W is power, area, sum; switching it to state drops the sum and
  offers On means; reordered, the export's order follows.
  Files: `components/property-panel/chart-series-section.tsx`,
  `components/property-panel/chart-properties.tsx`, `e2e/chart-panel.spec.ts`.
- **D10 Series from controls.** `seriesFromObject(obj, project)`
  (decision 10's list), pure.
  Test: `e2e/chart-from-controls.spec.ts`: each control type, the
  energy diagram's stack with its balance, relays left out, two units two
  axes, a third unit a second chart.
  Files: `lib/chart-from-controls.ts`, `e2e/chart-from-controls.spec.ts`.
- **D11 «Add history below».** The button (decision 10); the screen's
  «Time range» field in its panel.
  Test: `e2e/chart-history-page.spec.ts`: on a page with two Bars and a
  Switch, the button makes a docked screen below with one chart of three
  series; a page of relays offers no button; Time range lands in the
  export.
  Files: `components/property-panel/screen-properties.tsx`,
  `components/screen-editor-fields.tsx` (or where Manage Screens edits),
  `lib/chart-from-controls.ts`, `e2e/chart-history-page.spec.ts`.
- **D12 Handbook.** `handbuch/objekte/anzeigen.md` «Chart» (object, series,
  kinds, annotations, Live and Simulation), `handbuch/designer/screens.md`
  «Add history below» and «Time range», `handbuch/betrieb/daten.md`
  pointing to it; a warning that no device shows charts yet, with a
  `handbuch-macke` issue; through maettel-humanizer;
  `e2e/handbook-labels.spec.ts` green.
- **Checkpoint:** test:quick green; the user builds a history page in the
  preview against the van's recorder.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The panel grows past what one task holds | Medium | split chart (D8) and series (D9); the series block its own component |
| The layout is too designer-specific to port to C++ and Kotlin | High | pure numbers out, no canvas calls, no DOM; written with the energy diagram's layout as model |
| The preview subscribes to many day topics | Low | only the charts on view, only the days in the window (at most 7 per series) |
| Simulation looks real enough to mislead | Low | it is drawn only in Simulation, as every simulated value is |

## Not in this plan

Pinch, the four range actions, scrolling and the knob's ring
(`charts-actions`); drawing on the devices (`charts-firmware`,
`charts-android`); conformance and the starter project (`charts-finish`).
