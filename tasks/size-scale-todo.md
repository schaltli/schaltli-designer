# size-scale: tasks

Plan: `tasks/size-scale-plan.md` · Spec: `docs/2026-09-30-size-scale.md`

Every task that changes what a user sees updates its handbook page in the
same piece of work (CLAUDE.md) and says which one.

## Phase 1 - what devices say

## Task 1: The designer reads millimetres, family/weight and typographies

**Description:** `DeviceDescriptionFile.screen` gains `widthMm`/`heightMm`,
fonts `family`/`weight`, the file `typography` (named sets of style →
family); a set list without «Standard» counts as none. They reach the
project (`deviceDescriptionToProjectFields`, `ProjectFont`, a project field
for the typographies and the screen's millimetres) on every path a DDF
comes in: new project, opening, embedded DDF, "Load device".
`docs/device-contract.md` §1 describes the fields.

**Acceptance criteria:**
- [ ] A DDF with the fields gives a project with px/mm, fonts with family
      and weight, and its typographies; one without gives none of them and
      behaves as today.
- [ ] A DDF whose typographies lack «Standard» has no typography.

**Verification:** `npx playwright test e2e/size-scale.spec.ts` (new, the
parsing part); `e2e/device-platform.spec.ts`, `e2e/new-project.spec.ts`
green; `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/device-description.ts`,
`components/project-editor.tsx`, `components/project-settings-dialog.tsx`,
`docs/device-contract.md`, `e2e/size-scale.spec.ts`

**Estimated scope:** M

## Task 2: The firmware DDFs say them (schaltli-firmware)

**Description:** Knob, 4.3B and PaperS3 `device.json`: `widthMm`/`heightMm`
from the panels' data sheets, `family`/`weight` for every font, a
«Standard» typography (Helvetica for Caption and Label; the largest
regular face - Helvetica or FreeUniversal - for Title and Display, as the
fonts allow). Only with the user's go-ahead for that repo.

**Acceptance criteria:**
- [ ] The three DDFs parse in the designer with a scale (Task 1's spec,
      reading them from `../schaltli-firmware` as `e2e/ddf-seed.ts` does).
- [ ] The data sheet each millimetre value comes from is named in the
      commit.

**Verification:** `npx playwright test e2e/size-scale.spec.ts`; the
firmware repo's own DDF checks, if any

**Dependencies:** Task 1

**Files likely touched:** `../schaltli-firmware/ddf-source*/device.json`

**Estimated scope:** S

## Task 3: The Android app says them (schaltli-android)

**Description:** `DdfBuilder` writes `widthMm`/`heightMm` from the screen
in dp (160 dp = 1 inch), `family: "Roboto"` and `weight` for its fonts,
more sizes (the TTF scales freely), and a «Standard» typography. Its unit
test checks them. Only with the user's go-ahead for that repo.

**Acceptance criteria:**
- [ ] `DdfBuilderTest` checks millimetres and the typography.
- [ ] A DDF the app builds parses in the designer with a scale.

**Verification:** `./gradlew test` in schaltli-android;
`npx playwright test e2e/size-scale.spec.ts` with a DDF built by the test

**Dependencies:** Task 1

**Files likely touched:** `../schaltli-android/app/src/main/java/com/schaltli/android/ddf/DdfBuilder.kt`,
its test

**Estimated scope:** S

## Checkpoint A: every real DDF parses with a scale
- [ ] Knob, 4.3B, PaperS3 and an Android-built DDF: px/mm, fonts by
      family, «Standard»
- [ ] Review with the user

## Phase 2 - the scale

## Task 4: `lib/size-scale.ts`: millimetres, fonts within a family, steps

**Description:** The millimetres of the four styles and of S/M/L per object
kind (spec tables), `pxPerMm`, `fontFor(style, bold, typography, fonts,
pxPerMm)` (closest line height in the style's family, bold where the
family has it), `stepPx`, `nearestStep`, `isOnScale` (a pixel's
tolerance), `typographyFor(project)` («Standard» when the chosen name is
missing). Pure.

**Acceptance criteria:**
- [ ] The spec's worked example (4.3B: Caption 18, Label 25, Title
      Halloween 45, Display 35) comes out of `fontFor` with a test DDF.
- [ ] On the three firmware DDFs every style and step gives a font and a
      size; a family without bold gives regular; a missing typography
      name gives «Standard».

**Verification:** `npx playwright test e2e/size-scale.spec.ts`

**Dependencies:** Task 1

**Files likely touched:** `lib/size-scale.ts`, `e2e/size-scale.spec.ts`

**Estimated scope:** M

## Phase 3 - text styles

## Task 5: Style and Bold on text and live text; Custom and Snap

**Description:** In the text and live-text panels **Style [Caption | Label
| Title | Display]** and **Bold** replace the font picker when the project
has a typography; choosing one writes `textStyle`, `bold` and the resolved
`fontId`, `fontSize` and height. An object without a style shows **Custom
(font name)** and **Snap**. Without a typography the panel is as today.
Handbook: the text objects' page.

**Acceptance criteria:**
- [ ] On the 4.3B a text set to Label gets the expected font; Bold
      switches to the bold face.
