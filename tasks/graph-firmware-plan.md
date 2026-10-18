# Plan: graph-firmware

Spec: `docs/2026-10-17-screen-graph.md`; contract `docs/device-contract.md`
§2.10. Module `graph-firmware`: the 4.3B, the PaperS3 and the knob read the
screen graph from the export, page the main row, go to neighbours, follow
the finger up and down, draw the pull tab and the navigator's «←», and
declare `screen-graph`. The knob's screen menu goes, and with it «Show
Screen Menu» in the designer (`tasks/graph-contract-plan.md`, decision 2).
Work in `../schaltli-firmware` and here.

Survey (2026-10-18): the knob pages with a plain modulo (hidden screens
not skipped) and starts on the idle screen or 0; it already follows the
finger vertically. The 4.3B follows only sideways (`FollowSwipe.h`,
`pagingTargetFor`), the PaperS3 not at all. Overlays over the screen are
drawn after `renderNavigatorOver` in `ColorScreenRenderer`.

## Decisions taken here (to approve)

1. **One pure module, shared vectors.** `src/project/ScreenGraph.{h,cpp}`
   in the firmware, native-tested, does what every board needs from the
   export alone: next and previous over `mainRow` (from a docked screen,
   its page's place), which edges have a pull tab (the rule of §2.10,
   from `neighbours`, the swipes' actions and whether both screens are in
   the main row), the tab's line in the content area, and the nudge at a
   time. `lib/screen-graph/vectors.json` in the designer holds the cases;
   the designer's TypeScript runs them and the firmware test compares its
   copy byte for byte, as for the navigator.
2. **The pull tab is drawn into the screen's canvas**, after the
   navigator's strip is left out of it: it slides with the content, as
   the contract says, and every redraw path that draws the screen draws
   it (`renderScreen`, `renderScreenRegion`). The nudge redraws only the
   tabs' rectangles.
3. **The designer's reference draws the tabs too.** `lib/render-screen.ts`
   (what the HIL compares against, 0 px) draws them where the export
   would put them, at rest. Every board holds the nudge still while the
   test interface is on, so a picture never catches a tab half way.
   Every HIL picture of a screen in a row changes by the tabs, on both
   sides alike.
4. **Next and previous walk `mainRow` on every board**, the knob too: it
   now skips hidden and docked screens. Start: the knob keeps its idle
   screen, else `mainRow[0]`; the others `mainRow[0]`.
5. **Following the finger is decided by the tab rule** (§2.10): a swipe
   that reaches a neighbour follows, on its axis; others run their action
   at release. The 4.3B's `FollowSwipe` learns the vertical axis, clipped
   to the content area as sideways is now.
6. **The navigator's «←»** is drawn by `ColorScreenRenderer` on a screen
   with `back`: one entry, the arrow of `schaltli-back-<edge>` as a
   polyline 2.5 px wide in the entry's text colour, no name; a tap on it
   shows `neighbours[back]`. The knob has no navigator.
7. **The knob's screen menu goes** (`ScreenNavigatorOverlay` and its
   hooks); its DDF drops `showScreenMenu`. The designer removes «Show
   Screen Menu» from a project when it opens it and says so once
   (decision 6 of the spec), and no longer offers it. The PaperS3 and the
   4.3B never had it. The app follows in `graph-android`.
8. **Order:** the pure module and the designer's half first, then the
   4.3B (navigator, sideways follow already there), the PaperS3 (no
   motion), the knob (menu, vertical follow already there). Each board
   gets `screen-graph` in its DDF only when it does all of §2.10.
   Building and flashing the test boards over USB is mine; a release and
   the van stay the user's.

## Tasks

- **F1 The pure module and its vectors.** Designer:
  `lib/screen-graph/vectors.json`, the exported-shape functions
  (`exportedPullTabSides`, paging over `mainRow`) beside the designer's
  own, an e2e that runs the vectors and checks the designer's own rule
  agrees on real projects. Firmware: `ScreenGraph.{h,cpp}`,
  `test/test_screen_graph`, `[env:native]`.
- **F2 Loading and drawing, shared.** `ProjectLoader`: `mainRow`,
  `neighbours`, `back`, `side` on a `ButtonAction`. `ColorScreenRenderer`:
  the tabs and the «←». `render-screen.ts` draws the tabs; the HIL
  conformance and redraw fixtures take them in.
- **F3 4.3B.** Paging over `mainRow`, `goto-neighbour`, vertical follow,
  the nudge, the «←» tap, start; DDF `screen-graph`, generation 1.9;
  HIL `hil/screen-graph.js` (swipes by `/api/touch`, the screen shown,
  tabs in the picture, the strip still while sliding).
- **F4 PaperS3.** The same without motion and nudge; DDF, HIL.
- **F5 Knob.** Paging over `mainRow`, `goto-neighbour`, following by the
  tab rule, tabs and nudge, the menu gone; DDF without `showScreenMenu`,
  with `screen-graph`; HIL. Designer: «Show Screen Menu» removed with its
  notice, `lib/device-actions.ts`, fixtures in e2e and HIL.
- **F6 Handbook.** `geraete/knob.md` (no menu; the map comes with
  `graph-knob-map`), `designer/tasten.md` (the menu gone), the warning in
  `designer/screens.md` (which devices can), `objekte/anordnen.md` (the
  knob without a menu).
- **Checkpoint:** `npm run test:quick` green; `pio test -e native` green;
  each board's HIL green.
