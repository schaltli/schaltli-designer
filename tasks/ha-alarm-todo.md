# Todo: ha-alarm

Plan: `tasks/ha-alarm-plan.md`, approved by the user 2026-10-27 («los»).

- [x] D1 The Button's properties: message with {topic:…}, «Only when», «Then clear»; the text field's «Keyboard»
  - lib/button-values.ts; only {topic:…} is special in a message, every other brace as written (JSON); e2e/button-values.spec.ts (rules, preview: no code and a wrong one send nothing, 1234 sends it, the field empty after); property-panel-controls.json
- [x] D2 Export and the feature `button-values`: both exports carry the three; deploy asks for the feature
  - e2e/button-values.spec.ts «in the exports»
- [ ] D3 The import and the block: `case "alarm_control_panel"`, the code cases
- [ ] D4 Handbook
- [ ] F1 Firmware: fill, only when, then clear; digits keyboard; DDFs; HIL hil/alarm.js
- [ ] A1 Android: the same, the number pad; Android HIL screen
- [ ] Checkpoint: test:all (detached), COM3 logged
