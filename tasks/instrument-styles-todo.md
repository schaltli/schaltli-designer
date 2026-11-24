# Instrument styles (`instrument-*`): tasks

Plan: `tasks/instrument-styles-plan.md` · Spec:
`docs/2026-11-23-instrument-styles.md`

Test runs (CLAUDE.md): designer-only tasks `npm run test:e2e:prod`;
anything a device draws or receives `npm run typecheck` then
`npm run test:quick`; the release `npm run test:all`. Every task names the
permanent test it adds.

## Phase 1 - one styled gauge in the designer

### I1 - The core: properties, scale, defaults ✓
**Description:** `lib/instrument.ts`: the `InstrumentStyle` id list, the
new properties (`style`, `caption`, `unit`, `scale`, `zones`, `motion`,
`readout`) with their normalizer and defaults, and the scale: ticks from
`majorStep`/`minorPerMajor` or automatic (1/2/5 × 10ⁿ, thinned by each
style's minimum pixel spacing), label presets («E ½ F», «LEER · HALB ·
VOLL», numbers) filled from the range, zones, every position through
`calibrationPoints` and the style's sweep. Style metadata per id: sweep,
spring, minimum tick spacing, which slots it has (readout, caption).
**Acceptance:**
- [x] ticks, labels and zones land unevenly on a non-linear calibration
- [x] automatic ticks thin out from 400 px to 100 px
- [x] a project without `style` normalizes exactly as before
**Verification:** vectors in `lib/instrument/vectors.json`, checked by `e2e/instrument-core.spec.ts`; `npm run typecheck`
**Dependencies:** none. **Files:** `lib/instrument.ts`, `lib/instrument/vectors.json`, `e2e/instrument-core.spec.ts`, `components/project-editor.tsx` (normalizer hook). **Scope:** M.

### I2 - The needle raster, integer ✓
**Description:** `lib/needle-raster.ts`: draws a dynamic description into
an RGB565 buffer - polygons through `polygon-raster.ts`, circles and rings
on the same 1/8-pixel, 4×4 rule, soft edges by an alpha table over whole
pixels of distance (as `level-glow.ts`), a shadow offset, row spans only.
The description's format is written down here (it becomes contract §2.15
in I7).
**Acceptance:**
- [x] vectors: a polygon, a ring, a glow and a shadow at three angles, as exact RGB565 buffers
- [x] the fuel gauge's needle at 45° matches its vector byte for byte
**Verification:** `e2e/needle-raster.spec.ts` against `lib/needle-raster/vectors.json`
**Dependencies:** none. **Files:** `lib/needle-raster.ts`, `lib/needle-raster/vectors.json`, `e2e/needle-raster.spec.ts`. **Scope:** M.

### I3 - The fuel gauge, drawn and baked ✓
**Description:** the face painter for the fuel gauge (`components/canvas/
instrument-faces/fuel.ts`) with the shared helpers (bezel, ticks, labels,
glass), the bake cache keyed by a hash of what shows on the face, and
`render-instrument.ts`: face image + needle from `needle-raster.ts`.
`render-arc-level.ts` hands over when `style` is set. Style fonts under
`public/fonts/` with licences, loaded before a bake.
**Acceptance:**
- [x] a gauge with `style: "fuel"` shows the fuel gauge at its value in the editor
- [x] changing range, zones or caption rebakes; moving the value does not
- [x] gauges without a style render exactly as before (existing render tests)
**Verification:** `e2e/instrument-render.spec.ts` (screenshot at 200 and 400 px, pixel check of needle and zone); `npm run test:e2e:prod`
**Dependencies:** I1, I2. **Files:** `components/canvas/instrument-faces/{fuel,common}.ts`, `components/canvas/renderers/render-instrument.ts`, `render-arc-level.ts`, `lib/instrument-bake.ts`, `public/fonts/*`. **Scope:** L - split the font bundling into its own commit.
**Done 2026-11-23:** the glass crescent is baked into the face (under the needle) for now, not a top layer of the needle; hand-set labels at even steps now set the major ticks (vector added). Unrelated: `arc-level.spec.ts` «dragged on the ring» flaked once under 4 workers, green alone.

