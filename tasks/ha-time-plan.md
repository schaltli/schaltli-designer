# Plan: ha-time - a time the screen can set

Second of the components left from the 2026-10-26 overview that need input
the devices do not have yet (after `text`, tasks/ha-text-plan.md): an MQTT
`time`, the start time of a parking heater, a timer's end, an alarm. Asked
for by the user 2026-10-27 («ja schreib ein plan und beginn mit einem
artifact zum ausprobieren»). `date` and `datetime` exist in MQTT too and
would reuse what this builds; not in this plan.

Source: `homeassistant/components/mqtt/time.py` (branch `dev`, read
2026-10-27). An MQTT time has `command_topic`, `command_template`,
`state_topic`, `value_template`, nothing else - no range, no step, no mode.
It reads whatever `dateutil.parser.parse` takes and keeps the time of day
(a whole ISO date and time too, its time as written, no time zone
conversion); it sends `time.isoformat()`: `14:30:00`, seconds always, no
fraction for a whole second.

Repos: `schaltli-designer`, `schaltli-firmware` (4.3B, Knob, PaperS3),
`schaltli-android`.

## What carries over from the text field

The object pattern (type in the DDF's `supportedObjectTypes`, export as
is, theme roles), the look of the field (container, line, value; lib/text-
field.ts's geometry), the asked value until the topic answers, the
keyboard's way of taking every contact while it is open, `/api/keyboard`'s
idea for a test (here: the open picker as JSON), the import's rule for a
command template other than `{{ value }}` (read only).

## Decisions (settled with the user 2026-10-27, after trying the artifact)

1. **A new object: «Time field».** `type: "time-field"`, among the
   operating objects: the time in a field like the text field's, tapped it
   opens a picker. Properties: Topic, Write topic, «Minute step» (1, 5, 10,
   15, 30; **default 5**, the user: «standard 5 minuten, aber auf eine
   änderbar»), the field's colours and font. No seconds anywhere.
2. **What is read.** `HH:MM`, `HH:MM:SS` (a fraction ignored) or an ISO
   date and time, of which the time as written is kept. Anything else
   shows «--:--», as nothing heard yet does. **Always 24 hours** (`14:30`,
   «military time»), whatever the keyboard's language.
3. **What is sent.** `HH:MM:00`, Home Assistant's own `isoformat()`. The
   minute is **rounded onto the step** - on every device, the phone too,
   whose picker knows no step: OK rounds what it took. A reported minute
   off the step opens the picker on the nearest one.
4. **The picker per device.**
   - 4.3B and Knob: **two wheels**, hours and minutes, that follow the
     finger **continuously** and **snap on release**, the way a swipe
     between screens settles; a quick flick runs on a few steps. A tap on a
     neighbour brings it to the middle. OK, Cancel. The Knob's ring takes
     no part (the user: «der Ring ist nicht nötig»).
   - PaperS3: a button above and below hours and minutes (A): a wheel that
     follows a finger would cost a refresh per pixel step on e-paper.
   - Phone: Android's own time picker (24 hours), OK rounding onto the step.
5. **Gated by the type.** `"time-field"` in each DDF's
   `supportedObjectTypes`, as the text field.
6. **The import.** An MQTT `time` becomes a catalog control `{ kind:
   "time-field", read?, write }`, a placed block a Time field with the
   default step. A `command_template` other than `{{ value }}` leaves it
   read-only, a text showing the time.

## Tasks

### Designer

- **T0 The artifact.** https://claude.ai/artifact/9uyxiLRN9YDUYtzkUX25cZ -
  the pickers to try; decisions settled 2026-10-27.
- **D1 The object.** Type, drawing, panel, the preview's picker (the
  browser's own time input), lib/time-field.ts (parse, format, step) with
  its cases. Test: e2e/time-field.spec.ts; property-panel-controls.json.
- **D2 Export.** Both exports carry it. Test: in the same spec.
- **D3 The import.** `case "time"` in lib/ha-discovery.ts, the block.
  Test: e2e/ha-discovery.spec.ts with the docs' example, e2e/bausteine.spec.ts.
- **D4 Handbook.** objekte/bedienen.md «Time field», bausteine.md.

### Firmware

- **F1 Drawing** on the three boards (TimeField.h ported from
  lib/time-field.ts, native tests), DDFs, a conformance specimen.
- **F2 The picker** per board as decided in T0; `/api/picker` for tests;
  a HIL script that sets 06:45 by drags (4.3B, Knob) or taps (PaperS3),
  sends `06:45:00` and cancels.

### Android

- **A1** Drawing, the system time picker, the DDF; a screen in the
  Android HIL.

### Checkpoint

`npm run test:all` (detached, see memory «Lange Läufe abgekoppelt»), COM3
logged.

## Not in this plan

`date`, `datetime` (a date picker; `datetime` with its time zone rule);
12-hour display; seconds.
