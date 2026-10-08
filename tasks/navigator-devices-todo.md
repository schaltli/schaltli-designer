# Todo: the navigator on the devices

Plan: `tasks/navigator-devices-plan.md`. Spec: `docs/2026-10-08-navigator.md`, contract §2.7.

## Task 1: NavigatorLayout in the firmware

**Description:** `src/project/NavigatorLayout.{h,cpp}`, a port of
`lib/navigator.ts` (screens listed, strip, layout, entry rect, scroll to
show, entry at, page scroll). `test/test_navigator/` runs a byte-for-byte
copy of `lib/navigator/vectors.json` with the copy check.

**Acceptance criteria:**
- [x] Every vector passes; a changed copy fails the check.

Done 2026-10-08 (schaltli-firmware, «NavigatorLayout»). `fw-native` in
test:all runs it with the others.

**Verification:** `pio test -e native` · **Dependencies:** None · **Scope:** S

## Task 2: Loader, paging, renderNavigator

**Description:** `ProjectConfig::navigators`, `Screen::navigatorId/hidden`
parsed (entries through `parseScreenObject`); `pagedScreen` /
`firstShownScreen` (native-tested); `ColorScreenRenderer::renderNavigator
(screenIndex, scroll)` draws the strip of the screen's navigator, entries
clipped, the screen's entry active.

**Acceptance criteria:**
- [x] A project without navigators loads and draws as before.
- [x] Paging skips hidden screens, wraps, and a goto still reaches one (native).

Done 2026-10-08 (schaltli-firmware 8559388). renderScreen and
renderScreenRegion draw the navigator themselves, last, cut to the region -
so every board path, FollowSwipe's spare canvas included, gets it.

**Verification:** `pio test -e native`; all envs build · **Dependencies:** Task 1 · **Scope:** M

## Task 3: 4.3B: drawn, tapped, hidden, start

**Description:** `renderAndPresent` and `renderRegion` draw the strip over
the screen (before the popup dim); a tap on an entry opens its screen;
next/previous and swipe paging skip hidden screens; boot starts on the
first shown screen. `SYSTEM_GENERATION_MINOR` 5 on the 4.3B.

**Acceptance criteria:**
- [x] The strip matches the designer's at 0 px; a tap on an entry opens it; a value region under the strip leaves it intact.

Done 2026-10-08 (schaltli-firmware 1a76d13).

**Verification:** build; HIL (Task 5) · **Dependencies:** Task 2 · **Scope:** M

## Task 4: 4.3B: fixed while swiping, scrolling, live entries

**Description:** `FollowSwipe::compose` moves only the span beside the
strip; the highlight moves after the commit. A touch-down on the strip owns
the gesture: drag scrolls (region redraw), release still = tap. A live
screen icon in an entry redraws its entry as a region.

**Acceptance criteria:**
- [x] During a swipe the strip's pixels do not change; a swipe on the strip scrolls and never pages; a live entry follows its topic as regions.

Done 2026-10-08 (schaltli-firmware, «the navigator stands still while
swiping»). The test needed two things of the board: /panel.bmp (the glass,
RgbPanel::front) and the swipe loop serving the web client - an injected
swipe had followed its first step only, since no request was served until
it gave up.

**Verification:** build; HIL (Task 5) · **Dependencies:** Task 3 · **Scope:** M

## Task 5: HIL on the 4.3B

**Description:** `hil/navigator.js --device`: installs a master with a
navigator (12 screens, one hidden, a live screen icon), compares each state
to the designer at 0 px, taps, swipes beside and on the strip, checks the
strip during a swipe, the hidden screen skipped, the start screen; in
`test:all`.

**Acceptance criteria:**
- [x] Green on the 4.3B.

Done 2026-10-08: 11 checks, every picture 0 px; in test:all. The project
needs its swipes among `hardwareButtons`, or the export writes no swipe
action. popup, live-value-redraw and placeholder-redraw still green on the
new firmware.

**Verification:** `node hil/navigator.js --device 192.168.1.117` · **Dependencies:** Task 4 · **Scope:** M

## Checkpoint: 4.3B
- [ ] `pio test -e native`, all envs build, 4.3B HIL green
- [ ] The user taps through the navigator on the board

## Task 6: PaperS3

**Description:** Drawn as on the 4.3B (full refresh); a still tap on an
entry opens it; a swipe starting on the strip scrolls a page of entries on
release; hidden/start as Task 3. Generation 1.5. The HIL runs with
`--e-ink`.

**Acceptance criteria:**
- [x] `hil/navigator.js --device 192.168.1.118 --e-ink` green.

Done 2026-10-08: 10 checks on the PaperS3, 0 px (e-ink is found from the
DDF; the glass checks are the 4.3B's). The HIL now works out what each
step must show from the navigator's rules rather than fixed numbers, so
the same walk runs on both boards. Found on the way: a redraw of the same
screen undid a scroll (both boards now follow screen changes only), and
the entry icons were baked on a ground already reduced to the panel's
greys - the designer mixes into the true colour first (lib/asset-export.ts).
In test:all for both boards.

**Dependencies:** Task 5 · **Scope:** M

## Task 7: Android

**Description:** `Project.navigators`, `Screen.navigatorId/hidden`;
`NavigatorLayout.kt` with the vectors; `NavigatorStripView` outside the
sliding screens, entries' fixed icons and boxes drawn; tap → navigate;
drag scrolls (consumes the down); paging and start skip hidden;
`DdfBuilder` declares `navigator`; `SYSTEM_GENERATION` 1.5.

**Acceptance criteria:**
- [ ] Vectors pass; unit tests for paging and start; the app builds.

**Verification:** `gradle testDebugUnitTest assembleDebug` · **Dependencies:** Task 2 · **Scope:** L

## Task 8: Android HIL

**Description:** The Android fixture's master gets a navigator; the
orchestrator compares screens with it and taps an entry.

**Acceptance criteria:**
- [ ] Orchestrator green on the phone.

**Dependencies:** Task 7 · **Scope:** S

## Checkpoint: complete
- [ ] `npm run test:all`
- [ ] Handbook warnings (`handbuch-macke #54`) removed
- [ ] Spec status updated; #54 closed with the user's OK
