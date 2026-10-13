# Plan: energy-nested

Spec: `docs/2026-10-13-local-topics.md` (decision 8). Module
`energy-nested`: on the 4.3B and the knob an energy diagram moves also
in a switcher's active panel and in an open popup. Today
`ColorScreenRenderer::energyAnimations` (schaltli-firmware,
`src/project/ColorScreenRendererEnergy.cpp`) walks only
`screen.objects`, so such a diagram is drawn still. The PaperS3 draws
still anyway; Android already animates nested diagrams. Independent of
the local topics.

## Decisions taken here (to approve)

1. **What moves is what is shown:** the screen's objects, inside a
   switcher only its active panel (the same choice the renderer draws),
   and with a popup open the popup's objects at the popup's origin - the
   screen underneath is dimmed and stands still.
2. **The animations are worked out again when that changes:** a
   switcher's panel changes by a value, a popup opens or closes - as
   today on a screen change.
3. A firmware release is not part of the module; it goes with the next
   one.

## Tasks

- **N1 A diagram in a switcher's panel moves.** `energyAnimations` walks
  the active panel's children; the knob's and the 4.3B's loops recompute
  when a switcher shows another panel. Test: HIL fixture with a switcher
  holding a diagram per panel - the motion status names one diagram, and
  after the switcher topic changes the other; `hil/waveshare/energy-diagram.js`
  and `hil/waveshare4v3b/energy-diagram.js`.
- **N2 A diagram in a popup moves.** With a popup open the animations are
  the popup's, offset by its origin; closing it gives the screen's back.
  Test: HIL - tap opens the popup, status names its diagram and dots lie
  inside the popup's window.
- **N3 Handbook.** `handbuch/objekte/anzeigen.md`: a diagram moves in a
  switcher and a popup too (from the next firmware), through
  maettel-humanizer.
- **Checkpoint:** native tests, the knob and 4.3B HIL green (both flashed
  by USB first; the 4.3B needs the user's OK to flash).
