# The switch says what it is by the size of its knob

2026-09-22, the same evening as the ring. Held against Material's own switch,
ours was saying with colour alone what that one says with colour *and* size:
our knob was the same circle whether the state it stood for meant on or not.

The model is Material's switch. Where we differ from it is deliberate and
worth naming first: **ours can have any number of positions**, not two. So
there is no "off is on the left" here. Every state says for itself whether it
means on - the `showAsOn` it has always carried - and the switch draws itself
from whichever state is the one being shown.

## The rule

| the state being shown | knob | icon | track |
|---|---|---|---|
| does **not** mean on | half the track's height | none | half strength, plus an outline |
| means on | three quarters | the state's own, if it set one | full strength, no outline |
| held down | seven eighths | as above | as above |

Material's 16, 24 and 28 on a 32 dp track, kept as ratios because our track
follows the object rather than a fixed dp (switchTrack). The outline stays
Material's flat 2, by the user's eye and its spec both.

The knob's **position** does not change with its size: the slots are spaced
by the on size and the knob only changes diameter, so nothing jumps sideways
when a state arrives.

## The colours

One colour, as everywhere else here, and everything from it:

- **Not on**: the track at half strength - the same mixture the bar's own
  track takes, the fill mixed halfway into what the control stands on - with
  the outline and the small knob in the colour itself, at full strength.
  Until today the track was a *quarter* strength and the knob shared the half
  with the outline; brought together, the knob would have vanished into its
  own track.
- **On**: the track in the full colour, the knob in whatever reads on it
  (white on Material's purple, black on a pale blue), and the icon on the
  knob in the track's colour. No outline: a filled track needs none.

On a panel that cannot show the mixture - all of 1 bit - the half-strength
track falls back to the background and the outline carries the whole shape.
That needs no special case: the outline is there in every not-on state
anyway, which is exactly why it is worth having.

## The icon

Only the state that means on shows one, and only while it is the one being
shown. A picture squeezed into half a track height says nothing anyone can
read, and the knob's size has already said what the icon would.

An on state with no icon of its own shows no icon. Material's reference draws
a check there; we do not invent a picture the author did not choose - the
same stance everything else in this system takes about assets.

## Scope

Designer only, signed off on the picture. `SwitchShape.kt` follows when the
app is next brought level; the firmware has not had the 2026-09-20 switch at
all yet, so it will take this with that work. The golden file was re-recorded
straight away, so `SwitchShapeGoldenTest` fails until the port lands rather
than passing against numbers the designer no longer produces.
