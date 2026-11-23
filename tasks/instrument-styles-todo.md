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

### Checkpoint A - one styled gauge
- [ ] `npm run test:e2e:prod` green
- [ ] the user looks at the fuel gauge in the designer (look, panel) before the bar and the devices

## Phase 2 - the bar and motion in the designer

### I5 - The fuel gauge as a bar
**Description:** face painters for the bar, horizontal and vertical (from
`direction`), the *translate* primitive in `needle-raster.ts`;
`render-level-indicator.ts` hands over when `style` is set;
`level-indicator-properties.tsx` gets the same style controls (shared
components from I4).
**Acceptance:**
- [ ] all four directions draw, the pointer moves along the scale
- [ ] the bar's length follows the object, the face is rebaked at its size
**Verification:** `e2e/instrument-render.spec.ts` extended with bars; vectors for *translate*; `npm run test:e2e:prod`
**Dependencies:** I4. **Files:** `instrument-faces/fuel.ts`, `render-level-indicator.ts`, `level-indicator-properties.tsx`, `lib/needle-raster.ts`, vectors. **Scope:** M.

### I6 - Motion in the designer's preview
**Description:** in «Preview» and the live view, a value change moves the
needle with the style's spring (or at once with `motion: "direct"`); the
editor itself always shows the resting value. Overshoot clamps at the
stops as on the device.
**Acceptance:**
- [ ] a value change animates and comes to rest at exactly the static picture
- [ ] `direct` and `prefers-reduced-motion` jump
**Verification:** `e2e/instrument-motion.spec.ts` (frames sampled, final frame equals the static render); `npm run test:e2e:prod`
**Dependencies:** I5. **Files:** `lib/instrument-spring.ts`, `components/canvas/canvas.tsx` or the preview's renderer loop, `render-instrument.ts`. **Scope:** M.

## Phase 3 - the fuel gauge on every device

### I7 - Contract and export
**Description:** contract §2.15, feature `instrument-styles`: per styled
object the face asset (RGB565, deflated, path by hash), the dynamic
description, the spring; the flat properties stay for devices without the
feature. `project-zip.ts` and `asset-export.ts` bake and pack; the Deploy
dialog warns for devices without the feature and names the objects. The
local preview DDF announces the feature.
**Acceptance:**
- [ ] the zip carries face, description and spring for a styled gauge and bar
- [ ] a device without the feature gets a warning naming the objects
- [ ] two identical gauges share one face file
**Verification:** `e2e/instrument-export.spec.ts` (reads the zip); `npm run typecheck`, `npm run test:quick`
**Dependencies:** I5. **Files:** `docs/device-contract.md`, `lib/project-zip.ts`, `lib/asset-export.ts`, `components/deploy-dialog.tsx`, `public/ddf/*preview*`. **Scope:** M.

### I8 - Firmware: the styled object at rest
**Description:** `NeedleRaster` port with native tests on the shared
vectors; `ColorScreenRenderer` draws a styled gauge/bar: face from the
asset into PSRAM (loaded once per screen, freed on leaving), then the
dynamic layers. A face that does not fit is logged and drawn flat. All
board DDFs announce `instrument-styles`. A conformance specimen per
primitive used so far.
**Acceptance:**
- [ ] native tests pass on every vector
- [ ] the 4.3B's snapshot of the fuel gauge gauge and bar equals the export within the HIL tolerance
- [ ] builds for every board env
**Verification:** `pio test -e native`; `pio run` for all envs; `hil/conformance/specimens.js` extended; `npm run test:quick`
**Dependencies:** I7. **Files:** `src/project/NeedleRaster.{h,cpp}`, `test/test_needle/`, `src/project/ColorScreenRenderer.cpp`, `src/project/ProjectLoader.cpp`, `ddf-source*/`, `hil/conformance/specimens.js`. **Scope:** L - port and renderer in two commits.

### I9 - Firmware: motion
**Description:** the spring per styled object in the boards' loops: on a
value change, dirty-rectangle redraws until it rests (rgbpanel via
`blitRegion`, knob and T-Encoder through their presenter, PaperS3
`direct`). Measured per board with the spike's method; a board too slow
falls back to `direct`, recorded in its DDF.
**Acceptance:**
- [ ] on the 4.3B a swing of a 400 px fuel gauge runs at ≥ 25 fps and ends on the static picture
- [ ] touch and MQTT stay responsive during a swing (existing latency check)
- [ ] the knob's and T-Encoder's result recorded, with their fallback if needed
**Verification:** new HIL check `hil/waveshare4v3b/instrument-motion.js` (frame count and final snapshot); `npm run test:quick`
**Dependencies:** I8. **Files:** `src/boards/rgbpanel/main.cpp`, `src/main.cpp` (knob), `src/boards/lilygotencoderpro/`, `src/project/InstrumentMotion.h` (new). **Scope:** M.

### I10 - Android
**Description:** `PolygonRaster.kt` and `NeedleRaster.kt` ports with unit
tests on the shared vectors; the bundle carries the styled object
(`android-export.ts`, PNG face); the view draws face + needle and runs the
spring; the app's DDF announces the feature.
**Acceptance:**
- [ ] unit tests pass on every vector
- [ ] the phone's snapshot equals the export within tolerance, at rest
**Verification:** `gradle testDebugUnitTest`; `hil/android/` specimen; `npm run test:quick`
**Dependencies:** I7. **Files:** `render/PolygonRaster.kt`, `render/NeedleRaster.kt`, `ui/objects/InstrumentView.kt`, `lib/android-export.ts`, Android DDF builder. **Scope:** L - rasters and view in two commits.

### Checkpoint B - the fuel gauge everywhere
- [ ] `npm run test:quick` green
- [ ] the user sees it on the 4.3B, the knob and the phone, resting and swinging

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

### Checkpoint C - all primitives everywhere
- [ ] `npm run test:quick` green; the user sees the VFD swing on the 4.3B

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
