# Placeholders on the devices

Sub-module `placeholder-devices` of docs/2026-09-25-text-placeholders.md
(after `placeholder-core` and `placeholder-picker`, before
`placeholder-blocks`). Asked 2026-10-05: a Deploy to Device on the van's 4.3B
warns that its texts show `{topic:…}` as written - every device announces
generation 1.1, and no firmware or app resolves a placeholder yet.

## Objective

The designer writes placeholders since 2026-09-25 - a sensor block's value is
`{topic:van-sensors/sensor/cabin_temperature/state} °C` - but the knob, the
4.3B, the PaperS3 and the phone draw such a text as it is written. Each of
them learns to resolve placeholders the way the designer's preview does, and
then announces generation 1.2, which ends the warning.

Success looks like: a project with placeholders deploys without a warning
and shows on every device, live, what the designer's preview shows - the same
text, the same rounding, the same separators.

## What the devices resolve (the language, unchanged)

As docs/2026-09-25-text-placeholders.md defines it - grammar, `??`, `F0`-`F9`
and `N0`-`N9`, rounding on the decimal digits, `{{ }}`, unknown or reserved
shown as written - with these references:

| Reference | Firmware (knob, 4.3B, PaperS3) | Android |
|---|---|---|
| `topic:<path>` (with `#json.path`) | the topic's last value (ProjectLoader's value store) | MqttRepository's values |
| `device:id` | the MQTT client id, `<DEVICE_ID>-<mac>` | DeviceIdentity.deviceId |
| `device:model` | the board's name from its DDF (`device.json` `name`), compiled in | DeviceIdentity.deviceName (the marketing name) |
| `project:name` | never arrives: the designer bakes it at export | same |

## Behaviour

- **Where:** the text of a `text` object. That is all there is: the level
  header (a bar's, slider's or gauge's own label) was removed on 2026-09-29
  and the export strips it (`withoutLevelHeader`), so the parent spec's
  «label of bar, slider and gauge» does not apply any more; a level's name is
  a text beside it. Switch states, a button's text and `live-text`'s prefix
  and suffix stay literal, as the parent spec says.
- **Live:** a text redraws when a topic it references changes, as a bound
  object does - on the knob through its partial redraw, which today only
  knows `topic` and `setpointTopic`.
- **Subscriptions:** every topic a text references is subscribed. The 4.3B
  and the PaperS3 subscribe to all of `project.topics` already; the knob
  (`collectTopics`) and Android (`collectTopicNames`) learn the references.
  A device keeps values only for topics the project declares, so the export
  makes sure every referenced topic is declared (the designer declares them
  when a text is committed; the export checks it once more).
- **Separators:** the export writes the project's two characters,
  `decimalSeparator` and `thousandsSeparator`, into the device project; a
  device without them uses the designer's default, `.` and `'`. Today they
  stay in the designer.
- **Generation 1.2:** the firmware of all three boards and the app announce
  1.2. The designer's deploy warning (`PLACEHOLDER_GENERATION`) then stays
  quiet for them. The retired e-paper firmware is not changed and keeps the
  warning.

## Not in scope

- `placeholder-blocks` (block labels as placeholders with a `??` name) - the
  next sub-module.
- Placeholders in switch states, button texts, `live-text`; `live-text`
  itself stays.
- Bringing back a level's own label.
- Expressions beyond v1, new namespace fields (`device:name`,
  `project:version`).
- The e-paper firmware.

## Code

| Where | What |
|---|---|
| firmware `src/project/Placeholders.{h,cpp}` | the evaluator in plain C++ (`std::string`, no Arduino), so it builds natively; a thin adapter to `String` for the renderer |
| firmware `platformio.ini`, `test/test_placeholders/` | a `native` env (Unity) running the shared vectors |
| firmware `ProjectTypes.h`, `ProjectLoader.cpp` | the two separators read into `ProjectConfig` |
| firmware `ColorScreenRenderer.cpp` `renderLabel` | the text resolved before it is drawn |
| firmware knob `main.cpp` | `collectTopics`, `screenUsesTopic`, the partial redraw learn a text's references |
| firmware DDF header generation | the board's name compiled in for `device:model` |
| firmware `src/boards/*/DeviceInfo.h` | `SYSTEM_GENERATION_MINOR` 2 |
| Android `data/Placeholders.kt` | the evaluator; `TextBoxView` gets the resolved text |
| Android `TopicCollector`, `ProjectModels` | the references collected; the separators read |
| Android `MqttRepository`, `DdfBuilder` | `SYSTEM_GENERATION` 1.2 (both places) |
| designer `lib/project-zip.ts`, `android-export.ts` | the separators exported; every referenced topic declared |
| designer `docs/device-contract.md` | the language and the separators, for device authors |
| HIL `hil/conformance/specimens.js` | the `text` specimen gains texts with placeholders, formats and a fallback |

The vectors (`lib/placeholders/vectors.json`) are copied byte for byte into
the firmware and the app; each repo's test checks its copy against the
designer's when the designer is checked out beside it.

## Testing strategy

- **Vectors on all three platforms:** designer (Playwright, no browser - it
  runs today), firmware (`pio test -e native`), Android
  (`gradlew :app:testDebugUnitTest`).
- **Designer e2e:** the export carries the separators and declares every
  referenced topic; a 1.2 device gets no warning.
- **Device render (HIL):** the conformance `text` specimen with
  placeholders, each topic example a combination - the knob's, the 4.3B's
  and the PaperS3's pixels held to the designer's. Android by its unit tests
  and by hand on a phone.
- **Live:** on the knob and the 4.3B, a value published on a referenced topic
  changes the text without a deploy (HIL).

## Boundaries

- **Always:** the three evaluators kept in step through the vectors; the
  device contract and the handbook say what devices do.
- **Ask first:** releasing firmware and the app (van-deploy is the user's to
  run); any change to the e-paper firmware.
- **Never:** evaluate beyond the grammar; let a placeholder publish anything.

## Success criteria

- [ ] All vectors pass in the designer, the firmware (native) and Android.
- [ ] `Wasser {topic:schaltli/state/tank/1/level:F0} %` on a screen follows the
      tank on the knob, the 4.3B, the PaperS3 and the phone.
- [ ] A sensor block (its value text a placeholder) shows the value on every
      device.
- [ ] The HIL conformance passes with the placeholder specimen on the knob
      and the 4.3B (PaperS3 when connected), 0 px.
- [ ] Deploy to Device to a board or phone on the new firmware or app shows
      no placeholder warning.
- [ ] Firmware released, the app's APK on the GitHub release; the handbook no longer says devices show
      placeholders as written.

## Open questions

Settled with the user on 2026-10-05:

1. ~~The app's release~~ - an APK attached to the GitHub release, as today.
2. ~~`device:model` on the boards~~ - the DDF's full `name` («Waveshare
   Knob-Touch LCD 1.8»), compiled in.
3. ~~Native tests and Arduino `String`~~ - the evaluator is written on
   `std::string`, so the native env needs no Arduino shim; the renderer
   converts.
