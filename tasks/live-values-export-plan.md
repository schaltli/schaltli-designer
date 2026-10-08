# Implementation plan: live values on the devices (`live-value-export`)

Spec: `docs/2026-10-07-live-values.md` (modules `live-value-export`,
`live-value-firmware`, `live-value-android`). Issue #55. Follows
`tasks/live-values-plan.md` (the designer part, done 2026-10-07). Tasks:
`tasks/live-values-export-todo.md`. Chat German, docs English.

Scope: the export format and device contract, the firmware (Knob, 4.3B,
PaperS3) and the Android app read live values, live icons and combined
topics; the handbook's three «Noch nicht auf dem Gerät» warnings go.
**Not** in scope: the migration of Live Icon, Live Line, Switcher and Switch
onto live values (its own plan afterwards).

## Overview

Today the export writes a live value back as the placeholder that says the
same, and leaves out what none can say (rules, durations, combined topics,
live icons). After this plan a device of generation 1.4 reads the live
values themselves - the same evaluation, ported line by line and held to
`lib/live-value/vectors.json` on all three platforms - while an older one
keeps getting exactly what it gets today.

## What the code says (read 2026-10-08)

- **Firmware:** `src/project/Placeholders.{h,cpp}` is plain C++ on
  `std::string`, native-tested (`pio test -e native`, Unity) against a
  byte-identical copy of the designer's vectors, the copy checked against
  `../schaltli-designer`. `ProjectLoader` reads one flat `ObjectProperties`;
  icons are baked BMPs whose `path` the export flattens onto the object or
  the rule. Redraw dependencies are worked out on the fly
  (`textNamesTopic`, `screenUsesTopic`, `collectTopics`; the 4.3B's
  `renderValueChangesPartial`); the PaperS3 redraws whole. Generation is
  `SYSTEM_GENERATION_MINOR` in three `DeviceInfo.h`, now 3.
- **Android:** `data/Placeholders.kt` is the same port, tested by
  `PlaceholdersTest.kt` against a copy of the vectors (`testDebugUnitTest`).
  Objects keep `properties` as a loose `JsonObject`; every MQTT message
  replaces the whole topic map and the screen recomposes, so nothing per
  object has to be invalidated. Icons for a live icon are tinted SVGs per
  rule (`iconPathFor`, `android-export.ts`). `SYSTEM_GENERATION = "1.3"`.

## Architecture decisions

- **Additive, both readings in one file.** A text keeps `properties.text`
  as today's interim export writes it (placeholders, the rest left out) and
  gains `properties.liveText` (with `{live:<id>}`) and
  `properties.liveValues`. An icon keeps `path` (its Otherwise icon) and
  gains `liveValues` whose icon results carry their own baked `path` /
  `pathDark`. The project gains `combinedTopics`. A 1.3 device ignores the
  new keys and shows what it shows today; a 1.4 device prefers them. No
  export has to know which device it is for, and a deploy needs no second
  build. `LIVE_VALUE_GENERATION` 1.4 drives the deploy warning, which then
  only appears for a device below 1.4.
- **One evaluation, three ports.** `LiveValue` and `CombinedTopics` are
  ported from `lib/live-value.ts` and `lib/combined-topics.ts` the way the
  placeholders were: plain C++ (native-tested, no Arduino), plain Kotlin
  (JUnit), each running a byte-identical copy of `lib/live-value/vectors.json`
  that is checked against the designer's original.
- **Combined topics ship in evaluation order, no dependency list.** The
  export writes `combinedTopics` already ordered (and refuses circular ones,
  as it does now). A device recomputes them all, in that order, after each
  message on a topic any of them reads - a few dozen comparisons at most.
  The spec's «dependents list» is not needed for that; it says so after
  this plan.
- **Redraw follows the reads.** «Which objects depend on topic T» extends
  to: a text whose live values read T, an icon whose live value reads T,
  and either of those reading a combined topic that reads T (directly or
  through others). One helper per platform answers it; the Knob's and the
  4.3B's partial redraw use it, the PaperS3 still redraws whole.
- **HIL proves it on glass.** Each board fixture and the Android fixture
  get the same screen: a text with three chips (yes / no, a duration that
  empties at 0, a number with No value yet), an icon with threshold rules,
  and an icon reading a two-level combined topic. The orchestrators compare
  the device's snapshot with the designer's reference in every topic
  combination, as they do for every other object.

## Task list

### Phase 1: Export and contract (designer)
- [ ] Task 1: Both exports write `liveText`, `liveValues` (icon results baked) and `combinedTopics`; `LIVE_VALUE_GENERATION` 1.4 and the deploy warning only below it
- [ ] Task 2: The device contract describes live values and combined topics

### Checkpoint: Export
- [ ] A project without live values exports byte-identical to today (both exports); knob + 4.3B HIL green on 1.3 firmware

### Phase 2: Firmware (`schaltli-firmware`)
- [ ] Task 3: `LiveValue` and `CombinedTopics` in plain C++, native-tested against the shared vectors
- [ ] Task 4: The loader reads them; combined topics are recomputed on every message they read
- [ ] Task 5: Texts and icons draw through live values; partial redraw follows live and combined reads; generation 1.4
- [ ] Task 6: HIL: the live value screen on the Knob and the 4.3B (PaperS3 when reachable)

### Checkpoint: Firmware
- [ ] `pio test -e native` green; knob + 4.3B HIL green including the new screen; the user sees «Heizung läuft timer 3:23:18» on a board

### Phase 3: Android (`schaltli-android`)
- [ ] Task 7: `LiveValue.kt` and `CombinedTopics.kt`, unit-tested against the shared vectors
- [ ] Task 8: Texts and icons draw through live values, combined topics derived from the topic map, subscriptions follow; generation 1.4
- [ ] Task 9: HIL: the live value screen on the phone

### Checkpoint: Complete
- [ ] `npm run test:all` with what is connected
- [ ] Handbook: the three «Noch nicht auf dem Gerät» warnings (`handbuch-macke #55`) removed, «ältere Firmware» says 1.4
- [ ] Spec status updated; #55 can close once the migration plan exists

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Partial redraw misses an object reading a combined topic | High | One dependency helper per platform, a HIL case where only a combined topic's input changes |
| Three ports drift | High | Byte-identical vectors with the copy check, as for placeholders |
| The export grows for icon-heavy rules (one bitmap per icon result, light and dark) | Med | Bake per asset and colour once, shared by every rule that uses it (keyed like Android's `iconPathFor`) |
| PaperS3 not reachable for HIL | Med | Same renderer as the 4.3B; run its HIL when it is back, before closing #55 |
| Phone not connected for Android HIL | Med | Unit tests carry the logic; HIL when a phone is attached |

## Open questions

- None that block Phase 1. Before Phase 2 the user should see the export
  format (Task 2) once, since it is the contract the firmware is written to.
