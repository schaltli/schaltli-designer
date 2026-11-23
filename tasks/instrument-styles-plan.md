# Implementation plan: instrument styles for gauge and bar (`instrument-*`)

Spec: `docs/2026-11-23-instrument-styles.md` (approved 2026-11-23, with
the 4.3B spike's results). Tasks: `tasks/instrument-styles-todo.md`.
Proposals: artifact «Instrumentenkabinett»
(https://claude.ai/artifact/L7rPDLdoks8N2NQHrffVf2), whose SVG builders
are the drawing reference for every face. Chat German, docs English.

`tasks/plan.md` / `tasks/todo.md` belong to `theme-topic` and are left
alone; this plan follows the `<name>-plan.md` convention.

## Overview

Eleven styles (pressure gauge, art deco, moving-coil, roadster, cockpit,
rally, VFD, fuel gauge, blue/red, night cluster, engraving) for the
read-only gauge (`arc-level`) and bar (`level-indicator`), on every display
target: the designer, the ESP32 firmwares (rgbpanel 4.3B/4"/7", knob,
T-Encoder, PaperS3) and the Android app.

The order is set by risk and by the five dynamic primitives. One style -
the **fuel gauge** - goes all the way first: designer, contract, firmware,
Android, motion. It needs only *rotate* (gauge needle) and *translate*
(bar pointer) with a shadow, so it proves the whole chain with the fewest
parts. Then each further primitive arrives with the style that needs it
(*fill*: rally and night cluster, *segments* and *text*: VFD). After that
the remaining faces are designer work only, because every device already
draws every primitive.

## Architecture decisions

1. **Bake once, show the image everywhere.** The static layer (case, face,
   ticks, labels, zones, caption, unit) is drawn by the designer with the
   Canvas 2D API, at the object's pixel size, and cached by a hash of
   everything that shows on it. The editor draws that cached image too, so
   editor, export and device show the same face pixels. Canvas 2D, not
   SVG-as-image: an SVG in an `<img>` cannot use the page's fonts, and
   export already runs on canvases in the browser (`lib/asset-export.ts`).
2. **One pure core, written to be ported**, as `lib/energy-diagram.ts`:
   `lib/instrument.ts` turns properties + pixel size into the scale (ticks,
   labels, zones, angles through `calibrationPoints`) and the dynamic
   description (layers of primitives in object pixels, eighths of a pixel
   for corners, spring constants). Cases in `lib/instrument/vectors.json`.
   The face painters call the core for every position; devices only ever
   need the dynamic half.
3. **Needle pixels are integer and shared.** Bodies go through
   `PolygonRaster` (designer `lib/polygon-raster.ts`, firmware
   `src/project/PolygonRaster`; Android gets a port, it has none yet).
   Circles, rings and the cap through the same 1/8-pixel, 4×4-sample rule.
   Soft edges (glow, shadow) follow `lib/level-glow.ts`: an alpha table by
   whole pixels of distance from the shape, mixed into what lies beneath,
   plus an offset for a shadow. New: `lib/needle-raster.ts` + vectors, its
   ports `src/project/NeedleRaster.{h,cpp}` and `NeedleRaster.kt`. Row
   spans are mandatory (spike: 5× faster than walking the box).
4. **Contract as a feature, not a generation:** `instrument-styles`,
   announced in the DDF like `guard` and `charts`. The export carries per
   styled object the face asset path, the dynamic description and the
   spring; a device without the feature gets the object's flat look (the
   properties a flat gauge needs stay in the export), and the Deploy dialog
   names the styled objects it will show flat.
5. **Faces as RGB565 in the zip** (deflated), not BMP24: 312 KB unpacked on
   a device's file system instead of 470 KB for a 400 px face, and loaded
   into PSRAM without conversion. Android gets 24 bit PNG as its other
   assets.
6. **Motion is per board, the spring is shared data.** Frequency and
   damping come from the style; each board integrates the spring in its own
   loop. The transient need not match the designer pixel for pixel, the
   resting picture must. rgbpanel boards redraw the dirty rectangle
   (`blitRegion`, as the spike), knob and T-Encoder through their
   presenter, PaperS3 always `direct`.
7. **Style typefaces ship with the designer** (OFL: IM Fell English,
   Playfair Display, Oswald, Saira, Share Tech Mono) under `public/fonts/`
   with their licences; faces wait for `document.fonts` before baking. They
   never go to a device.

## Dependency graph

```
I1 core ──┬─> I3 fuel gauge face ─> I4 panel ─> I5 bar ─> I6 motion (designer)
I2 needle ┘                                         │
          └──────────────> I7 contract + export ────┤
                                  │                 │
                    I8 firmware static ─> I9 firmware motion
                    I10 Android
                                  │
          ┌───────────────────────┴────────────────────┐
   I11 fill (rally, night)   I12 segments+text (VFD)   (each: designer, firmware, Android)
          └──────────────────────┬─────────────────────┘
       I13-I16 remaining faces (designer only) ─> I17 round + e-paper ─> I18 handbook, release
```

I8 and I10 can run side by side once I7 is done, as can I11 and I12.

## Checkpoints

- **A (after I4):** one styled gauge in the designer, editable. The user
  looks at it before the bar and the devices.
- **B (after I10):** the fuel gauge on every device, resting and swinging.
  `npm run test:quick`; the user looks on the 4.3B, the knob and the phone.
- **C (after I12):** all five primitives on every device.
- **D (after I16):** all eleven styles; the user reviews them in the
  designer at 400/300/200/150/100 px.
- **E (after I18):** release (`npm run test:all`).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Canvas 2D faces differ visibly from the SVG proposals (no SVG filters, gradients drawn differently) | Med | Port the artifact's builders one by one; checkpoint A judges the first port before ten more |
| Text in baked faces differs slightly between browsers/OS | Low | The baked image is the truth on the device; e2e compares within a tolerance, HIL compares device against export, not against a reference picture |
| PSRAM runs out with several large styled gauges | Med | Decision 2 allows it; the face loader fails visibly (the flat look plus a log line) instead of crashing; Deploy dialog shows the face memory per screen |
| Knob / T-Encoder presenter cannot redraw a region during a swing as cheaply as rgbpanel | Med | Measure in I9 with the spike's method; fall back to `direct` motion on that board, recorded in its DDF |
| Android has no `PolygonRaster` | Med | Port it in I10 with the shared vectors before the needle |
| Eleven faces is a lot of drawing code | Med | One file per style under `components/canvas/instrument-faces/`, sharing helpers (ticks, labels, bezel, glass); the core does all positions |

## Decided on the plan (the user, 2026-11-23)

1. **A styled face looks the same in light and dark.** A physical
   instrument has one look; styled objects export no `…Dark` for the face.
2. **The style chooses the readout's font**, not the user. Done as the
   faces are: the designer bakes the glyphs a readout can show (`0-9 . - +`
   and the unit) in the style's own typeface at the readout's size into a
   small strip image, exported with the face; the *text* primitive places
   those glyphs. No project font and no `fontId` for a styled readout, and
   the VFD gets its segment look on every device.
