# Todo: graph-knob-map

Plan: `tasks/graph-knob-map-plan.md`.

- [x] K1 `src/project/GraphMap` (the comb's tiles, a tile's centre at a pan, the tile under a point, the pan near the round edge) and `test/test_graph_map`
- [x] K2 `src/GraphOverlays` `GraphHints`: LVGL cards on the top layer at the edges a swipe leads to, icon and name, fading over 120 px; shown from 12 px of movement, never on a tap or a popup, gone on release
- [x] K3 `GraphMapView`: the map on a swipe of 60 px that pauses 0.4 s; the drag ends under it; the finger the pointer, the lit tile drawn again on its ground, the pan near the edge; lifting jumps or cancels; the setup hold set aside while it is open. `/api/debug` reports `graphHints` and `graphMap` (open, lit, every tile's centre)
- [x] K4 HIL: `hil/screen-graph.js` on the knob checks the hints (state and glass), the map opening on a pause, the lit tile, the jump and the cancel - 23 checks. Found: a mid-swipe glass fetch holds the finger still, which on the knob is the map's gesture - skipped there; the test project takes `needsPageIconsInSize` from the description, or the knob has no icons to show
- [x] K5 Handbook `geraete/knob.md` (the hints, the map); the spec's decisions 6 and 15 settled
- [x] Checkpoint: pio test -e native 57/57, test:quick 2026-10-18 Overall PASS (e2e 1633, the screen graph on all three boards, the Android HIL)
