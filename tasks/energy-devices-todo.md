# Todo: energy-firmware and energy-android

Plan: `tasks/energy-devices-plan.md`, approved by the user 2026-10-12
(«plan ist freigegeben»). No push, no release, no van; a push on halt or
finish. Hardware tasks wait for the running test:all.

- [x] F1 The core in C++
  - firmware aa00215: src/project/EnergyDiagram.{h,cpp}, test/test_energy_diagram (8 cases, the vectors' copy checked)
- [x] F2 Parsing and dark
  - firmware a2f8d34: EnergyDiagramProps behind a deep-copying handle; ThemeVariant swaps it; tools/theme-variant/check.cpp extended (ProjectLoader has no laptop test: covered by F3's HIL)
- [x] F3 Drawn still
  - firmware 000045c; designer cf8fd9c (every shape an outline in eighths, PolygonRaster in TS, RGB565 mixing in whole numbers - the canvas's own anti-aliasing left 866 px at the edges), 94d6a1f (specimen: Flow and Sankey side by side, topics driven): conformance 3/3 cases, 0 px
- [x] F4 Motion
  - firmware bf8683e: painted into every framebuffer, dots from 64 masks; hil/waveshare4v3b/energy-diagram.js (dcc3a43): Flow 7.7 ms/step x1.03, Sankey 23.5 ms x1.02, 10 steps/s, glass moves inside the diagram only
- [x] F5 A tap runs the node's action
  - firmware 000045c/bf8683e; energy-diagram.js: a tap on the sun's node opens its popup
- [x] F6 Generation 1.7 and the DDF
  - firmware ff01576; designer be65dff (DDF copy); the spike's ?set=energyspike gone
- [x] A1 The core in Kotlin
  - android 0f6750f: data/EnergyDiagramLayout.kt, EnergyDiagramLayoutTest (4 tests, the copy checked)
- [x] A2 Drawn
  - android c898d44, 3e5fdb6 (topics subscribed, a swipe on it pages); designer: shapes at the canvas's resolution, iconAssetId in the export; HIL screen-7 0.4-0.5 %
- [x] A3 Motion
  - withFrameNanos ~30/s, only the drawing reads it; HIL screen-8: the glass changes inside the diagram only
- [x] A4 A tap runs the node's action
  - no consumed touch (a diagram over the whole screen took every swipe); HIL screen-8: the sun opens the popup
- [x] A5 Generation 1.7 and supported types
  - android f3af7af; DdfBuilderTest
- [x] Handbook: info box out, device pages
  - objekte/anzeigen.md (devices, Motion on the 4.3B, own colour), geraete/index.md (the one type knob and PaperS3 lack)
  - the local preview DDF is NOT deleted: the user's project prompt-water is on it - left for the user to move the project to the 4.3B first
- [ ] Checkpoint: test:all green; the user looks at the glass and the phone
