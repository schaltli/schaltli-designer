# Android: the reference has to draw the way the device draws

Agreed 2026-09-22, after measuring the panels and then talking two wrong
answers out of the plan.

## What was measured

**The four boards, conformance 09:39: 21 of 21 checks, `diff = 0`.** Not
"within tolerance" - no differing pixel at all.

**The Android suite, 09:51: 12 of 12 "pass", 6 146 to 17 026 differing
pixels.** It passes because it compares with `comparePixelsWithTolerance`, a
channel threshold of about 24, rather than the e-paper target's rule that any
differing pixel fails. Diffing `expected-0-0.png` against `actual-0-0.png`
(1080×2037) by hand: 21 219 pixels differ at all, 0.96 %; 12 127 differ beyond
the threshold, 0.55 % - which is the number the suite reports.

**The reference device**, Huawei P20 Pro `CLT-L29`, Android 10, over adb as
`WCR0218314002560`:

| | |
|---|---|
| physical | 1080 × 2240 |
| density | 480 dpi = exactly ×3.0 |
| drawable app area | 1080 × 2037 (system bars take 203) |
| cutout | 81 px tall, x 386…694 |
| what the DDF announces | 360 × 679, in **dp** |

## Where the difference actually sits

Painting the difference settles it. Every differing pixel is on

- **a glyph** - "Readouts", "OK", "0%", "Frischwasser", "(0%) 75%", each
  outlined along its edges,
- **the two diagonal MqttDataLine strokes**, along their whole length,
- **one small round icon**.

Everything else is identical: the pills, the tracks, the card, the triangle,
every axis-aligned rectangle, **and every baked bitmap** - the switch icons and
the whole SoftwareButton.

That pattern is not random, and it tells us how the app works. **Bitmaps** it
scales through Coil with `FilterQuality.None`, blockily - and
`matchDeviceScaling` imitates exactly that in the reference, which is why they
agree to the pixel. **Text and vector shapes** Compose draws **natively at
1080**, smooth. The reference draws them at 360 and blows them up blockily.

So at those places we are comparing **blocky against smooth**. That is a fault
in the instrument, not in the product. The phone is not drawing wrongly; it is
drawing *better* than the reference.

The saved evidence is `hil/android/report/images/diff-0-0-diagnose.png`.

## Two directions that were abandoned, and why

Recording these so nobody proposes them again.

**"Android must letterbox or zoom in integer steps."** Wrong: nothing is being
fitted. The DDF describes the screen exactly. The user's objection killed it -
"if you ask the app for its DDF it returns one that matches its screen exactly,
so what is there to scale?"

**"Announce the DDF in physical pixels and render 1:1."** Coherent, and still
wrong in practice. It would make an Android project's canvas 1080×2159 - three
times every other screen in the tool - force every font size to be re-chosen
(24 becomes 72), make porting painful, and produce **exactly the same picture
on the phone as today**. Effort with no visible return. The user's objection
again, and it stands.

## Decisions

**1. Nothing changes in the designer, in a project, or in the DDF.** Projects
stay at 360 × 679, the canvas stays the size of every other screen, font sizes
stay as they are. The whole change lives in the measuring apparatus.

**2. The reference render mimics the device's *mixed* strategy.** Text and
vector shapes are drawn **natively at the device's scale** - smooth, the way
Compose draws them. Baked bitmaps keep being scaled up nearest-neighbour, the
way Coil does. `matchDeviceScaling` keeps its job, but only for the bitmaps it
was written for.

Note what this does *not* change: a rectangle with integer coordinates lands on
multiples of three either way, so every shape that matches today still matches.
Only anti-aliased edges move, and they move towards the truth.

**3. The tolerance is then tightened to whatever the measurement supports**,
and the suite fails if the residue grows. A threshold that nobody has revisited
is how a real difference hides; a threshold set to the measured floor plus a
margin is a guard.

**4. Android is measured on layout and geometry, not on rasterisation - and the
report says so.** The boards reach zero because they draw bitmap fonts with no
anti-aliasing: there are no in-between tones to disagree about. A 480 dpi phone
draws soft edges because that is what it is for, and forcing a zero there would
mean taking that away. Printing "pass" for both without saying they were
measured by different rules is the part that has to stop.

## Steps

1. **Split the reference render.** Draw the project at the device's scale:
   text and shapes natively, baked assets nearest-neighbour. The harness is
   `app/test-render/page.tsx`; the upscale lives in
   `hil/android/orchestrator.js`.
2. ~~**Re-measure and write the number down here.**~~ **Done, 2026-09-22.**
   Run both ways on the same phone, same fixture, minutes apart -
   `HIL_ANDROID_NO_SCALE=1` forces the old path and exists for exactly this:

   | case | 1x then enlarge | drawn at device scale | |
   |---|---|---|---|
   | 0-0 | 12 523 | **5 404** | −57 % |
   | 0-1 | 16 350 | **8 150** | −50 % |
   | 0-2 | 17 494 | **9 779** | −44 % |
   | 2-0 / 2-2 | 16 813 | **9 957** | −41 % |
   | 3-0 | 7 082 | **4 435** | −37 % |
   | 3-1 | 7 478 | **3 297** | −56 % |
   | 3-2 | 7 782 | **5 135** | −34 % |

   Wherever the residue was rasterisation, drawing at the device's scale
   removes between a third and well over half of it. Nothing regressed.

   **What it did not fix, and was never going to.** Screen 1 ("Ring") sits at
   ~16 % and case 2-1 at ~2.3 %, and both are the same with the scaling and
   without it - which is what the switch was added to prove. `landedOn` rules
   out a mis-swipe: even the best-matching screen scores 15.7 %, so the phone
   is on the right screen and drawing it differently.

   It is drawing an **older arc-level**. The designer's ring has since gained
   the same "asked against reported" treatment the slider has - a vertical
   setpoint mark outside the arc, a filled arc only for what is actually
   reported, and the two numbers, commanded large and measured in brackets.
   The phone still paints a white block where the mark goes, a grey empty
   track, and one number. The three blocks ported on 2026-09-22 were the bar,
   the switch and the button; the ring was not among them.

   So the remaining gap is a **port**, not a measurement. The suite is now
   doing its job: it stopped calling a real difference noise.
3. **Set the threshold to the measured floor plus a small margin**, and make
   growth a failure.
4. **State the standard in the report**, so the two families of panel are not
   silently equated.
5. **Then re-run the boards, strictly.** The user asked for all boards to be
   tested again down to the last pixel once Android is settled; conformance
   already runs that way, so this is a confirmation, not new machinery.

## Left open

- **What remains after step 1.** If the residue is a handful of pixels on glyph
  edges, that is the floor and decision 4 describes it honestly. If something
  larger survives, a real rendering difference has been hiding under the
  tolerance for months, and it gets fixed then rather than excused.
- **Hiding the system bars.** For a phone screwed to a wall nobody wants an
  Android navigation bar under the tank gauge, and hiding it would give the app
  1080 × 2159 instead of 1080 × 2037. That is a product question about usable
  area, not about pixel parity, and it is independent of everything above.
- **The rename.** All of this happens before `ScreensmithAndroid` becomes
  `schaltli-android`, by the user's own sequencing, so paths in this document
  are the current ones.