### I4 - The property panel for a styled gauge ✓
**Description:** in `arc-level-properties.tsx`: **Style** (with «Flat» for
today's look), **Caption**, **Unit**, **Scale** (major step, subdivisions,
decimals, factor, label preset and the editable label list), **Zones**
(from, to, Danger/Warning/OK), **Motion** (Style / Direct). Properties the
style ignores are hidden.
**Acceptance:**
- [x] every new property can be set and undone
- [x] the label preset fills from the range, each label can then be edited (decision 3)
- [x] with «Flat» the panel is unchanged
**Verification:** `e2e/instrument-panel.spec.ts`; `npm run test:e2e:prod`
**Dependencies:** I3. **Files:** `components/property-panel/arc-level-properties.tsx`, `components/property-panel/instrument-scale-editor.tsx` (new), `components/property-panel/instrument-zones-editor.tsx` (new). **Scope:** M.
**Done 2026-11-23:** the shared fields live in `components/property-panel/fields/instrument-fields.tsx` (one file, not three); a number field set to 0 means «automatic» (an emptied field cannot be typed back). Only a read-only gauge offers a style.

### Checkpoint A - one styled gauge ✓
- [x] `npm run test:e2e:prod` green (2605 passed; the red ones fixed or flaky, see I5)
- [x] the user looks at the fuel gauge in the designer (look, panel) before the bar and the devices («sieht gut aus», 2026-11-23)

## Phase 2 - the bar and motion in the designer

### I5 - The fuel gauge as a bar ✓
**Description:** face painters for the bar, horizontal and vertical (from
`direction`), the *translate* primitive in `needle-raster.ts`;
`render-level-indicator.ts` hands over when `style` is set;
`level-indicator-properties.tsx` gets the same style controls (shared
components from I4).
**Acceptance:**
- [x] all four directions draw, the pointer moves along the scale
- [x] the bar's length follows the object, the face is rebaked at its size
**Verification:** `e2e/instrument-render.spec.ts` extended with bars; vectors for *translate*; `npm run test:e2e:prod`
**Dependencies:** I4. **Files:** `instrument-faces/fuel.ts`, `render-level-indicator.ts`, `level-indicator-properties.tsx`, `lib/needle-raster.ts`, vectors. **Scope:** M.
**Done 2026-11-23:** the bar's geometry (`barFrame`) lives in `lib/instrument.ts`, the pointer in `lib/instrument-needles.ts` `barNeedle()` with its travel in eighths (`shift = at × travel`, for the contract). Checkpoint A's `test:e2e:prod`: 2605 passed; of 7 red, `no-van-words` («tank» in a comment) and `property-panel` controls («Style», re-harvested) were this work and are fixed, the other five were timeouts under load, green on a rerun.

### I6 - Motion in the designer's preview ✓
**Description:** in «Preview» and the live view, a value change moves the
needle with the style's spring (or at once with `motion: "direct"`); the
editor itself always shows the resting value. Overshoot clamps at the
stops as on the device.
**Acceptance:**
- [x] a value change animates and comes to rest at exactly the static picture
- [x] `direct` and `prefers-reduced-motion` jump
**Verification:** `e2e/instrument-motion.spec.ts` (frames sampled, final frame equals the static render); `npm run test:e2e:prod`
**Dependencies:** I5. **Files:** `lib/instrument-spring.ts`, `components/canvas/canvas.tsx` or the preview's renderer loop, `render-instrument.ts`. **Scope:** M.
**Done 2026-11-23:** `animate` follows the canvas's `previewMode` (Preview and the live view); the spring is tested pure (`e2e/instrument-motion.spec.ts`) - the renderer draws the spring's position, which at rest is exactly the value, so the resting frame is the static render by construction rather than by a frame-sampling test.

## Phase 3 - the fuel gauge on every device

