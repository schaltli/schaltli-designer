# Implementation plan: the navigator on the devices (`navigator-devices`)

Spec: `docs/2026-10-08-navigator.md`; device contract §2.7. Designer part
done (`tasks/navigator-plan.md`). Issue #54. Tasks:
`tasks/navigator-devices-todo.md`. Chat German, docs English.

Scope: the spec's modules `navigator-4v3b`, `navigator-papers3`,
`navigator-android`, then the handbook warnings (`handbuch-macke #54`) go.
Not the Knob (round; keeps its screen menu, `ScreenNavigatorOverlay`).

## Overview

Each device reads `navigators[]`, a screen's `navigatorId` and `hidden`;
draws the strip over the screen with each entry's `normal` or `active`
objects; a tap on an entry opens its screen; a swipe that starts on the
strip scrolls it and never pages; paging and the start screen skip hidden
screens. On the 4.3B and in the app the strip stands still while the screen
slides beneath it; the PaperS3 scrolls a page of entries at a time.

## Architecture decisions

- **One geometry, three ports.** `src/project/NavigatorLayout.{h,cpp}` and
  `data/NavigatorLayout.kt` port `lib/navigator.ts`, each running a
  byte-for-byte copy of `lib/navigator/vectors.json` with the copy check,
  as live values do.
- **Firmware draws entries with what it has.** An entry's objects are
  parsed by `parseScreenObject` and drawn by `renderObject`, offset to the
  entry like a switcher's panel children, inside `setRegion(strip)` with
  the strip's ground as the background colour. One public
  `ColorScreenRenderer::renderNavigator(index, scroll)`; named
  `NavigatorStrip` where a name could meet the Knob's
  `ScreenNavigatorOverlay`.
- **Hidden screens in one place per device.** A shared
  `pagedScreen(project, current, delta)` / `firstShownScreen(project)` in
  `src/project/` (native-tested), used by swipe paging, next/previous and
  boot; Android's `ButtonActionDispatcher.navigationTarget` and
  `MainActivity`'s start screen.
- **4.3B swipe:** both canvases carry the strip; `FollowSwipe::compose`
  moves only the span beside it (columns for left/right, rows for
  top/bottom) and copies the strip unchanged; after the swipe commits the
  strip is redrawn as a region for the highlight.
- **Touch ownership:** a touch-down on the strip belongs to the navigator,
  as a settable level's does: drag along scrolls (region redraw), a still
  release is a tap → `goto-screen`. Under an open popup the existing
  «outside the fence closes» branch already covers it.
- **Android draws fixed icons and boxes in entries.** `NavigatorStripView`
  lays out entries in a clipped strip outside `FollowingScreens`' sliding
  boxes; an entry's fixed icon goes through `IconPathView` with its path,
  its box through a small box view; the strip consumes its touch-down.
- **Generation 1.5 per device when its task is done**, the DDF already
  declares the type (34d48a9); Android's `DdfBuilder` adds it.

## Task list

### Phase 1: firmware, shared
- Task 1: NavigatorLayout port with the vectors (native)
- Task 2: Loader, paging helpers, `renderNavigator`

### Phase 2: 4.3B
- Task 3: Drawn, tapped, hidden skipped, start screen; generation 1.5
- Task 4: Fixed while swiping; scrolling; live entries redrawn
- Task 5: HIL `hil/navigator.js` on the 4.3B

### Checkpoint: 4.3B
- native tests, all envs build, 4.3B HIL green; the user taps through it on the board

### Phase 3: PaperS3, Android
- Task 6: PaperS3: drawn, tap, page scroll on release, hidden, start; 1.5; HIL `--e-ink`
- Task 7: Android: models, layout port, strip view, tap, scroll, hidden, start; DDF; 1.5
- Task 8: Android HIL: the fixture's master gets a navigator

### Checkpoint: complete
- `npm run test:all`; handbook warnings `handbuch-macke #54` removed; spec status; #54 closed with the user's OK

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| FollowSwipe composes at frame rate; a strip span per row costs time | Med | Same memcpy per row, shorter; measured by the existing bandwidth HIL |
| A value region overlapping the strip paints screen objects over it | High | `renderRegion` redraws the strip clipped to the region last, tested in the HIL |
| Designer reference for a screen with a master's navigator (test-render does not merge masters) | Med | The HIL builds the reference from the exported screen plus the navigator object, as the designer draws it |
| Android touch consumption order between strip and FollowingScreens | Med | The strip sits inside the pointerInput box and consumes on down, as LevelDrag does; unit + HIL |
| PaperS3 has no region refresh | Low | Full refresh on scroll/state change, as on every PaperS3 change today |

## Open questions

- None blocking. A live entry on the PaperS3 refreshes the whole panel,
  as any value there does today (spec open question, settled this way).
