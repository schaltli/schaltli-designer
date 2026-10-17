# Plan: graph-surface

Spec: `docs/2026-10-17-screen-graph.md` (decisions 1, 2, 8, 9, 12).
Module `graph-surface` of the capability map. The designer gets a view of
its own that arranges the screens, as PowerPoint's slide sorter does. It
shows the comb as it is: the main row, each page's screen above and
below it, and apart from them hidden screens, popups and masters.
Dragging orders and docks. The list of screens shows docked screens
under their page. Depends on `graph-model` (done 2026-10-17); runs
beside `graph-contract`.

## Decisions taken here (to approve)

1. **The view replaces «Manage Screens»** (user, 2026-10-17: «eine
   zweite Ansicht neben der Manage-Screens-Ansicht ist komplett
   überflüssig»). «Manage Screens» at the foot of the screens panel opens
   it, under the same name, and the «Screens» tab of the project settings
   goes. The view covers the canvas and the properties; the screens panel
   and the toolbar stay; «Done» or Esc closes it.
   - **What the old tab did, the view does.** A click on a screen selects
     it, and a column at the right shows what the tab showed for each
     row: its fields (`ScreenEditorFields`: name, type, icon, «Position»,
     «Hide screen», master), the number of objects, and «Move left»,
     «Move right», «Duplicate» and «Delete». The two moves stand for the
     tab's «Move up» and «Move down»: the way to order the row without a
     mouse.
   - A double-click opens the screen for editing and closes the view.
   - In the preview «Manage Screens» is off: the project is read-only
     there.
   - Every change goes through `setProject`, so undo works as everywhere,
     and `withGraphMended` keeps the graph whole.
2. **The layout is the comb** (`graphLayout`, one pure function).
   - One column per screen of the main row, in order, scrolling sideways
     when there are many.
   - Three levels: above, the row, below. A short join links a page to
     its row neighbours and to the screens docked on it. There is no
     join between A' and B', so the gap shows they are no neighbours
     (decision 2).
   - Under the comb, separated by a line, the area «Apart» with three
     groups: «Hidden», «Popups» and «Masters».
   - The thumbnails are the screens panel's own (`ScreenThumbnail`),
     sized so three levels fit the window's height.
3. **Dragging** (HTML5 drag and drop, as the screens panel uses now):
   - **Into the row:** onto the gap between two columns, or before the
     first or after the last. The screen joins the row there: its dock
     and «Hidden» go, and `project.screens` is reordered so it stands
     before the page to its right. A page dragged within the row takes
     the screens above and below it along, since they are docked on it.
   - **Onto a free place above or below a page:** it docks there
     (`canDock`). While dragging, only the places `canDock` allows are
     lit; dropping on any other place says why, in the words of
     `canDock` (a toast).
   - **Onto «Hidden»:** the screen becomes a hidden screen. Screens
     docked on it become hidden too, with the usual toast.
   - Popups and masters are shown but not dragged. Which kind a screen
     is stays in its properties («Screen type», «Add Master Screen»).
     A drop of a page onto «Popups» or «Masters» is not offered.
4. **The list of screens shows the comb too.** A docked screen sits
   indented under its page, the one above first and then the one below,
   each marked ↑ or ↓. Dragging in the list orders the row as now. A
   docked screen in the list is not dragged: it moves with its page and
   is placed in «Manage Screens» or by «Position». A drop on a docked
   row counts as a drop on its page.
5. **A neighbour cut off is warned about** (decision 9). A swipe whose
   own action takes the direction of a neighbour gets a note under it in
   «Swipe navigation», e.g. «"Energie-Verlauf" lies below: this swipe
   no longer reaches it.». In «Manage Screens» that join carries a
   warning mark with the same words as its tooltip. One function in
   `lib/screen-graph.ts` answers for both: the sides where a neighbour
   lies but the resolved swipe does not go there.
6. **No keyboard dragging.** «Position» in the properties remains the way
   without a mouse (spec, decision 12).

