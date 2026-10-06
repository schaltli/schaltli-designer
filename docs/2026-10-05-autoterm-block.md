# The Autoterm block

Idea agreed with the user on 2026-10-05, after the bridge was moved onto
Pekaway's HTTP API for the Autoterm (commit a668037) and tried in the van
(Autoterm Air 2D on USB4). Builds on docs/2026-10-04-bridge-blocks.md.
Mockup (its runtime slider with stops is superseded by decision 3):
https://claude.ai/artifact/XmjDYTRnfj7T8eZUxB4fNE

Status: decisions only. No spec, no plan yet.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `level-current` | A level part in a block description may name the measured value's topic. Slider and dial already have «Topic» (fill), «Write topic» and «Setpoint topic» (handle); only the wiring is missing - `lib/bausteine.ts` never sets the setpoint topic. A few lines and a test | designer (`lib/block-description.ts`, `lib/bausteine.ts`) | - |
| `text-part` | A part that shows a topic's text as it comes, as wide as it needs | designer | - |
| `block-sections` | A description groups parts into sections; the Insert dialog ticks them, all ticked by default; some cannot be unticked | designer (format, dialog) | - |
| `bridge-autoterm` | The bridge's new values, commands, fuel counter and fault, and the block description using all of the above | `integrations/vanpi/` | the three above |

## The block, top to bottom

| Section | Parts | Can be unticked |
|---|---|---|
| (fault) | One line, red, only while there is a fault | never shown in the dialog: always there |
| Zustand | `state_text`: Bereit · Startet · Heizt · Lüftet · Kühlt ab · Störung | yes |
| Bedienung | Betrieb: Aus · Temperatur · Leistung · Lüften (one choice on `heater/view`); then by that view: target dial or slider, power level 1-10, or fan level 1-10 | no |
| Laufzeit | Switch «Timer»; while on, the dial «Laufzeit» 0-600 min | yes |
| Raumtemperatur | The room sensor's value | yes |
| Spannung | `voltage`, V | yes |
| Diagnose | heater temperature, fan rpm, pump Hz | yes |
| Verbrauch | `fuel_text` and a button «Nullen» | yes |

No weekly schedule: Pekaway's own scheduler stays where it is. The block
sees the heater running when the schedule starts it, as it reads Pekaway's
state; it does not say why.

## Decisions

1. **Power as a mode of its own.** The Betrieb choice has four options and
   writes `schaltli/cmnd/heater/view` (`off`, `target`, `power`, `fan`),
   matching `schaltli/state/heater/view`. The «Regelung» part goes. Home
   Assistant keeps its climate mode and preset.
2. **Target: the handle is the setpoint, the fill the measured room
   temperature** (the dial already works so, docs/2026-09-17-settable-level.md
   6b/6c). Up to 30 °C for an Autoterm, as Pekaway takes.
3. **Runtime as an egg timer** (changed the same day: a slider with stops
   was too much machinery for what it does). A switch «Timer»: off runs on
   without end; on sets 60 min. While it is on, a dial «Laufzeit», 0-600 min
   (Pekaway's limit), step 5: the handle is the runtime set (`runtime_m`,
   setpoint topic), the fill the time left (`runtime_remaining_s` in
   minutes, topic). The dial to 0 is the timer off. The dial is shown by
   the switch's own topic (`heater/timer_on`, a second switcher beside the
   one on `heater/view`). A new command `schaltli/cmnd/heater/runtime`: 0
   runs on without end, any other number sets the runtime anew without
   changing the mode; `schaltli/cmnd/heater/timer_on` = `on`/`off`.
   `schaltli/cmnd/heater/timer` stays as it is for Home Assistant (a number
   starts the heater for that long, 0 switches it off). While the heater is
   off the bridge keeps the runtime and sends it with the next start -
   Pekaway would otherwise start its countdown at once, heater off or not
   (seen in the van 2026-10-05). Issue #48 («Only these values») is not
   needed for this and stays open for the MaxxFan's speeds.
4. **A fault is always shown** - no silent failure. `schaltli/state/heater/fault`
   holds a German text, empty when there is none. Sources:
   - the heater: Pekaway's 2D status texts `no ignition error`,
     `no fuel? retry`, `flame-out`, and `unknown status`;
   - the heater's fault code, once Pekaway passes it on as `heaterror`
     (asked for in Pekaway's forum, 2026-10-05; Pekaway's 2D path skips
     that byte today). Texts from the Planar repair manual, table 2, below;
   - a command Pekaway's HTTP API refused or did not answer;
   - a start the heater did not follow: still «Bereit» 90 s after it.
   Not covered: a heater that stops answering altogether. Pekaway keeps
   reporting its last values; only values frozen for minutes would show
   it. To be judged in the van.
