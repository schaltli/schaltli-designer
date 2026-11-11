# VanPi bridge: what the starter's review needs

Spec drafted 2026-11-11 from the starter's block review with the user
(`tasks/bausteine-review.md`). **Status: approved by the user on 2026-11-11.**
Changes to `integrations/vanpi/bridge-logic.js` and its Node-RED tab;
installing on the van stays the user's.

## Decisions (the user, 2026-11-11)

1. **Dimmers as `number`**, not `light`: 0-100, unit «%», `mode:
   slider`, state from `dimmer/<n>/level`, command `dimmer/<n>` (takes a
   number today). In the designer a dimmer is then a slider. Home
   Assistant loses the light card, «all lights off» and going back to the
   last brightness (`on_level`) - accepted.
2. **The heater's «on»**: a command `heater/view` with payload `on` that
   starts the heater in the last mode it ran in (temperature, power or
   fan), remembered by the bridge; the block's Korry «Heizung» writes
   `on`/`off`. The block description gains the switch part; the four-mode
   choice becomes three modes (Temperatur | Leistung | Lüften), shown
   faint while off.
3. **The time**: every minute the bridge writes `schaltli/state/time`
   («18:31») and `schaltli/state/date` («Mi 11.11.», German day names)
   retained, from an inject node on its tab. The master's header shows
   them as live text - no new code in designer or firmware.
4. **The MaxxFan block** gains the switch part «Lüfter» on
   `maxxfan/power` (exists) and «Deckel» as a switch; its mode choice
   becomes Hand | Auto; «Luft» Rein | Raus.

## Testing

- `integrations/vanpi` unit tests: the number discovery for a dimmer;
  `heater/view on` after each mode; the time and date payloads; the
  block descriptions' new parts.
- The designer's Prebuilt from the new descriptions (e2e).
- On the van, by the user: the dimmer as a slider, the heater on and off
  without heating longer than asked, the header's clock.
