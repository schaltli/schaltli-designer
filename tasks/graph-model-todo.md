# Todo: graph-model

Plan: `tasks/graph-model-plan.md`. Approved by the user on 2026-10-17,
decision 1 after asking why («ok, bleib bei 1»), decision 7 (a row
screen with no swipe action gains swiping to its neighbours: «7 ja»).

- [x] G1 The core
  - lib/screen-graph.ts: `mainRow`, `rowScreenOf`, `isInGraph`, `neighboursOf`, `backOf`, `screensCutOff`, `withCutOffHidden`, `canDock`, `pagedScreen`; `dock?` on ProjectScreen
  - `isPagedScreen` leaves docked screens out, so `firstScreenToOpen` and the preview's next and previous follow the main row (`pagedScreen`: from a docked screen it counts from the row screen it hangs from)
  - left and right of a row screen is the row: docking there is refused, the list orders the row
  - e2e/screen-graph.spec.ts «screen graph: the core» (7 tests)
- [x] G2 The action
  - `goto-neighbour` with `side` in HardwareButtonAction; summaries «Go to the screen above / below / on the left / on the right» (`describeNeighbourSide`)
  - the picker: «Go to the screen beside» (not on a popup) and «Side»; a swipe suggests the side it pulls in, a button «Right»; «No screen is docked there: here it does nothing.» on a screen without one
  - the preview moves to the neighbour and closes a popup; a click on a swipe or button resolves through `resolveSwipeAction` (own, «Nothing» included; neighbour; master)
  - e2e/screen-graph.spec.ts «what a swipe does» (4) and «Go to the screen beside» (picker, note, preview)
- [ ] G3 The export
  - export a docked screen with `hidden: true` too, so a board of today pages past it and leaves it out of the navigator, as a new one does
- [ ] G4 «Position» and leaving the graph
- [ ] G5 The navigator
- [ ] G6 Handbook
- [ ] Checkpoint: test:quick green; the user docks a history below a page in the preview
