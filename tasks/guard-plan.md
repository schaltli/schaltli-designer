# Plan: Guard

From docs/2026-11-15-guard.md (approved 2026-11-15; the user asked for it to
be built on 2026-11-15, ahead of the starter film). Branch `guard` in the
designer (from `starter-project`), in firmware and android (from `led-look`).

## Approach

**One module says what is drawn, everyone draws it.** `lib/guard.ts` holds
the times and thresholds, the fixed yellows, the geometry (cover outline,
corner lock, knob lock, group badge, cover marks) and the gesture as pure
functions (`guardDown/Move/Up/Tick/Changed`). The lock and the double arrow
are integer run shapes - the lock built from `roundRectSpans`, which every
device already has for `clip` - so the lock at rest is pixel-exact against
the reference render; `lib/fixtures/guard-spans.json` pins them for the
devices' unit tests.

**What a device gets** (`properties.guard: true`, plus a top-level `guard`
the designer computes, absolute coordinates like the object's):

```jsonc
"guard": {
  "cover": { "x", "y", "width", "height", "radius" },
  "travel": 23,                          // px to lock in (45 %, min 20 px at the 4"'s density)
  "lock": { "x", "y", "size" },          // button, toggle-button: drawn in the face's ink
  "badge": { "cx", "cy", "r", "fill", "ink", "fillDark", "inkDark",
             "lock": { "x", "y", "size" } }   // button-group
  // switch: none - the lock sits on the knob, size max(8, trunc(4r/5)),
  // centred, in the knob's on-colour; the knob's state icon is not drawn.
}
```

Decisions taken while building (spec leaves them open):
- A guarded Switch draws the lock where the knob's icon would go; the
  state still shows by the knob's place, size and label.
- The group's badge is the group's colour with its on-colour lock, inside
  the corner (a badge sticking out would be cut by partial redraws).
- The cover's lock and arrows are drawn by each device from the same runs
  (no picture exported).

## Tasks

- T1 designer: lib/guard.ts, fixture, property «Guard», canvas lock (designer
  canvas and render-screen), Convert to keeps it, export (`guard`), deploy
  feature gating, e2e.
- T2 designer preview: the gesture on the canvas (mouse = one finger), the
  cover drawn and animated, hint, relock on screen change and hiding, e2e.
- T3 firmware: loader, lock drawn at rest, cover on 4"/4.3B (follows the
  finger), Knob (same, its own touch code), PaperS3 (E7: no follow, three
  refreshes); swipe starting on a guard does not page; relock hooks; DDFs
  declare `guard`; headers regenerated; unit test of the runs.
- T4 android: model, lock, cover overlay in the three composables, consumes
  the gesture so FollowingScreens does not page, DdfBuilder declares
  `guard`, golden test of the runs.
- T5 HIL: guarded specimen in hil/conformance (gated on `guard`), tap does
  not switch, push then tap does, swipe does not page, screen change locks;
  android orchestrator check.
- T6 handbook objekte/bedienen.md, designer/vorschau.md; device contract
  §2.14; test:quick.
