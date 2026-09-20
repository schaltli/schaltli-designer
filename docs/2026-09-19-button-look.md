# The software button as a Material 3 button

Agreed 2026-09-19, right after the slider (`2026-09-19-slider-look.md`). The
user: "auch dieser muss material-like gemacht werden. jetzt sieht er wie ein
fremdkörper aus". It did: a white box, a grey border, a 4 px radius and a 3 px
drop shadow, pressed by sliding the face 3 px onto its own shadow - a desktop
button from twenty years ago next to a slider that is now one shape.

Proposed from a mock-up built out of plain label and icon objects with the
pills drawn in (today's button, then filled, tonal and outlined, each normal,
pressed and with an icon); the user chose all three points below as proposed,
the third "wie Material".

## Decisions

**1. Material's three common buttons, as a `buttonStyle`.** `filled` for the one
action a screen is about, `tonal` for ordinary switches, `outlined` for the
quiet ones. **Tonal is the default**: a page of filled buttons is heavy, and
Material spends them sparingly. Always a pill (radius half the height), no
shadow, no border except the outlined one's.

**2. One colour, `buttonColor`, and everything else derived** - the slider's
rule (decision 12 there):

- filled: the colour, with a white label on a dark colour and a black one on a
  light colour - decision 5.
- tonal: the colour halfway to the screen's background - exactly the slider's
  empty track (`levelTrackLook`), so a tonal button and a slider are one family -
  with a white or black label by the same rule.
- outlined: no fill, a 1 px outline in that same tint, the label in the colour.

`backgroundColor`, `borderColor`, `textColor`, `iconColor`, `borderWidth` and
`cornerRadius` are no longer read or offered. The icon takes the label's colour,
as Material's does.

**3. Pressed is Material's state layer:** the label's colour over the container
at 10 % (over the background for outlined). A depth that cannot show 10 % - 1 bit
always, some pairs of greys - turns the button inside out instead: filled draws
outlined, anything else draws filled.

**4. Pressed also changes shape** - Material 3 Expressive's shape morph, added
the same day. The user, having pressed one: "der alte button wurde
runtergedrückt, der neue zeigt kein feedback". The old pressed bitmap slid the
whole face 3 px; the 10 % layer alone disappears under a finger and in the
~100 ms of a tap. Material's other two answers do not fit a device that swaps
two still bitmaps: the ripple is an animation from the touch point, and it
outlasts a short tap only because it keeps running after the release. What does
fit is the Expressive morph: pressed, the pill's ends close to corners of a
fifth of the height (`buttonCornerRadius`; Material: 8 dp on a 40 dp button, 12
on 56, 28 on 136). The ends of a button stick out beside the fingertip, so a
changed silhouette is seen where a changed colour is not. It is baked into
`pathActive`, so it reaches the 4.3B without a firmware change.

And the **preview** shows it: in preview mode a software button is drawn pressed
while the mouse holds it and let go on any release, inside the canvas or not. It
never showed a pressed state before - neither the old button nor the new one.

**5. The label colour is Material's tone rule** - white when the colour's tone
(CIELAB L*) rounds to under 60, black from 60 up
(`DynamicColor.tonePrefersLightForeground`). Replaced the same day. The first
version took whichever of white and black has the higher WCAG contrast, and that
formula is known to be weak on blue: it switches at L* 49, so Material's own
blue `#1E88E5` (L* 56), a red `#E53935` and a petrol `#00897B` got black labels -
more contrast by the number, less to the eye. The user: "zuwenig kontrast zB bei
dunkelblau", and proposed exactly this rule: "bei dunklen buttons weiss, bei
hellen schwarze schrift".

## What followed from them

- **1 bit.** The tint is the background there, so tonal is drawn as outlined,
  as the slider's track becomes an outline. The first 1-bit bake showed the
  1 px outline broken along its curves: an anti-aliased edge is cut at 50 % on
  the way to the glass. On 1 bit the pill is drawn with the integer rasteriser
  the slider uses (`fillRoundRect`), and the outline is cut out of a filled pill
  rather than drawn over one, so a background image still shows inside it.
- **The icon** follows the slider header's rule: a capital's height, its ink
  standing on the baseline, centred with the label as one group, 8 px apart. That
  is smaller than Material's 18 dp beside 14 sp text; it was the rule already
  agreed for the header and nobody asked for another.
- **One drawing for the preview and the bake.** The button reaches a device as
  two bitmaps the export bakes and the firmware blits, and the export had its own
  copy of the drawing code. Both now call `drawSoftwareButton()`
  (`components/canvas/renderers/render-software-button.ts`), and
  `e2e/software-button-look.spec.ts` holds the baked normal bitmap equal to the
  preview, to the pixel, on 24 and 1 bit.
- **No firmware change.** The device only blits what was baked, so the new look
  arrives with the next deploy. Android is the exception: the app draws buttons
  natively from the old properties and keeps the old look until it is ported.

## Left open

- **On the devices, for the firmware port:** the knob and the PaperS3 never draw
  `pathActive` at all - only the 4.3B does - and none of them holds it after the
  release, so a quick tap shows it for a frame or two. Material's ripple is seen
  on a short tap because it runs on after the finger lifts; the equivalent here
  is holding the pressed bitmap for a minimum of about 150 ms. Both are firmware,
  frozen with the rest of it.

- The Switch (a segmented control) is the next object with the same problem,
  as Material's segmented button. Separately.
- Conformance's button specimen is filled now; whether the pill's anti-aliased
  edge comes through the RGB565 step exactly is for the first run on glass.
