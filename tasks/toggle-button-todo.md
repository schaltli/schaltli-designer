# toggle-button - todo

Plan: tasks/toggle-button-plan.md. Spec: docs/2026-11-06-toggle-button.md.
Each task: `npm run typecheck`, its spec, `npm run test:quick`, its handbook part.

- [ ] Before: the other session's work on `prebuilt` committed; branch `toggle-button` (designer from prebuilt, firmware and android from master)
- [ ] T1 designer: type `toggle-button`, isSwitchType call sites decided, lib/toggle-button-shape.ts
- [ ] T2 designer: render, ribbon tool, property panel «Name», size rules, preview (next, ring, state layer, «?»)
- [ ] Checkpoint A: test:quick green; the user decides the disc's colours / 1 bit and a minimum height
- [ ] T3 designer: Convert to as a family of three
- [ ] T4 designer: export looks, noneLook, ring, state icons, the second font
- [ ] T5 firmware: loader, renderer, tap, DDFs, conformance specimens on every board
- [ ] T6 android: ToggleButtonView, DDF, golden and specimens
- [ ] Checkpoint B: conformance on every board and the app, nothing excused
- [ ] T7 CamperUI rebuild on Toggle Buttons, on the 4", compared
- [ ] T8 handbook objekte/bedienen.md, handbook-labels, test:quick
