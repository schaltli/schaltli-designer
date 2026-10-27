# Todo: ha-time

Plan: `tasks/ha-time-plan.md`, written 2026-10-27; decisions settled 2026-10-27
(«räder … kontinuierlichem ziehen, das beim loslassen einrastet»; Knob the same,
no ring; step 5 by default, rounded onto; 24 hours).

- [x] T0 The artifact: https://claude.ai/artifact/9uyxiLRN9YDUYtzkUX25cZ (4.3B A buttons, 4.3B B wheels, knob ring, PaperS3 A, phone's own picker); decisions settled
- [x] D1 The object: type, drawing, panel, preview picker, lib/time-field.ts
  - e2e/time-field.spec.ts (rules, panel, preview 06:43 → 06:45:00), property-panel-controls.json; drawn by the text field's drawField
- [x] D2 Export
  - e2e/time-field.spec.ts «in the exports», both targets
- [x] D3 The import: `case "time"`, block
  - e2e/ha-discovery.spec.ts (docs' «Scheduled task», template, no state topic), e2e/bausteine.spec.ts «a time»; fixture ha-docs-time-scheduled.json
- [x] D4 Handbook: objekte/bedienen.md «Time field» with the device part, bausteine.md row, both index lists
- [x] F1 Firmware: drawing, TimeField.h, DDFs, conformance specimen
  - test/test_time_field; specimen «time-field»: 0 differing pixels on .117, .114, .118 (text-field too, its drawing now shared)
- [x] F2 Firmware: the pickers, /api/picker, HIL setting 06:45
  - schaltli-firmware f2b9ec4 (TimePicker, 4.3B), 7abc94e (knob), PaperS3 after; test/test_time_picker; hil/time-field.js 6/6 on .117 and .114, 5/5 on .118; in test:all
- [x] A1 Android: drawing, system time picker, HIL screen
  - schaltli-android commit after 9af1038; TimeFieldTest, DdfBuilderTest; hil/android screen-12 and checkTimeField: 30/30, OK sends 06:30:00 from 06:32, Cancel nothing (the dial is Android's, not driven)
- [x] Checkpoint: test:all 2026-10-27 (detached): e2e 1889 passed; android, papers3 green; knob-time-field 5/6 - the flick ran on only two under the full run's load (the test's flick made plain: three values in two moves, run on past three; 6/6 alone); 4v3b layout, energy motion, local topics and the dial's drag failed under load with snapshots 'terminated' - each green alone afterwards (3/3, PASS, 5/5, 6/6). The 4.3B's internal heap was 76 KB after the run; opening, dragging and cancelling the picker 20 times left it at 154 KB, no leak there. COM3: no panic
