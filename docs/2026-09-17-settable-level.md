# A level you can set: the slider the Dimmer block asked for

Agreed 2026-09-17, on seeing the Dimmer block: a dimmer runs from 0 to 100,
and the object set could only offer five fixed steps for it. Nothing in it
sets a free value - `level-indicator` and `arc-level` display one, `Switch`
and `SoftwareButton` send fixed ones. The same gap turns the heater's target
(12-35 °C) and a fan's speed into rows of buttons; in the van that was worked
around with +/- buttons and a 250 ms coalescer.

## Decisions

**1. No new object type.** `level-indicator` and `arc-level` get an optional
`writeTopic`. With one set, the object is operable; without one, it is exactly
what it is today. No new renderer, no new type for a device to learn, and the
same contract the Switch already has: read from `schaltli/state/...`, write
to `schaltli/cmnd/...` (`device-contract.md` §4).

**2. The finger sets the value, and owns the picture while it is down.**
Press sets the value under the finger, a drag follows it, release confirms.
While the finger is down, what is drawn is the finger's value - not the last
one received. Otherwise every incoming message fights the hand.

**3. Sent while dragging, at most every 250 ms, and once more on release.**
A light should follow the hand rather than jump when it lets go, but a drag
must not put thirty messages on the broker. The same 250 ms coalescing the
van's fan step uses. The release always publishes the final value, so what
stands at the end is exact rather than whatever the last tick caught.

**4. A step, so a drag does not produce 37 and then 38.** An optional `step`
property (default 1) the value snaps to. The Dimmer block sets 5.

**5. The value comes from the position by inverting the calibration.**
`calibrationPoints` already map a value to a bar percentage; a drag has the
percentage and needs the value, which is the same interpolation read the
other way, clamped to the outer points.

**6. Written, not yet confirmed, means the bar stays where the finger left
it.** No second appearance to draw, no timeout to tune: the written value is
what is shown until a message arrives on the read topic, and then that wins -
including when it says something else, which is the installation disagreeing
and has to be visible.

This is where a level differs from a Switch, which needs its hollow bar
because its value is a word on a segment rather than a position. And it is
only safe because the bridge asks again every two seconds (decision 1 of
`2026-09-15-live-data.md`): a command that never landed corrects itself
within about two seconds instead of standing forever.

Revised from the first version of this document, which copied the Switch's
hollow bar onto levels. That would have meant a new appearance in every
renderer, on three boards plus Android, and pixel parity for a state only a
drag can produce - for a picture that a bar already shows correctly by
standing still.

**6b. A setpoint is what a finger moves, where there is one.** Asked while
this was being built: what about the heater's arc? Its fill is the *measured*
temperature (`heater/temp`) and its marker the target (`heater/target`) - and
only the target can be set. Nothing can move a measurement; a finger that
tried would be overwritten two seconds later by the bridge's next round.

So: with a `setpointTopic`, the finger moves the marker, and the setpoint is
what is published and held. Without one - a dimmer's bar - it moves the fill.

The range then comes from the calibration for free: the heater takes 12-35,
and a calibration of 12..35 makes any other value unreachable, because the
inverse interpolation clamps at the outer points. And the van's existing +/-
buttons do not clash with it - they publish the same
`schaltli/cmnd/heater/target`, so both can sit on one screen.

Only the arc has a setpoint today, so this lands with the ring (decision 7).

**6c. The marker is the feedback, and a tap is enough** (the user, while this
was being built, on seeing 6b): build a settable level the way the heater's
arc already works. A tap anywhere puts the marker there and sends the
command; the fill keeps showing what the installation reports; when the
command has landed, the two coincide - a thermostat dial.

That is better than 6 and replaces its mechanism. What it drops:
- No holding the value locally and no suppressing incoming messages while a
  finger is down (decision 2's second half): the fill may follow reality the
  whole time, because it is no longer the thing the finger moved.
- No coalescer, because one tap is one message (decision 3 still applies to
  a drag, which is the same thing with the finger moving).
- No special case for the PaperS3 (decision 9): it has dispatched taps since
  the beginning.

And what it shows is more honest: the difference between what was asked for
and what is measured, instead of a bar that hides it by standing still.

Where the asked-for value comes from: the installation's own setpoint topic
where there is one (the heater), else the value this device last sent, which
it remembers until the reading agrees with it.

Open: only the arc draws a marker today. A settable bar would need one - a
thin line, the same arithmetic, but a new appearance in the designer, three
boards, Android and conformance. The arc comes first because it can already
do it.

**7. Both objects, the bar first.** The ring is the same arithmetic on a
sector rather than a rectangle, and a ring is fiddlier to drag - so it
follows once the bar is right.

**8. A drag that starts on a settable level belongs to it.** Two boards page
the screen by following a horizontal finger (the knob's `tryStartDrag`, the
4.3B's `FollowSwipe`), and a bar is dragged horizontally too. Whichever the
finger goes down on decides: on a settable level, paging does not start.

**9. The PaperS3 sets on release only.** Every intermediate frame there is a
full refresh of about a second, which is why that board rejected
follow-the-finger paging in the first place. It keeps the position where the
finger lifted, publishes once, and draws once.

**10. Every side, or it is not in the contract.** Knob, 4.3B, PaperS3, the
Android app and the designer's live preview, with conformance covering a drag
the way it covers a tap today. The live preview publishes for real (decision
5 of `2026-09-15-live-data.md`); the simulation answers through the mock
engine.

## Order of work

1. **Designer**: `writeTopic` + `step` on both objects, the inverse
   calibration (done), dragging on the canvas in preview mode, holding the
   dragged value until the read topic answers, e2e against the local broker.
2. **Firmware**: hit-testing a settable level (today only `Switch` and
   `SoftwareButton` can be hit at all), following the finger, the 250 ms
   coalescer and holding the value - on all three boards, release-only on
   the PaperS3.
3. **Android**: the same, through a drag gesture.
4. **Contract + conformance**: the drag case, and `device-contract.md` on
   what a settable level reads, writes and draws.
5. **Blocks**: the Dimmer block becomes a real dimmer, and the Battery and
   Tank blocks stay read-only (nothing to write there).
