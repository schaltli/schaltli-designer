# camera - todo

Plan: tasks/camera-plan.md. Spec: docs/2026-11-09-camera.md.
Each task: `npm run typecheck`, its spec or HIL case, `npm run test:quick`.

- [ ] Before: branch `camera` in firmware and android (designer's exists)
- [x] T1 designer: `hil/camera-server.js` looping the drain video by the clock (not in the repo), frame number in the picture, every mode reachable from a test
- [ ] T2 firmware: CameraFeed, loader, drawing on the 4", HIL for criteria 1 and 4
- [ ] Checkpoint A: the numbers to the user; stop if criteria 1 or 4 fail
- [ ] T3 firmware: «No live image», Basic, 256 KB, no credentials in logs; HIL for 2, 3, 6, 7, 9
- [ ] T4 designer: type, placeholder, sizes, properties, only where declared; e2e
- [ ] T5 designer: preview and demo still image; e2e
- [ ] T6 designer: export, device contract, conformance specimen, fixture from the designer
- [ ] Checkpoint B: the user places one and sees it on the 4"
- [ ] T7 firmware: 4.3B declared, HIL, COM3 logged
- [ ] T8 firmware: Knob measured
- [ ] Checkpoint C: the user decides whether the Knob declares the type
- [ ] T9 android: CameraView, DDF, tests, HIL
- [ ] T10 handbook objekte/anzeigen.md, handbook-labels, humanizer
- [ ] T11 30-minute soak, `npm run test:all`, idea and spec up to date
