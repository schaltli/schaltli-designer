# The slider as one shape

Agreed 2026-09-19, after the settable level shipped and its marker turned out
to be invisible in practice (`docs/2026-09-18-*`, the white-on-white find) and
then merely ugly once it was visible. The user's words on the first attempt:
"der knubbel ist zu klein, der sieht nicht nach Griff aus, er würde mich in
die Finger stechen. keiner würde einen solchen Anfasser in der Realität
bauen." And on the second: "schaut alles ein bisserl plain aus."

Both were right, and the reason was not the handle. It was that a level
indicator is drawn as a *box with things inside it* - white rectangle, grey
border, a coloured rectangle for the fill, a blob for the marker - where every
modern slider is drawn as *one shape*.

## What was looked at

| system | track | handle | shape |
| --- | --- | --- | --- |
| iOS (UISlider) | ~4 pt | 28 pt across, white, shadow | circle, 7x the track |
| WinUI 3 | ~4 px | ~20-22 px, ring with an inner dot | circle, ~5x |
| **Material 3** | **16 dp** | **4 dp wide x 44 dp tall** | **a bar, not a circle** |

Two things came out of that, and the second one overturned the first plan:

1. **Every one of them makes the handle far larger than the track** - but iOS
   and Windows have a *thin* track, because theirs is purely a control. Ours is
   32 px because it is also a gauge: it shows a tank. Their ratios do not carry
   over; 7x would be a 224 px handle.
2. **The one system with a fat track abandoned the circle.** Material 3 uses a
   narrow bar, a 6 dp *gap* between handle and track, pill ends on both tracks
   (radius = height/2), and a 2 dp inner corner at the gap.

The gap is the part worth stealing: what makes a handle look like it is lying
*on* the track is the slot of background you can see around it - not a shadow,
not an outline. That also explains why the first mock-up failed: our unfilled
track is white, and a white gap on white reads as nothing at all.

## Decisions

**1. One shape, not a box.** Track and fill are pills (corner radius = half the
track height). The unfilled part gets a colour of its own instead of being the
object's white background - which the arc has had all along as `trackColor`,
so this is the bar catching up rather than a new idea.

**2. It applies to every level indicator, settable or not.** A tank, a battery
and a dimmer look alike; only the handle tells them apart. Two shapes for the
same control on one page is worse than a changed look. The cost is named:
**this changes the appearance of every existing project.**

**3. The handle is the fill's own colour** (the user chose this over a darker
one). A bar 6 px wide, overhanging the track by 8 px top and bottom, pill ends,
with a 6 px gap to the track on both sides. Handle and active track are one
object that the gap separates - Material's reading, not a second colour.

**4. A stroke always means a settable value, and there is never more than one.**
The first version of this file had a second form - a tick *inside* an unbroken
track, for a setpoint that is shown but cannot be set. On glass the user threw
it out, and the reason is better than the rule it replaced: "des strich zeigt
immer einen einstellbaren wert an. beispiele 4,5,6 zeigen einen strich ohne
unterbrechung der bahn. gefällt mir nicht."

So there are exactly two pictures:

- **nothing settable** - a filled pill, no stroke at all (a tank, a battery);
- **settable** - the same pill with one handle, always overhanging, always with
  the gap on both sides, wherever along the track it happens to stand.

The fill is the **measured** value and the handle is the **commanded** one.
Usually they coincide and the handle sits in the fill's own edge. When they do
not - a dimmer whose command is still travelling, a heater warming towards its
setpoint - the handle stands away from the fill and the picture says by itself
"it is here, it should go there". That single rule covers the case the tick was
invented for, which is why the tick is gone: `levelTickRect()` is deleted, not
kept for later.

`markerStyle` goes away too: the shape follows from what the object can do, not
from a menu. Existing projects carrying the property are simply not read.

An object that carries a `setpointTopic` but no `writeTopic` still draws the
handle. It reads as settable and is not - but that is a mistake the author made,
and per the user's own line about the end stop, "das ist sache des menschen,
nicht des tools".

**5. This solves the 1-bit setpoint, which colour never could.**
`lib/control-palette.ts` records the limitation: "Cannot be told from the fill,
and no colour choice fixes that - one bit has no third value. The setpoint
needs a shape of its own on this depth." The overhang is that shape. On the
PaperS3 the handle now sticks out of the track, and the gap is white.

**6. The Material 3 palette for 24-bit** (the user chose it over keeping the
greens): primary `#6750A4` for fill and handle, `#E8DEF8` for the unfilled
track. The greyscale depths keep their own greys and gain only the shape -
Material's colours say nothing on a panel with sixteen greys. Noted, because it
was raised and chosen anyway: these are Google's brand colours, and the one
place to change that later is this file.

**7. No stop indicator.** Material puts a dot at the end of the inactive track.
On a tank gauge it answers no question anybody has.

