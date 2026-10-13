# Calculating in combined topics

Idea written down with the user on 2026-10-13, from Rajiva's first try of
Schaltli (forum.camper-bauen.de, topic 14107, page 2). His Home Assistant
light «Ambient Light» announces `brightness_scale` 32767. The Block menu
placed a slider for it, its fill right, but the number beside it read
`32767`. He asked how to make a percentage of it, and today there is no
way.

Status: idea. No spec yet. Issue #72.

## Problem Statement

How might a value that arrives in the device's own units - a PWM step, an
ADC reading, watts where kilowatts read better, two batteries that should
show as one - be shown the way a person reads it, without changing the
publisher and without Node-RED in between?

Today a **combined topic** («Add combined topic», handbook
`designer/topics.md#combined`) is the one thing a device works out itself,
and it only says yes or no from conditions. A level object's
**calibration** maps a value to a fill, but the number it shows is still the
raw value.

## Recommended Direction

Two parts, for two different cases.

**A level shows its fill as a percentage.** Slider, Dial, Bar and Gauge get
a choice of what their number says: the value, or the fill in percent.
Only the number changes. The calibration already turns the value into the
fill, and a finger's fill back into a value in the topic's units, rounded
to the step, which is what goes to the write topic - always, today
(`lib/settable-level.ts`). Rajiva's slider at half its length already
sends about 16384; only the `32767` beside it is the wrong thing to show.
A block from a Home Assistant light sets the choice to percent by default:
Home Assistant shows brightness in percent as well.

**A combined topic can calculate.** Next to «all» and «any», a third kind
takes one or more values and a formula: `a * 100 / 32767`, `a + b`,
`a / 1000`. Only the four operations, brackets and rounding, no
functions; the device works it out as it works out conditions today, and
it can be read everywhere a value is read. It is read-only: nothing writes
into a calculation, so it needs no inverse.

The first part answers Rajiva's case on its own and is smaller. The second
is the general tool for everything read-only.

## Key Assumptions to Validate

- [ ] **The percentage does not jump.** 16384 read back is 50.0015 %;
  check that the number shown after the answer comes back is the one the
  finger set, with the decimals the object shows.
- [ ] **A formula field is something users can fill in.** Try the wording
  with two or three people from the forum before building the parser.
- [ ] **The firmware has room for an expression evaluator.** Knob, 4.3B,
  PaperS3 and Android each need one; measure its size on the knob first.

## MVP Scope

In: «show as percent» on the four level objects, its default on blocks from
Home Assistant lights, the export and each device drawing it; a new system
generation. The calculation kind of combined topic after it, as its own
step.

## Not Doing (and Why)

- **A calculation in a value's chip in a text** - discussed 2026-10-13 and
  dropped: Bar, Gauge, Slider and Dial bind to the topic directly, so a
  chip's calculation would help only the text. A calculating combined
  topic can be read by every object.
- **Writing through a formula** - a formula has no general inverse; a
  settable value is already scaled by the calibration, both ways.
- **Functions, conditions inside formulas, text operations** - combined
  topics' conditions already cover the yes/no side; anything more is
  Node-RED's job.
- **Home Assistant `value_template`s with arithmetic** - the catalog still
  refuses them (`readPath` in `lib/ha-discovery.ts`); a calculation kind
  could take them over later.

## Open Questions

- Is «Combined topic» still the right name once one can calculate, or does
  it become «Calculated topic» beside it?
- Does the percentage show with or without the «%» sign by default?
