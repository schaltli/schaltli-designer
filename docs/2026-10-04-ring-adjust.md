# The rotary ring adjusts a slider or dial

Agreed with the user on 2026-10-04 (idea session «raster-slider»). Its
sibling is docs/2026-10-04-bridge-blocks.md, which motivates the switcher
case below.

## Problem

How might the Knob's rotary ring set a slider or dial on the screen,
without the receiver having to understand «increment» and «decrement»?

The ring today is two buttons per screen, «Rotate Left» and «Rotate
Right», each sending one fixed MQTT message (`handbuch/geraete/knob.md`).
A relative «one step up» needs a receiver that can count; Home
Assistant's `fan_mode` or a bridge's absolute speed want the value. The
device contract already names the gap (`docs/device-contract.md`, the M5
Dial note on encoders and the `ButtonAction` model).

## Direction

**A new ring action, «Adjust a slider or dial».** It is set where ring
actions are set today: click «Rotate Left» or «Rotate Right» on the
device in the designer, choose under «Does», then pick its target on this
screen. Left is one step lower, right one higher; the absolute value is
written to the slider's `writeTopic`. One step is `step`, so the ring
sets a stepless dimmer as well as a fan in tens.

**The target is a slider, a dial, or a switcher.** A switcher shows one
panel by a topic's value - the MaxxFan shows its temperature slider in
auto mode and its speed slider by hand. Bound to the switcher, the ring
adjusts the slider or dial in the panel showing now; with none showing
(the fan off), it does nothing. The binding stays fixed per screen and in
one place, and what the ring sets is always what the screen shows. It
never follows the object last touched: nobody could tell what the ring
does.

**A detent is a finger.** Each detent goes through the same path as a
finger setting the slider: the asked value is drawn at once, reports are
held back until one matches or `LEVEL_AWAIT_MS` (2500) passes, and the
next step counts from the asked value, not the reported one - otherwise
fast turning steps from a stale value and loses detents. One write per
detent, to be tried on hardware. At either end, nothing happens: the
encoder has no haptics, and the screen adds no bounce. No wrapping.

## What the code says (checked 2026-10-04)

- Firmware (`schaltli-firmware`): `shownLevelValue` draws `askedValue_`;
  reports are stored but not drawn while a finger is down and, after the
  lift, until a matching one arrives or 2.5 s pass
  (`src/boards/waveshare4v3b/main.cpp` ~1188, `src/main.cpp` ~2432).
  Drag publishes are throttled to 100 ms (`LEVEL_PUBLISH_MIN_MS`).
- The ring today: `pollEncoder()` in `src/main.cpp` maps each detent to
  `button-0`/`button-1` and dispatches it at once; a `send-mqtt` action
  publishes its fixed message with no asked value, no await and no
  throttle. The first detent on a dark screen only wakes it.
- `settableLevelValueAt` snaps with `roundf(value / step) * step`; the
  ring needs the same snap from a value, not from a touch position.

## Assumptions to check

- [ ] One write per detent holds up when turning fast (HIL: spin the
      ring, broker reports back with a delay; no lost or doubled steps).
- [ ] A switcher's visible panel is known at the moment of a detent
      (the firmware draws it; the action needs the same answer).
- [ ] A detent arriving while a finger holds the same slider is either
      ignored or wins cleanly - decide, then test.

## MVP

- Contract: the action `adjust-level` (name to settle) with the target
  object's id; a target may be `slider`, `dial` or `switcher`.
- Designer: «Adjust a slider or dial» under «Does», with a picker of this
  screen's sliders, dials and switchers; a master screen's binding holds
  for every screen using it, as ring actions do today.
- Knob firmware: the action, through the asked/await path.
- e2e spec for the designer side, HIL fixture addition for the Knob,
  handbook `geraete/knob.md`.

## Not doing

- The ring following the last-touched object - invisible.
- Wrapping at the end, feedback at the end stop.
- A separate step size for the ring - it uses the slider's `step`.
- Setting both ring buttons at once - each is set on its own, as today.

## Later: step mode for calibration points

Not part of this; recorded so the findings are not lost. Calibration
points get a mode «Only these values»: the points are the only valid
values, in list order, each at its `barSizePercent`, a point may carry a
text `value` and a `label`. It is for hand-built steps (cold → lukewarm →
warm → hot) and for a Home Assistant choice the user turns into a slider
by hand - the catalog keeps Buttons for a choice, since Home Assistant
does not say whether its options are a scale.

Checked in the code on 2026-10-04 - moderately invasive, centralized
enough, no reason to prefer a `states[]` list:

- Values arrive and are stored as strings on both targets; the number is
  parsed only where drawn.
- Firmware: `struct CalibrationPoint { float value; … }`,
  `parseCalibrationPoints` (a text value becomes 0); two helpers in
  `ColorScreenRenderer.cpp` (`interpolateCalibration`,
  `calibrationValueForPercent`, both sort by value); about 8 call sites
  doing `toFloat()`; `settableLevelValueAt` returns a float;
  `formatLevelPayload` and the float echo comparison, duplicated in both
  boards' `main.cpp`.
- Android: four functions in `ui/objects/LevelIndicatorView.kt` (a text
  value is dropped on parse), about 6 call sites there and in
  `ArcLevelView.kt`; the echo match `sameLevel` already falls back to an
  exact string comparison.
- Shape of the change on both: in step mode, map each point to its list
  index and work in index ↔ percent; one branch per call site.
- E-paper (`schaltli-eink`) not yet read.
- The designer sorts points by value (`components/canvas/canvas.tsx`,
  `lib/settable-level.ts`).
