# Todo: graph-android

Plan: `tasks/graph-android-plan.md`.

- [x] A1 The pure part: `data/ScreenGraph.kt`, `ScreenGraphTest` on the byte-for-byte copy of the vectors (LF on every checkout)
- [x] A2 Model and actions: `mainRow`, `neighbours`, `back`, `pullTabColor`, a navigator's `back`, `side`; `data/ScreenGraphProject.kt` (an export from before the graph gets its row neighbours); next/previous over the main row, goto-neighbour, the start on the row's first. `ScreenGraphProjectTest`
- [x] A3 Drawing: pull tabs in `ScreenRenderer` through `BoxView`, the nudge (still while the test interface runs); the way back in `NavigatorStripView`
- [x] A4 Following the finger by the tab rule, up and down (`FollowingScreens`); the navigator stands still as the overlay it was - the sliding screens are not clipped, the strip's ground covers them
- [x] A5 The screen menu gone (`ScreenMenuOverlay` deleted); DDF `screen-graph`, no `deviceActions`; generation 1.9. `DdfBuilderTest`. `gradle testDebugUnitTest assembleDebug lintDebug` green
- [ ] A6 HIL on the phone (`hil/android/orchestrator.js`) - the phone was not reachable on 2026-10-18 (no adb device, nothing on .170:8080)
- [ ] Checkpoint