## Tasks

- **S1 The core.** In `lib/screen-graph.ts`:
  - `graphLayout(screens)` gives the columns `{ page, up?, down? }` and
    the groups `{ hidden, popups, masters }`;
  - `withScreenInRow(screens, id, beforeId | null)`;
  - `withScreenDocked(screens, id, pageId, edge)`, which checks with
    `canDock`;
  - `withScreenApart(screens, id)`;
  - `cutOffSides(screens, id, master)` for decision 5.

  Test: e2e on the functions:
  - the layout of a project of today, and of one with docks;
  - into the row at the start, middle and end, from a dock and from
    hidden;
  - a page moved takes its docked screens along;
  - a refused dock gives the reason;
  - the cut-off sides.

  Files: `lib/screen-graph.ts`, `e2e/screen-graph.spec.ts`.
- **S2 The view, in place of the tab.** `components/manage-screens/manage-screens.tsx`:
  - the comb, the joins and the area «Apart»;
  - the selected screen's column: its fields, the number of objects,
    «Move left», «Move right», «Duplicate», «Delete»;
  - «Manage Screens» opens it; «Done» and Esc close it;
  - a double-click opens the screen;
  - the «Screens» tab of the project settings removed, with its handlers
    moved where the view needs them.

  Test:
  - e2e opens it on a project with A' above A and a hidden screen, then
    checks the order of the columns, A' over A, «Setup» under «Hidden»,
    no join between A' and B', and that a double-click on B opens B;
  - a click on B shows its fields, and renaming, «Move left»,
    «Duplicate» and «Delete» work there;
  - the e2e that drove the old tab are moved onto the view (found by
    grepping for `"screens"` and «Manage Screens»).

  Files: the new component, `screens-panel.tsx`, `project-editor.tsx`,
  `project-settings-dialog.tsx`, `e2e/manage-screens.spec.ts`, the old
  tab's specs.
- **S3 Dragging.** Into the row, onto a place, onto «Hidden»; only
  allowed places lit; a refused drop gives its toast. Undo takes back
  one drag.

  Test: e2e with `dragTo`:
  - B before A;
  - a hidden screen below B;
  - A' into the row;
  - B onto «Hidden», with its docked screen hidden too and the toast;
  - a drop above a docked screen refused;
  - Ctrl+Z.

  Files: the component, `e2e/manage-screens.spec.ts`.
- **S4 The list.** Docked screens indented under their page with ↑/↓,
  not draggable; a drop on one goes to its page.

  Test: e2e for the order in the list, the marks, and dragging a page
  in the list carrying its docked screens along.
  Files: `screens-panel.tsx`, `e2e/manage-screens.spec.ts`.
- **S5 The warning.** `cutOffSides` shown in «Swipe navigation» and on
  the join in the view.

  Test: e2e - a swipe up set to «Send an MQTT message» on a page with a
  screen below shows the note, and the view marks the join.
  Files: `property-panel/screen-properties.tsx` (or
  `hardware-button-action-fields.tsx`), the component,
  `e2e/manage-screens.spec.ts`.
- **S6 Handbook.**
  - `designer/screens.md`: «Manage Screens» as the view, in «Screens
    über- und untereinander» and where the old tab was described, with
    a screenshot from `handbook-screenshots`; the list's marks.
  - `designer/tasten.md`: the cut-off note.

  Through maettel-humanizer, with labels in `<span class="ui">`.
- **Checkpoint:** `npm run test:quick` green; the user arranges a project
  of their own in the view.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| HTML5 drag and drop between nested drop zones misfires (gap vs. place vs. column) | Med | one drop target per zone with explicit `data-drop` attributes; the e2e drags onto each kind |
| Thumbnails of many screens render slowly in the view | Med | the same `ScreenThumbnail` the panel already renders for every screen; drawn once per change, not per drag move |
| The list's indentation confuses the row order a user reads from it | Low | the marks ↑/↓, and the handbook shows the list beside the view |
