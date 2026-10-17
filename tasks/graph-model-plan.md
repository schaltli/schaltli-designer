# Plan: graph-model

Spec: `docs/2026-10-17-screen-graph.md` (decisions 1-4, 7, 8, 11, 13,
16). Module `graph-model` of the capability map: the designer knows the
screen graph. Screens are docked, the main row and the neighbours are
worked out, the four neighbour actions exist, the export carries
`neighbours`, `back`, the main row and the resolved swipes, and the
preview follows them. There is no surface yet (`graph-surface`) and no
Deploy gate yet (`graph-contract`). After it, those two run side by side.

## Decisions taken here (to approve)

1. **The main row needs no `dock`.** It is the paged screens (main, not
   hidden) that have no `dock`, in list order: the order «Next screen»
   walks now. Only a screen off the row has
   `dock: { screenId, edge: "up" | "down" | "left" | "right" }`, the edge
   of the other screen it sits on. So an existing project is one row
   without any migration (decision 11), and reordering in the screens
   panel reorders the row, as now.
   - This narrows decision 13 («each screen has `dock`»); the spec gets
     the line once this is approved.
   - Within the row, a screen's left and right neighbours are the row's
     screens before and after it, with no wrap at the ends.
2. **What may dock where** (`canDock`, one function, used by every
   place that docks):
   - Only a main screen docks, and only onto a main screen. A docked
     screen offers no «Hide screen», and a hidden screen takes no dock:
     it stands apart (decision 8).
   - Each edge of a screen holds one neighbour at most. On a row screen,
     the left and right edges hold its row neighbours.
   - No loops.
   - No screen up or down from one that is itself docked up or down
     (decision 3).
   - A refused dock gives its reason, e.g. «The edge below "Energie" is
     taken by "Energie-Verlauf"».
3. **A screen that leaves the graph takes nothing with it.** This covers
   deleting a screen and making it a popup, a master or hidden. The
   screens docked on it become hidden screens, still «Go to Screen»
   targets, and a toast names them. Otherwise they would drop silently
   into the main row.
4. **One action type with a side.** `{ type: "goto-neighbour", side }`,
   where `side` is "up", "down", "left" or "right".
   - The picker shows it as «Go to the screen beside» with a choice of
     «Above», «Below», «Left» and «Right».
   - The summaries read «Go to the screen above» and so on (decision 16).
5. **The export resolves swipes in the order of decision 4.** For each
   swipe, the screen's own action wins first.
   - An explicit «None» counts as its own action: it is how one says
     «nothing here», and `graph-surface` warns where it cuts a neighbour
     off.
   - Next comes the neighbour in that direction: swipe up goes to the
     screen below, swipe left to the one on the right.
   - Last comes the master's action.
6. **A neighbour in the row is exported as «Next screen» or «Previous
   screen».** A neighbour off the row is exported as `goto-neighbour`.
   This covers a resolved swipe and a «Go to the screen beside» on a
   button alike; with no neighbour on that side, nothing is written.
   - **Old boards:** a single row exports nothing a board of today does
     not know. `goto-neighbour` appears only once something is docked
     off the row, which is exactly when `graph-contract` gates Deploy.
   - **Wrap:** «Next screen» wraps at the end of the row; the row
     neighbour exists only where it does not need to.
7. **Behaviour that changes in a row** (to approve). With the order of
   decision 4, a row screen that has no swipe action gains swiping to its
   row neighbours. A master's swipe left or right then counts only at
   the ends of the row.
   - Projects whose master says «Swipe left → Next screen», which is
     most, do exactly what they did.
   - A screen with no swipe at all now swipes.
   - A master that pages the other way round would be turned around.
   - The alternative: in the row, left and right do only what an action
     says, and neighbours count only off the row. That keeps every old
     project unchanged, but the row then behaves differently from the
     rest of the graph.
   - Recommended: the order of decision 4 everywhere, with the handbook
     saying so.
8. **The export:**
   - `mainRow: [ids]` at the top of the device's `project.json` and of
     the Android bundle.
   - Each row or docked screen gets
     `neighbours: { up?, down?, left?, right? }` (ids).
   - Each docked screen gets `back`: the side of the screen it is docked
     on. The device draws the «←» pointing the other way: swiped up to a
     history, `back` is "up" and the arrow points down (decision 7).
   - A device of today ignores the new fields. The navigator's entries
     stay the main row; `navigatorScreens` also leaves out docked
     screens.
