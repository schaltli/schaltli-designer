# Plan: text sizes

Module `text-sizes` of docs/2026-11-04-text-sizes-and-colours.md (approved
2026-11-04). Branch `text-sizes` in designer and firmware, released together
with `native-buttons` (the user, 2026-11-04).

## What was found

- A typography in a DDF names a **family per old style** (caption, label,
  title, display); the designer picks the face within the family closest to
  a style's millimetres (`fontFor`, `fourBitFontFor` by capital height).
- The colour boards' 4-bit families carry **exactly four capital heights**,
  one per style (`tools/build-typography-fonts.py`, `TEXT_STYLE_MM` there);
  the PaperS3 its 1-bit u8g2 sizes. The DDF is compiled into the firmware
  and sent over MQTT, so new faces mean a firmware release - with
  native-buttons.
- The device never reads typographies: the designer writes a font id into
  every object.

## Approach

- **Sizes, not a new DDF format.** `TEXT_SIZES` (micro … huge) with their
  millimetres; each size takes its family from one of the four style keys a
  typography already has: Micro, Mini, Standard → caption; Large, XL →
  label; XXL → title; Huge → display. The DDF stays as it is.
- **Property:** `textStyle` keeps its name and takes the size ids; opening a
  project moves the four old values to the nearest size (caption →
  standard, label → xl, title → xxl, display → huge) and resolves the font
  anew (`resolveScale`).
- **Fonts:** the tool builds each 4-bit family at the seven capital heights
  (0.69 of each size's line), Seven Segment at Huge's line; the faces no
  longer asked for go, each named in the `replaces` of the nearest new one,
  so a project naming an old id by hand («Custom») draws in its successor.
  The PaperS3 keeps its 1-bit sizes, picked by closest line.

## Tasks

- **T1 designer model and panel** - `lib/size-scale.ts`,
  `lib/device-description.ts`, the Text size field («Text size», seven
  options with px), migration, blocks and demos on sizes. Verify:
  `e2e/size-scale.spec.ts` (sizes in px per device, migration, family
  mapping), property-panel specs, `handbook-labels`.
- **T2 firmware fonts** - the tool at seven sizes, DDFs regenerated, the
  designer's `public/ddf` copies updated, flash checked on every board.
  Verify: builds, `hil/size-scale/text-styles.js`, conformance text on the
  boards.
- **T3 handbook** - page «Schriftgrössen» with the table and a screenshot
  with callouts (`e2e/handbook-screenshots.spec.ts`), «Stile» in
  `objekte/anzeigen.md`, «Text style» → «Text size» everywhere.
- **T4 CamperUI rebuild on sizes**, `test:quick`.