**8. The handle is clamped inside the track at the extremes**, rather than the
track being inset to make room for it. Insetting would move every value's
position and so would change `levelPercentFromPoint` in four renderers and the
meaning of every calibration. Clamping is what the line marker has always done;
the cost is that at 0 % and 100 % the handle's centre lies by half its width,
which is 3 px.

**9. The name and the icon belong to the control, on a header line above the
bar.** The user asked for this after the number placement was settled ("ich
möchte nun doch dass man die bezeichnung und ein icon direkt auf dem control
spezifiziert") and then settled the layout with a picture of Android's own
volume settings: icon and name on a line of their own, the bar underneath at
full width.

Google's arrangement is the one that works, and beside-the-bar - which was tried
first on glass - is the one that does not. Put the name in a column to the left
and its width becomes a property nobody can set correctly: derive it from the
text and the bar starts at a different place in every row, so stacked sliders
stop lining up; make it a fraction of the object and "Frischwasser" is clipped
on a narrow bar. Put it on a line above and there is nothing to set: the icon
and the name hang on the object's left edge, the number on its right edge, the
bar spans the whole width, and rows stacked under each other align by
construction. The property that was about to be invented does not exist.

One name and one icon, both optional, and nothing further - the control is not
to become a layout engine. The icon uses the asset mechanism that is already
there (`assetId`, the icon picker, and top-level flattening into the
background), drawn square at the header's height in the text colour.

The header takes its room from the top of the object's own rectangle and the bar
gets the rest. The object does **not** grow by itself: the rectangle is what the
author drags, and one that silently changes size breaks the layout around it. An
object too short for both shows it too short in the designer, which is the
honest answer; the blocks (Tank, Dimmer, Heizung) carry a height that fits.

**10. The number: one line, right edge, unit only on the big one.** Right-aligned
at the object's right edge, on the header line when there is one and beside the
bar when there is not - the same edge either way, so the two forms mix in one
column without drifting. Reserved width is five digit widths in the object's own
font, capped at 40 % of the object.

The **commanded** value is the big one - it is where the handle points and what
the finger changed. The **measured** value goes small and grey, immediately to
its left, and only when the two differ; a dimmer that has arrived shows one
number, not "45 % / ist 45 %".

The unit rides on the big number only. Measured on the 4.3B (2026-09-19): at 12
px, helvR08's degree sign is a broken ring that reads as a lowercase c. Two
units on one line is noise anyway, and the small value is plainly the same
quantity.

**11. Both forms are the same object.** A bar with no name and no icon is the
header form with an empty header - not a second control, not a mode. That is
what keeps a page of mixed rows aligned.

## What this costs, and what it does not

The rounding is **already there and already proven**: the firmware has
`fillRoundRect`/`drawRoundRect`, the conformance specimen for `box` uses
`cornerRadius: 8` and reports zero differing pixels, and the Switch already
draws its state bar with it. An earlier estimate in this session put a day's
work on a new anti-aliased disc rasteriser; that is not needed, because the
shape is pills and bars rather than circles.

What is actually new: the bar's geometry (pill track, tinted unfilled part,
gap, handle) and the header line (icon, name, number) in four renderers -
designer, firmware, Android, and the reference page - a `trackColor`, a `label`
and an `assetId` on the bar, the palette, the property panel, the Dimmer block's
defaults, `device-contract.md`, and conformance specimens for a settable and a
read-only bar.

The header's one genuinely new piece on the device is the icon: the level
indicator has never drawn one. It is not new machinery, though - a top-level
icon is flattened into the screen background at export time (`asset-export.ts`),
so what the firmware receives is background pixels it already knows how to
paint. Only the designer and the export have to agree on where the icon sits.

## How it was arrived at

Nothing here was decided from a screenshot of our own code. Each shape was laid
out from plain `box`, `label` and `icon` objects, deployed to the 4.3B and
photographed, and only the picture that survived became a rule - three rounds of
it, in `docs/`'s sibling session notes:

1. Material's exact numbers (track 16, handle 4x44, gap 6, inner corner 2) -
   this is the one that was approved, and it is why the geometry is a ratio of
   the object rather than a set of properties.
2. Where the number goes - which produced decision 10, and which showed that a
   number no longer fits *inside* a 16 px track at all.
3. The setpoint - which is where the tick died (decision 4) and where the header
   line was settled against Google's own settings screen (decision 9).

The scratch scripts were not kept; the pictures and these decisions are what
carries over. What does get kept is the test: `e2e/settable-level.spec.ts`
already finds the bar by scanning the rendered canvas for the fill colour rather
than computing where it ought to be, after two earlier versions of that test
passed against deliberately broken code.

## Left open

The **arc** keeps its sector marker for now. The same reasoning applies to it -
a handle that overhangs the ring, with a gap - but the ring's rasteriser knows
one thickness, so an overhanging marker is not the same small change it is on a
bar. Decided separately once the bar is on glass. Whether the arc also gains a
name and an icon (decision 9) waits for the same round: it has a middle, which
is a place for them that the bar does not have.
