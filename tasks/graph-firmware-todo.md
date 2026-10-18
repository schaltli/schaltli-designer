# Todo: graph-firmware

Plan: `tasks/graph-firmware-plan.md`.

- [x] F1 The pure module and its vectors: `lib/screen-graph-device.ts`, `lib/pull-tabs.ts` (the tab a box with round ends, its colour worked out by the designer, the nudge in whole pixels), `lib/screen-graph/vectors.json` written by `scripts/screen-graph-vectors.ts`; `e2e/screen-graph-vectors.spec.ts` runs them and holds the device's rule to the designer's on projects. Firmware `src/project/ScreenGraph`, `test/test_screen_graph` (byte-for-byte copy, LF on every checkout in both repos)
- [x] F2 Loading and drawing, shared. Export: `pullTabColor`/`pullTabColorDark` per screen, `navigators[].back` - the way back as a baked entry as long as the strip (contract §2.10 updated: a box, not a line; the colour from the export; the way back as objects). Firmware: `ProjectLoader`, `ScreenGraphProject.h`, `ColorScreenRenderer` (tabs into the picture, the way back). `app/test-render` `pullTabs` (the master kept for its swipes, only swipes among the project's buttons - as the export), passed by every HIL script whose board declares `screen-graph`
- [x] F3 4.3B: main row, goto-neighbour, the slide by the tab rule up and down (`FollowSwipe` vertical), nudge (still while the test interface runs), the way back's tap, start; DDF `screen-graph`, generation 1.9. `hil/screen-graph.js` (16 checks at 0 px) in test:quick for all three boards, SKIPPED until a board declares it. Found on the way: the way back's icon was not baked, and the reference did not preload it; a swipe the project does not have as a button has no tab (conformance 8/57 until then); the preview no longer swipes a device without swipes
- [ ] F4 PaperS3
- [ ] F5 Knob, and «Show Screen Menu» gone
- [ ] F6 Handbook
- [ ] Checkpoint