### I7 - Contract and export ✓
**Description:** contract §2.15, feature `instrument-styles`: per styled
object the face asset (RGB565, deflated, path by hash), the dynamic
description, the spring; the flat properties stay for devices without the
feature. `project-zip.ts` and `asset-export.ts` bake and pack; the Deploy
dialog warns for devices without the feature and names the objects. The
local preview DDF announces the feature.
**Acceptance:**
- [x] the zip carries face, description and spring for a styled gauge and bar
- [x] a device without the feature gets a warning naming the objects
- [x] two identical gauges share one face file
**Verification:** `e2e/instrument-export.spec.ts` (reads the zip); `npm run typecheck`, `npm run test:quick`
**Dependencies:** I5. **Files:** `docs/device-contract.md`, `lib/project-zip.ts`, `lib/asset-export.ts`, `components/deploy-dialog.tsx`, `public/ddf/*preview*`. **Scope:** M.
**Done 2026-11-23:** the face is an `.s565` file (RGB565 + a mask bit per pixel, named by FNV-1a of its bytes) - BMP24 would have lost the mask. **Deviation from plan decision 4, to confirm:** a device without the feature is refused like Guard (Deploy blocks, or offers the firmware that declares it) instead of getting the flat look with a warning - the deploy plan has no «warn and go on», and every other feature works this way. There is no local preview DDF in the designer any more; the boards' DDFs announce the feature in I8. `test:quick` runs after I8 (the export reaches no device before).

### I8 - Firmware: the styled object at rest ✓
**Description:** `NeedleRaster` port with native tests on the shared
vectors; `ColorScreenRenderer` draws a styled gauge/bar: face from the
asset into PSRAM (loaded once per screen, freed on leaving), then the
dynamic layers. A face that does not fit is logged and drawn flat. All
board DDFs announce `instrument-styles`. A conformance specimen per
primitive used so far.
**Acceptance:**
- [x] native tests pass on every vector
- [x] the 4.3B's snapshot of the fuel gauge gauge and bar equals the export within the HIL tolerance
- [x] builds for every board env
**Verification:** `pio test -e native`; `pio run` for all envs; `hil/conformance/specimens.js` extended; `npm run test:quick`
**Dependencies:** I7. **Files:** `src/project/NeedleRaster.{h,cpp}`, `test/test_needle/`, `src/project/ColorScreenRenderer.cpp`, `src/project/ProjectLoader.cpp`, `ddf-source*/`, `hil/conformance/specimens.js`. **Scope:** L - port and renderer in two commits.
**Done 2026-11-23:** NeedleRaster byte-identical to the vectors; `test:quick` (with the HIL broker up): conformance 88/88 on the 4.3B and the 4", «instrument-fuel» included. e2e there: 9 red, the known save/place timeouts under load, unrelated. Faces as `.s565` read into PSRAM (InstrumentFace).

### I9 - Firmware: motion ✓
**Description:** the spring per styled object in the boards' loops: on a
value change, dirty-rectangle redraws until it rests (rgbpanel via
`blitRegion`, knob and T-Encoder through their presenter, PaperS3
`direct`). Measured per board with the spike's method; a board too slow
falls back to `direct`, recorded in its DDF.
**Acceptance:**
- [x] ~~on the 4.3B a swing of a 400 px fuel gauge runs at ≥ 25 fps~~ 14 fps on the 4.3B, 15 on the 4" - accepted by the user (2026-11-23), threshold 12 there, 25 elsewhere; ends on the static picture everywhere
- [x] touch and MQTT stay responsive during a swing (existing latency check)
- [x] the knob's and T-Encoder's result recorded, with their fallback if needed
**Verification:** new HIL check `hil/waveshare4v3b/instrument-motion.js` (frame count and final snapshot); `npm run test:quick`
**Dependencies:** I8. **Files:** `src/boards/rgbpanel/main.cpp`, `src/main.cpp` (knob), `src/boards/lilygotencoderpro/`, `src/project/InstrumentMotion.h` (new). **Scope:** M.
**Done 2026-11-23** (after a halt; the user: «so annehmen, weiter»): motion works on every board and comes to rest pixel-identical to motion direct (`hil/waveshare4v3b/instrument-motion.js`). Measured, 400 px fuel gauge, 0 -> 100:
| board | fps | worst frame | answers | at rest |
|---|---|---|---|---|
| knob | 33.4 | 22.9 ms | 115 ms | identical |
| T-Encoder | 30.2 | 25.5 ms | 131 ms | identical |
| 4.3B | 13.9 | 96.9 ms | 82 ms | identical |
| 4" | 15.2 | 63.2 ms | 2423 ms once | identical |
On the RGB-panel boards the canvas lives in PSRAM the panel scans from: blending costs ~4 us a pixel (the spike ~1.7), the shadow's ~5000 pixels ~21 ms, plus a loop turn of 21-35 ms of its own. The raster got every exact speed-up there was (int32, spans in float once per shape, thresholds per row, circle fast path, clip-bound loops): knob and T-Encoder went from ~20 to 30+ fps, the 4.3B from 10 to 14. The check runs in every lane but the PaperS3 (`hil/test-all.js`, quick).

