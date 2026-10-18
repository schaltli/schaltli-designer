# The screen graph

Proposed by the user on 2026-10-17, while specifying charts
(`docs/2026-10-16-charts.md`, decision 12): a page's history lies below
it, a swipe up away, and that does not fit the list of screens that «Next
screen» and «Previous screen» walk through.

Status: a draft. Decisions marked (user, 2026-10-17) are the user's; the
rest is proposed.

## Objective

Screens are laid out on a surface, next to, above and under each other,
as monitors are in Windows' display settings:

```
   [Energie] ── [Wasser] ── [Licht] ── [Heizung]
       │            │                      │
   [Energie-     [Wasser-               [Heizung-
    Verlauf]      Verlauf]               Verlauf]
```

Swiping goes to the neighbour in that direction, and a page's history is
nothing but the screen under it: no screen type, no action and no field
of its own.

## Decisions

1. **A comb: the main row, and one screen above and one below each page**
   (user, 2026-10-17, first «free in both directions», narrowed the same
   day for a view that shows exactly what a swipe does). The main row
   runs left to right; a screen of it may have one screen docked above
   and one below; a docked screen has no further neighbour, neither
   beside nor above or below. Every place is a column and a level, so
   the designer can lay the graph out as it is (decision 12).
2. **A neighbour is a screen docked on, not one that happens to lie
   beside** (user, 2026-10-17: with B right of A, A' above A and B' above
   B, there is no way from A' to B'). A' and B' lie side by side in the
   designer's view and are still not neighbours; the view shows the
   docks as joins, so one sees which touch.
3. **No stacking, for now** (user, 2026-10-17: whether histories may be
   stacked is not known yet). Part of the comb (decision 1); to be lifted
   when there is a use for it.
4. **Swiping goes to the neighbour.** Swiping up shows the screen docked
   below - what lies below is pulled up - swiping left the one docked on
   the right. A swipe with no neighbour in its direction does nothing.
   What a swipe does is decided in this order (user, 2026-10-17):
   1. the screen's own swipe action;
   2. the neighbour in that direction;
   3. the swipe action the screen inherits from its master.

   So a master's «Swipe left → Next screen» still works everywhere, and
   in a single row the neighbour is the screen it would have shown
   anyway; a master's action never hides a screen docked below.
5. **The knob swipes too** (user, 2026-10-17): its CST816 reads a swipe as
   the round screens do now. The ring is not for navigating (user,
   2026-10-17): it turns the value a screen sets, a dimmer or a heater's
   temperature. A knob reaches a screen further away with the map
   (decision 15).
6. **No screen menu** (user, 2026-10-17). The device action «Show Screen
   Menu» goes, on the knob and in the Android app alike:
   - In the Android app the navigator has taken over its job.
   - **The knob shows where a swipe leads, while swiping**: as soon as a
     touch moves far enough to be a swipe, the knob shows at each edge
     that has a neighbour that screen's icon and name - 12, 3, 6 and 9
     o'clock on the round display - and they fade as the screen follows
     the finger. (proposed: how far is «far enough», and whether the
     hints show on touch-down already.)
   - A tap stays a tap: nothing shows before the touch moves.
   - **Projects that use it**: the designer removes the action when it
     opens the project and says so once («The screen menu is gone: swipe,
     the ring or the navigator change screens now»). A device keeps
     obeying it until its next deploy, so an older board's project does
     not break. The device-action mechanism itself (`deviceActions` in
     the DDF, `docs/device-contract.md`) stays, with no action left for
     now.
   - The screen icons stay: the navigator and the knob's hints show them.
7. **The navigator lists the main row, and «←» elsewhere** (user,
   2026-10-17). On a screen of the main row it lists the main row as it
   does now (`docs/2026-10-08-navigator.md`). On any other screen it
   shows one arrow back, pointing against the swipe that led there:
   swiped up to a history, the arrow points down. (proposed: the main row
   is the first screen and every screen docked left or right of it, in
   order; next and previous walk it.)
8. **Hidden screens, popups and masters have an area of their own**
   (user, 2026-10-17): in the designer's view of the
   surface they stand apart, not docked anywhere. A master is never seen
   on a device; it is a template. A popup opens over a screen as now
   (`docs/2026-10-06-popup-screens.md`); a hidden screen is reached only
   by an action naming it.
