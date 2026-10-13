# Plan: android-draws-all

The app draws every object itself, as the boards have since 2026-09-25
(device contract §2, «Static content»): box, line and a fixed icon, and
the screen's colour. The Android bundle carries no baked background any
more. The user's decision (2026-10-13): «Die Android-App soll sich
gefälligst auch genauso verhalten» - no zoo. Released with local-android
as app v0.11.0.

## Decisions

1. **The export bakes nothing.** `lib/android-export.ts` writes no
   `backgroundImage`/`backgroundImageDark` and no screen PNGs. A screen's
   background *picture* then reaches no device at all, as on the boards
   (contract §2 already says so for them).
2. **A feature, not a generation.** The app's DDF lists
   `"static-objects"` in `supportedFeatures`. Deploy asks an app without
   it to update when the project has a box, a line or a fixed icon - an
   older app still fills the screen colour, so a project without them is
   fine on it. Boards are not asked: their export never carried the
   picture (the requirement belongs to the Android bundle).
3. **Box** like the boards and the designer's `render-box.ts`: an outer
   `fillRoundRect` in the stroke colour, the inset one in the fill colour
   (`render/GfxPrimitives.kt`, already the Adafruit port).
4. **Line** ported from the designer's `render-line.ts` -
   Bresenham, `fillThickLine`, fillets, arrowheads - as
   `render/LineRaster.kt`, pure and held to a golden file the designer
   records (`hil/android/fixtures/build-line-golden.js`), the way the arc,
   the pill and the level shape are. The live line uses it too.
5. **A fixed icon** is drawn from the `path`/`pathDark` the export already
   gives it (`IconPathView`), with its background colour.
6. **A text's background** fills its whole frame, not its line (found in
   local-android, 2026-10-13).
7. **Tolerances:** the Android HIL compares with its existing tolerance;
   any rounding difference at a corner or a fillet that needs more is
   listed in the final report, not a reason to stop (the user, 2026-10-13).

## Tasks

- **D1 Line raster + golden.** `LineRaster.kt`, `LineRasterGoldenTest`,
  the designer's golden builder. Verify: the golden test green.
- **D2 The app draws box, line, fixed icon, text background; no
  background picture; DDF `static-objects`.** `ScreenRenderer.kt`,
  new `StaticObjectViews.kt`, `TextBoxView.kt`, `MqttDataLineView.kt`,
  `DdfBuilder.kt` (+test). Verify: unit tests, lint.
- **D3 The export and Deploy.** `lib/android-export.ts` without the bake,
  `lib/deploy-plan.ts`/deploy dialog asking older apps; e2e
  (`android-export.spec.ts`, `deploy-plan.spec.ts`). The Android HIL
  fixture: no background expected; a box, a line and a fixed icon inside
  a switcher's panel. Verify: e2e, the Android HIL on the phone.
- **D4 Handbook** (`geraete/android.md`, wherever a background picture is
  promised) and the contract §2.
- **Checkpoint:** test:quick green; then v0.11.0 (local topics + this).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The line port differs from the designer at fillets | Med | golden file from the designer's own code, point for point |
| Rounded corners of a box differ by AA | Low | Adafruit integer port on both sides; tolerance listed if needed |
| A project with a background picture loses it on Android | Low | the same as on every board since 2026-09-25; handbook says so |