5. **Zustand in German**, from Pekaway's texts: standby → Bereit; glow
   plug, ignition, cooling flame sensor, starting, warming up → Startet;
   heating, running → Heizt; ventilation, only fan → Lüftet; cooling down,
   shutting down → Kühlt ab; a fault → Störung.
6. **Fuel used**, counted by the bridge: Σ pump Hz × time × 0.044 ml (pump
   TH11: 4.4 ml per 100 strokes; a constant in the bridge for another
   pump). Pekaway polls the heater every 6 s, so the count is an estimate.
   `fuel` (litres, a number, for Home Assistant), `fuel_since`,
   `fuel_text` («2.100 l seit 05.12.2024 18:00h», the Pi's time zone),
   retained, and read back after a Node-RED restart as the theme is.
   Reset: `schaltli/cmnd/heater/fuel` = `reset`.
7. **New values** beside these: `voltage`, `fan_rpm`, `pump_hz`, from
   Pekaway's `heatvolt`, `heatfan`, `heatglow` of the Autoterm. A 4D gives
   no fan or pump values in Pekaway's flow; those parts stay empty there.
8. **All sections ticked** when the block is inserted; what is not wanted is
   unticked in the dialog or deleted on the screen afterwards.
9. **Two columns** (asked the same day, after trying it: the whole block did
   not fit the 4.3B's 800 x 480). A part's `column` 1 or 2; in a block with
   any, a part without one spans the width. The fault and the mode across
   the top, then the controls left and the readings right, each column a
   stack of its own. Heater temperature, fan and pump in one line
   (`heater/diag_text`). A dial placed as a part is six lines of the block's
   font (144 px on the 4.3B) instead of a row's height, and a ring in a
   table keeps its Diameter field. Laid out at 8.66 px/mm the block is 409
   px high.
10. **Smaller still** (the user, the same evening, after placing it: still
    too big). The state and the fault merged into one small line at the top
    (`heater/status_line`: the fault while there is one, else the state; the
    Caption style, a description's `small`). Room temperature, voltage and
    diagnostics out of the block - their topics stay. Under the mode, side
    by side the mode's dial and the timer; at the bottom the fuel line with
    «Nullen» beside it. A description's `row` names a row of two columns, so
    several can stand one below the other; a side of a button alone takes
    what the button needs. Sections left: «Laufzeit», «Verbrauch». 382 px
    high at 8.66 px/mm.
11. **The timer a switch, the dials level, «Nullen» small** (the user, on
    the 4.3B). A description's `look` names the look a part comes in first
    ("switch" for the timer, where a switch is otherwise buttons only). Two
    sides of a row that each end in a dial or switcher stand at the bottom,
    so the mode's dial and the timer's are on one line, the same size. A
    new size step XS (control 5 mm, track 1.15 mm, icon 3 mm), and a
    description's `size` for a part: «Nullen» in XS.

## Fault codes (Planar repair manual 11.2017, table 2)

The texts for `heaterror`, once Pekaway delivers it. Codes 11 and 31-36 are
PLANAR-8DM only and left out. An unknown code shows «Störung, Code <n>».

| Code | Text |
|---|---|
| 01 | Überhitzung Wärmetauscher |
| 02 | Überhitzung Steuergerät |
| 04, 06 | Fühler im Steuergerät defekt |
| 05 | Temperatur- oder Flammfühler defekt |
| 07 | Überhitzungsfühler unterbrochen |
| 08, 29, 78 | Flammabriss im Betrieb |
| 09 | Glühkerze defekt |
| 10 | Gebläse erreicht Drehzahl nicht |
| 12 | Überspannung |
| 13 | Startet nicht, zwei Versuche fehlgeschlagen |
| 15 | Unterspannung |
| 16 | Fühler beim Vorlüften nicht abgekühlt |
| 17 | Brennstoffpumpe defekt |
| 20, 30 | Keine Verbindung Bedienteil – Steuergerät |
| 27 | Gebläsemotor dreht nicht |
| 28 | Gebläsedrehzahl nicht regelbar |

## Order

1. `level-current`, `text-part`, `block-sections`.
2. `bridge-autoterm`, then a run in the van with real Schaltli commands -
   including `stop/0` and a new target while heating, both untried so far.
