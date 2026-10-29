# Todo: charts-designer

Plan: `tasks/charts-designer-plan.md`. Approved by the user on 2026-10-29 («1. ja»), all decisions as written; the history page is named «<page> history» («2. History»).

- [x] D1 The window and its history
  - lib/chart-window.ts: `chartWindow` (24 h today, 7 days to today, 1 h and 6 h to the step now is in, per day its last days), `historyTopicsFor`; days in a zone as the recorder counts them
  - e2e/chart-window.spec.ts (6), the recorder's days among them
- [x] D2 The layout: axes and lines
  - lib/chart-layout.ts: `seriesData` (day and recent payloads to steps, a state's periods in unix seconds, factor and invert), `niceStep` (1, 2, 2.5, 5), `axisLabel`, `weekdayOf` (Mo … So), `chartLayout`: plot, left and right axis (auto from 0, fixed, at-least), time ticks and midnights, zones, line, area, steps, range band, gaps, the NowPoint, now past the window
  - e2e/chart-layout.spec.ts «axes and lines (D2)» (9), the water example's numbers by hand
- [x] D3 The layout: bands, stacks, bars, legend
  - lib/chart-layout.ts: a state's band in a strip at the plot's foot and the x of each start; stacks piled up from zero and down, a balance as minus the others where all have a value; per day one bar per day (energy up and down, run time in hours, a level's daily value), the days named; min and max marked with value and time; the legend top right, top left or below, its figures - «jetzt» and the value now, the sum in Wh/kWh (in and out apart, the window's clock times where it is not whole days), run time «h:mm h», starts «n×»
  - e2e/chart-layout.spec.ts «bands, stacks, bars, legend (D3)» (6)
- [x] D4 The painter
  - components/canvas/renderers/render-chart.ts paints the layout: zones, grid with stronger midnights, value, time and day labels, areas, ranges, bands with their starts, bars, lines, min/max marks, the NowPoint, «→» for a window that ended, the legend, a message in the middle («Chart: add a series»); grey and 1-bit: four hatchings and four dashes by the series' place; canvas (the screen's time range), render-screen (`chart` option for D5), `chartFontSize`
  - test-render `__chartForTest`: the layout and the colours at probed points
  - e2e/chart-render.spec.ts (3): line, band, zone and NowPoint where the layout puts them; a band hatched on 4 bit; the empty chart's message
  - for charts-firmware: the labels are drawn in the canvas's sans-serif at the chart font's size, not in the device font itself - a pixel comparison with a device needs the texts drawn as the energy diagram draws its (as text objects)
- [x] D5 Live and Simulation
  - lib/chart-preview.ts: `chartPreview` - Live from the history lying on the broker, in the recorder's zone, «No recorder on this broker», «No history yet»; otherwise (Simulation, editor, thumbnails) `simulatedData`: a cosine curve through the examples (a field's where `#path`) up to now, a state on and off as they say, per day bars; `historySubscriptions`: the Live preview subscribes `schaltli/history/<name>/#` per series and the recorder (all of a series' history, not only the window's days: simpler, and a change of range needs no new subscription)
  - canvas and render-screen draw with it
  - found on the way: opening a project dropped every series' and zone's colour - the colour migration deletes colours nested in properties; a chart's series and zones are now left to applyTheme (lib/themes.ts)
  - e2e/chart-preview.spec.ts (5): the messages, Live in the recorder's zone, Simulation, the subscriptions, and in the Live preview against the bench's broker no curve without a recorder and the curve once history is laid; e2e/chart-model.spec.ts: colours kept on opening
- [x] D6 Inferring the kind
  - lib/chart-infer.ts `inferValueKind`: a binary sensor, switch, light … a state; device_class power power, temperature, humidity, battery, voltage … a level; unit W/kW/MW power, any other unit a level; examples all on/off words a state; else a level
  - e2e/chart-infer.spec.ts (3)
- [x] D7 The tool
  - «Chart» in the toolbar's Show group; drawn, an empty chart of the drawn size, the font near 14 px
  - offered and enabled although no device declares `chart` yet (its description says so): without it nobody could build a chart before charts-firmware - found when the user looked for it in the van; Deploy still refuses it
  - a topic only a chart reads was already used (`source.topic` ends in «topic»): a test holds it
  - e2e/chart-model.spec.ts: «the Chart tool (D7)», and the topic not offered for removal
- [x] D8 The panel: the chart
  - components/property-panel/chart-properties.tsx: «Chart» (Mode «Over time»/«Per day», Days, Scrolling, Legend, Font), «Left axis» and, with a series on it, «Right axis» (Scale «Automatic»/«Fixed»/«At least», Range Min/Max, Unit), «Zones» (Axis where there are two, Values From/To, Colour; «Add zone»), «Frame» collapsed; every change through `normalizeChart`; a slot for the series (D9)
  - e2e/chart-panel.spec.ts «a chart's panel (D8)» (3); chart-model.spec.ts opens «Frame» first
- [ ] D9 The panel: the series
- [ ] D10 Series from controls
- [ ] D11 «Add history below»
- [ ] D12 Handbook
- [ ] Checkpoint: test:quick green; the user builds a history page in the preview against the van's recorder
