# Todo: ha-text

Plan: `tasks/ha-text-plan.md`, approved by the user 2026-10-27 («Standard
ist gem. Browser. Rest ok. Leg los»).

- [x] D1 The object: type, drawing, panel, preview typing
  - dff4995; e2e/text-field.spec.ts, property-panel-controls.json
- [x] D2 Export and deploy: both exports, the type in the device descriptions
  - both exports pass it through with its colours resolved (fieldColor/lineColor in COLOR_KEYS, dff4995); e2e/text-field.spec.ts «in the exports». The type itself goes into the DDFs in F1 and A1; deploy's type check is the energy diagram's
- [x] D3 The import: `case "text"`, block places a Text field
  - e2e/ha-discovery.spec.ts (docs' «Remote LCD screen», defaults, password, template, pattern), e2e/bausteine.spec.ts «a text: a text field beside the name»; fixture ha-docs-text-lcd.json. A hidden field's topics keep no examples (no password saved in the project)
- [ ] D4 Handbook: bedienen.md, einrichten.md (Keyboard), bausteine.md
- [ ] Checkpoint: test:quick
- [ ] F1 Firmware: drawing on all three boards, conformance specimen
- [ ] F2 Firmware: shared keyboard, layouts, «Keyboard» setting with the browser default, unit tests
- [ ] F3 Firmware: 4.3B, Knob, PaperS3 geometry and HIL typing
- [ ] A1 Android: drawing, system keyboard, HIL fixture screen
- [ ] Checkpoint: test:all, COM3 logged