9. **The pull tab** is drawn by the device on every edge a swipe leads to
   a neighbour from: a short line centred on that edge, which a colour
   display nudges towards the middle now and then. There is no object for
   it. Where the screen's own swipe action takes that direction (decision
   4), the swipe does not lead to the neighbour, and there is no tab: a
   tab promises what the gesture does (user, 2026-10-17). The navigator's
   «←» stays even then, since it is tapped, not swiped. The designer
   warns when an own swipe action cuts a neighbour off, so that no swipe
   and no action reaches it. The look was settled with the designer's preview (user, 2026-10-18): 32 by 4 px with round ends, 6 px from the edge, the theme's muted text at 70 %, nudged 6 px towards the middle for 0.8 s every 5 s where the screen moves (`lib/pull-tabs.ts`). A swipe moves what lies beside the navigator, which stays, as on the devices (user, 2026-10-18); the tabs stand on the edges of that area.
10. **A swipe belongs to what it starts on** (user, 2026-10-17), as a slider's
    and the navigator's do now (`docs/2026-10-08-navigator.md`, decision
    13): a horizontal swipe that starts on a scrolling chart scrolls
    through time, one that starts beside it changes the screen. A
    vertical swipe changes the screen on a chart too, since a chart
    scrolls only sideways. No special case for a swipe from the very
    edge: on Android the edge belongs to the system's back gesture, and
    on the knob it is too narrow to hit.
11. **Existing projects** load as one row in their present order, so every
   swipe and every «Next screen» does what it did. (proposed)
12. **«Manage Screens» becomes the view that arranges the screens**
    (user, 2026-10-17: a second view beside it would be one too many), as
    PowerPoint's slide sorter: the main row as a row of thumbnails, the
    screens docked above and below each page in the rows over and under
    it, and apart from them hidden screens, popups and masters (decision
    8). Dragging orders the row, docks a screen above or below a page, or
    puts it apart. The list of screens stays, and shows a docked screen
    indented under its page with ↑ or ↓. Moving the list to the bottom
    of the window was weighed and left: three levels of thumbnails would
    cost the canvas its height for good. «Position» in a screen's
    properties stays as the way without a mouse.
13. **The device computes nothing** (user, 2026-10-17), as with charts
    (`docs/2026-10-16-charts.md`, «Data model»). In the project a
    screen off the main row has `dock: { screenId, edge }`; the main row
    is the paged screens without one, in list order, so an existing
    project needs no migration (user, 2026-10-17,
    `tasks/graph-model-plan.md` decision 1). On export the designer writes
    out each screen's `neighbours: { up?, down?, left?, right? }`, its
    `back` (the direction of the screen it is docked on, for the «←») and
    the main row in order for next and previous. A device follows no
    tree. The order of decision 4 is resolved on export too: no device
    knows masters (the export already writes their actions into each
    screen), so the designer writes for each direction the action that
    wins - the screen's own, else «Go to the screen …» towards the
    neighbour (decision 16), else the master's. A device runs one action
    per swipe, as now. (user, 2026-10-17, with the modules)
14. **A feature the device declares** (user, 2026-10-17): `screen-graph` in its
    DDF. Deploy gates on it only when something is docked off the main
    row; a single row runs on an older board as it is. Otherwise Deploy
    brings the board up to date first, as with `local-topics`. Hard from
    the start (user, 2026-10-18): until a device declares it, a docked
    project deploys nowhere. The contract is `docs/device-contract.md`
    §2.10; «Show Screen Menu» goes with `graph-firmware`, so the knob is
    never without a way to its screens (`tasks/graph-contract-plan.md`).

15. **The knob jumps through a map** (user, 2026-10-17). A swipe that
    ends in a pause, the finger still down, opens the screen graph as a
    map: the screens as small tiles around the current one, the branches
    between them. The finger becomes the pointer; the tile under it is
    lit, and lifting the finger jumps there. Lifting it over the current
    screen, or off every tile, cancels. Near the round edge the map pans,
    so a graph larger than the display is reached all the same. A short
    swipe stays a swipe to the neighbour. While the map is open the 5 s
    setup hold does not count: a finger resting on a tile is choosing,
    not asking for setup. Only screens of the graph are on the map;
    hidden screens, popups and masters are not (decision 8). Any device
    may show it; the knob needs it, having no navigator. (proposed: the
    pause is about 0.4 s, and the map is the designer's view of the
    surface, drawn small)
