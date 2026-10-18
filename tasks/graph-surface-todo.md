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
- [x] S3b The hints and the room (asked by the user 2026-10-17)
  - the snapping table's hints in place of the grey places: the target under the pointer alone, a line along the page's edge, a row gap as a new table column, «Hidden» green; the join from thumbnail to thumbnail, under the name
  - «Manage Screens» covers the projects and screens lists, the tools ribbon greyed out; the keys for objects and pasting objects rest while it is open (undo, redo, save do not)
  - e2e/manage-screens.spec.ts: the join's ends, the hints, «covers both lists and greys out the tools; the keys for objects rest»
- [x] S4 The list
  - components/screens-panel/screens-panel.tsx: the main row in its order, each page followed by its screens above and below, indented and marked ↑/↓ (titles «Above "X"» / «Below "X"»), then the hidden screens; a docked row is not draggable, a drop on it goes after its page and what hangs from it; a main screen dropped on a page goes into the row there (`withScreenInRow`: a hidden one is shown)
  - e2e/manage-screens.spec.ts «the screens list and the screen graph»
  - handbook: designer/screens.md, the list's indenting
  - test:quick 2026-10-17 (S3b and S4 together): e2e 1606 passed; broker-login (EPERM on a rename), knob internal heap and 4.3B conformance red in the run, green alone - conformance after a restart of the 4.3B, which kept losing the broker
- [x] S5 The warning: `cutOffSides` no longer warns where the own action goes there all the same («Go to a screen» naming it, «Next/Previous screen» in the row); a note under «Swipe navigation», the join amber in the view with the note as its title. Tests: `e2e/manage-screens.spec.ts` «a neighbour cut off…», `e2e/screen-graph.spec.ts`
- [ ] S6 Handbook
- [ ] Checkpoint: test:quick green; the user arranges a project of their own in the view
