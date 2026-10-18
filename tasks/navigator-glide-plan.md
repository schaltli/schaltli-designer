# Plan: the navigator's marker glides with a swipe (#59)

User, 2026-10-18: «mach #59, auch im designer» - the preview swipes now
(screen graph), so it glides there too. Decided 2026-10-09 in the issue: the
whole accent area moves, follows the finger proportionally, glides back on a
cancelled swipe, settles with a small overshoot.

## How it is drawn, everywhere the same

At the start of a swipe that glides, the strip is drawn twice:

- **normal**: every entry in its normal look (none active);
- **accent**: the entries' part filled with the marker's colour, every entry
  in its active look on it.

A frame is the normal strip, and inside the marker - the box an entry's
`active` objects begin with, moved along the strip - the accent strip, cut
row by row to the box's rounded corners (`cornerInset`). On the 4.3B that is
memory copies only: no strip is drawn per frame. When the marker comes to
rest the true strip is shown, as before.

## The shared core (lib/navigator.ts, lib/navigator/vectors.json)

- `markerGlides(from, to, scrollFrom, scrollTo)`: both entries listed,
  different, the strip at the same scroll on both screens. Otherwise the
  marker jumps at the end, as before (a screen off the main row, a target
  scrolled out of sight).
- `markerOffset(layout, from, to, travel, span)`: px along the strip,
  proportional to the swipe, whole pixels.
- `markerSettle(start, end, elapsedMs)`: after the finger lifts, from where
  it was to the target (or back), an ease-out-back over MARKER_SETTLE_MS
  (320 ms), up to a tenth past the end. Integer arithmetic.
- `markerRect(layout, from, offset, scroll, box)`, `cornerInset(radius,
  width, height, row)`.

Device contract §2.7: the marker is the `box` an entry's `active` objects
hold; a device may glide it. Nothing new in the export.

## Pieces

1. Designer core + vectors + e2e (navigator-core.spec).
2. Designer: `renderNavigator` draws a marker; the preview glides it with a
   swipe and settles it; test-render takes `navigatorMarker` for the HIL
   reference; e2e on the preview.
3. 4.3B: ColorScreenRenderer draws the two strip variants; FollowSwipe
   composes the marker per frame and settles it after release; a third
   canvas for the accent strip; `/api/navigator-marker` shows a frame at a
   given offset for the HIL; native tests on the core.
4. HIL `hil/navigator.js`: a marker frame pixel for pixel against the
   designer, mid-swipe the marker has moved, the frame rate with and without.
5. Android: core port + vectors test; FollowingScreens reports the swipe;
   NavigatorStripView draws the marker; settle animation; HIL end state,
   a screenshot mid-swipe.
6. Spec (decision 14), contract §2.7, handbook `objekte/anordnen.md`.

PaperS3 and the knob: unchanged (PaperS3 jumps, the knob has no navigator).
