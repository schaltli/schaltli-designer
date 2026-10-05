# Tasks: placeholders on the devices

Spec: docs/2026-10-05-placeholder-devices.md. Plan: tasks/placeholder-devices-plan.md.
Chat German, docs English.

## Task 1: Designer export - separators, declared topics, device contract

**Description:** The device export (`lib/project-zip.ts`) and the Android
export (`lib/android-export.ts`) write `decimalSeparator` and
`thousandsSeparator` into the device project; every topic a text references
is declared in the exported `topics` (added if the project lacks it). The
device contract (`docs/device-contract.md`) describes the language and the
two fields for device authors.

**Acceptance criteria:**
- [x] An exported project carries both separators as the project sets them; the default `.` and `'` when it sets none.
- [x] A text referencing an undeclared topic exports with that topic declared.
- [x] `project:name` stays baked in; every other placeholder reaches the device as written.

**Verification:** `npx playwright test e2e/placeholders.spec.ts` (export cases, no browser)

**Dependencies:** none · **Files:** `lib/project-zip.ts`, `lib/android-export.ts`, `docs/device-contract.md`, `e2e/placeholders.spec.ts` · **Scope:** S

## Task 2: Firmware evaluator, native env, vectors

**Description:** `src/project/Placeholders.{h,cpp}` on `std::string`: parse,
format a number (F/N, rounding on the decimal digits, the two separators),
resolve a text with a lookup that returns a value or "never arrived". A
PlatformIO `native` env and `test/test_placeholders/` run a byte-for-byte copy
of the designer's `vectors.json`, and check the copy against
`../schaltli-designer/lib/placeholders/vectors.json` when it is there.

**Acceptance criteria:**
- [x] Every vector passes under `pio test -e native`.
- [x] A copy that differs from the designer's fails the test; without the designer beside it the check is skipped and says so.
- [x] The three board envs still build.

**Verification:** `pio test -e native`; `pio run -e waveshare-knob-touch-lcd-1v8 -e waveshare-touch-lcd-4v3b -e m5stack-papers3`

**Dependencies:** none · **Files:** firmware `src/project/Placeholders.{h,cpp}`, `platformio.ini`, `test/test_placeholders/` · **Scope:** M

## Task 3: Android evaluator, unit tests over the vectors

**Description:** `data/Placeholders.kt` with the same shape and rules; a
JUnit test over a copy of `vectors.json` in `app/src/test/resources/`, with
the same byte-for-byte check against the designer beside it.

**Acceptance criteria:**
- [x] Every vector passes under `gradlew :app:testDebugUnitTest`.
- [x] A differing copy fails; no designer beside it skips the check and says so.

**Verification:** `gradlew :app:testDebugUnitTest`

**Dependencies:** none · **Files:** android `data/Placeholders.kt`, `app/src/test/.../PlaceholdersTest.kt`, `app/src/test/resources/placeholder-vectors.json` · **Scope:** M

## Checkpoint A - the vectors on all three platforms
- [x] Designer, firmware (native) and Android pass the same vectors
- [x] All three board envs build; the app builds
- [ ] Review with the user

## Task 4: Firmware - texts resolved and redrawn, separators, device fields

**Description:** `ProjectConfig` gets the two separators (ProjectLoader reads
them, `.` and `'` when absent). `renderLabel` resolves a text that contains
`{` before it is drawn: `topic:` from the value store (with `#json.path`),
`device:id` the MQTT client id, `device:model` the board's DDF name compiled
in. On the 4.3B and the PaperS3 a text is redrawn when a topic it references
changes.

**Acceptance criteria:**
- [x] A text `Wasser {topic:…/level:F0} %` shows the value and follows it on the 4.3B.
- [x] `{device:model}` and `{device:id}` show the board's name and its id.
- [x] The project's separators apply to F and N formats.

