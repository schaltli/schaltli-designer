# Todo: graph-model

Plan: `tasks/graph-model-plan.md`. Approved by the user on 2026-10-17,
decision 1 after asking why («ok, bleib bei 1»). Decision 7 (a row
screen with no swipe action gains swiping) is still to be answered
before G3.

- [x] G1 The core
  - lib/screen-graph.ts: `mainRow`, `rowScreenOf`, `isInGraph`, `neighboursOf`, `backOf`, `screensCutOff`, `withCutOffHidden`, `canDock`, `pagedScreen`; `dock?` on ProjectScreen
  - `isPagedScreen` leaves docked screens out, so `firstScreenToOpen` and the preview's next and previous follow the main row (`pagedScreen`: from a docked screen it counts from the row screen it hangs from)
  - left and right of a row screen is the row: docking there is refused, the list orders the row
  - e2e/screen-graph.spec.ts «screen graph: the core» (7 tests)
- [ ] G2 The action
- [ ] G3 The export (needs decision 7)
  - export a docked screen with `hidden: true` too, so a board of today pages past it and leaves it out of the navigator, as a new one does
- [ ] G4 «Position» and leaving the graph
- [ ] G5 The navigator
- [ ] G6 Handbook
- [ ] Checkpoint: test:quick green; the user docks a history below a page in the preview
