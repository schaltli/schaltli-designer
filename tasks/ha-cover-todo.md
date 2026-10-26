# Todo: ha-cover

Plan: `tasks/ha-cover-plan.md`. Approved by the user 2026-10-26.

- [x] C1 The parts
  - `case "cover"` in `partsOf`, `buttonPart`, `textPart`, `positionPart` in lib/ha-discovery.ts (sensor and button reuse the helpers); e2e/ha-discovery.spec.ts four cover cases; fixtures schaltli-awning.json, ha-docs-cover-tilt.json, ha-docs-cover-no-close.json
- [x] C2 A button part names itself
  - Already so: buildEntry passes `control.part` as each part's label. No code change. e2e/bausteine.spec.ts «an awning: its state beside the name, Open, Stop and Close a button each sending its payload, the position a slider». The plan's «leaving Stop unticked» does not apply: entries have no part checkboxes (decided 2026-10-01), a part not wanted is deleted on the screen.
- [x] C3 Handbook
  - handbuch/designer/bausteine.md: row «Abdeckung (`cover`)» and a paragraph under «Mehrere Teile»; through maettel-humanizer
- [x] Checkpoint: test:quick 2026-10-26: e2e 1681 passed, 1 skipped; papers3 lane green; knob, 4v3b and the phone not reachable, skipped
