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
- [x] D4 Handbook (designer part): objekte/bedienen.md «Time field», bausteine.md row, both index lists; the device part follows with F2/A1
- [ ] F1 Firmware: drawing, TimeField.h, DDFs, conformance specimen
- [ ] F2 Firmware: the pickers, /api/picker, HIL typing 06:45
- [ ] A1 Android: drawing, system time picker, HIL screen
- [ ] Checkpoint: test:all (detached), COM3 logged
