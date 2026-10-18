# Plan: graph-knob-map

Spec: `docs/2026-10-17-screen-graph.md`, decisions 6 (the hints) and 15
(the map). Module `graph-knob-map`: the knob, which has no navigator, shows
where a swipe leads while swiping, and opens the screen graph as a map on a
swipe that ends in a pause. Work in `../schaltli-firmware` (knob only).

## Decisions (user, 2026-10-18)

1. **The hints show from 12 px of movement** - where a drag starts - never on
   touch-down: a tap stays a tap. At each edge a swipe leads to a neighbour
   from (the pull tab's rule, contract §2.10) the neighbour's icon and name,
   at 12, 3, 6 and 9 o'clock; they fade as the screen follows the finger and
   go when it is lifted.
2. **The map opens on a pause of 0.4 s** at the end of a swipe, the finger
   still down - a swipe being at least 60 px, so the setup hold (which allows
   40 px of drift) is never taken for one. While the map is open the setup
   hold does not count.
3. **The map looks like «Manage Screens»**: tiles with the screen's icon and
   name, the main row across, a screen above or below a page above or below
   it, joins between docked screens; the current screen in the middle,
   outlined. The finger is the pointer: the tile under it is lit, lifting
   jumps there; over the current screen or off every tile it cancels. Near the
   round edge the map pans. Hidden screens, popups and masters are not on it.

## How

- **Hints and map are LVGL objects on the top layer**, above the screen's
  image: they stand still while the screen slides, and closing them leaves
  the picture as it was - nothing to restore. Names in Montserrat 14 (LVGL's
  own), icons from the screens' page icons (`pageIconPath`, 56 px masks).
- **The layout is a pure module**, `src/project/GraphMap`: tiles from
  `mainRow` and each row screen's `neighbours.up/down`, a tile's centre around
  the current one at a pan, the tile under a point, the pan near the edge.
  Native tests.
- **Test interface**: `/api/debug` says which hints show, whether the map is
  open, the tile lit and every tile's centre, so a HIL can drive it through
  `/api/touch`.

## Tasks

- **K1** `src/project/GraphMap` and `test/test_graph_map`.
- **K2** `src/GraphHints` (LVGL) and the hints in the gesture loop.
- **K3** `src/GraphMapView` (LVGL) and the map in the gesture loop: pause,
  pointer, pan, jump or cancel, the setup hold set aside.
- **K4** HIL: `hil/screen-graph.js` on the knob also checks the hints and the
  map (open on a pause, a jump by lifting over a tile, a cancel over the
  current screen), the panel's pixels changing where they show.
- **K5** Handbook `geraete/knob.md`; the spec's decisions settled.
- **Checkpoint:** `pio test -e native`, the knob's HIL and `npm run
  test:quick` green.
