# size-scale: tasks

Plan: `tasks/size-scale-plan.md` · Spec: `docs/2026-09-30-size-scale.md`

## Definition of done (every task)

A task is done when its acceptance criteria are met **and**:

- new behaviour is covered by a test that fails without the change and
  passes with it; ad-hoc checks (a scratch script, a HIL run) have become a
  permanent e2e spec or HIL fixture (CLAUDE.md);
- `npm run typecheck` and the specs the task names are green, and the
  change was seen working in the running designer, not only compiled;
- no dead code, debug output or commented-out blocks; nothing outside the
  task changed in passing;
- a change a user can see has its handbook page updated, and the report
  names the page (CLAUDE.md);
- the user has seen it before it is committed.

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

**Verification:** `npx playwright test e2e/size-scale.spec.ts`; `npm run typecheck`

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

## Task 6a: Style and Bold on levels (bar, slider, gauge, dial)

**Description:** The Style field from Task 5 on the bar/slider and
gauge/dial panels, for the font of their value.

**Acceptance criteria:**
- [ ] Both panels show Style and Bold when the project has a typography
      (`font-select.spec.ts` extended to say so).
- [ ] A gauge's value in Display gets the Display font on the 4.3B.

**Verification:** `npx playwright test e2e/font-select.spec.ts e2e/size-scale.spec.ts e2e/arc-level.spec.ts`;
`npm run typecheck`

**Dependencies:** Task 5

**Files likely touched:** `components/property-panel/level-indicator-properties.tsx`,
`components/property-panel/arc-level-properties.tsx`, `e2e/font-select.spec.ts`,
`handbuch/objekte/anzeigen.md`

**Estimated scope:** S

## Task 6b: Style and Bold on buttons and switches

**Description:** The same on the button and switch/switcher panels, for
their labels.

**Acceptance criteria:**
- [ ] Both panels show Style and Bold when the project has a typography.
- [ ] A switch's labels in Title get the Title font on the 4.3B; the
      switch's minimum width follows the wider labels.

**Verification:** `npx playwright test e2e/font-select.spec.ts e2e/size-scale.spec.ts e2e/switch-look.spec.ts e2e/software-button-look.spec.ts`;
`npm run typecheck`

**Dependencies:** Task 5

**Files likely touched:** `components/property-panel/software-button-properties.tsx`,
`components/property-panel/switch-properties.tsx`, `e2e/font-select.spec.ts`,
`handbuch/objekte/bedienen.md`

**Estimated scope:** S

## Checkpoint B1: every font is a style
- [ ] Tasks 5-6b green; no panel with a font picker left where the project
      has a typography
- [ ] Review with the user in the running designer

## Task 7: New objects start in Label / Display; blocks use the style

**Description:** `canvas.tsx` creation: text, live text, button, switch,
level labels in Label; a level's value in Display where it stands alone;
regular. `blockFont()` gives way to the Label style. Only with a
typography; without, as today.

**Acceptance criteria:**
- [ ] Every object drawn on a 4.3B project has a `textStyle`; on a project
      without typography, `fonts[0]` / smallest font as today.
- [ ] A placed block's label is Label.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/object-creation-preview.spec.ts e2e/bausteine.spec.ts`;
`npm run typecheck`

**Dependencies:** Tasks 5, 6a, 6b

**Files likely touched:** `components/canvas/canvas.tsx`, `lib/bausteine.ts`,
`components/project-editor.tsx`

**Estimated scope:** S

## Task 8a: A device change gives styled text the new device's fonts

**Description:** `resolveScale(project)` in `lib/size-scale.ts`; run after
"Load device" and on opening with a changed DDF: every styled object gets
its font anew; Custom objects are left alone. Handbook: the device change
in the project settings page.

**Acceptance criteria:**
- [ ] A project moved from the 4.3B to the Knob keeps «Label» and gets the
      Knob's font for it; a Custom text keeps its font id.
