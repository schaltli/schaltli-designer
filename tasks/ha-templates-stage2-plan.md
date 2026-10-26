# Plan: ha-templates stage 2 - scaled topics and write formats

Spec: `docs/2026-10-26-ha-templates.md` («The two new pieces», stage 2).
Stage 1 is built (`ea7fab8`, `2093a83`). This stage adds the two pieces a
device must compute, so that a template that scales a number - read or
written - becomes a block: rtl_433's conversions, OpenMQTTGateway's
intervals, Shelly gen2's numbers over RPC, Zigbee2MQTT's cover position.

Repos: `schaltli-designer`, `schaltli-firmware` (4.3B, Knob, PaperS3),
`schaltli-android`.

## Decisions taken here (to approve)

1. **A factor is a fraction, the arithmetic exact in 64-bit integers.**
   Open question 1 of the spec, answered as proposed: a factor is
   `numerator / denominator`, both integers, |each| ≤ 1 000 000, so
   `/ 60000` and `/ 2.55` (= × 20 / 51) are exact. The offset is a decimal
   with at most 6 places. A value is read as a plain decimal (the
   formats' own reading, contract «never through a float») of at most 12
   significant digits, at most 9 after the point; the result is rounded
   half away from zero to `decimals` (0-6), as `F0`-`F6` round, and is
   below 10^12. `decimals` is at least the offset's places (273.15 needs
   2): a chip's own format rounds further where a template rounded to
   fewer. With those bounds every step fits
   in a signed 64-bit integer on all three platforms (TypeScript BigInt,
   C++ `int64_t`, Kotlin `Long`). A value that is not a plain decimal or
   exceeds the bounds gives no value, never a wrong one.
2. **A scaled topic is a third kind of combined topic.** Beside `all` and
   `any`: `{ mode: "scale", source, numerator, denominator, offset?,
   decimals }`, one source (a topic, a JSON field, another combined topic),
   read as `combined:<name>` like the others - so the evaluation order,
   the circular-reference check, «no value yet», delete and rename are the
   ones combined topics already have. Its value is the number as text in
   plain decimal ("21.5"), never the project's separators: those are the
   formats' to apply.
3. **A write format on what writes a number.** A slider, a dial, a settable
   bar or arc gets an optional `writeFormat`: `{ text, numerator?,
   denominator?, offset?, decimals? }`. `text` holds `{value}` once, e.g.
   `{"brightness":{value}}`; the value set by the finger is scaled first,
   then put in, in plain decimal. Only `{value}` is special: every other
   brace is written as it stands - not `{{`/`}}` as in placeholders, since
   a JSON payload ends in `}}` all the time (changed while building S1,
   2026-10-26). Absent: the number alone, as today. What is drawn and the
   asked value (the handle until the state comes back) stay the unscaled
   number.
4. **One feature in the DDF: `"scaled-values"`.** As local topics (a
   feature, not a generation: the Knob announces 1.4 and the PaperS3 1.6).
   Deploy asks it of a device for any scaled topic or write format in the
   project, naming them, the way it asks `"local-topics"`: a board whose
   release has it is updated first, else refused with the reason; an app
   asked to update. Every device gets it - no device left out (memory
   «Geräte: kein Zoo»).
5. **The import makes them from linear templates only.** A template whose
   value is `a × path / b + c`, in any arrangement of `*`, `/`, `+`, `-`,
   `multiply`, `float`, `int`-free, optionally `| round(n)` last, becomes a
   scaled topic (reading) or a write format (`text` around one such
   expression, writing). Anything else stays as stage 1 leaves it. A
   placed block brings its scaled topics into the project's combined
   topics as it brings its topics, named after the entity and the part
   (`cabin_temperature`, a number added on a clash).

## Tasks

### Designer

- **S1 The arithmetic and its vectors.** `lib/scaled-value.ts`:
  `scale(value, factor)` and `writeFormat(value, format)` as decision 1
  and 3 say, written to be ported line by line (no float, no regular
  expression a loop could not do). `lib/scaled-value/vectors.json`: the
  cases all three must agree on - exact divisions and not, rounding at
  every half, negative values and offsets, each bound and one past it, not
  a decimal, `{value}` with braces around, `{{`/`}}`.
  Test: `e2e/scaled-value.spec.ts` runs the vectors.
  Files: `lib/scaled-value.ts`, `lib/scaled-value/vectors.json`,
  `e2e/scaled-value.spec.ts`.
- **S2 Scaled topics in the project.** `CombinedTopic` gets the `scale`
  kind (`lib/combined-topics.ts`): evaluation, order, circularity, «no
  value yet» (a source without a value has none), the preview computing it
  from its source's examples and test value. The export carries it as the
  other kinds.
  Test: the `combined` section of `lib/live-value/vectors.json` gains scale
  cases (the firmware and app run them there too); an e2e that a scaled
  topic reading another combined topic is ordered after it, a circle
  refused.
  Files: `lib/combined-topics.ts`, `lib/live-value/vectors.json`,
  `e2e/combined-topics.spec.ts`, the export.
