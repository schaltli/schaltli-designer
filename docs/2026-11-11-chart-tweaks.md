# Chart tweaks

Spec drafted 2026-11-11 from the starter's block review with the user
(`tasks/bausteine-review.md`, «Chart»; draft «Chart im Starter» linked
there). **Status: approved by the user on 2026-11-11.** Small changes to the
chart object of docs/2026-10-16-charts.md; the compact form is in
docs/2026-11-11-value-cards.md.

## Objective

On the starter's «Temperaturen» the curves stick to the top of the plot,
the axes are labelled small, and «Solar» says «No history yet» with an
axis from 0.00 to 1.00 and a series called «power». The user chose form A:
the chart alone in a card, the legend top left with each series' value
now, the time range small top right, 24 h with pinch.

## Decisions (the user, 2026-11-11)

1. **«Automatic» starts at 0 only for power and percent.** A series of
   kind power, or with the unit «%», keeps today's rule (from 0 when
   nothing is below it). Any other level - a temperature, a voltage - gets
   an axis round its values, out to the next tick either side. A chart with
   both on one axis follows the rule for power.
2. **A series is named from discovery**, where its topic has a name there
   (Home Assistant's or the bridge's), not from the topic's last segment.
   A chart made from controls or energy nodes keeps taking their names.
3. **The simulation invents a course** where the recorder has none yet: a
   plausible day for the series' kind and range (a temperature that cools
   at night, solar that rises and falls with the sun, a level that steps),
   in the designer's preview and simulation only - never on a device, and
   marked in the preview as invented.
4. **The time range stands top right, small**, in the date font where the
   day names stood: «heute 11.11.» for today's 24 h, «letzte 6 h» and
   «letzte Stunde» for the shorter ranges, «5.–11.11.» for seven days, a
   past day as «Mi 10.11.». The words follow the project's language as the
   day names do.
5. **The starter's charts**: form A - in a card, legend top left with
   «current» per series, min or max marked, sum for power; axis labels in
   the 4"'s Standard size; the screens' time range 24 h with pinch in/out
   mapped to widen/narrow (charts spec decision 15, already built).

## Testing

- `e2e/chart-layout*.spec.ts`: the axis rule per kind and unit; the
  range label per range and snap.
- Block/chart builder: a series' name from discovery.
- Preview: an invented course with no history, marked; none once history
  arrives.
- HIL conformance: a temperature chart's axis on the boards.
- Handbook: the chart's page (axis «Automatic», the range label).

## Success criteria

- The starter's «Temperaturen» fills its plot; «Solar» shows a course in
  the designer before any history and its real one on the 4" after.
