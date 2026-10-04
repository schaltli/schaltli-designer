# Implementation plan: the rotary ring adjusts a slider or dial (`ring-adjust`)

Idea: `docs/2026-10-04-ring-adjust.md` (agreed 2026-10-04). Tasks:
`tasks/ring-adjust-todo.md`. Chat German, docs English.

## Overview

A hardware button gets a new action, «Adjust a slider or dial»: each press -
on the Knob each detent of the ring - moves a slider or dial on the screen
one `step` and writes the absolute value to its `writeTopic`, through the
same asked/await path a finger uses. The target may be a switcher; then the
slider or dial in its visible panel is the one moved.

## Architecture decisions

- **Contract shape:** `{ "type": "adjust-level", "targetObjectId": "<id>",
  "direction": "up" | "down" }` in a screen's `buttonActions`. Direction is
  explicit, not derived from the button: the firmware keys actions by button
  id and does not know which one is «left». The designer presets it from the
  button's name («Rotate Left» → down, «Rotate Right» → up) and the user can
  change it. Additive minor under the version model: firmware that does not
  know the type already ignores it silently (Knob, 4.3B, Android, e-paper
  all checked 2026-10-04).
- **Target:** a `slider`, `dial` or `switcher` on the same screen, or on its
  master (a master's action may only target the master's own objects, which
  every screen using it shows). A switcher's target is the first slider or
  dial in its visible panel, in object order; a panel without one, or a
  switcher showing no panel, means the detent does nothing.
- **One step:** the object's `step` (default 1). Range: the smallest and
  largest calibration point value (default 0-100), clamped; at either end,
  nothing is written. No wrapping.
- **The value a step starts from:** the asked value while one is held for the
  object's marker topic, else the reported one; no value yet counts as the
  range's minimum.
- **A detent is a finger without a drag:** it sets the asked value, redraws,
  publishes at once (no throttle - one write per detent), and arms
  `levelAwaitValue`/`levelAwaitUntilMs` (2500 ms) so a late report does not
  pull the handle back. While a finger holds any level (`levelDragObjId` set),
  a detent is ignored: the finger wins.
- **A dangling target** (object deleted, or not a slider/dial/switcher any
  more): the side panel says so; the export drops the action, as it drops
  «none».
- **Where:** designer (model, side panel, export, preview simulation) and the
  Knob firmware (`schaltli-firmware/src/main.cpp`). The 4.3B has no hardware
  buttons, Android and e-paper ignore the type - no work there.
- **Not for software buttons** in this plan: the dropdown there stays as is.

## Task list

### Phase 1: Designer

- [ ] Task 1: Set the action, export it (model, side panel, export, contract)
- [ ] Task 2: The preview turns the ring (simulation)

### Checkpoint: Designer
- [ ] e2e specs pass, `npm run build` clean
- [ ] The user sets the action on a Knob project and turns it in the preview

### Phase 2: Knob

- [ ] Task 3: A detent moves a slider or dial (firmware + HIL)
- [ ] Task 4: A detent moves the visible panel's slider (firmware + HIL)

### Checkpoint: Knob
- [ ] `hil/waveshare` passes on the Knob (COM4, .114)
- [ ] The user spins the real ring fast; no lost or doubled steps

### Phase 3: Handbook

- [ ] Task 5: Handbook page of the Knob

### Checkpoint: Complete
- [ ] `npm run test:all` green (or hardware suites skipped with their warning)
- [ ] Every acceptance criterion in the todo checked

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| One write per detent floods the broker or the receiver when spinning fast | Med | HIL scenario with a delayed echo in Task 3; the user spins the real ring at the Knob checkpoint; a write-after-pause fallback is a one-place change in the detent handler |
| `POST /api/input` skips `pollEncoder`, so HIL never sees several detents in one poll or the wake-on-first-detent rule | Med | HIL sends detents in quick succession; the real-ring check at the checkpoint covers `pollEncoder` |
| The switcher's visible panel lives in a private renderer function (`getActivePanel`) | Low | Task 4 adds one public helper «settable level shown by this switcher» |
| Await state is shared with the finger path (`levelAskedTopic`, one at a time) | Low | Finger wins; a detent on another object replaces the pending await, as a new drag does today |

## Open questions

- None blocking. To confirm at the designer checkpoint: does the preset
  direction from the button's name feel right, or should the direction field
  be hidden on the Knob?
