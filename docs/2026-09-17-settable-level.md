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
same contract the Switch already has: read from `screenbee/state/...`, write
to `screenbee/cmnd/...` (`device-contract.md` §4).

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
