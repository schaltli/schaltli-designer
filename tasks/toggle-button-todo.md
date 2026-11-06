# toggle-button - todo

Plan: tasks/toggle-button-plan.md. Spec: docs/2026-11-06-toggle-button.md.
Each task: `npm run typecheck`, its spec, `npm run test:quick`, its handbook part.

- [x] Before: the other session's work on `prebuilt` committed; branch `toggle-button` (designer from prebuilt, firmware and android from master)
- [x] T1 designer: type `toggle-button`, isSwitchType call sites decided, lib/toggle-button-shape.ts
- [x] T2 designer: render, palette part, property panel «Name», size rules, preview (next, ring, state layer, «?»)
- [x] Checkpoint A: the user decided (2026-11-06): disc as tall as both lines, icon doubled, a ring in 1 bit, a minimum height
- [x] T3 designer: Convert to as a family of three
- [x] T4 designer: export looks, noneLook, ring, state icons, the second font
- [x] T5 firmware: loader, renderer, tap, DDFs, conformance specimens on every board
- [x] T6 android: ToggleButtonView, DDF, golden and specimens
- [x] Checkpoint B: conformance on every board and the app, nothing excused
- [x] T7 CamperUI rebuild on Toggle Buttons, on the 4", compared
- [x] T8 handbook objekte/bedienen.md, handbook-labels, test:quick
