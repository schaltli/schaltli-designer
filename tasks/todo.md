# Themes in the designer (`theme-model`): tasks

Plan: `tasks/plan.md` · Spec: `docs/2026-09-24-themes-model.md` · Map:
`docs/2026-09-24-themes.md`

## Task 1: The theme catalogue, and a page to choose from

**Description:** `lib/themes.ts` with the role list, the `Theme` type,
`resolveRole`, `applyTheme`, `nearestRole`, `isRole`, `COLOR_KEYS`, and the
catalogue: `lavender` (today's creation palette, derived from
`lib/control-palette.ts` and `handleCreateObject`'s literals), `schaltli`
(the brand) and 4-6 candidates, each with light and dark. A script renders
a sample screen per theme, variant and device (4.3B, Knob, PaperS3) through
`app/test-render` with the real renderers and composes them into one page
the user picks from. Nothing in the product changes yet.

**Acceptance criteria:**
- [x] `lib/themes.ts` typechecks; `resolveRole` quantises through
      `applyColorDepth` and returns the light value for 4-bit and 1-bit
      whatever the variant; `applyTheme` leaves non-role values untouched.
- [x] `lavender.light` equals today's creation defaults value for value
      (asserted in a test against `controlPalette("24bit")`).
- [x] The catalogue page shows every theme in both variants on the three
      devices with a tank, a switch, a dimmer and a dial.

**Verification:**
- [x] `npm run typecheck`
- [x] `npx playwright test e2e/themes.spec.ts` (the `lavender` equality test)
- [x] Manual: the page, opened by the user

**Dependencies:** none

**Files likely touched:** `lib/themes.ts`, `scripts/theme-catalogue.mjs`,
`e2e/themes.spec.ts`

**Estimated scope:** M

## Checkpoint A: the catalogue
- [x] User picks the themes and their names
- [x] Eight roles or six (`textMuted`, `accentAlt`) decided
- [x] UI wording confirmed: `Theme`, `Light`, `Dark`, `Themes`, role names
- [x] Spec and catalogue updated accordingly

## Task 2: A screen is drawn and exported from roles

**Description:** `settings.themeId` and `screen.themeId` in the types;
`themeFor(project, screen)`; the screen background resolves through
`lib/master-screen.ts` to a role; `applyTheme` is called at every site that
hands objects to drawing (canvas `drawObject` loop and nested panels,
screen thumbnail, live preview) and `resolvedProject` at both exporters.
Master objects resolve against the screen they are drawn on. After this
task a project whose values are roles draws and exports correctly; hex
values still pass through unchanged.

**Acceptance criteria:**
- [x] A project with role values renders on canvas, in thumbnails and in
      the preview with the theme's colours (pixel probes), and its firmware
      and Android exports contain the light variant's hex and no role name.
- [x] One master label on two screens with different themes is drawn in
      each screen's `text` colour.
- [x] Every existing e2e spec passes unchanged (hex projects are
      untouched by `applyTheme`).

**Verification:**
- [x] `npx playwright test e2e/themes.spec.ts`
- [x] `npx playwright test` (whole e2e suite)
- [x] `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:** `lib/themes.ts`, `lib/master-screen.ts`,
`components/canvas/canvas.tsx`, `components/screens-panel/screen-thumbnail.tsx`,
`lib/project-zip.ts`, `lib/android-export.ts`, `components/project-editor.tsx`
(types), `e2e/themes.spec.ts`

**Estimated scope:** L (seven files, small edits each; the exporters get two
lines)

## Task 3: New objects are born with roles, old files arrive with them

**Description:** Creation writes roles: `controlPalette` roles for blocks
(`lib/bausteine.ts`), `handleCreateObject` and the canvas's button/switch
creation, `addScreen`. The migration pass in `migrateProject` replaces every
hex by the nearest `lavender` role and drops `gridColor`; version restore and
autosave restore call `migrateProject`. A frozen pre-theme fixture
(`test-projects/pre-theme-project.zip`, default colours plus one hand-picked
X11 colour) is added. After this task everything inside the designer is
role-only.

**Acceptance criteria:**
- [x] Every object from the toolbar and every block has role values and no
      hex; the look tests (`bausteine`, `switch-look`, `level-track`,
      `software-button-look`) pass unchanged.
- [x] The pre-theme fixture opens on `lavender` with every hex replaced;
      default-coloured objects render pixel-identical to the fixture's
      render before migration; the X11 colour lands on its expected role;
      saving and reopening is idempotent; a value that is neither role nor
      `transparent` is refused naming the object.
- [x] Version restore and autosave restore of the fixture migrate too.

**Verification:**
- [x] `npx playwright test e2e/themes.spec.ts e2e/bausteine.spec.ts e2e/switch-look.spec.ts e2e/level-track.spec.ts e2e/software-button-look.spec.ts e2e/system-generation.spec.ts`
- [x] `npm run typecheck`

**Dependencies:** Task 2

**Files likely touched:** `lib/control-palette.ts`, `lib/bausteine.ts`,
`components/project-editor.tsx`, `components/canvas/canvas.tsx`,
`lib/object-types.ts`, `test-projects/pre-theme-project.zip` (+ its build
script), `e2e/themes.spec.ts`

**Estimated scope:** L

## Checkpoint B: role-only inside
- [ ] `npx playwright test` green (the known `main` failures aside, listed
      by name)
- [ ] `npm run test:all` green where hardware is reachable
- [ ] A new project, exported, is byte-identical in colour to one made
      before themes with default colours

## Task 4: The user picks roles, and a theme per screen

**Description:** `components/property-panel/role-picker.tsx` replaces
`color-depth-aware-picker.tsx`: the eight roles with swatches resolved for
the current variant and depth, `Transparent` where allowed, `Inherit from
Master` on the screen background. `ColorField` and `IconColorField` use it;
every `*-properties.tsx` passes role values. `screen-properties.tsx` gets a
`Theme` select (project theme as the inherit entry) and loses `Grid`.
Picking a role or a theme is one undo step.

**Acceptance criteria:**
- [ ] Every colour control on every object type lists the roles (and
      `Transparent` / `Inherit from Master` where they exist) and nothing
      else; picking writes the role name; no control accepts a hex.
- [ ] A screen's `Theme` select changes its colours on canvas and
      thumbnail; one undo step; `Inherit` returns to the project theme.
- [ ] `property-panel.spec.ts`, `master-screen-background.spec.ts`,
      `undo.spec.ts`, `empty-values.spec.ts` rewritten where they asserted
      colours, otherwise unchanged and green.

**Verification:**
- [ ] `npx playwright test e2e/themes.spec.ts e2e/property-panel.spec.ts e2e/master-screen-background.spec.ts e2e/undo.spec.ts e2e/empty-values.spec.ts`
- [ ] Manual: every object type's Colour section in the running designer

**Dependencies:** Task 3

**Files likely touched:** `components/property-panel/role-picker.tsx` (new),
`color-depth-aware-picker.tsx` (removed), `fields/wrapped-fields.tsx`,
`icon-color-field.tsx`, `screen-properties.tsx`, `lib/color-palette.ts`
(shrinks), `e2e/*.spec.ts`

**Estimated scope:** L

## Task 5: Light and dark in the editor; the Themes tab

**Description:** A `Light` / `Dark` toggle in the top bar sets the variant
the canvas, the thumbnails and the preview draw; disabled on 4-bit and
1-bit projects; not saved, not in undo. `Settings` › `Themes` replaces
`Color Palette`: the catalogue with light and dark swatches at the
project's depth, the project theme selectable, the themes in use marked.

**Acceptance criteria:**
- [ ] `Dark` changes canvas and thumbnails (pixel probes) and the preview;
      the saved project is identical before and after; undo is unaffected;
      on a 4-bit project the toggle is disabled and the light variant shows.
- [ ] The `Themes` tab lists the catalogue with quantised swatches, sets
      `settings.themeId`, and marks themes any screen uses.

**Verification:**
- [ ] `npx playwright test e2e/themes.spec.ts e2e/handbook-labels.spec.ts`
- [ ] Manual: toggle and tab in the running designer

**Dependencies:** Task 4

**Files likely touched:** `components/project-editor.tsx`,
`components/canvas/canvas.tsx`, `components/screens-panel/screen-thumbnail.tsx`,
`components/project-settings-dialog.tsx`, `e2e/themes.spec.ts`

**Estimated scope:** M

## Checkpoint C: user review
- [ ] User works through a project in the running designer: create,
      recolour, switch theme, toggle variant, export
- [ ] Feedback folded into Tasks 4-5

## Task 6: The handbook says so

**Description:** New page `handbuch/designer/themes.md` (what a theme and a
role are, the toggle, the Themes tab, what happens to an older project);
`objekte/gemeinsames.md` "Farben" rewritten for roles; `designer/screens.md`
(Theme per screen, no Grid); `designer/projekte.md` (Themes tab). Every
quoted label exists in source. Texts go through the humanizer.

**Acceptance criteria:**
- [ ] The four pages describe the UI as built; `handbook-labels.spec.ts`
      is green; the sidebar lists the new page.

**Verification:**
- [ ] `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`
- [ ] `npm run build --prefix handbuch`

**Dependencies:** Task 5

**Files likely touched:** `handbuch/designer/themes.md`,
`handbuch/objekte/gemeinsames.md`, `handbuch/designer/screens.md`,
`handbuch/designer/projekte.md`, `handbuch/.vitepress/config.mjs`

**Estimated scope:** M

## Checkpoint D: complete
- [ ] `code-reviewer` agent over the diff; findings fixed or answered
- [ ] `npm run test:all`
- [ ] Spec's success criteria walked through
- [ ] Commit and push; capability map's `theme-model` marked landed