- [ ] Opening a project whose embedded DDF is unchanged changes nothing.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/device-platform.spec.ts`;
`npm run typecheck`

**Dependencies:** Tasks 5, 6a, 6b

**Files likely touched:** `lib/size-scale.ts`, `components/project-settings-dialog.tsx`,
`components/project-editor.tsx`, `e2e/size-scale.spec.ts`,
`handbuch/designer/projekte.md`

**Estimated scope:** M

## Task 8b: Typography in Project Properties

**Description:** **Typography** in Project Properties, shown when the
device offers more than one; the project keeps the name; changing it runs
`resolveScale`. A name the device lacks means «Standard».

**Acceptance criteria:**
- [ ] With two typographies in a test DDF, switching gives the other
      family on every styled object.
- [ ] With one typography the field is not shown; a project whose name the
      device lacks uses «Standard».

**Verification:** `npx playwright test e2e/size-scale.spec.ts`; `npm run typecheck`

**Dependencies:** Task 8a

**Files likely touched:** `components/project-settings-dialog.tsx`,
`e2e/size-scale.spec.ts`, `handbuch/designer/projekte.md`

**Estimated scope:** S

## Checkpoint B: text on the devices
- [ ] A test screen with the four styles, regular and bold, deployed to
      Knob, 4.3B and PaperS3; checked by eye with the user; millimetres
      tuned in `lib/size-scale.ts` if needed
- [ ] The test screen becomes a permanent HIL fixture

## Phase 4 - size steps

## Task 9a: Size S/M/L on levels (bar, slider, gauge, dial)

**Description:** A new **Size [S | M | L]** field on the bar/slider and
gauge/dial panels when the project has a scale; writes `sizeStep` and the
thickness or diameter. Off-scale objects show **Custom (37 px)** and
**Snap**. `resolveScale` (Task 8a) also re-resolves stepped objects'
fixed dimension on a device change. Handbook: the displays page.

**Acceptance criteria:**
- [ ] A slider at S/M/L has the spec's thickness in pixels on the 4.3B,
      its length unchanged; a dial its diameter.
- [ ] An old project's bar shows Custom; Snap works; a stepped slider moved
      to the Knob gets the Knob's M.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/property-fields.spec.ts`;
`npm run typecheck`

**Dependencies:** Tasks 4, 8a

**Files likely touched:** a new `components/property-panel/fields/size-step-field.tsx`,
`level-indicator-properties.tsx`, `arc-level-properties.tsx`,
`lib/size-scale.ts`, `handbuch/objekte/anzeigen.md`

**Estimated scope:** M

## Task 9b: Size S/M/L on switches, buttons and icons

**Description:** The same field on switch/button group, button, icon and
live icon: height, or edge for icons.

**Acceptance criteria:**
- [ ] Each at S/M/L has the spec's millimetres on the 4.3B; a switch's
      width stays at least what its labels need.
- [ ] Off-scale ones show Custom; Snap works.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/property-fields.spec.ts e2e/switch-look.spec.ts`;
`npm run typecheck`

**Dependencies:** Task 9a

**Files likely touched:** `switch-properties.tsx`, `software-button-properties.tsx`,
the icon panels, `handbuch/objekte/bedienen.md`

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

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/resize-snap-opposite-edge.spec.ts e2e/arc-level.spec.ts e2e/object-creation-preview.spec.ts`;
`npm run typecheck`

**Dependencies:** Tasks 9a, 9b

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

**Acceptance criteria:**
- [ ] `docs/device-contract.md` says which millimetres a typography's
      families should reach, and why.
- [ ] The handbook shows the Style, Size and Typography fields; every page
      this plan touched has been through `maettel-humanizer`.

**Verification:** `npx playwright test e2e/handbook-screenshots.spec.ts e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`;
`npm run build --prefix handbuch`; `npm run test:all`

**Dependencies:** Checkpoint C

**Files likely touched:** `docs/device-contract.md`, `e2e/handbook-screenshots.spec.ts`,
`handbuch/objekte/*.md`, `handbuch/designer/projekte.md`

**Estimated scope:** S

## Checkpoint D: complete
- [ ] `npm run test:all` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked
- [ ] `tasks/block-discovery-*` can continue with Task 6
