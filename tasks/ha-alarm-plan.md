# Plan: ha-alarm - an alarm panel, its code typed in a text field

Third of the components left from the 2026-10-26 overview that need input
the devices did not have (after `text` and `time`): an MQTT
`alarm_control_panel`. Asked for by the user 2026-10-27; the code typed in
a text field, as the user proposed («warum nicht einfach ein textfeld
verwenden?»); Trigger offered where the panel offers it.

Source: `homeassistant/components/mqtt/alarm_control_panel.py`,
`mqtt/const.py` (branch `dev`, read 2026-10-27).

- `state_topic` and `command_topic` are required. States: `disarmed`,
  `armed_home`, `armed_away`, `armed_night`, `armed_vacation`,
  `armed_custom_bypass`, `pending`, `arming`, `disarming`, `triggered`;
  anything else is ignored.
- Commands: `payload_arm_home` (`ARM_HOME`), `payload_arm_away`
  (`ARM_AWAY`), `payload_arm_night` (`ARM_NIGHT`), `payload_arm_vacation`
  (`ARM_VACATION`), `payload_arm_custom_bypass` (`ARM_CUSTOM_BYPASS`),
  `payload_disarm` (`DISARM`), `payload_trigger` (`TRIGGER`), rendered
  through `command_template` (default `{{action}}`) with the variables
  `action` and `code`; not retained.
- `supported_features`: which of `arm_home`, `arm_away`, `arm_night`,
  `arm_vacation`, `arm_custom_bypass`, `trigger` it offers; default all.
  Disarm is always there.
- `code`: none, a fixed code (`1234`), `REMOTE_CODE` or `REMOTE_CODE_TEXT`.
  `code_arm_required`, `code_disarm_required`, `code_trigger_required`, each
  true by default. Home Assistant checks a fixed code before it sends; with
  `REMOTE_CODE(_TEXT)` it sends any non-empty code and the panel checks it.
  The code reaches the panel only where `command_template` uses `{{code}}`.
- Numeric or text: Home Assistant shows a keypad when `code` is digits only
  or `REMOTE_CODE`, a text input otherwise.

## What the code says

- A Button's «Send an MQTT message» publishes its message as written on
  every device: no placeholders, no condition (firmware main.cpp files,
  the app's ButtonActionDispatcher).
- Text fields, local topics (a value the device keeps, never on the
  broker), combined topics with `==` against a value, and placeholders
  (`{topic:…}`, resolved by every device in texts) all exist.
- So what is missing is in the Button alone: a message built from a value
  at the moment of the press, a condition for sending at all, and clearing
  a value after.

## Decisions taken here (to approve)

1. **No new object: a block of what exists.** An alarm panel is placed as:
   its state as a text; under it a **Text field «Code»** where a code is
   asked; a **Button** per action it offers - «Home», «Away», «Night»,
   «Vacation», «Bypass», «Disarm», and «Trigger» where `supported_features`
   has it (the user, 2026-10-27).
2. **The state in words.** A live value on the state topic, one rule per
   state: «Disarmed», «Armed home», «Armed away», «Armed night», «Armed
   vacation», «Armed bypass», «Pending», «Arming», «Disarming»,
   «Triggered»; no value yet «--».
3. **The code field.** A text field, hidden (dots), writing a **local
   topic** of its own (`local/<entity>/code`): typed on the device, kept on
   the device, never published. Numeric codes (`1234`, `REMOTE_CODE`) open
   the keyboard on its digits: a new text field property «Keyboard»
   (letters | digits), the phone asking Android for its number pad.
4. **The Button grows three optional properties** - general, not alarm
   only:
   - its message may hold **placeholders**, `{topic:…}` included, resolved
     at the press as a text resolves them: `{"action":"DISARM","code":"{topic:local/alarm/code}"}`;
   - **«Only when»**: a combined topic; the press sends nothing unless it is
     yes (a fixed code: «local/…/code == 1234»);
   - **«Then clear»**: a local topic set empty after sending (the code is
     not left standing in the field).
5. **The three code cases.**
   - No code, or `code_*_required` false for that action: the button sends
     its payload, the field is left out where no action needs it.
   - `REMOTE_CODE` / `REMOTE_CODE_TEXT`: the message is the command
     template rendered with the code as the placeholder of the code field;
     «Only when» the field is not empty; «Then clear» the field. The panel
     checks the code.
   - A fixed code: the device checks it, as Home Assistant would: «Only
     when» a combined topic «code field == <code>»; then clear. The code
     stands in the project - it stands on the broker already, in the
     announcement.
   A template the subset cannot render leaves the actions out with the
   reason, the state still shown.
6. **Gated by a feature.** The DDF's `supportedFeatures` gets
   `"button-values"` for the three Button properties and the text field's
   «Keyboard»; Deploy asks for it as for `"scaled-values"`: a board updated
   first, an app asked to update.

## Tasks

### Designer

- **D1 The Button's properties.** «Only when», «Then clear», placeholders
  in the message (the message field offers topics as a text does), the
  preview doing all three; the text field's «Keyboard» (the preview's input
  `inputmode="numeric"`). Test: e2e/button-values.spec.ts;
  property-panel-controls.json.
- **D2 Export and the feature.** Both exports carry them;
  `lib/button-values.ts` names what needs the feature. Test: in the spec,
  e2e/deploy-plan.spec.ts.
- **D3 The import and the block.** `case "alarm_control_panel"` in
  lib/ha-discovery.ts: the parts of decision 1, the code cases of decision
  5; the block lays them out, its local topic and combined topic with it.
  Test: e2e/ha-discovery.spec.ts with the docs' examples and each code
  case; e2e/bausteine.spec.ts.
- **D4 Handbook.** objekte/bedienen.md (Button: «Only when», «Then clear»,
  values in the message; Text field: «Keyboard»), designer/bausteine.md
  (the alarm panel).

### Firmware

- **F1** The Button: message placeholders resolved at the press, «Only
  when», «Then clear»; the keyboard opening on its digits; the feature in
  the DDFs. Test: HIL `hil/alarm.js` on each board - a block installed,
  the code typed, Disarm sending the code in the message, a wrong fixed
  code sending nothing, the field empty after.

### Android

- **A1** The same in the app, the number pad for a numeric field. Test: a
  screen in the Android HIL.

### Checkpoint

`npm run test:all` (detached, memory «Lange Läufe abgekoppelt»), COM3
logged.

## Not in this plan

A code entered on the Knob's ring; a keypad drawn as its own object;
`date`, `datetime`.
