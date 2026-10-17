# Todo: graph-surface

Plan: `tasks/graph-surface-plan.md`. Approved by the user on 2026-10-17
(«ja, mit S1 anfangen»), with the view replacing «Manage Screens» rather
than standing beside it.

- [x] S1 The core
  - lib/screen-graph.ts: `graphLayout` (columns `{ page, up?, down? }`, and apart: hidden, popups, masters), `withScreenInRow`, `withScreenDocked` (shows a hidden screen on the way, refuses in `canDock`'s words), `withScreenApart`
  - lib/hardware-button-actions.ts: `cutOffSides` - the sides where a neighbour lies but the screen's own swipe does something else
  - e2e/screen-graph.spec.ts «what «Manage Screens» lays out and moves» (5 tests)
- [x] S2 The view, in place of the tab (no dragging yet)
  - components/manage-screens/manage-screens.tsx: the comb (one column per page, the places above and below, dashed when free, joins between neighbours), «Apart» (Hidden, Popups, Masters); a click selects and shows the screen's fields, its number of objects, «Move left» / «Move right» (row screens), «Duplicate», «Delete»; a double-click opens it; «Done» and Esc close
  - «Manage Screens» in the screens panel opens it in place of the canvas and the properties; the project settings' «Screens» tab and its handlers gone
  - lib/screen-actions.ts: duplicate and delete once, for the list and the view; a copy of a docked screen lands in the main row
  - e2e/manage-screens.spec.ts (layout and double-click; rename, move, duplicate, delete); seven specs that drove the old tab moved onto the view (helpers `openManageScreens`, `manageScreensCard`, `closeManageScreens`)
  - handbook: designer/screens.md describes the view, designer/projekte.md loses the tab's row
  - test:quick 2026-10-17: e2e 1603 passed; 4.3B deploy (download stalled at 50 %) and PaperS3 live values (terminated) red in the run, green alone
- [x] S3 Dragging
  - components/manage-screens/manage-screens.tsx: a screen (not a popup or master) is dragged into a gap of the row, onto a free place above or below a page, or onto «Hidden»; only the targets it fits are lit (`data-lit`), a drop elsewhere toasts the reason (`canDock`'s words, or «the last screen of the main row»); each drop one undo step
  - e2e/manage-screens.spec.ts «Manage Screens: dragging» (2 tests: B before A, a hidden screen below B, A' into the row, Ctrl+Z; B onto «Hidden» with B' hidden and the toast, A refused below another page with only the allowed targets lit)
  - handbook: designer/screens.md, a paragraph on dragging
  - test:quick 2026-10-17: e2e 1605 passed; 4.3B live values terminated in the run, green alone
- [ ] S4 The list
- [ ] S5 The warning
- [ ] S6 Handbook
- [ ] Checkpoint: test:quick green; the user arranges a project of their own in the view
