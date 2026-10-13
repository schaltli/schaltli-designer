# A level shows its fill in percent

Idea written down with the user on 2026-10-13, from Rajiva's first try of
Schaltli (forum.camper-bauen.de, topic 14107, page 2). His Home Assistant
light «Ambient Light» announces `brightness_scale` 32767. The Block menu
placed a slider for it, its fill right, but the number beside it read
`32767`. He asked how to make a percentage of it, and today there is no
way.

First written as «calculating in combined topics»; the calculating part
was dropped the same day, see «Not Doing».

Status: idea. No spec yet. Issue #72.

## Problem Statement

How might a level whose value arrives in the device's own units - a PWM
step, an ADC reading - show a number a person reads, without changing the
publisher and without Node-RED in between?

The calibration already turns the value into the fill, and a finger's fill
back into a value in the topic's units, rounded to the step, which is what
goes to the write topic - always, today (`lib/settable-level.ts`).
Rajiva's slider at half its length already sends about 16384. Only the
number beside it is wrong: it shows the value, `32767`, not the fill.

## Recommended Direction

Slider, Dial, Bar and Gauge get a choice of what their number says: the
value, or the fill in percent. Only the number changes; reading, the fill
and writing stay as they are. A block from a Home Assistant light sets the
choice to percent by default: Home Assistant shows brightness in percent
as well.

## Key Assumptions to Validate

- [ ] **The percentage does not jump.** 16384 read back is 50.0015 %;
  check that the number shown after the answer comes back is the one the
  finger set, with the decimals the object shows.

## MVP Scope

In: the choice on the four level objects, its default on blocks from Home
Assistant lights, the export and each device drawing it; a new system
generation. The handbook pages `objekte/anzeigen.md` (Bar, Gauge) and
`objekte/bedienen.md` (Slider, Dial).

## Not Doing (and Why)

- **Combined topics that calculate** (`a * 100 / 32767`, `a + b`) - Rajiva's
  case does not need them, and no other case asks for them yet. If one
  does, a third kind beside «all» and «any» is the place, read-only.
- **A calculation in a value's chip in a text** - discussed 2026-10-13 and
  dropped: Bar, Gauge, Slider and Dial bind to the topic directly, so a
  chip's calculation would help only the text.
- **Home Assistant `value_template`s with arithmetic** - the catalog still
  refuses them (`readPath` in `lib/ha-discovery.ts`).

## Open Questions

- Does the percentage show with or without the «%» sign by default?
