# guard - todo

Plan: tasks/guard-plan.md. Spec: docs/2026-11-15-guard.md.
Each task: `npm run typecheck`, its spec; test:quick at the end (touches every device).

- [x] Before: branches `guard` (designer from starter-project, firmware and android from led-look)
- [x] T1 designer: lib/guard.ts, fixture, property, canvas lock, Convert to, export, deploy gating
- [x] T2 designer preview: gesture, cover, hint, relock
- [x] T3 firmware: loader, lock, cover on 4"/4.3B, Knob, PaperS3, no paging, relock, DDFs
- [x] T4 android
- [~] T5 HIL specimens and checks: conformance specimen «guard» + guardAndExpect (run.js), Android checkGuard + fixture builder; OPEN: comprehensive-test.zip not rebuilt (phone not on adb), boards not yet run
- [~] T6 handbook (objekte/bedienen.md, designer/vorschau.md), contract §2.14 done; test:quick open