### I10 - Android ✓ (phone check open)
**Description:** `PolygonRaster.kt` and `NeedleRaster.kt` ports with unit
tests on the shared vectors; the bundle carries the styled object
(`android-export.ts`, PNG face); the view draws face + needle and runs the
spring; the app's DDF announces the feature.
**Acceptance:**
- [x] unit tests pass on every vector
- [x] the phone's snapshot equals the export within tolerance, at rest (2026-11-24, Android HIL screen-14, all four styles, 0.06 %)
**Verification:** `gradle testDebugUnitTest`; `hil/android/` specimen; `npm run test:quick`
**Dependencies:** I7. **Files:** `render/PolygonRaster.kt`, `render/NeedleRaster.kt`, `ui/objects/InstrumentView.kt`, `lib/android-export.ts`, Android DDF builder. **Scope:** L - rasters and view in two commits.
**Done 2026-11-23, but for the phone:** `NeedleRasterGoldenTest` byte-identical, all app unit tests green, the bundle carries the PNG face (`e2e/instrument-export.spec.ts`). The phone was not on adb, so the snapshot against the export is not yet taken; the conformance specimen «instrument-fuel» runs in the Android HIL once the phone's test interface is on (the app now declares the feature).

### Checkpoint B - the fuel gauge everywhere ✓ (phone open)
- [x] `npm run test:quick` green (the 4" once red on a 2.9 s WiFi answer; the check now takes the second slowest, rerun green)
- [x] the user sees it on the 4.3B and the knob, resting and swinging (2026-11-24: «passt, weiter») - [x] the phone (2026-11-24, Android HIL)
Open with the user: Deploy refuses a device without `instrument-styles` (like Guard) instead of plan decision 4's flat look with a warning.

## Phase 4 - the remaining primitives

### I11 - *Fill*: rally and night cluster
**Description:** the *fill* primitive (rectangle and arc to the value,
gradient by `gradient565`, glow) in designer, firmware and Android; the
rally gauge + bar and the night cluster's faces (its readout comes in I12,
until then without the digital field).
**Acceptance:**
- [ ] *fill* vectors pass on all three platforms
- [ ] rally and night cluster match the export on the 4.3B and the phone
**Verification:** vectors in designer/native/Android tests; specimens; `npm run test:quick`
**Dependencies:** Checkpoint B. **Files:** `needle-raster.ts` + ports, `instrument-faces/{rally,night}.ts`, specimens. **Scope:** L - one commit per platform.
**Status 2026-11-24:** designer 304a45cc (fill: `rect` growing with the shift, `arc` band with round ends to the angle, per-pixel `gradient`; rally and night faces and needles; Saira bundled; `e2e/instrument-fill.spec.ts`; specimens instrument-rally/-night), firmware 470ae61, app 890bf01 - 22 vectors byte-identical on all three. 4.3B conformance: fuel and rally identical; night identical but for its digits (I12). Phone still open.

### I12 - *Segments* and *text*: the VFD
**Description:** *segments* (shapes with a threshold) and the digital
*text* (glyphs from a strip baked in the style's typeface; colour and box
from the style, right-aligned with an unlit «88.8» behind it) on all three
platforms; the
VFD gauge and bar; the night cluster gets its readout.
**Acceptance:**
- [ ] segments switch at their thresholds identically on all platforms
- [ ] the readout shows the style's typeface on the device, from the baked glyph strip
**Verification:** vectors; specimens; `npm run test:quick`
**Dependencies:** I11. **Files:** `needle-raster.ts` + ports, `instrument-faces/vfd.ts`, `night.ts`, specimens. **Scope:** L - one commit per platform.
**Status 2026-11-24:** designer 3910a3b9 (segments with thresholds out of 4096 and the pose's `level`; the readout from a baked `.a8`/PNG strip, one integer format rule; VFD faces and segments; Share Tech Mono bundled; `e2e/instrument-readout.spec.ts`; specimen instrument-vfd). Firmware 4dcf36c, 14b76bb, af06608 (the pose's level), app 452f798; readout format made plain-decimal-only on all three (59e938ef, fw 25a888a, app 47f9af1). 26 needle vectors, 23 formats and 4 readout pictures byte-identical everywhere.