9. **Docking without the surface, for now:** «Position» in the screen's
   properties offers «In the main row», or «Docked on [screen] [edge]»,
   with only the choices `canDock` allows. It makes the module usable
   and testable before `graph-surface`, and it stays as the keyboard way
   afterwards.
10. **The preview:**
    - A button with «Go to the screen beside» moves to the neighbour.
    - The navigator on a docked screen shows only «←», and a click on it
      goes back.
    - There is no swipe gesture (spec, «Modules»).

## Tasks

- **G1 The core.** A new `lib/screen-graph.ts` with:
  - `mainRow(screens)`;
  - `neighboursOf(screens, id)`;
  - `backOf(screens, id)`;
  - `canDock(screens, id, onId, edge)` → `{ ok } | { reason }`;
  - `screensCutOff(screens, id)` for decision 3.

  `dock?` goes on `ProjectScreen`. `isPagedScreen` stays, and next and
  previous use `mainRow`.
  Test: `e2e/screen-graph.spec.ts` covers the functions:
  - a row from today's project;
  - A' below A, with its neighbours and back;
  - the A'/B' case (no neighbour across);
  - every refusal of decision 2;
  - the cut-off screens.

  Files: `lib/screen-graph.ts`, `components/project-editor.tsx` (type),
  `lib/popup.ts`, `e2e/screen-graph.spec.ts`.
- **G2 The action.**
  - `goto-neighbour` in the union and in `describeHardwareButtonAction`.
  - The picker with its side choice.
  - The preview's `handlePreviewButtonAction` moves to the neighbour
    and closes a popup, as the other screen changes do.
  - `resolveSwipeAction(screen, master, swipeId, screens)` for decision
    5.

  Test: e2e for picking and saving, the summary, and a preview click
  moving to A'. The function gets e2e cases for own, «None», neighbour
  and master.
  Files: `components/project-editor.tsx`,
  `components/hardware-button-action-fields.tsx`,
  `lib/hardware-button-actions.ts`, `e2e/screen-graph.spec.ts`.
- **G3 The export.**
  - `lib/project-zip.ts` and `lib/android-export.ts` write `mainRow`,
    `neighbours`, `back`, the resolved swipes and the translated
    `goto-neighbour` (decisions 5, 6, 8).
  - Android also gets the swipe ids that only a neighbour fills.

  Test: e2e builds both from three projects:
  - a single row: its swipes as before, no `goto-neighbour`;
  - A' below A: A has «swipe-up → goto-neighbour down», A' has
    `back: "up"`;
  - a master with «Swipe up → Open popup»: it shows only where nothing
    is docked below.

  Files: `lib/project-zip.ts`, `lib/android-export.ts`,
  `e2e/screen-graph-export.spec.ts`.
- **G4 «Position» and leaving the graph.**
  - The field in the screen properties.
  - «Hide screen» offered only in the row.
  - Delete, popup, master and hide make the screens docked on it hidden,
    with a toast.

  Test: e2e docks A' below A by the field; the edge that is taken is not
  offered; deleting A hides A' and says so.
  Files: `components/screen-editor-fields.tsx` (or
  `property-panel/screen-properties.tsx`), `screens-panel.tsx`,
  `project-settings-dialog.tsx`, `e2e/screen-graph.spec.ts`.
- **G5 The navigator.**
  - `navigatorScreens` follows `mainRow`.
  - On a docked screen the preview draws only «←», pointing against
    `back`, and a click goes to the screen it is docked on.

  Test: e2e (`navigator.spec.ts`) checks the main-row screens unchanged,
  and that on A' there is a single entry that goes to A.
  Files: `lib/navigator.ts`, `components/canvas/canvas.tsx`,
  `e2e/navigator.spec.ts`.
- **G6 Handbook.**
  - `designer/screens.md`: neighbours, «Position», the main row, and the
    swipe order with the change of decision 7.
  - `designer/tasten.md`: «Go to the screen beside».
  - A warning that the devices follow with their next release.

  Through maettel-humanizer, with labels in `<span class="ui">`.
- **Checkpoint:** `npm run test:quick` green; the user docks a history
  below a page in the preview and clicks through.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A place that walks `screens.filter(isPagedScreen)` by itself and misses the row (export, navigator, start screen) | Med | G1 greps `isPagedScreen` and `navigatorScreens` and routes each through `mainRow`, or leaves it with a reason |
| Decision 7 surprises someone whose screens had no swipe | Low | the handbook says it; a swipe set to «None» brings the old behaviour back |
| Android's export takes only the button ids the project names, so a swipe only a neighbour fills is missed | Med | G3 adds the four swipe ids for every row and docked screen; the export test checks it |
