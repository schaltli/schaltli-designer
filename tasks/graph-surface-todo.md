# Todo: graph-surface

Plan: `tasks/graph-surface-plan.md`. Approved by the user on 2026-10-17
(«ja, mit S1 anfangen»), with the view replacing «Manage Screens» rather
than standing beside it.

- [x] S1 The core
  - lib/screen-graph.ts: `graphLayout` (columns `{ page, up?, down? }`, and apart: hidden, popups, masters), `withScreenInRow`, `withScreenDocked` (shows a hidden screen on the way, refuses in `canDock`'s words), `withScreenApart`
  - lib/hardware-button-actions.ts: `cutOffSides` - the sides where a neighbour lies but the screen's own swipe does something else
  - e2e/screen-graph.spec.ts «what «Manage Screens» lays out and moves» (5 tests)
- [ ] S2 The view, in place of the tab
- [ ] S3 Dragging
- [ ] S4 The list
- [ ] S5 The warning
- [ ] S6 Handbook
- [ ] Checkpoint: test:quick green; the user arranges a project of their own in the view
