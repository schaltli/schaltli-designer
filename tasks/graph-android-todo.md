# Todo: graph-android

Plan: `tasks/graph-android-plan.md`.

- [x] A1 The pure part: `data/ScreenGraph.kt`, `ScreenGraphTest` on the byte-for-byte copy of the vectors (LF on every checkout)
- [x] A2 Model and actions: `mainRow`, `neighbours`, `back`, `pullTabColor`, a navigator's `back`, `side`; `data/ScreenGraphProject.kt` (an export from before the graph gets its row neighbours); next/previous over the main row, goto-neighbour, the start on the row's first. `ScreenGraphProjectTest`
- [x] A3 Drawing: pull tabs in `ScreenRenderer` through `BoxView`, the nudge (still while the test interface runs); the way back in `NavigatorStripView`
- [x] A4 Following the finger by the tab rule, up and down (`FollowingScreens`); the navigator stands still as the overlay it was - the sliding screens are not clipped, the strip's ground covers them
- [x] A5 The screen menu gone (`ScreenMenuOverlay` deleted); DDF `screen-graph`, no `deviceActions`; generation 1.9. `DdfBuilderTest`. `gradle testDebugUnitTest assembleDebug lintDebug` green
- [x] A6 HIL on the phone: `checkScreenGraph` in `hil/android/orchestrator.js` (`--only-graph` runs it alone), 11 checks within the suite's limit (A 0.11%, A1 0.03%); the reference draws pull tabs where the app declares `screen-graph`; the app's debug route says the screen and the last named swipe. Found: a swipe named at release must be quick (the injected 400 ms one overran the 900 ms on the P20); the case after the dial's tap waits out LEVEL_AWAIT_MS (1-1 had read the asked 50, 0.86%). Fixture 23/23. The phone had to come back from the camper's broker (`hil/boards-network.js home --only android`)
- [x] Checkpoint: `gradle testDebugUnitTest assembleDebug lintDebug` green, the Android HIL green on the P20; version and release stay the user's
