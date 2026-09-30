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
- [x] A DDF with the fields gives a project with px/mm, fonts with family
      and weight, and its typographies; one without gives none of them and
      behaves as today.
- [x] A DDF whose typographies lack «Standard» has no typography.

**Verification:** `npx playwright test e2e/size-scale.spec.ts` (new, the
parsing part); `e2e/device-platform.spec.ts`, `e2e/new-project.spec.ts`
green; `npm run typecheck` - done 2026-09-30: 16/16 with
`project-download.spec.ts`. The new-project path is tested in the browser;
opening and "Load device" take the same two fields from the same
`ProjectDeviceFields` and are covered only by that. Family and weight
now also survive the editable project file (`lib/project-zip.ts` and its
reader), which dropped every font field it did not list.

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
- [x] The three DDFs parse in the designer with a scale (Task 1's spec,
      reading them from `../schaltli-firmware` as `e2e/ddf-seed.ts` does).
- [x] The data sheet each millimetre value comes from is named in the
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
- [x] `DdfBuilderTest` checks millimetres and the typography.
- [x] A DDF the app builds parses in the designer with a scale.

**Verification:** `./gradlew test` in schaltli-android;
`npx playwright test e2e/size-scale.spec.ts` with a DDF built by the test

**Dependencies:** Task 1

**Files likely touched:** `../schaltli-android/app/src/main/java/com/schaltli/android/ddf/DdfBuilder.kt`,
its test

**Estimated scope:** S

## Checkpoint A: every real DDF parses with a scale
- [x] Knob, 4.3B, PaperS3 and an Android-built DDF: px/mm, fonts by
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
- [x] The spec's worked example (4.3B: Caption 18, Label 25, Title
      Halloween 45, Display 35) comes out of `fontFor` with a test DDF.
- [x] On the three firmware DDFs every style and step gives a font and a
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
- [x] On the 4.3B a text set to Label gets the expected font; Bold
      switches to the bold face.
