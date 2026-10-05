# Implementation Plan: placeholders on the devices

Spec: docs/2026-10-05-placeholder-devices.md (sub-module `placeholder-devices`
of docs/2026-09-25-text-placeholders.md). Tasks: tasks/placeholder-devices-todo.md.
Three repos: schaltli-designer, schaltli-firmware, schaltli-android.

## Overview

The knob, the 4.3B, the PaperS3 and the phone learn to resolve the
placeholders the designer writes into a `text` object's text - the same
evaluator rules on every platform, held together by the shared vectors - and
then announce system generation 1.2, which ends the designer's deploy
warning. The designer exports what a device needs for it: the two separators
and every referenced topic declared.

## Architecture decisions

- **One evaluator per platform, one set of vectors.** `lib/placeholders.ts`
  stays the reference; the firmware's `Placeholders.{h,cpp}` and Android's
  `Placeholders.kt` follow its shape (parse, format a number, resolve with a
  lookup). `lib/placeholders/vectors.json` is copied byte for byte into both
  repos; each test fails on a copy that differs from the designer's beside it.
- **The firmware evaluator on `std::string`** (settled 2026-10-05), no
  Arduino: a PlatformIO `native` env runs the vectors on the PC. The renderer
  converts to and from `String` at its edge.
- **Only `text` objects** - a level's own label is gone since 2026-09-29.
- **The device keeps only declared topics** (ProjectLoader::setTopicValue),
  so the export guarantees every referenced topic is declared rather than the
  firmware learning to keep undeclared ones.
- **`device:model` is the DDF's full name**, compiled into the firmware from
  `device.json` (settled 2026-10-05); on Android the marketing name.
- **Generation 1.2 last on each platform**, once it resolves - a device that
  announced it early would silence the warning while still showing `{…}`.
- **Releases are asked for first**: firmware through release-firmware.js
  (dry run, notes, publish), the APK attached to the GitHub release
  (settled 2026-10-05).

## Task list

### Phase 1: the evaluators
- [x] Task 1: Designer export - separators, referenced topics declared, device contract
- [x] Task 2: Firmware evaluator on std::string, native env, vectors
- [x] Task 3: Android evaluator, unit tests over the vectors

### Checkpoint A: the vectors on all three platforms
- [ ] Review with the user

### Phase 2: on the devices
- [x] Task 4: Firmware - texts resolved and redrawn (4.3B, PaperS3), separators, device fields
- [x] Task 5: Firmware - the knob's topics and partial redraw learn the references
- [ ] Task 6: Firmware - generation 1.2; HIL specimen with placeholders
- [ ] Task 7: Android - texts resolved, topics collected, separators, generation 1.2

### Checkpoint B: on the knob, the 4.3B and a phone
- [ ] Review with the user

### Phase 3: ship
- [ ] Task 8: Handbook, device contract, full run
- [ ] Task 9: Releases - firmware and APK (asked first)

### Checkpoint C: complete
- [ ] Review with the user

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The knob's partial redraw only knows bound objects; texts with several topics redraw wrongly or not at all | High | Task 5 on its own, with a live HIL check: a published value changes the text |
| Bitmap fonts lack a separator (`'`, a space is fine) | Med | HIL specimen renders N formats with the Swiss preset; a missing glyph shows in the comparison |
| Decimal rounding differs between C++, Kotlin and TS | Med | rounding on decimal text, as the spec says; the vectors cover the edge cases (75.195, -2.5) |
| An undeclared topic silently empty on a device | Med | Task 1 makes the export declare every reference; an e2e test checks it |
| Android hard-codes the generation in two places | Low | Task 7 changes both, a unit test reads both |
| String conversion cost on every redraw on the knob | Low | resolve only texts that contain `{`; measured in the HIL bandwidth checks already run |

## Open questions

None open - the spec's three were settled on 2026-10-05.
