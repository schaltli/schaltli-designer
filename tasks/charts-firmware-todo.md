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
- [x] F2 Parsing
  - firmware: `ChartProps` behind a `ChartHandle` on ObjectProperties (the core's model, the font, the quiet colour and each series' and zone's colour pair); `ProjectLoader::parseChart`; Screen `timeRange`; ButtonAction `rangeDirection` and `range`; ThemeVariant swaps the chart's pairs (firmware aa8fb17)
  - test/test_chart «test_chart_from_the_export»: the contract's example read field by field; all three boards build
- [x] F3 The history
  - [x] the holder, Arduino-free: firmware src/project/ChartHistory.{h,cpp} - `topicsFor` (charts × view × the recorder's calendar → payload topics), `setWanted` (added / dropped, the dropped let go), `onMessage` (now with its day table, the recorder's presence, a wanted payload), `now`, `heldBytes`; `historyName` and `historyTopicsFor` in ChartCore; test/test_chart_history (3); 98 native tests green (firmware 475ebd8)
  - [x] firmware src/ChartFeed.h, one class for the three mains: routes schaltli/history/… to the holder, subscribes NOW and RECORDER where a project has charts, fits the wanted topics to the shown screen and popup on every change and once a minute (a day turns), keeps each screen's view, says when a chart needs drawing again; `?set=charts` on every board's test interface (`describe`); MQTT buffer 4096
  - [x] HIL hil/charts-history.js (each board's lane, quick): knob, 4.3B and PaperS3 flashed with the checkout (hil/firmware-upload.js --install-checkout) - each PASS, 6 checks; the knob's heap PASS with the 4 KB buffer, minimum 123580 bytes free (hil/internal-heap.js)
- [x] F4 Drawn on the 4.3B and the knob
  - found first: the designer's chart is painted with the canvas's anti-aliasing, which no board can match, and conformance asks 0 px of difference. As the energy diagram does (render-energy-diagram.ts DiagramPixels, lib/polygon-raster.ts ↔ firmware PolygonRaster): the shapes become outlines in eighths, filled by the shared raster into RGB565 pixels mixed over the screen's ground, on both sides; texts stay Text objects (BDF on both)
  - [x] lib/chart-shapes.ts: from the layout and the colours, the list of fills in drawing order - zones (alpha), grid lines and midnights (rects), ranges and areas (alpha), bands and bars, start triangles, lines as quads 2 px wide (dashed on grey), marks and the NowPoint as 16-gons, legend swatches; on grey the rectangles (zones, bands, bars) hatched with 1 px quads clipped to them and framed - an area on grey is a lighter fill and its line dashed, as clipping hatching to any outline is more than it is worth; the fills in the vectors
  - [x] render-chart.ts paints those fills through a pixel buffer as the energy diagram's, and its texts as now; chart-render spec held to the fills
  - [x] firmware ChartShapes, held to the vectors (fills on colour and grey: count, colour, alpha, clip exact; corners within an eighth)
  - [x] firmware ColorScreenRendererChart.cpp: the fills into a pixel buffer drawn onto the canvas, the texts through drawTextBox, the messages; `readsTopic` false for a chart (it reads history, not its series' topics)
  - [x] HIL hil/charts-draw.js instead of a conformance specimen (a specimen has no history to lay): the board's snapshot against test-render's drawing of the same history at the same clock (`chartLive`) - 4.3B 0/384000, knob 0/129600, PaperS3 0/518400 px; in each board's lane
  - found on the way, each fixed and tested: a board without the recorder's table looped for ever over a window's midnights and restarted (empty table: UTC days now, on both sides; loops capped; test_chart «without a table», chart-window spec); text boxes on half pixels in the designer (now whole, as lround); texts not cut at the chart's edge on the board (now its region); the designer wrote numbers with "." where the project says "," (now the project's separator)
  - the PaperS3 draws through the same renderer: F5's drawing is done with it
- [ ] F5 Drawn on the PaperS3, DDFs declare chart and charts
- [ ] F6 Range, pinch, ring, drag
- [ ] F7 Generation and handbook
- [ ] Checkpoint: test:quick green; the user deploys a history page to the 4.3B in the van and sees the recorder's curve
