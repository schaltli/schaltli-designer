# Plan: graph-android

Spec: `docs/2026-10-17-screen-graph.md`; contract `docs/device-contract.md`
§2.10. Module `graph-android`: the app does what the boards do since
`graph-firmware` (`tasks/graph-firmware-plan.md`, whose decisions hold here
too) - reads the screen graph from the export, pages the main row, goes to
neighbours, follows the finger up and down beside a navigator that stands
still, draws the pull tab and the navigator's way back, declares
`screen-graph`; its screen menu goes. Work in `../schaltli-android`.

Survey (2026-10-18, app 0.13.0): Compose, one project unit a dp;
`FollowingScreens` (`ui/SwipeNavigation.kt`) follows sideways only, and the
navigator stands still as an overlay over both sliding screens, which are
not clipped; next and previous walk `project.screens` with
`NavigatorLayout.pagedIndex`; `ScreenMenuOverlay` with its device action.

## Tasks

- **A1 The pure part.** `data/ScreenGraph.kt`: `rowStep`, `tabSides`,
  `contentArea`, `tabRect`, `nudgeAt`, as the firmware's ScreenGraph; an
  export from before the screen graph gets the row's left and right
  neighbours. Test: `data/ScreenGraphTest.kt` on a byte-for-byte copy of
  `lib/screen-graph/vectors.json`.
- **A2 The model and the actions.** `mainRow`, a screen's `neighbours`,
  `back`, `pullTabColor` (dark through the existing XDark swap), a
  navigator's `back`, an action's `side`. `navigationTarget`: next and
  previous over the main row, `goto-neighbour`; the start on the row's
  first.
- **A3 Drawing.** The pull tabs in `ScreenRenderer`, after the objects, as
  boxes through `BoxView`, so they slide with the screen; the nudge every 5 s
  (still while the test interface runs). The navigator's way back: one entry
  as long as the strip, `back[arrow]`, a tap shows `neighbours[back]`.
- **A4 Following the finger.** By the tab rule, up and down too, only the
  content area beside the navigator sliding (the two screens clipped to it).
- **A5 The screen menu gone.** `ScreenMenuOverlay` and its hooks; the DDF
  without `deviceActions`, with `screen-graph`; generation 1.9.
- **A6 HIL.** `hil/android/orchestrator.js`: the screen graph's walk on the
  phone - up to the history and back, the way back, next from it, the own
  swipe that cuts off - pictures against the reference with `pullTabs`.
- **Checkpoint:** `gradle testDebugUnitTest` green, `npm run test:quick`
  green, the Android HIL green on the phone. The version and the release
  stay the user's.
