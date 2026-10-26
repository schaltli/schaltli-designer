# Todo: ha-templates stage 2

Plan: `tasks/ha-templates-stage2-plan.md`. Approved by the user 2026-10-26.

- [x] S1 The arithmetic and its vectors (`lib/scaled-value.ts`, vectors, e2e)
- [x] S2 Scaled topics in the project (combined kind `scale`, vectors, export)
- [x] S3 Write formats on levels (property, preview publish, export)
- [x] S7 Contract (§1 feature, §2.6 scale kind, write format)
- [x] Checkpoint: test:quick
- [x] F1 Firmware port (`ScaledValue`, combined scale kind, native tests)
- [x] F2 Firmware writing (one `formatWrite()` for every board)
- [x] F3 Firmware announces `"scaled-values"`
- [x] A1 Android port (`ScaledValue.kt`, combined scale kind, tests)
- [x] A2 Android writing (`setLevel`)
- [x] A3 Android announces `"scaled-values"`
- [x] Checkpoint: test:quick, native firmware tests, Android unit tests (the new app is built, not installed: the phone's adb asks for confirmation on the phone)
- [ ] S4 The editor (third kind in Add combined topic, «Send as»)
- [x] S5 Deploy asks `"scaled-values"`
- [x] S6 The import (`linearForm`, scaled topics and write formats from templates)
- [ ] Checkpoint: test:quick
- [ ] H1 HIL fixtures on every lane
- [ ] H2 Handbook
- [ ] Checkpoint: test:all
