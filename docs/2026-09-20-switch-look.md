# The Switch: a button group, and a switch with a knob

Agreed 2026-09-19/20, after the slider and the button. The old Switch was a
square box with a grey border, dividers between its segments and a coloured bar
along the top of the active one - the same foreign body the button had been.

The user found the target himself, in Material's own documentation: the strip
the docs use to change what a page shows. It is Material 3's **connected button
group**, and Material has retired the segmented button in favour of it: the
group sits in a rounded container of its own, the buttons are 2 dp apart, and
selecting one changes that button's shape and colour rather than adding
anything between them.

## Decisions

**1. Two forms, from the `mode` the object already has.**

- `segmented` -> a **connected button group**: one container, every state side
  by side in it, the reported one as its own pill.
- `single` -> a **switch**: a track with a knob standing at one of n positions,
  the state's icon on the knob and its label beside it. n is normally 2.

The switch form was the user's own correction of a proposal that would have
made the single-area mode look exactly like a button: "der switch schaut dann
aber gleich aus wie ein button ... vielleicht wäre eine modifizierte form des
m3 switch besser? eine pille mit enthaltener kugel, die an n positionen stehen
kann." A switch reads as a switch, and for two states it is the control
everybody already knows from a phone.

**2. One colour, as everywhere else.** `switchColor`, and `switchStyle` says how
loud the chosen state is: `filled` (the colour itself, the default) or `tonal`
(the colour halfway to the background - the slider's own empty track, so a
switch, a tonal button and a slider on one screen are one family). Both are
offered because they cost one colour decision and Material itself lets a group
take either. The label on any of them is white or black by Material's tone rule.

`backgroundColor`, `activeBackgroundColor`, `borderColor`, `textColor`,
`cornerRadius`, `iconColor` and `activeTextColor` are no longer read or offered.

**3. Asked for and reported are two different things, as on a slider.**

- group: the reported state keeps its pill, and the asked one gets a ring. Both
  are visible at once - "it is this, you asked for that", which is what the old
  hollow bar said.
- switch: the knob moves to the asked position at once, because that is what a
  finger expects, and the **colour** follows only when the value comes back. The
  knob is the request, the colour is the truth.

A finger holding a segment gets the same ring; a finger on the knob makes it
bigger, which is what Material does.

**4. `showMarker` becomes `showAsOn`.** It used to decide whether the marker bar
was drawn; it now decides whether a switch showing that state is drawn in
colour or quietly. Old projects keep working - `switchStateIsOn` reads the old
name too - because the van's screens are full of them.

**5. Shapes follow the rectangle, not a property.** A strip is a pill; anything
not clearly wider than tall is a rounded square, or a segment as tall as it is
wide comes out an oval (seen in the first render). Icon and label sit side by
side in a strip and stacked in a tile, by the same rule.

**6. Nothing reported, nothing claimed.** The group marks no state; the switch
shows an empty track, no knob and a "?" beside it. Standing the knob somewhere
would claim a state nobody has reported.

## What this costs

The Switch is drawn **live on the device**, unlike the button, whose picture the
designer bakes - so it needed a firmware port, done the same day. The geometry
is `lib/switch-shape.ts`, mirrored as `src/project/SwitchShape.h`; the tap
mapping is `switchshape::stateIndexForTap`, which all three boards now call
instead of keeping a copy each. Conformance passes 40/40 with nothing excused,
and the Waveshare fixture suite 13/13 - after its checked-in fixture zip was
rebuilt, since it carries bitmaps the designer baked under the old rules.

What is new in the designer: `lib/switch-shape.ts`, a rewritten
`render-switch.ts`, the state icons' bake (they are now a capital's height and
take the ink colour of the state they belong to), the property panel, the
preview's pressed state and its ring, and `e2e/switch-look.spec.ts`. The old
`e2e/switch-marker.spec.ts` is gone: it pinned down the bar's geometry to the
pixel, and there is no bar.

## Left open

- **Dragging the knob.** A tap picks a slot today, on any n. Dragging is the
  same mechanism a settable level uses and belongs with the firmware port; for
  two states nobody needs it.
- **More than two states in the switch form** hides the alternatives: only the
  reported state's label is beside the knob. The group shows them all, and it is
  what a screen with three choices should use.
