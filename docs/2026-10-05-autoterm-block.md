# The Autoterm block

Idea agreed with the user on 2026-10-05, after the bridge was moved onto
Pekaway's HTTP API for the Autoterm (commit a668037) and tried in the van
(Autoterm Air 2D on USB4). Builds on docs/2026-10-04-bridge-blocks.md; needs
issue #33 («Only these values», sketched in docs/2026-10-04-ring-adjust.md,
section «Later: step mode for calibration points»). Mockup:
https://claude.ai/artifact/XmjDYTRnfj7T8eZUxB4fNE

Status: decisions only. No spec, no plan yet.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `only-these-values` | Issue #33: calibration points as the only values a slider or dial takes, in list order, each with a label; the fill between two points in proportion | designer, firmware, Android | - |
| `level-current` | A level part in a block description names a second topic for the fill: the measured value, while the handle is the setpoint | designer (`lib/block-description.ts`, `lib/bausteine.ts`) | - |
| `text-part` | A part that shows a topic's text as it comes, as wide as it needs | designer | - |
| `block-sections` | A description groups parts into sections; the Insert dialog ticks them, all ticked by default; some cannot be unticked | designer (format, dialog) | - |
| `bridge-autoterm` | The bridge's new values, commands, fuel counter and fault, and the block description using all of the above | `integrations/vanpi/` | the four above |

## The block, top to bottom

| Section | Parts | Can be unticked |
|---|---|---|
| (fault) | One line, red, only while there is a fault | never shown in the dialog: always there |
| Zustand | `state_text`: Bereit · Startet · Heizt · Lüftet · Kühlt ab · Störung | yes |
| Bedienung | Betrieb: Aus · Temperatur · Leistung · Lüften (one choice on `heater/view`); then by that view: target dial or slider, power level 1-10, or fan level 1-10 | no |
| Laufzeit | Runtime slider, in the Temperatur, Leistung and Lüften panels | yes |
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
3. **Runtime as a slider with stops** (`only-these-values`): 30′ · 1h · 1.5 ·
   2h · 3h · 4h · 6h · 8h · 10h · ∞, values in minutes, ∞ = 0 at the right
   end. Pekaway takes at most 600 min; longer is ∞. The handle is the
   runtime set (`runtime_m`), the fill the time left (`runtime_remaining_s`),
   in proportion between two stops. «30′» sits at about 8 % of the track, so
   the last half hour still shows as a shrinking fill; nothing in that piece
   can be picked. A new command `schaltli/cmnd/heater/runtime`: 0 runs on
   without end, any other number sets the runtime anew without changing the
   mode. `schaltli/cmnd/heater/timer` stays as it is for Home Assistant
   (a number starts the heater for that long, 0 switches it off). While the
   heater is off the bridge keeps the runtime and sends it with the next
   start - Pekaway would otherwise start its countdown at once, heater off
   or not (seen in the van 2026-10-05).
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

1. `only-these-values` (#33), its own spec and plan; the MaxxFan's ten
   speeds want it too.
2. `level-current`, `text-part`, `block-sections`.
3. `bridge-autoterm`, then a run in the van with real Schaltli commands -
   including `stop/0` and a new target while heating, both untried so far.
