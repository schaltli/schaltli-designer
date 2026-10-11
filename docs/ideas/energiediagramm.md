# Energy diagram

Idea refined with the user on 2026-10-11, after the demo's page «Energie»
was built from today's objects (`deploy/demo/camper-project.ts`) and found
to fall short of a good energy diagram. Mockup of both modes, with the
demo van's four situations:
https://claude.ai/artifact/Fe7crSShAaeheK9UidGtcN

## Problem Statement

How might we show, on a van's display, at a glance where energy comes from
right now, how much, and where it goes - honestly, from what is measured,
and as nicely as Victron's VRM or a Home Assistant power flow card?

Today's page is put together from texts, live icons, a gauge and dotted
lines. Its lines lie still and grey, 6 W and 600 W look alike until one
reads the number, and what draws hangs under the battery although a
charger often feeds it directly (measured in the van on 2026-10-11: the
mains charger 7 A, the battery about 0 A, the fridge on the charger).

For the 4.3B and the Android app, in the demo and in the user's van alike.

## Recommended Direction

A new object, **energy diagram**, with a list of **nodes** (UI «Nodes»,
handbook «Knoten»). Each node has a role - source, sink or storage -, a
name, an icon, a read topic for its watts and up to three lines of live
text. A storage has a second read topic, its charge. A node may be the
**rest**: it has no topic, and the object works out what comes in and is
not measured going out - what the van's consumers draw, so no Node-RED
flow and no bridge has to sum it.

The object has two modes on the same nodes:

- **Sankey**: sources on the left, sinks on the right, a band's width its
  watts, all bands through the 12 V bus in the middle - never from a source
  straight to a sink, since nobody measures who feeds whom. A storage
  changes sides with its sign: charging it is a sink (green), giving it is
  a source (red). The nodes' y gives their order.
- **Flow**: the bus in the middle, each node a circle at its own x/y, a
  straight line to the bus, thicker with more watts. A storage shows its
  charge as a ring.

In both, dots run along the bands and lines while watts flow, faster with
more, towards the bus while a node gives and away while it takes. A node
with nothing flowing is grey and still. A tap on a node can open a popup -
the details (volts, amps, charge phase) one level down, with the popup
screens Schaltli already has.

The live lines are the live values texts already have (`{live:...}` with
rules, format, No value yet), so the time to go is a line of the battery
node: «noch {ttg}», from `schaltli/state/battery/time_to_go`, which the
VanPi bridge publishes since 2026-10-11 from Pekaway's own figure.

## Key Assumptions to Validate

- [ ] **Motion on the 4.3B.** Running dots mean redrawing small areas some
  ten times a second; today the board redraws only when a value changes.
  Test: a firmware spike with five running lines, measuring frame rate,
  panel bandwidth (`hil/waveshare4v3b/panel-bandwidth.js`) and touch
  latency, before anything else is built.
- [ ] **Filled bands on the ESP32.** The firmware draws no curved filled
  shapes yet. Test: in the same spike, one band compared pixel for pixel
  with the designer's, as every object is (the HIL snapshot diff).
- [ ] **Values arrive at different times.** Chargers and battery report
  separately; for a moment the balance is wrong and the rest jumps. Test:
  watch the demo van and the user's van; settle the rest only after a
  short calm, or smooth it.
- [ ] **Signs are not the same everywhere.** Some devices report discharge
  as positive. A node gets «reverse sign». Test: the user's three sources
  (Victron BLE, Pekaway shunt, Ective) all come in the right way round.

## MVP Scope

In: the object in the designer (inserting, nodes list in the property
panel, dragging nodes in the flow mode, the preview), both modes, the rest
node, up to three live lines per node, a tap opening a popup, motion, the
export, a new system generation, the 4.3B and the Android app. The demo's
page «Energie» rebuilt from it.

Out of the first version: everything under «Not Doing».

## Not Doing (and Why)

- **History and daily totals** - the user put them later; they need a
  store over time, which no device has.
- **Bands from a source straight to a sink** - who feeds whom is not
  measured; the diagram would have to invent it.
- **The PaperS3 and the Knob** - e-paper cannot move and the knob is round
  and small; their descriptions declare the object unsupported rather than
  showing half of it. A ring mode for round displays may come later.
- **Volts and amps inside the diagram itself** - it shows watts; anything
  else is a live line, or a text beside it.
- **Curved or routed lines in the flow mode** - straight to the bus keeps
  editing and firmware simple.
- **Warning colours by rule, the diagram as idle screen, insertion through
  Bausteine** - good next steps, after the first version stands.

## Open Questions

- Decided 2026-10-11, see `docs/2026-10-11-energy-diagram.md`: the bus
  has its own x/y; colours come from six theme roles; a firmware spike on
  the 4.3B comes first.
- Pekaway's time to go is only in Node-RED's globals; ask Pekaway to put
  it into `pkw/tele/batt`, so the bridge need not read an internal
  variable?
