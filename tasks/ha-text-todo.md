# Todo: ha-text

Plan: `tasks/ha-text-plan.md`, approved by the user 2026-10-27 («Standard
ist gem. Browser. Rest ok. Leg los»).

- [x] D1 The object: type, drawing, panel, preview typing
  - dff4995; e2e/text-field.spec.ts, property-panel-controls.json
- [x] D2 Export and deploy: both exports, the type in the device descriptions
  - both exports pass it through with its colours resolved (fieldColor/lineColor in COLOR_KEYS, dff4995); e2e/text-field.spec.ts «in the exports». The type itself goes into the DDFs in F1 and A1; deploy's type check is the energy diagram's
- [x] D3 The import: `case "text"`, block places a Text field
  - e2e/ha-discovery.spec.ts (docs' «Remote LCD screen», defaults, password, template, pattern), e2e/bausteine.spec.ts «a text: a text field beside the name»; fixture ha-docs-text-lcd.json. A hidden field's topics keep no examples (no password saved in the project)
- [x] D4 Handbook (designer part): objekte/bedienen.md «Text field», bausteine.md table row, objekte/index.md and designer/index.md lists; checked against the maettel-humanizer catalog
  - the device part («Am Gerät», «Keyboard» in geraete/einrichten.md) follows with F2/F3 and A1
- [x] Checkpoint: test:quick 2026-10-27 (second run; the first was stopped for low memory): e2e 1875 passed, 1 skipped, 2 failed - font-select's list lacked the new panel (fixed), broker-login under load (EPERM on rename, fixed in bd9f6b2); knob, 4v3b, papers3, android green; the DDFs «stale» from F1 in progress. COM3: no panic
- [x] F1 Firmware: drawing on all three boards, conformance specimen
  - schaltli-firmware 4c86ea2, 8d1953d; test/test_text_field; hil/conformance specimen «text-field»: 0 differing pixels on 4.3B, knob, PaperS3
- [x] F2 Firmware: shared keyboard, layouts, «Keyboard» setting with the browser default, unit tests
  - schaltli-firmware 84095ea; test/test_keyboard (layouts, shift, bounds, browser languages, geometry, frames)
- [x] F3 Firmware: 4.3B, Knob, PaperS3 geometry and HIL typing
  - 84095ea (4.3B), 0df96dd (knob), PaperS3 commit after; hil/text-field.js 6/6 on .117, .114, .118; PaperS3 138 ms from press to the panel; GET /api/keyboard on the test interface
- [ ] A1 Android: drawing, system keyboard, HIL fixture screen
- [ ] Checkpoint: test:all, COM3 logged