**Verification:** board builds; HIL on the 4.3B (Task 6's specimen, or by hand before it)

**Dependencies:** Task 2 · **Files:** firmware `ProjectTypes.h`, `ProjectLoader.cpp`, `ColorScreenRenderer.cpp`, the DDF header generation, `src/boards/waveshare4v3b/main.cpp`, `src/boards/papers3/main.cpp` · **Scope:** M

## Task 5: Firmware - the knob learns the references

**Description:** On the knob `collectTopics` and `screenUsesTopic` take the
topics a text references, and the partial redraw redraws such a text when
one of them changes.

**Acceptance criteria:**
- [x] A text referencing a topic not bound to any object is subscribed and follows it.
- [x] A change on one of several topics in one text redraws that text, nothing else on the screen.

**Verification:** knob build; HIL live check on the knob

**Dependencies:** Task 4 · **Files:** firmware `src/main.cpp` · **Scope:** S

## Task 6: Firmware - generation 1.2; HIL specimen with placeholders

**Description:** `SYSTEM_GENERATION_MINOR` 2 on the three boards. The HIL
conformance `text` specimen gains texts with placeholders - a topic with F
and N formats, a `??` fallback, `{device:model}` - each topic example a
combination; a live check publishes a value and compares again.

**Acceptance criteria:**
- [x] The boards announce 1.2; the designer's deploy dialog shows no placeholder warning for them.
- [x] HIL conformance passes on the knob and the 4.3B, 0 px (PaperS3 when connected).
- [x] A published value changes the text on both boards without a deploy.

**Verification:** `npm run test:all` with the knob and the 4.3B on the network

**Dependencies:** Tasks 4, 5 · **Files:** firmware `src/boards/*/DeviceInfo.h`; designer `hil/conformance/specimens.js`, `hil/conformance/build-project.js` · **Scope:** M

## Task 7: Android - texts resolved, topics collected, separators, 1.2

**Description:** `TopicCollector` collects a text's references; `Project`
reads the two separators; `ScreenRenderer` hands `TextBoxView` the resolved
text, recomposed when a referenced value changes; `device:id` and
`device:model` from DeviceIdentity. `SYSTEM_GENERATION` 1.2 in
`MqttRepository` and `DdfBuilder`.

**Acceptance criteria:**
- [x] Unit tests: the references collected, the separators read, both generation places at 1.2.
- [ ] On a phone a placeholder text follows its topic (by hand, with the van's broker or the local one).

**Verification:** `gradlew :app:testDebugUnitTest`; the app built and tried on a phone

**Dependencies:** Task 3 · **Files:** android `data/TopicCollector.kt`, `data/ProjectModels.kt`, `ui/ScreenRenderer.kt`, `ui/objects/TextBoxView.kt`, `mqtt/MqttRepository.kt`, `ddf/DdfBuilder.kt` · **Scope:** M

## Checkpoint B - on the knob, the 4.3B and a phone
- [x] HIL green on the knob and the 4.3B, 0 px
- [ ] A phone shows a placeholder text live
- [ ] Review with the user

## Task 8: Handbook, device contract, full run

**Description:** The handbook says devices resolve placeholders (from
generation 1.2) instead of showing them as written; the warning before a
deploy is described for older firmware only. Humanized. Full e2e and
`npm run test:all`.

**Acceptance criteria:**
- [x] Handbook updated, labels test and build green.
- [ ] `npm run test:all` green but for what needs a device not connected.

**Dependencies:** Tasks 1-7 · **Files:** `handbuch/objekte/anzeigen.md` and wherever the warning is described · **Scope:** S

## Task 9: Releases - firmware and APK (asked first)

**Description:** With the user's go: firmware through
`tools/release-firmware.js` (dry run, notes from CHANGES.txt, `--publish`),
the manifest committed in the designer; the app's APK built and attached to
the same GitHub release.

**Acceptance criteria:**
- [ ] A release whose manifest names generation 1.2 for every board, with the APK attached.
- [ ] The designer on `main` offers it under Deploy to Device.

**Dependencies:** Task 8 · **Scope:** S

## Checkpoint C - complete
- [ ] Every success criterion of the spec ticked
- [ ] Review with the user