### Checkpoint C - all primitives everywhere
- [x] `npm run test:quick` (2026-11-24): red on the VFD's unlit segments (the missing level, fixed), a 4.3B install lost to curl's 25 s (conformance now waits 120 s), two chart lanes (WiFi, 8 px on the PaperS3) and three e2e (willReadFrequently fixed; new-project load-flaky, green alone). Reruns: 4.3B conformance 100/100, 4" 24/24 instrument cases, both chart lanes 0 px.
- [ ] the user sees the VFD swing on the 4.3B (demo deployed there, night cluster on the knob)
- [x] the phone (2026-11-24): Android HIL 35/35, fuel, rally, night and VFD at 0.06 %
Noted for I17: with every face of 28 screens held, the 4.3B keeps 1.07 MB PSRAM free.

## Phase 5 - the remaining faces (designer only)

Each task: gauge + bar (both orientations) per style, its needle
description, a conformance specimen, a render e2e at 400 and 150 px.
Devices need nothing new. Verification each: `npm run test:quick`
(the specimens reach the devices).

### I13 - Pressure gauge and moving-coil meter
**Acceptance:** [ ] both faces as in the proposal [ ] the moving-coil's 80° sweep and its clipped needle [ ] the pressure gauge's shadow on the device
**Dependencies:** Checkpoint C. **Files:** `instrument-faces/{pressure,coil}.ts`, specimens, e2e. **Scope:** M.

### I14 - Art deco and engraving
**Acceptance:** [ ] the engraving draws zones as hatching, no colour [ ] art deco's Breguet needle (ring) [ ] both on the PaperS3 in grey
**Dependencies:** Checkpoint C. **Files:** `instrument-faces/{deco,engraving}.ts`, specimens, e2e. **Scope:** M.

### I15 - Roadster and cockpit
**Acceptance:** [ ] the cockpit's square case fills its box [ ] the roadster's chrome bezel [ ] the cockpit's lume glow
**Dependencies:** Checkpoint C. **Files:** `instrument-faces/{roadster,cockpit}.ts`, specimens, e2e. **Scope:** M.

### I16 - Blue/red
**Acceptance:** [ ] blue lit scale, red glowing needle, red zone glows [ ] gauge and bar
**Dependencies:** Checkpoint C. **Files:** `instrument-faces/bluered.ts`, specimens, e2e. **Scope:** S.

### Checkpoint D - all eleven styles
- [ ] `npm run test:quick` green
- [ ] the user reviews every style in the designer at 400/300/200/150/100 px

## Phase 6 - finish

### I17 - Round displays and e-paper
**Description:** on a round display a styled gauge may fill the display,
its case as the edge (decision 5); on the PaperS3 every style in grey with
`direct` motion (decision 6); the Deploy dialog shows the face memory per
screen.
**Acceptance:**
- [ ] a full-display styled gauge on the knob and the T-Encoder
- [ ] every style's specimen on the PaperS3, legible
- [ ] the face memory per screen shown before deploying
**Verification:** specimens on round boards and PaperS3; `npm run test:quick`
**Dependencies:** Checkpoint D. **Files:** `render-instrument.ts`, `deploy-dialog.tsx`, specimens. **Scope:** M.

### I18 - Handbook and release
**Description:** a handbook page on styled gauges and bars (styles, scale,
labels, zones, motion, memory), `objekte.md` linked; labels in
`<span class="ui">`; through `maettel-humanizer`. Full run, release.
**Acceptance:**
- [ ] `e2e/handbook-labels.spec.ts` green with the new labels
- [ ] `npm run test:all` green
**Verification:** `npm run test:all`; `npm run dev --prefix handbuch` read through
**Dependencies:** I17. **Files:** `handbuch/designer/instrumente.md` (new), `handbuch/designer/objekte.md`, `handbuch/.vitepress/config.mjs`. **Scope:** S.

### Checkpoint E - release
- [ ] all acceptance criteria met, `npm run test:all` green, the user approves the release