16. **Four actions for the neighbours** (user, 2026-10-17): «Go to the
    screen above», «… below», «… on the left» and «… on the right» do what the swipe in
    that direction would do without the screen's own swipe action. So a
    project can put the screen graph on hardware buttons, one for each
    direction, and work without swiping at all, as «Next screen» and
    «Previous screen» walk the main row. With no neighbour there, the
    action does nothing. The export already carries `neighbours`
    (decision 13); the device computes nothing for them.

## Modules

Approved by the user on 2026-10-17. Each module gets its plan as
`tasks/<module>-plan.md` and its tasks as `tasks/<module>-todo.md`, as
with local topics. Commands, tests, style and boundaries are those of
`CLAUDE.md` (`npm run test:quick` for every change, ad-hoc checks become
e2e or HIL tests, the handbook changes with what a user sees) and of the
firmware's `pio test -e native`.

| Module | Responsibility | Depends on |
|---|---|---|
| `graph-model` | `dock` in the project, the tree check (decisions 2 and 3), the main row, loading existing projects as one row, the four actions in the union and the picker, the export of `neighbours`, `back`, the main row and the resolved swipe actions (decision 13), the preview running the actions and «←» | - |
| `graph-surface` | the view to arrange the screens (decision 12): the comb as it is, docking and ordering by dragging, the area for hidden screens, popups and masters; docked screens indented in the list of screens; the warning when an own swipe action cuts a neighbour off | `graph-model` |
| `graph-contract` | `docs/device-contract.md`, the feature `screen-graph`, Deploy's gate (decision 14), «Show Screen Menu» removed with its notice (decision 6) | `graph-model` |
| `graph-firmware` | 4.3B, PaperS3, knob: reading the export, the four actions, next and previous over the main row, following the finger up and down, the pull tab, the navigator's «←», the knob's screen menu gone, the DDF; native tests and HIL | `graph-contract` |
| `graph-android` | the app: the same, `ScreenMenuOverlay` gone; the orchestrator's HIL | `graph-contract` |
| `graph-knob-map` | the knob: the hints at the edges while swiping, the map on a swipe and hold (decision 15) | `graph-firmware` |

Order: `graph-model` → `graph-surface` and `graph-contract` side by side
→ `graph-firmware` and `graph-android` → `graph-knob-map`. The handbook
is changed in each module, not at the end.

Taken with the map (user, 2026-10-17):

- Following the finger up and down belongs to the boards and the app
  that follow it sideways now (knob, 4.3B, Android); «what lies below is
  pulled up» lives by it. The PaperS3 has no animation and jumps.
- The designer's preview swipes after all (user, 2026-10-18, overturning
  the decision of 2026-10-17): a drag where nothing else owns the press,
  the screen following it to a neighbour, and the pull tab drawn there,
  nudging as on the device - so the tab's look is settled before the
  boards draw it.

## Where it goes in (from the survey of 2026-10-17)

- **Designer.**
  - Screens are `ProjectScreen` (`components/project-editor.tsx`), in the
    order of `project.screens`; `dock` goes beside `masterScreenId`.
  - Next and previous walk `screens.filter(isPagedScreen)`
    (`lib/popup.ts`) in the preview (`handlePreviewButtonAction`) and on
    the devices: that filter becomes the main row.
  - Masters resolve in `lib/hardware-button-actions.ts`
    (`resolveButtonAction`, `exportedButtonAction`); the neighbour slots
    in between.
  - The action union is `HardwareButtonAction`; the picker is
    `components/hardware-button-action-fields.tsx`; the swipe fields are
    in `components/property-panel/screen-properties.tsx`.
  - The screen list is `components/screens-panel/screens-panel.tsx`
    (reorder by dragging) and «Manage Screens» in
    `components/project-settings-dialog.tsx`; the surface takes their
    place or stands beside them, decided in `graph-surface`.
  - The navigator lists `navigatorScreens` (`lib/navigator.ts`).
  - Export: `lib/project-zip.ts` (the per-screen loop) and
    `lib/android-export.ts`.
  - Deploy: the features in `components/deploy-dialog.tsx` beside
    `localTopicsFeature`, and `lib/deploy-plan.ts`.
  - Migration: `migrateProject` (`lib/object-types.ts`).
  - «Show Screen Menu» is in `lib/device-actions.ts`,
    `lib/device-description.ts`, `ProjectSettings.deviceActions`, the
    contract, `DEVICE_GUIDE.md`, and fixtures in e2e and HIL.
