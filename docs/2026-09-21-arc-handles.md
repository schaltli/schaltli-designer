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

**1. A dashed line, and a small segment on it.** Each end draws a radial
dashed line, from the ring's inner edge out to 30 px past its outer edge,
standing exactly at that end's angle. The handle itself is a short segment
of the ring sitting on that line, the size of the box's own corner handles.

The first attempt was the segment alone - a short, thicker piece of the ring
at each end, no line. It did not read as a handle at all; it looked like
part of the drawing. The line is what says "this is a control, and it stands
here", and the segment is what says "and this is the bit to take hold of".

**2. Not a square, but small enough to look like one.** Strictly it is a
ring segment, because a square would claim an x and a y and an angle has
neither. At eight pixels it reads like the four corner handles anyway, which
is the point: recognisably the same kind of thing, doing a different job.

**3. Same blue as every other handle** (`#3b82f6`, white underneath). Only
the shape and the line distinguish them. Cursor `grab`/`grabbing`, the same
vocabulary as the grip in a list.

**4. The segment sits on the side of the line the ring is closed** - inwards,
into the sweep. That is what keeps the two apart on a full ring, where both
lines stand at the same angle: the segments end up side by side around it
rather than on top of one another. This is also why the rule below needs no
special case for a closed ring.

**5. The line is as grabbable as the segment.** It is what the eye sees - a
30 px mark standing at the angle - and asking someone to hit eight pixels of
arc when a whole line is drawn there would be a trick.

**6. The box's corner handles keep the press where the two overlap.** A
line reaching 30 px past the ring lands exactly on a corner handle when a
scale ends towards a corner - which the default shape does, at 135 degrees.
The corner is the smaller, older target and it wins; the arc's ends are
checked after it. `e2e/arc-level.spec.ts`'s "resizing keeps it square" is
the guard, and it caught this the first time round.

**7. Visible whenever a single Gauge or Dial is selected**, beside the
corner handles. Not hidden behind a modifier: the box of an arc is the thing
one drags rarely, the scale the thing one drags often, and a hidden handle
for the common case is backwards.

## The drag

**8. One end at a time.** Dragging moves the end you grabbed; the other
stays. Rotating the whole sector without changing its span is deliberately
*not* in: it is a wish nobody has expressed, and an invisible modifier costs
a line of documentation and a line of test for something nobody would find.

**9. One rule for the limits: an end never comes past the other.** The span
stays between 15 degrees and a full turn. Everything else follows from it:

- Growing until the ends meet closes the ring - which is what `minAngle ==
  maxAngle` means to `resolveArcSweep` ("equal positions mean a full ring").
- Shrinking stops one step short, so the arc can never collapse through zero
  and come out the other side as a *full* ring. That jump - careful shrinking
  suddenly producing everything - was the trap this rule exists for.
- Out of a full ring, the only direction that is not "past the other end"
  opens a gap. No special case needed.

An earlier draft had a second rule for the full ring. The handle shape made it
unnecessary.

**10. Snaps to 15 degrees**, the half hours the clock face used and the
presets sat on. Both ways of setting the same property now snap the same
way. The degree boxes in the panel stay for the angle a drag cannot land on.

The span is carried from step to step rather than measured against the
drag's start, so a drag that goes right round keeps counting instead of
wrapping at half a turn - and the clamp has one number to hold.

**11. No readout on the canvas.** The two degree boxes in the panel update
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
