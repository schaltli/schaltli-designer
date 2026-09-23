# Das Bild geht mit dem Finger

Built 2026-09-21. A horizontal swipe on the Android app carries the picture
along while it is being made, the way the Waveshare firmware has since
2026-08-22 (`FollowSwipe.h` in `schaltli-firmware`).

## What was wrong

Nothing was broken; a swipe simply did nothing at all until it was let go,
and then the screen changed in one step. On a board that reads as a limit of
the panel. On a phone, where every other surface moves under the hand, it
reads as a surface that is not listening.

## The rules, and where they come from

All of them are the firmware's, copied rather than re-tuned. Two of them are
about hands and one is about hardware nobody has here, and it is kept anyway:

- **60 units of travel and a 2:1 axis ratio** name a gesture. Already in this
  app; unchanged.
- **A third of the way across commits**, and anything short of it springs
  back.
- **Or a flick**: 400 units a second, at least 30 units travelled. This one
  was added to the firmware for a panel that could sample a fast gesture only
  two or three times, so a throw arrived as a nudge and sprang back. A phone
  samples it far better and would not need the rule - but a hard flick across
  a screen means "go" on both, and the rule costs nothing.
- **The glide** finishes the movement instead of jumping it, at about the
  firmware's rate.

**The picture follows the hand, not the binding.** A finger moving left always
pushes the current screen out to the left and brings the next one in from the
right - even where the project has bound a leftward swipe to the *previous*
screen, which it is free to do. Tying the direction of travel to which screen
arrives would have such a project sliding its screens backwards under the
finger. The firmware says the same thing in its own header, and for the same
reason.

## What is not followed

A vertical swipe, and a horizontal one bound to an MQTT message or to the
screen menu. There is no second picture to bring in, so those are named on
release exactly as they always were. The naming and the following share one
gesture detector, so neither can fire twice.

`ButtonActionDispatcher.navigationTarget` was pulled out of `dispatch` for
this: the screen a swipe slides *towards* and the screen it *lands on* are now
one piece of arithmetic. Two copies of the wrap-around would eventually slide
in one screen and land on another.

## What holds it

`SwipeNavigationTest` in the app's repo takes the two halves that need no
screen - which gesture was made, and where it leads.

The following itself needs a phone, and `hil/android/orchestrator.js` checks
it on every run: a deliberately slow `adb input swipe`, looked at part of the
way through. Four claims - the picture moves mid-gesture, a long drag leaves
a different screen behind, a short one comes back to *exactly* where it was,
and swiping back lands exactly on the screen the fixture opens with. The
third is the half that is easy to get wrong, because a follow that never
returns is a screen stuck at an angle. The fourth is also the tidying up:
everything after it compares screen 0 against screen 0's reference.
