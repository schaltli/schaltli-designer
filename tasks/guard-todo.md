# guard - todo

Plan: tasks/guard-plan.md. Spec: docs/2026-11-15-guard.md.
Each task: `npm run typecheck`, its spec; test:quick at the end (touches every device).

- [x] Before: branches `guard` (designer from starter-project, firmware and android from led-look)
- [x] T1 designer: lib/guard.ts, fixture, property, canvas lock, Convert to, export, deploy gating
- [x] T2 designer preview: gesture, cover, hint, relock
- [x] T3 firmware: loader, lock, cover on 4"/4.3B, Knob, PaperS3, no paging, relock, DDFs
- [x] T4 android
- [x] T5 HIL specimens and checks (test:all 2026-11-15: 4.3B and 4" conformance with guard PASS, PaperS3 PASS after the up() fix, Android checkGuard PASS; knob not on the bench): conformance specimen «guard» + guardAndExpect (run.js), Android checkGuard + fixture builder; comprehensive-test.zip rebuilt 2026-11-15 with the guarded button
- [x] T6 handbook (objekte/bedienen.md, designer/vorschau.md), contract §2.14; test:quick 2026-11-15: e2e green after the panel snapshot, 4.3B conformance 84/84 incl. guard, PaperS3 lanes green; knob, 4" (van) and phone not reachable