- **S3 Write formats on levels.** `writeFormat` on slider, dial, settable
  bar and arc; the designer's preview publishes through it where it
  publishes a set value; the export carries it.
  Test: e2e - a slider with a write format, dragged in the preview against
  the test broker, publishes the formatted payload; the zip and the
  Android bundle carry the property.
  Files: the level property types, the preview's publish, export.
- **S4 The editor.** Add combined topic offers the third kind (form:
  source, × numerator, ÷ denominator, + offset, decimals; a preview of the
  source's example scaled); a level's properties get «Send as» (the text
  with `{value}`) and the same four fields. Labels settled when building,
  shown to the user first.
  Test: e2e - a scaled topic made in the form is listed, read by a text
  chip, previewed from its source; «Send as» set on a slider is saved.
  Files: the combined topics section, the level property panel.
- **S5 Deploy asks the feature.** `planDeploy` takes `"scaled-values"`
  beside `"local-topics"`, naming the scaled topics and the objects with a
  write format.
  Test: `e2e/deploy-plan.spec.ts` as for local topics.
  Files: `lib/deploy-plan.ts`, `components/deploy-dialog.tsx`, a
  `lib/scaled-values.ts` beside `lib/local-topics.ts`.
- **S6 The import.** `lib/ha-template.ts` gets `linearForm(template)`:
  the path, the fraction, the offset and the decimals of a linear
  template, or why it is not one. `lib/ha-discovery.ts` uses it: a value
  or level read through one becomes a control reading a scaled topic the
  entry describes; a level's command template of text around one linear
  expression of `value` becomes its write format. `lib/bausteine.ts`
  places the scaled topics with the block.
  Test: fixtures from the survey - rtl_433's speed (`* 3.6`, `round(2)`),
  OpenMQTTGateway's interval (`/1000` read, `{"interval":{{value*1000}}}`
  written), Shelly gen2's thermostat target (stage 1's fixture, its
  temperature now a level), Zigbee2MQTT's cover position
  (`{ "position": {{ position }} }`); a placement test that the block
  brings its scaled topic.
  Files: `lib/ha-template.ts`, `lib/ha-discovery.ts`, `lib/bausteine.ts`,
  `e2e/ha-discovery.spec.ts`, `e2e/bausteine.spec.ts`, fixtures.
- **S7 Contract.** `docs/device-contract.md`: the scale kind in §2.6, the
  write format beside `writeTopic`, `"scaled-values"` in §1's features.

### Firmware (after S1-S3, S7)

- **F1 Port.** `src/project/ScaledValue.{h,cpp}` from `lib/scaled-value.ts`;
  `CombinedTopics` evaluates the scale kind; `test/test_scaled_value`
  runs `lib/scaled-value/vectors.json` (a copy, checked byte for byte
  against the designer's, as the live value vectors are);
  `test_live_value` gains the combined scale cases with the vectors.
- **F2 Writing.** Every place a board publishes a set level - 4.3B
  (`levelDragWriteTopic`), Knob, PaperS3 - goes through one
  `formatWrite()`; the asked value stays the unscaled number.
- **F3 Announce.** `"scaled-values"` in each board's DDF
  (`DeviceInfo.h`).
  Test: the native unit tests; a HIL fixture per lane (H1).

### Android (after S1-S3, S7, beside the firmware)

- **A1 Port.** `data/ScaledValue.kt`, the scale kind in
  `data/CombinedTopics.kt`; `ScaledValueTest.kt` and `LiveValueTest.kt`
  run the vectors.
- **A2 Writing.** `setLevel` in `MainActivity.kt` publishes through the
  write format.
- **A3 Announce.** `"scaled-values"` in the app's DDF.

### Hardware in the loop and the handbook

- **H1 HIL.** A fixture project with a scaled topic (a text chip and a bar
  reading it) and a slider with a write format, in `hil/waveshare/fixtures/`
  and the Android fixtures: a lane publishes the source and reads the
  scaled value back through `/api/topic-values`; a set level is heard on
  the broker as the formatted payload. In `test:quick`'s lanes.
- **H2 Handbook.** The combined topics page (the third kind), the level
  objects' page («Send as»), `handbuch/designer/bausteine.md` (scaling
  templates now become blocks; the «Not supported» examples brought up to
  date). Through maettel-humanizer.

## Order and checkpoints

S1 → S2 → S3 → S7 → (F1-F3 ∥ A1-A3) → S4 → S5 → S6 → H1 → H2.
The device work needs only S1-S3 and the contract; the editor and the
import come after it so nothing reaches a project that no device can show.
`test:quick` after each task; a release's `test:all` before H2 is done.

## Not in this stage

- A scale that is not linear (`log`, `sqrt`, a table) or reads two values.
- `int` as truncation (`F0` rounds).
- A text whose template maps values (live value rules) - stage 1's
  leftover, independent of this one.
