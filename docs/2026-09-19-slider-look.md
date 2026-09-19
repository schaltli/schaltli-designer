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

**4. A handle means settable; a tick means shown.** With a `writeTopic` the
object draws the handle above. With only a `setpointTopic` - a heater on a
display-only page - it draws a tick *inside* the track, no overhang, no gap.
`markerStyle` goes away: the shape follows from what the object can do, not
from a menu. Existing projects carrying the property are simply not read.

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

## What this costs, and what it does not

The rounding is **already there and already proven**: the firmware has
`fillRoundRect`/`drawRoundRect`, the conformance specimen for `box` uses
`cornerRadius: 8` and reports zero differing pixels, and the Switch already
draws its state bar with it. An earlier estimate in this session put a day's
work on a new anti-aliased disc rasteriser; that is not needed, because the
shape is pills and bars rather than circles.

What is actually new: the bar's geometry (pill track, tinted unfilled part,
gap, handle) in four renderers - designer, firmware, Android, and the reference
page - a `trackColor` on the bar, the palette, the property panel, the Dimmer
block's defaults, `device-contract.md`, and conformance specimens for a
settable and a read-only bar.

## Left open

The **arc** keeps its sector marker for now. The same reasoning applies to it -
a handle that overhangs the ring, with a gap - but the ring's rasteriser knows
one thickness, so an overhanging marker is not the same small change it is on a
bar. Decided separately once the bar is on glass.
