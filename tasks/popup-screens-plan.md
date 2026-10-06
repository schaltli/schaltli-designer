# Implementation plan: popup screens (`popup-screens`)

Spec: `docs/2026-10-06-popup-screens.md` (agreed 2026-10-06). Tasks:
`tasks/popup-screens-todo.md`. Chat German, docs English.

## Overview

A screen can be a popup: designed at the display's size inside a fence
(80 % of the area, rectangle or circle), out of navigation, opened by «Open
Popup» and closed by «Close Popup», a tap outside the fence or a swipe. The
designer gets the type, the fence, the actions and a preview; the export
writes popups beside the screens; the three boards and the Android app open
and close them, each drawing the frame its own way.

## Architecture decisions

- **`screenType?: "popup"` beside `isMaster`**, absent = main screen. No
  migration; masters stay as they are (agreed 2026-10-06). A popup has a
  master for its theme only, «Show master» always off.
- **Popups in `popups[]`, not `screens[]`.** An older reader skips the
  unknown key and keeps paging right - that makes it a minor, with
  `POPUP_GENERATION` for the deploy warning.
- **One `popupFence` per project**, display pixels, with resolved
  `borderColor`/`scrimColor` and `Dark` twins. Pure `lib/popup.ts` computes
  it; the canvas, the preview and the export all use that one function.
- **Absolute coordinates.** A popup's objects are where they are on the
  display; no device needs an offset or a scale. The boards gain one
  renderer entry, `renderPopup`, that skips `fillScreen` and clips the
  background to the fence.
- **Open/closed is device state**, one deep. While open, actions and hit
  tests use the popup; swipes close, except one a settable level owns.
- **The boards draw the frame themselves:** halved RGB565 outside the fence
  on the 4.3B and the Knob, a growing rectangle as the only animation;
  border, shadow and a region push on the PaperS3. Android scrims and zooms.

## Task list

### Phase 1: Designer (`popup-designer`)

- [x] Task 1: A screen can be a popup (type, panel, badge)
- [x] Task 2: A popup is out of navigation and goto pickers
- [x] Task 3: The fence on the canvas; no swipe section on a popup
- [x] Task 4: «Open Popup» and «Close Popup» in the action pickers
- [x] Task 5: The preview opens and closes a popup
- [x] Task 6: Handbook

### Checkpoint: Designer
- [ ] `e2e/popup-screens.spec.ts` and the master/swipe/button specs pass, `npm run build` clean
- [ ] The user makes a popup on a 4.3B and a Knob project and opens it in the preview

### Phase 2: Export (`popup-export`)

- [x] Task 7: `popups[]`, `popupFence` and the actions in the board export
- [x] Task 8: The Android export and its baked popup PNG
- [x] Task 9: `POPUP_GENERATION` and the deploy warning
- [x] Task 10: The device contract

### Checkpoint: Export
- [ ] A project without popups exports byte-identical to before (both exports)
- [ ] An older device given a project with popups pages as before (Knob, current firmware)

### Phase 3: Boards (`popup-firmware`, in `schaltli-firmware`)

- [x] Task 11: Loader and renderer: popups, fence, the two actions, `renderPopup`
- [x] Task 12: The 4.3B opens and closes a popup (+ HIL)
- [x] Task 13: The Knob (+ HIL)
- [x] Task 14: The PaperS3 (+ HIL)

### Checkpoint: Boards
- [ ] All three envs build; the HIL suites of the three boards pass
- [ ] The user opens, uses and closes the popup on each board

### Phase 4: Android (`popup-android`, in `schaltli-android`)

- [x] Task 15: Open, draw and close a popup
- [x] Task 16: Swipes: a consumed gesture is the control's, any other closes (+ HIL)

### Checkpoint: Complete
- [ ] `npm run test:all` passes
- [ ] Success criteria of the spec ticked; the user has tried it on every device

Phases 3 and 4 do not depend on each other and may run side by side.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The 4.3B's growing frame stutters (about 15 fps for two canvases today) | Low | It is guidance, not contract: drop to opening at once if it looks worse than none (judged on the board, Task 12) |
| A swipe on the popup's slider closes it on Android (consumption never checked) | High | Task 16 fixes the check for screens too; a HIL drag on the popup's slider |
| The Knob's screen menu and a popup fight over swipe-up | Med | The menu stands down while a popup is open (Task 13), HIL checks swipe-up closes |
| PaperS3 ghosting after a closed popup | Med | Close is a full repaint (`forceFullNext`), HIL ghost check as `hold-countdown.js` |
| Popups leak into code that loops over `screens` (asset export, HIL fixtures, thumbnails) | Med | One `isPopup()` in `lib/popup.ts`; Task 2 greps every `isMaster` site and decides each |

## Open questions

- What the canvas shows behind a popup while editing it: the spec says
  nothing but the veil. Revisit after Task 3 if it reads badly.
