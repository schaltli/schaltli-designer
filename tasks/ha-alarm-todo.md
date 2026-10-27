# Todo: ha-alarm

Plan: `tasks/ha-alarm-plan.md`, approved by the user 2026-10-27 («los»).

- [x] D1 The Button's properties: message with {topic:…}, «Only when», «Then clear»; the text field's «Keyboard»
  - lib/button-values.ts; only {topic:…} is special in a message, every other brace as written (JSON); e2e/button-values.spec.ts (rules, preview: no code and a wrong one send nothing, 1234 sends it, the field empty after); property-panel-controls.json
- [x] D2 Export and the feature `button-values`: both exports carry the three; deploy asks for the feature
  - e2e/button-values.spec.ts «in the exports»
- [x] D3 The import and the block: `case "alarm_control_panel"`, the code cases
  - lib/ha-discovery.ts (states in words, a code field on a local topic with its check, buttons with Only when / Then clear), lib/bausteine.ts; renderTemplate trims as Home Assistant does; e2e/ha-discovery.spec.ts (four alarm fixtures), e2e/bausteine.spec.ts «an alarm panel with a code»
- [x] D4 Handbook
  - objekte/bedienen.md (Button: {topic:…}, Only when, Then clear; Text field: Keyboard), designer/bausteine.md (Alarmanlage)
- [x] F1 Firmware: fill, only when, then clear; digits keyboard; DDFs; HIL
  - ButtonValues.h + test_button_values, ProjectLoader::pressedMessage, all three boards; the HIL went into hil/text-field.js as checks 7-8 rather than a new script (one project, one upload); green on 4.3B, knob, PaperS3
- [x] A1 Android: the same, the number pad; Android HIL screen
  - ButtonValues.kt + test, the dispatcher (typed text sent `literal`, never read for {topic:…}), NumberPassword; Android HIL screen-13 «Alarm», checkAlarm: 31/31
- [ ] Checkpoint: test:all (detached), COM3 logged