- [x] An old project's text shows Custom; Snap puts it on the nearest
      style; the project exports byte-for-byte as before until then.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/font-select.spec.ts`;
handbook labels and build

**Dependencies:** Task 4

**Files likely touched:** `components/property-panel/label-properties.tsx`,
`components/property-panel/mqtt-data-field-properties.tsx`, a new
`components/property-panel/fields/text-style-field.tsx`, `lib/size-scale.ts`,
`e2e/size-scale.spec.ts`, `handbuch/objekte/anzeigen.md`

**Estimated scope:** M

Done 2026-09-30. Tested on the Knob, not the 4.3B: an 800 px screen does
not fit the test window. The "exports as before" half of the second
criterion holds because nothing resolves an unstyled text until it is
chosen; it is tested explicitly with Task 8a's re-resolving on load.

## Task 6a: Style and Bold on levels (bar, slider, gauge, dial)

**Description:** The Style field from Task 5 on the bar/slider and
gauge/dial panels, for the font of their value.

**Acceptance criteria:**
- [x] Both panels show Style and Bold when the project has a typography
      (`font-select.spec.ts` extended to say so).
- [x] A gauge's value in Display gets the Display font - tested on the
      Knob (Helvetica 35), where the test window fits the screen.

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
- [x] Both panels show Style and Bold when the project has a typography -
      labelled "Text style", as both panels already have a Style (their look).
- [x] A switch's labels in Title get the Title font (tested on the Knob).
- [ ] ~~the switch's minimum width follows the wider labels~~ - not done:
      as with the font picker until now, a style change does not widen the
      switch; left for the size steps (Task 9b), which set its height.

**Verification:** `npx playwright test e2e/font-select.spec.ts e2e/size-scale.spec.ts e2e/switch-look.spec.ts e2e/software-button-look.spec.ts`;
`npm run typecheck`

**Dependencies:** Task 5

**Files likely touched:** `components/property-panel/software-button-properties.tsx`,
`components/property-panel/switch-properties.tsx`, `e2e/font-select.spec.ts`,
`handbuch/objekte/bedienen.md`

**Estimated scope:** S

## Checkpoint B1: every font is a style
- [x] Tasks 5-6b green; no panel with a font picker left where the project
      has a typography
- [ ] Review with the user in the running designer

## Task 7: New objects start in Label / Display; blocks use the style

**Description:** `canvas.tsx` creation: text, live text, button, switch,
level labels in Label; a level's value in Display where it stands alone;
regular. `blockFont()` gives way to the Label style. Only with a
typography; without, as today.

**Acceptance criteria:**
- [x] Every object drawn on a 4.3B project has a `textStyle`; on a project
      without typography, `fonts[0]` / smallest font as today.
- [x] A placed block's label is Label.

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
- [x] A project moved from the 4.3B to the Knob keeps «Label» and gets the
      Knob's font for it; a Custom text keeps its font id.
- [x] Opening a project whose embedded DDF is unchanged changes nothing.

**Verification:** `npx playwright test e2e/size-scale.spec.ts e2e/device-platform.spec.ts`;
`npm run typecheck`

**Dependencies:** Tasks 5, 6a, 6b

**Files likely touched:** `lib/size-scale.ts`, `components/project-settings-dialog.tsx`,
`components/project-editor.tsx`, `e2e/size-scale.spec.ts`,
`handbuch/designer/projekte.md`

**Estimated scope:** M

Done 2026-09-30. Opening is tested in the browser; "Load device" calls
the same `resolveScale`, whose moving from the 4.3B to the Knob is tested
on the real DDFs without a browser.

## Task 8b: Typography in Project Properties

**Description:** **Typography** in Project Properties, shown when the
device offers more than one; the project keeps the name; changing it runs
`resolveScale`. A name the device lacks means «Standard».

**Acceptance criteria:**
- [x] With two typographies in a test DDF, switching gives the other
      family on every styled object.
- [x] With one typography the field is not shown; a project whose name the
      device lacks uses «Standard».

**Verification:** `npx playwright test e2e/size-scale.spec.ts`; `npm run typecheck`

**Dependencies:** Task 8a

**Files likely touched:** `components/project-settings-dialog.tsx`,
`e2e/size-scale.spec.ts`, `handbuch/designer/projekte.md`

**Estimated scope:** S

## Checkpoint B: text on the devices
- [x] A test screen with the four styles, regular and bold, deployed to
      Knob, 4.3B and PaperS3; checked by eye with the user (2026-09-30:
      "OK in Konsistenz und Grösse", taken as the base; no tuning)
- [x] The test screen becomes a permanent HIL fixture:
      `hil/size-scale/text-styles.js`

## Phase 3b - three typographies (appendix of 2026-09-30)

See the plan's appendix. Standard, Humanist, Technic; DSEG7 for Technic's
Display.

## Task T1: Glyphs wider than 32 px, designer and firmware

**Description:** A bitmap row is read into 32 bits on both sides, so wider
glyphs lose their left part. Designer (`lib/bdffont.ts`): rows kept as hex
text, bits read per digit, the bit-to-x mapping unchanged (done, not yet
committed). Firmware (`src/project/BdfFont.cpp`, `parseHexRow`, `rows_`):
rows as several 32-bit words, same mapping - the one-pixel shift the
designer has is kept on both sides.

**Acceptance criteria:**
- [ ] A 50 px wide test glyph draws every pixel in the designer (e2e) and
      on the 4.3B (HIL: the text-styles screen with DSEG7, compared with
      the designer's render).
- [ ] Existing projects' pixels are unchanged on both sides (the pixel and
      HIL specs that pass today still pass).

**Verification:** `npx playwright test e2e/size-scale.spec.ts` (new test) and
the pixel specs (137 passed on 2026-09-30 after the designer fix); firmware
built for all three boards; a HIL run on the 4.3B.

**Dependencies:** None

**Files likely touched:** `lib/bdffont.ts`, `e2e/size-scale.spec.ts`,
`../schaltli-firmware/src/project/BdfFont.cpp`, `.h`

**Estimated scope:** M

## Task T2: Bold in the size regular has

**Description:** `fontFor` picks the size from the regular faces and then
the bold face of that size, if the family has one; only a family with no
bold at all stays regular. Today regular and bold are sized apart, so a
bold Caption can come out smaller than its regular (Lucida Bright 12 vs 14
on the 4.3B).

**Acceptance criteria:**
- [ ] With Lucida Sans on the PaperS3, Label and Label bold are the same
      size.
- [ ] A family whose bold lacks the chosen size falls back to regular, not
      to another size.

**Verification:** `npx playwright test e2e/size-scale.spec.ts`; `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/size-scale.ts`, `e2e/size-scale.spec.ts`

**Estimated scope:** S

## Task T3: The fonts into the firmware DDFs

**Description:** In schaltli-firmware: `tools/ttf-to-bdf.py` (Pillow; from
the scratch tool of 2026-09-30) rasterises DSEG7 Classic Regular and Bold
at each device's Display height; the designer's `scripts/u8g2-font-to-bdf.js`
converts the u8g2 faces - Lucida Sans (luRS/luBS), FreeUniversal (fur/fub)
up to 42, Logisoso - in the sizes each device's styles reach, plus one on
either side for later tuning. Each font gets `family` and `weight`; the
typographies Standard (Display now FreeUniversal), Humanist and Technic
are written. Licences checked against u8g2's font list and DSEG's, and
recorded in `ddf-source*/fonts/LICENSES.md`. Headers regenerated.

**Acceptance criteria:**
- [ ] Each device's three typographies resolve every style, regular and
      bold, to a font of the named family (the designer's firmware-DDF test,
      extended).
- [ ] The zipped DDF per device stays under an agreed budget (to measure;
      about 500 KB more is the estimate).
- [ ] Every added font's licence is named and allows redistribution.

**Verification:** `npx playwright test e2e/size-scale.spec.ts`;
`node tools/generate-ddf-header.js --check` for all three

**Dependencies:** T1 (so the wide faces are drawn right), T2

**Files likely touched:** `../schaltli-firmware/tools/ttf-to-bdf.py`,
`ddf-source*/device.json`, `ddf-source*/fonts/*`, the headers

**Estimated scope:** M

## Task T4: Flash, show, switch

**Description:** Flash the three boards (Knob COM4, 4.3B COM3, PaperS3 COM5).
`hil/size-scale/text-styles.js --typography <name>` shows each typography
on the devices; a project on each board shows Typography in Project
Properties with all three, and switching changes the fonts.

**Acceptance criteria:**
- [ ] Each typography on each board looks as its preview (checked with the
      user).
- [ ] Switching in the designer and deploying changes the device's text.

**Verification:** the HIL script; the user's look

**Dependencies:** T3

**Files likely touched:** `hil/size-scale/text-styles.js`

**Estimated scope:** S

## Task T5: Handbook

**Description:** The three typographies by name and look in
`handbuch/objekte/anzeigen.md` (Stile) and `designer/projekte.md`
(Typography); a picture of each; that Technic's Display is a
seven-segment face that shows letters only as far as segments can.

**Dependencies:** T4

**Estimated scope:** S

## Checkpoint B2: three typographies on the devices
- [ ] T1-T5 done; the user has seen all three on all three boards

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
