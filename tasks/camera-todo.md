# camera - todo

Plan: tasks/camera-plan.md. Spec: docs/2026-11-09-camera.md.
Each task: `npm run typecheck`, its spec or HIL case. `npm run test:quick`
between tasks dropped (the user, 2026-11-09); `npm run test:all` in T11.

- [x] Before: branch `camera` in designer, firmware and android
- [x] T1 designer: `hil/camera-server.js` looping the drain video by the clock (not in the repo), frame number in the picture, every mode reachable from a test
- [x] T2 firmware: CameraFeed, loader, drawing on the 4", HIL for criteria 1 and 4
- [x] Checkpoint A (2026-11-09): 10.2 images/s, delay 100 ms; the user: go on, with criterion 4 relative to the same screen without a Camera
- [x] T3 firmware: «No live image», Basic, 256 KB, no credentials in logs; HIL for 2, 3, 6, 7, 9
- [x] T4 designer: type, placeholder, sizes, properties, only where declared; e2e
- [x] T5 designer: preview and demo still image; e2e
- [x] T6 designer: export, device contract, conformance specimen, fixture from the designer
- [ ] Checkpoint B: the user places one and sees it on the 4" (found: a label over the picture was painted over - fixed; preview only in Preview mode)
- [x] T7 firmware: 4.3B declared, HIL. Unlimited the loop paused 389 ms (baseline 136); the user chose a cap: 170 ms between requests, 5.1 images/s, pause 282-285 ms of 286 allowed - tight on both. Fixed on the way: PSRAM for the pictures taken before the fonts, «No live image» no longer parses every font. COM3 log not captured (the logger hung opening the port).
- [ ] T8 firmware: Knob measured
- [ ] Checkpoint C: the user decides whether the Knob declares the type
- [ ] T9 android: CameraView, DDF, tests, HIL
- [ ] T10 handbook objekte/anzeigen.md, handbook-labels, humanizer
- [ ] T11 30-minute soak, `npm run test:all`, idea and spec up to date
