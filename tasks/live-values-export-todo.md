# Tasks: live values on the devices (`live-value-export`)

Plan: `tasks/live-values-export-plan.md` · Spec: `docs/2026-10-07-live-values.md`
· Issue #55. Chat German, docs English.

## Task 1: The export writes live values

**Description:** Both exports keep today's `text` (placeholders, the
unsayable left out) and `path` (a live icon's Otherwise icon) and add:
`properties.liveText` and `properties.liveValues` on a text;
`properties.liveIconId` and `liveValues` on an icon, each icon result with
its baked `path` / `pathDark` (boards: BMP per asset and colour, shared;
Android: `iconPathFor`); `combinedTopics` at the project level in
evaluation order. `LIVE_VALUE_GENERATION` 1.4 in `lib/system-generation.ts`;
the deploy dialog's «Not on devices yet» shows only for a device below 1.4.

**Acceptance criteria:**
- [x] A project without live values exports byte-identical to before (board and Android).
- [x] A text with three chips exports `text` as today and `liveText` / `liveValues` as authored; every icon result has a file in the zip.
- [x] A device announcing 1.4 gets no «Not on devices yet» warning; one announcing 1.3 does.

Done 2026-10-08. `exportedTextProperties` writes `text` (1.3) and
`liveText` / `liveValues` (1.4); `withLiveIconFallbacks` keeps a live icon
live with its Otherwise icon as `assetId`. A live icon is no longer
static: it stays out of the baked background on both exports, and every
icon it can show is baked (boards: `<object>~<branch>`, the path on the
result) or written as a tinted SVG (Android). `combinedTopics` in
evaluation order. `LIVE_VALUE_GENERATION` 1.4; the deploy warning shows only
below it. One change for old apps: an Android app below 1.4 draws no live
icon (it draws no icon of its own; the warning names it) - a 1.3 board
still draws the Otherwise icon. 4.3B HIL green.

**Verification:** `e2e/live-value.spec.ts` (export cases), `e2e/android-export.spec.ts`, `e2e/deploy-dialog.spec.ts`; knob + 4.3B HIL.

**Dependencies:** none · **Scope:** M

**Files likely touched:** `lib/project-zip.ts`, `lib/android-export.ts`,
`lib/asset-export.ts`, `lib/object-text.ts`, `lib/system-generation.ts`,
`components/deploy-dialog.tsx`

## Task 2: The device contract

**Description:** `docs/device-contract.md`: the new keys, the evaluation
rules (pointing at `lib/live-value.ts` and the vectors), combined topics in
evaluation order and when to recompute them, generation 1.4 and what a 1.3
device does with the file.

**Acceptance criteria:**
- [x] Every key Task 1 writes is described, with an example.
- [ ] The user has read the format once before Phase 2 starts.

Done 2026-10-08: `docs/device-contract.md` §2.6. The spec's «dependency
list» is gone from it (decided in the plan), its status updated. Waiting
for the user to read §2.6.

**Verification:** review.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `docs/device-contract.md`

## Checkpoint: Export
- [ ] A project without live values exports byte-identical (both exports)
- [ ] Knob and 4.3B HIL green on today's firmware

## Task 3: LiveValue and CombinedTopics in the firmware

**Description:** `src/project/LiveValue.{h,cpp}` and
`src/project/CombinedTopics.{h,cpp}`: plain C++ ports of
`lib/live-value.ts` (evaluate, matches, formats, `resolveLiveText`) and
`lib/combined-topics.ts` (order, evaluate, compute). `test/test_live_value/`
runs a byte-identical copy of `lib/live-value/vectors.json` (evaluate,
text, resolve, combined) and checks the copy against the designer's.

**Acceptance criteria:**
- [x] Every case of every section passes.
- [x] The copy check fails when the designer's file differs.

Done 2026-10-08 (schaltli-firmware). `evaluationOrder` is ported too: the
shared cases give combined topics in any order. `test:all` gains
`fw-native`, which runs `pio test -e native` (placeholders, live values,
popup fence) - it did not run the firmware's unit tests before.

**Verification:** `pio test -e native` (in schaltli-firmware).

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `src/project/LiveValue.{h,cpp}`, `src/project/CombinedTopics.{h,cpp}`,
`test/test_live_value/*`, `platformio.ini`

## Task 4: The loader reads live values and combined topics

**Description:** `ProjectLoader` parses `liveText`, `liveValues`,
`liveIconId` with result paths, and `combinedTopics`. After `setTopicValue`
on a topic any combined topic reads, all are recomputed in order;
`getTopicValue` / `hasTopicValue` answer `combined:<name>`.

**Acceptance criteria:**
- [ ] A 1.3-format project loads exactly as before.
- [ ] `/api/topic-values` shows combined topics following their inputs.

**Verification:** native test for the loader's parse (if separable), HIL via `/api/topic-values`.

**Dependencies:** Task 3 · **Scope:** M

**Files likely touched:** `src/project/ProjectLoader.cpp`, `src/project/ProjectTypes.h`,
`src/interfaces/IProjectLoader.h`

## Task 5: Drawing and redraw

**Description:** `renderLabel` draws `liveText` through the live values when
present; `renderIcon` draws a live icon's result path. One helper says
which objects read a topic, following live values and combined topics;
the Knob's `screenUsesTopic` / `renderTopicChangePartial` and the 4.3B's
`renderValueChangesPartial` use it. `SYSTEM_GENERATION_MINOR` 4 on all
three boards.

**Acceptance criteria:**
- [ ] A text and an icon reading a combined topic redraw when only that combined topic's input changes.
- [ ] Generation 1.4 in `hello`.

**Verification:** `pio run` for all three envs; HIL (Task 6).

**Dependencies:** Task 4 · **Scope:** M

**Files likely touched:** `src/project/ColorScreenRenderer.{h,cpp}`, `src/main.cpp`,
`src/boards/waveshare4v3b/main.cpp`, `src/boards/*/DeviceInfo.h`

## Task 6: HIL on the boards

**Description:** The knob smoke fixture and the 4.3B fixture get the live
value screen (three chips, a threshold icon, an icon on a two-level
combined topic); their orchestrators compare it in every combination,
including «no value yet» and a change of only a combined topic's input.

**Acceptance criteria:**
- [ ] 0 px difference on the Knob and the 4.3B in every combination.
- [ ] The PaperS3 runs it when reachable.

**Verification:** `npm run test:all` (knob, 4.3B).

**Dependencies:** Task 5 · **Scope:** M

**Files likely touched:** `hil/waveshare/fixtures/build-smoke-test.js`,
`hil/waveshare4v3b/…`, `hil/hil-combinations` helpers

## Checkpoint: Firmware
- [ ] `pio test -e native` green; knob + 4.3B HIL green with the new screen
- [ ] The user sees «Heizung läuft timer 3:23:18» on a board

## Task 7: LiveValue and CombinedTopics in the app

**Description:** `data/LiveValue.kt` and `data/CombinedTopics.kt`, ports as
in Task 3; `LiveValueTest.kt` runs a copy of the vectors with the same copy
check.

**Acceptance criteria:**
- [ ] Every case passes; the copy check works.

**Verification:** `gradlew testDebugUnitTest` (JAVA_HOME = Android Studio's jbr).

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `app/src/main/java/com/schaltli/android/data/LiveValue.kt`,
`…/CombinedTopics.kt`, `app/src/test/…/LiveValueTest.kt`, `app/src/test/resources/live-value-vectors.json`

## Task 8: The app draws live values

**Description:** `ProjectModels` reads `combinedTopics`; the screen derives
combined values from the topic map; `ScreenRenderer` draws `liveText`
through the live values and a live icon's result path; `TopicCollector`
subscribes to live sources and combined inputs. `SYSTEM_GENERATION` 1.4.

**Acceptance criteria:**
- [ ] The live value screen reads right in the app at every combination.
- [ ] A 1.3-format project shows as before.

**Verification:** unit tests; Task 9.

**Dependencies:** Task 7 · **Scope:** M

**Files likely touched:** `ProjectModels.kt`, `TopicValueResolver.kt`, `TopicCollector.kt`,
`ui/ScreenRenderer.kt`, `SystemGeneration.kt`

## Task 9: HIL on the phone

**Description:** `hil/android/fixtures/build-android-test.js` gets the live
value screen; the orchestrator compares it.

**Acceptance criteria:**
- [ ] The phone matches the designer's reference in every combination.

**Verification:** `node hil/android/orchestrator.js` with a phone attached.

**Dependencies:** Task 8 · **Scope:** S

**Files likely touched:** `hil/android/fixtures/build-android-test.js`, `hil/android/orchestrator.js`

## Checkpoint: Complete
- [ ] `npm run test:all` with what is connected
- [ ] Handbook warnings (`handbuch-macke #55`) removed; «ältere Firmware» says 1.4
- [ ] Spec status updated