- **Firmware.**
  - `ProjectLoader::parseScreenInto` reads the screen; `getButtonAction`
    picks the action.
  - Paging is `pagedIndex` in `NavigatorLayout.cpp`. The knob's next and
    previous (`src/main.cpp`, `dispatchButtonAction`) do not skip hidden
    screens now; the main row mends that.
  - Following the finger:
    - knob: `tryStartDrag`, and `prerenderNeighbours` (±1 index only);
    - 4.3B: `pagingTargetFor`, sideways only, and `FollowSwipe.h`.
  - The knob's screen menu is `ScreenNavigatorOverlay` with its hooks in
    `src/main.cpp`.
  - The DDFs list `supportedFeatures` in `ddf-source*/device.json`.
  - A new pure module for the native tests is added to `[env:native]`.
- **Android.**
  - The model is `data/ProjectModels.kt`.
  - Swipes are looked up in `MainActivity.kt`; the slide is
    `ui/SwipeNavigation.kt` (sideways only); the actions are
    `mqtt/ButtonActionDispatcher.kt` (`navigationTarget`).
  - The navigator is `ui/NavigatorStripView.kt`.
  - The screen menu is `ui/ScreenMenuOverlay.kt`.
  - The DDF is `ddf/DdfBuilder.kt`.

## Success criteria

1. An existing project opens as one row; its export differs only by the
   main row, and every swipe and «Next screen» does what it did (e2e,
   `project-migration`).
2. With A' docked below A: A's export has `neighbours.down`, A''s
   `back: "up"`, and A's swipe up is «Go to the screen below». An own
   swipe up on A wins over it, and a master's swipe up shows only on a
   screen with no neighbour below (e2e).
3. A dock that would close a loop, or put a screen above or below one
   docked above or below, is refused (e2e).
4. Deploy of a project with a screen docked off the main row to a board
   without `screen-graph` brings it up to date first, and asks an older
   app to update; a single row deploys as before (e2e, `deploy-plan`).
5. A project with «Show Screen Menu» loses it on opening, says so once,
   and exports without it (e2e, `device-actions`).
6. In the preview the four actions change screen, and the navigator
   shows «←» on A' and goes back on a click (e2e).
7. In the view to arrange the screens: the main row in order, each
   page's screens above and below it, hidden screens, popups and masters
   apart; dragging orders the row, docks above or below a page and puts a
   screen apart; the list of screens shows a docked screen indented under
   its page; a cut-off neighbour is warned about (e2e).
8. On the 4.3B, the PaperS3 and the knob (HIL): swiping up on A shows
   A', down goes back; from A' no sideways swipe reaches B'; next and
   previous walk the main row and skip hidden screens; a pull tab is
   drawn where a swipe leads to a neighbour and nowhere else; the
   navigator shows «←» on A' and goes back on a tap. The main row's
   paging has a native test.
9. The Android app as 8 (orchestrator HIL, unit tests).
10. On the knob (HIL, by `/api/touch`): the hints show while swiping; a
    swipe and hold opens the map; lifting on a tile jumps there, on the
    current screen cancels; holding 5 s on the map does not open setup.
11. Handbook: `designer/screens.md` (the surface, docking),
    `designer/tasten.md` (the four actions, the screen menu gone),
    `objekte/anordnen.md` (navigator «←»), `geraete/knob.md` (hints, map,
    no screen menu), `geraete/android.md`.

## Not doing

- Screens stacked vertically (decision 3), until there is a use.
- Neighbours by position on the surface (decision 2): only docked ones.
- The ring for navigating (decision 5): it turns values.
- The screen menu (decision 6).
- A special case for a swipe from the very edge (decision 10).
- A device working anything out from the tree (decision 13).
- Hidden screens, popups and masters in the graph or on the map
  (decision 8).

## Open

- The decisions still marked (proposed): the lines between docked
  screens (2), the main row (7), the pull tab's look (9), existing
  projects as one row (11), docking by dragging (12), the map's pause
  and look (15). Each is settled in the plan of its module at the
  latest.
- How far a touch must move on the knob before the swipe hints show.
- How long the pause is that opens the map (proposed: 0.4 s), tried on
  the knob in a hand.
