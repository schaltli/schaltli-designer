# Todo: the navigator's marker glides with a swipe (#59)

Plan: tasks/navigator-glide-plan.md.

- [x] Core in lib/navigator.ts (markerGlides, markerOffset, markerSettle,
      markerRect, cornerInset) + lib/navigator/vectors.json + e2e
      navigator-core.spec
- [x] Designer: renderNavigator draws the marker; the preview glides and
      settles it; test-render `navigatorMarker`; e2e preview-swipe
- [x] 4.3B: renderer strip looks, FollowSwipe composes and settles, third
      canvas, `?set=marker=` for the HIL; native test_navigator; knob and
      PaperS3 build
- [x] HIL hil/navigator.js on the 4.3B: two marker frames 0 px against the
      designer, mid-swipe the marker moved, settle frames and fps reported
- [x] Android: core + vectors test, FollowingScreens onFollow/onFollowEnd,
      NavigatorStripView marker, settle in MainActivity, `markerFrames`
      debug; assembleDebug
- [x] Android HIL on the phone: checkScreenGraph B to C glide, 13/13 (3 of 5
      frames between, settled in 20 frames; 2026-10-18)
- [x] Spec decision 14, contract 2.7, handbook objekte/anordnen.md

Also in this piece: the way back's arrow points to where the page lies
(user, 2026-10-18) - lib/navigator-entries.ts, spec decision 7, contract
2.10, handbook designer/screens.md, e2e navigator-theme-switch.