- [ ] An old project's text shows Custom; Snap puts it on the nearest
      style; the project exports byte-for-byte as before until then.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/font-select.spec.ts`;
handbook labels and build

**Dependencies:** Task 4

**Files likely touched:** `components/property-panel/label-properties.tsx`,
`components/property-panel/mqtt-data-field-properties.tsx`, a new
`components/property-panel/fields/text-style-field.tsx`, `lib/size-scale.ts`,
`e2e/size-scale.spec.ts`, `handbuch/objekte/anzeigen.md`

**Estimated scope:** M

## Task 6: Style and Bold on the other objects with a font

**Description:** The same field on bar/slider, gauge/dial, button,
switch/switcher panels (their font only; their size is Phase 4).

**Acceptance criteria:**
- [ ] Every panel that had `FontField` has the Style field when the project
      has a typography (`font-select.spec.ts` extended to say so).
- [ ] A switch's labels in Title get the Title font on the 4.3B.

**Verification:** `npx playwright test e2e/font-select.spec.ts e2e/size-scale.spec.ts e2e/switch-look.spec.ts`

**Dependencies:** Task 5

**Files likely touched:** `level-indicator-properties.tsx`,
`arc-level-properties.tsx`, `software-button-properties.tsx`,
`switch-properties.tsx`, `e2e/font-select.spec.ts`,
`handbuch/objekte/bedienen.md`, `handbuch/objekte/anzeigen.md`

**Estimated scope:** M

## Task 7: New objects start in Label / Display; blocks use the style

**Description:** `canvas.tsx` creation: text, live text, button, switch,
level labels in Label; a level's value in Display where it stands alone;
regular. `blockFont()` gives way to the Label style. Only with a
typography; without, as today.

**Acceptance criteria:**
- [ ] Every object drawn on a 4.3B project has a `textStyle`; on a project
      without typography, `fonts[0]` / smallest font as today.
- [ ] A placed block's label is Label.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/object-creation-preview.spec.ts e2e/bausteine.spec.ts`

**Dependencies:** Task 5

**Files likely touched:** `components/canvas/canvas.tsx`, `lib/bausteine.ts`,
`components/project-editor.tsx`

**Estimated scope:** S

## Task 8: Typography in Project Properties; device change re-resolves

**Description:** **Typography** in Project Properties, shown when the
device offers more than one; the project keeps the name. `resolveScale`
runs after "Load device", on opening with a changed DDF, and after a
typography change: every styled object gets its font anew; Custom objects
are left alone. Handbook: project settings and device change.

**Acceptance criteria:**
- [ ] A project moved from the 4.3B to the Knob keeps «Label» and gets the
      Knob's font for it; a Custom text keeps its font id.
- [ ] With two typographies in a test DDF, switching gives the other
      family; a name the new device lacks falls back to «Standard».

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/device-platform.spec.ts`

**Dependencies:** Tasks 5, 6

**Files likely touched:** `components/project-settings-dialog.tsx`,
`components/project-editor.tsx`, `lib/size-scale.ts`,
`handbuch/designer/projekte.md`

**Estimated scope:** M

## Checkpoint B: text on the devices
- [ ] A test screen with the four styles, regular and bold, deployed to
      Knob, 4.3B and PaperS3; checked by eye with the user; millimetres
      tuned in `lib/size-scale.ts` if needed
- [ ] The test screen becomes a permanent HIL fixture

## Phase 4 - size steps

## Task 9: Size S/M/L in the properties; Custom and Snap

**Description:** **Size [S | M | L]** on bar, slider, gauge, dial, switch,
button group, button, icon, live icon when the project has a scale;
writes `sizeStep` and the fixed dimension (thickness, diameter, height,
edge). Off-scale objects show **Custom (37 px)** and **Snap**. Device
change re-resolves stepped objects' fixed dimension (with Task 8's
`resolveScale`). Handbook: the objects' pages.

**Acceptance criteria:**
- [ ] Each object kind at S/M/L has the spec's millimetres in pixels on
      the 4.3B; its free dimension is unchanged.
- [ ] An old project shows Custom, Snap works, and exports as before
      until then; a stepped slider moved to the Knob gets the Knob's M.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/property-fields.spec.ts`

**Dependencies:** Tasks 4, 8

**Files likely touched:** the object panels, a new
`components/property-panel/fields/size-step-field.tsx`,
`lib/size-scale.ts`, `handbuch/objekte/*.md`

**Estimated scope:** M

## Task 10: Resizing and drawing snap the fixed dimension

**Description:** In `canvas.tsx` resize (after the minimum clamps) a
stepped object's fixed dimension snaps to the nearest step while the free
one follows the mouse; squares (gauge, dial, icon) snap their edge.
Drawing a new object makes it M and drags only its free dimension.

**Acceptance criteria:**
- [ ] Dragging a slider taller lands on S, M or L; dragging it longer
      changes only its length.
- [ ] A dial dragged from M towards L snaps to L; a new slider is M.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/resize-snap-opposite-edge.spec.ts e2e/arc-level.spec.ts e2e/object-creation-preview.spec.ts`

**Dependencies:** Task 9

**Files likely touched:** `components/canvas/canvas.tsx`, `e2e/size-scale.spec.ts`

**Estimated scope:** M

## Checkpoint C: steps on the devices
- [ ] The test screen gains every object kind at S/M/L; checked on the
      devices with the user; millimetres tuned if needed
- [ ] `npm run test:e2e` green but for failures that also fail on `main`

## Task 11: Handbook pictures, device-contract guide, humanizer pass

**Description:** The millimetres as a guide for DDF authors in
`docs/device-contract.md`; handbook pictures of the Style and Size
fields; every touched handbook page through `maettel-humanizer`;
`npm run test:all`.

**Dependencies:** Checkpoint C

**Estimated scope:** S

## Checkpoint D: complete
- [ ] `npm run test:all` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked
- [ ] `tasks/block-discovery-*` can continue with Task 6
