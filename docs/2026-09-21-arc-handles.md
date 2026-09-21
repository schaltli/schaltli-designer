# Den Schwenkbereich am Bogen selbst anfassen

Agreed 2026-09-21. A Gauge and a Dial keep their scale in two stored
numbers, `minAngle` and `maxAngle`, and until today the only way to set them
was in the property panel: a clock face to click, four presets, two degree
boxes. The ends are dragged on the canvas now, and the clock went with it.

The clock existed *because* there was nothing to take hold of. Once there is,
a picture of a clock beside the drawing is a second, worse preview of the
same thing. Round 3 of the panel rebuild had decided the clock was worth
keeping as the only bespoke control in nineteen panels
(`2026-09-20-property-panel.md`); one day later that decision is reversed,
which is what a living document is for.

## The handles

**1. Two caps, not two squares.** Each end carries a short piece of the ring
- about 10 degrees, a little thicker than the ring itself - drawn just
*inside* its own end. A square handle claims an x and a y; an angle has
neither. A piece of arc says what it is.

**2. Same blue as every other handle** (`#3b82f6`, white outline). The four
corner handles of the box stay where they are. Only the shape distinguishes
them: square for the box, curved for the angles. Cursor `grab`/`grabbing`,
the same vocabulary as the grip in a list.

**3. Drawn inwards, which is why they can never coincide.** On a full ring
both ends are the same angle. Because each cap runs *into* its own arc, the
two end up side by side around that point instead of on top of one another,
and it stays obvious which is which. This is the whole reason the shape was
chosen, and it removed a rule (see 6).

**4. Visible whenever a single Gauge or Dial is selected**, beside the
corner handles. Not hidden behind a modifier: the box of an arc is the thing
one drags rarely, the scale the thing one drags often, and a hidden handle
for the common case is backwards.

## The drag

**5. One end at a time.** Dragging moves the end you grabbed; the other
stays. Rotating the whole sector without changing its span is deliberately
*not* in: it is a wish nobody has expressed, and an invisible modifier costs
a line of documentation and a line of test for something nobody would find.

**6. One rule for the limits: an end never comes past the other.** The span
stays between 15 degrees and a full turn. Everything else follows from it:

- Growing until the ends meet closes the ring - which is what `minAngle ==
  maxAngle` means to `resolveArcSweep` ("equal positions mean a full ring").
- Shrinking stops one step short, so the arc can never collapse through zero
  and come out the other side as a *full* ring. That jump - careful shrinking
  suddenly producing everything - was the trap this rule exists for.
- Out of a full ring, the only direction that is not "past the other end"
  opens a gap. No special case needed.

An earlier draft had a second rule for the full ring. The cap shape made it
unnecessary.

**7. Snaps to 15 degrees**, the half hours the clock face used and the
presets sat on. Both ways of setting the same property now snap the same
way. The degree boxes in the panel stay for the angle a drag cannot land on.

The span is carried from step to step rather than measured against the
drag's start, so a drag that goes right round keeps counting instead of
wrapping at half a turn - and the clamp has one number to hold.

**8. No readout on the canvas.** The two degree boxes in the panel update
while the drag runs, which is enough; a number floating by the pointer would
be a third place saying the same thing.

## What left the panel

The clock face (`ClockDial`, about 100 lines), the four presets and
`ARC_PRESETS` with them - it had no other user. The Shape section is now:
Angles, the line "Min (7:30) to Max (4:30).", Direction, Thickness, Marker
width.

The clock *vocabulary* stays in that one line. "225" is what the file
stores; "half past seven" is what a person says about a round face, and the
line translates between them for free.

Losing the presets means the four shapes take a drag instead of a click.
That was weighed and accepted: the thermostat shape is the default a new
arc already has, and the full ring is still reachable by dragging (growing
is allowed all the way to 360) or by typing 0 and 0.

## What holds it

`e2e/arc-level.spec.ts` drags the ring three times, once per rule: the end
lands on a half hour, an end dragged at the other one does not pass it, and
growing until they meet gives `minAngle == maxAngle`. The test that used to
click the presets is what these replaced.
