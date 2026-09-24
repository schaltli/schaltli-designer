# Spec: `theme-model` - themes in the designer

Module of `docs/2026-09-24-themes.md` (the capability map holds the shared
decisions: MQTT switch, colour displays only, shipped themes, no hex
values anywhere in the designer). Status: draft 2026-09-24.

## Objective

A user picks a **theme** for a screen and a **role** for each colour, and
never a hex value. The designer ships a small set of themes, each with a
light and a dark variant; a project uses as many of them as it likes, one
per screen, so screens can look different without anyone choosing colours.
The editor shows either variant. Hex values disappear from the project
file: a colour property *is* a role.

This module changes the designer and its project file. What reaches a
device is unchanged in this module: the exporter resolves roles to the
light variant's hex, exactly what it writes today, until `theme-export`
decides the contract's shape.

### User-visible behaviour (acceptance criteria)

1. Every colour control in the property panel offers the theme's roles
   (with a swatch showing the value in the current variant and colour
   depth) instead of a colour list. `Transparent` stays where a background
   may be transparent; `Inherit from Master` stays on the screen
   background. No control anywhere lets a user enter or pick a hex value.
2. A screen has a `Theme` setting in its properties; a screen without one
   uses the project's theme (`Settings` › `Themes`), which new projects get
   from the device's colour depth. Changing either is one undo step.
3. A master screen's objects take the theme of the screen they are drawn
   on: the same master label is white on a dark-themed screen and black on
   a light-themed one.
4. A toolbar toggle `Light` / `Dark` switches what the canvas, the screen
   thumbnails and the preview show. It is view state: not saved in the
   project, not an undo step. On a 4-bit or 1-bit project the toggle is
   disabled and everything shows the light variant.
5. New objects and blocks get roles, not hex: text → `Text`, borders →
   `Outline`, box and line strokes → `Text`, box fill → `Panel`, level and
   arc fills, switches and buttons → `Accent`, text on a fill → `Text on
   accent`, screen background → `Surface`. Icons keep their own colours
   unless a tint role is chosen.
6. A project file from before themes (there is no productive one; test
   fixtures and the generation corpus exist) opens on `Lavender` with every
   hex replaced by the nearest role; objects created with default colours
   look as before. The next save writes roles only; reopening changes
   nothing more. This runs at every door a project comes in through: file
   import, zip import, version restore, autosave restore, API load. (Today
   version and autosave restore skip `migrateProject`; that gap closes.)
7. A saved project contains no hex value in any colour property, in no
   screen and no object.
8. `Settings` › `Themes` (replacing the `Color Palette` tab) lists the
   shipped themes with their light and dark swatches at the project's
   colour depth and marks the ones the project uses.
9. On a 4-bit or 1-bit project all values are the theme's light variant
   quantised as today; two themes may look alike there, and the `Themes`
   tab shows the quantised swatches so this is visible before choosing.

## Model

### Roles

A theme gives a value to each of eight roles, per variant:

| Role | UI name | Used for |
|---|---|---|
| `surface` | Surface | screen background |
| `panel` | Panel | box fill, text field background, cards |
| `outline` | Outline | borders, quiet lines |
| `text` | Text | text, drawn lines, box strokes, icon tint |
| `textMuted` | Muted text | secondary text, sublabels |
| `accent` | Accent | level and arc fill, switch and button colour |
| `onAccent` | Text on accent | text over an accent fill |
| `accentAlt` | Second accent | a second highlight, so one screen can carry two |

What a device derives today stays derived and is not a role: a level's
track, an arc's marker, a switch's surface, pill and ink, a button's pressed
state (`lib/level-shape.ts`, `lib/switch-shape.ts`, `lib/material-colors.ts`,
mirrored in C++ and Kotlin). They are computed from the resolved accent and
surface, so a theme changes them without touching that code.

### Shipped themes

`lib/themes.ts` holds the catalogue: about 6-8 themes, each `{ id, name,
light: Record<Role, hex>, dark: Record<Role, hex> }`, 24-bit values; other
depths quantise through `applyColorDepth` as every renderer does today.
Fixed for this module:

- `lavender` "Lavender": light = today's creation palette exactly
  (`lib/control-palette.ts` 24-bit: surface `#ffffff`, text `#000000`,
  outline `#cccccc`, accent `#6750A4`, onAccent `#ffffff`, …). Its dark
  variant, and every other theme, is chosen in the catalogue task (open
  question 1).
- `schaltli` "Schaltli": the brand (`brand/README.md`, "Die Farben") -
  white, ink `#111111`, greys on the PaperS3 ramp, signal orange as accent.

The catalogue is data. Adding a theme later is adding an entry; nothing else
knows the names.

### Storage (project file)

- `settings.themeId: string` - the project's theme; a new project gets one
  from the device's colour depth, a migrated one gets `lavender`.
- `screen.themeId?: string` - overrides per screen. Missing = project theme
  (the same "undefined = inherit" convention as `backgroundColor`).
- Every colour property (`color`, `backgroundColor`, `borderColor`,
  `fillColor`, `strokeColor`, `textColor`, `buttonColor`, `switchColor`,
  `iconColor`, screen `backgroundColor`) holds a **role name** or
  `"transparent"`. Nothing else. The keys keep their names, so the panels,
  the exporter's `/color$/i` scan and the object types stay as they are;
  only their values change meaning.
- `ScreenObject.properties` stays untyped, but `lib/themes.ts` exports
  `isRole()` and the list of colour keys, and the migration pass and the
  exporter refuse a value that is neither a role nor `transparent` -
  loudly, naming the object, so a hex can never slip through again. (The
  HIL reference render, `app/test-render`, is not a door: it draws the
  *device* format, which stays hex, and the HIL suites feed it directly.)

A reader from before themes would draw a role name as a colour and get it
wrong, so this is a major step for the project file by the rules in
`docs/nested-provenance.md`. Whether `SYSTEM_GENERATION` is bumped here or
in `theme-export` follows from the contract decision there (capability
map, "Contract"): the same number gates the export, and a bump stops
deploys to devices that do not know it yet.

### Resolution

One function, at the boundary between model and drawing; the renderers
never see a role:

```ts
// lib/themes.ts
export type Variant = "light" | "dark"
export function themeFor(project: Project, screen: ProjectScreen): Theme
export function resolveRole(theme: Theme, role: Role, variant: Variant, depth: ColorDepth): string
// Objects with every bound colour replaced by its hex for this screen,
// variant and depth - what the renderers draw. Unbound values pass through.
export function applyTheme(project: Project, screen: ProjectScreen, objects: ScreenObject[], variant: Variant): ScreenObject[]
```

The renderers are **not** changed: canvas, thumbnails, live preview, the
HIL reference render (`app/test-render`) and the exporter call `applyTheme`
first and hand plain hex to `renderScreenObjects`, as they do now. On a
4-bit or 1-bit project `resolveRole` ignores `variant` and returns the
light value.

### Migration

`migrateProject` (`lib/object-types.ts`) grows one more idempotent pass:
for each screen, for each object, for each colour key whose value is a hex,
replace it by the role whose light value in `lavender` at the project's
depth is nearest (Rec. 601 luma-weighted RGB distance; a tie prefers the
role today's defaults would have used for that key). Screen
`backgroundColor` the same way; `gridColor` is dropped (it is derived).
`"transparent"` and missing values are left alone. A project without hex
passes through untouched. This exists for the test fixtures and the
generation corpus, not for users: there is no productive data.

The doors that skip `migrateProject` today (version restore, autosave
restore: `components/project-editor.tsx`) get it.

## Tech stack

Next.js designer as is: TypeScript, React, shadcn `Select` for the role
picker (replacing `components/property-panel/color-depth-aware-picker.tsx`),
Playwright for tests. No new dependencies.

## Commands

```
Dev:            npm run dev
Typecheck:      npx tsc -p tsconfig.typecheck.json --noEmit
Theme tests:    npx playwright test e2e/themes.spec.ts
Handbook labels:npx playwright test e2e/handbook-labels.spec.ts
Full suite:     npm run test:all
Handbook:       npm run dev --prefix handbuch
```

## Project structure

```
lib/themes.ts                                   catalogue, roles, themeFor, resolveRole, applyTheme, nearestRole
lib/object-types.ts                             migrateProject: the role-binding pass
lib/control-palette.ts                          creation defaults become roles (or are read from `lavender`)
lib/color-palette.ts                            shrinks: the used/unused colour scan goes with the picker
components/property-panel/role-picker.tsx       the role chooser (replaces color-depth-aware-picker.tsx)
components/property-panel/fields/wrapped-fields.tsx, icon-color-field.tsx, *-properties.tsx
                                                write roles instead of hex
components/property-panel/screen-properties.tsx Theme select
components/project-settings-dialog.tsx          Themes tab
components/project-editor.tsx                   variant toggle state, creation by role, migration at every door
components/canvas/canvas.tsx, components/screens-panel/screen-thumbnail.tsx,
components/live-preview*, app/test-render/page.tsx, lib/project-zip.ts, lib/android-export.ts
                                                applyTheme before rendering / writing
e2e/themes.spec.ts                              the tests below
test-projects/generations/…                     one new pre-theme fixture (corpus is extended, never regenerated)
handbuch/designer/themes.md (new), handbuch/objekte/gemeinsames.md, handbuch/designer/screens.md,
handbuch/designer/projekte.md                   handbook
docs/2026-09-24-themes-model.md                 this spec
```

## Code style

As the surrounding code: comments say why, English, no abbreviations in
names. A theme is data that reads like the palette it is:

```ts
// lib/themes.ts
export const THEMES: Theme[] = [
  {
    id: "lavender",
    name: "Lavender",
    // Today's creation palette (lib/control-palette.ts), value for value:
    // a project from before themes opens in this and looks the same.
    light: { surface: "#ffffff", panel: "#e5e5e5", outline: "#cccccc", text: "#000000",
             textMuted: "#5f5f5f", accent: "#6750A4", onAccent: "#ffffff", accentAlt: "#625B71" },
    dark:  { /* catalogue task */ },
  },
]
```

## Testing strategy

Playwright e2e, `e2e/themes.spec.ts`, against the running designer, in the
style of `e2e/property-panel.spec.ts` and `e2e/undo.spec.ts`:

1. **No hex anywhere:** every colour control on every object type lists
   the eight roles (and `Transparent` / `Inherit from Master` where they
   exist) and nothing else; picking one writes the role name into the
   property; a saved project holds no hex in any colour key.
2. **Two screens, two themes:** a master label is drawn in each screen's
   text colour (canvas pixel probe on both screens); switching a screen's
   theme is one undo step.
3. **Variant toggle:** `Dark` changes the canvas and the thumbnails, is
   not in the saved project and not in undo; on a 4-bit project the toggle
   is disabled.
4. **Creation defaults:** objects from the toolbar and from every block
   come with roles; their rendered pixels equal today's (the existing
   `bausteine.spec.ts`, `switch-look.spec.ts`, `level-track.spec.ts`,
   `software-button-look.spec.ts` keep passing unchanged, which is the
   proof `lavender` equals today's palette).
5. **Migration:** the new pre-theme fixture opens on `lavender` with every
   hex replaced; default-coloured objects render pixel-identical to a
   render of the fixture before migration; a hand-picked X11 colour lands
   on the expected role; saving and reopening changes nothing (idempotent).
   Version restore and autosave restore of the same fixture migrate too.
   A value that is neither role nor `transparent` after migration is
   refused with a message naming the object.
6. **Themes tab and handbook labels:** the tab lists the catalogue;
   `e2e/handbook-labels.spec.ts` passes with the handbook's new labels.

The frozen generation corpus (`test-projects/generations/`) is extended by
one pre-theme project and never regenerated (`build-corpus.js`).

## Boundaries

- **Always:** keep colour properties role-only in the project file (no
  hex, no second representation); resolve through `applyTheme` rather than
  teaching renderers about roles; migrate at every door;
  quote every new UI label in the handbook and keep `handbook-labels`
  green; run the humanizer over handbook text; keep the derived-colour
  rules (`level-shape`, `switch-shape`, `material-colors`) untouched -
  they are mirrored on the devices.
- **Ask first:** changing a shipped theme's values once it has shipped
  (goldens depend on them); any change to `SYSTEM_GENERATION`; any change
  to what the exporter writes (that is `theme-export`); adding a role;
  removing `accentAlt` or `textMuted` if the catalogue task finds them
  unnecessary.
- **Never:** write a hex into a project file; change the export's shape in
  this module; regenerate the frozen corpus; touch firmware or Android
  repositories; remove or weaken a colour-pinning test without replacing
  what it pinned.

## Success criteria

- Acceptance criteria 1-9 hold; the six test groups pass alongside
  `npm run test:all`.
- `npx tsc -p tsconfig.typecheck.json --noEmit` clean.
- Every existing e2e and HIL suite passes unchanged, except tests that
  asserted the *colour list* of the old picker, which are rewritten to
  assert roles.
- The handbook says what a theme, a role and the light/dark toggle are,
  where to set them, and that older projects are moved to `Lavender` on
  opening (`handbuch/designer/themes.md`, and the three pages above).
- No new npm dependency; the property panel's colour rows are not slower
  to open than today.

## Decided at Checkpoint A (2026-09-24)

1. **Catalogue:** eight themes - Lavender (`lavender`, today's creation
   palette, the default), Schaltli, Slate, Forest, Ocean, Amber,
   Terracotta, Garden - with the values in `lib/themes.ts`, as shown on the
   catalogue page `e2e/themes.spec.ts` writes.
2. **Eight roles**, including `textMuted` and `accentAlt`.
3. **Wording confirmed:** `Theme`, `Light`, `Dark`, `Themes`, and the role
   names Surface, Panel, Outline, Text, Muted text, Accent, Text on accent,
   Second accent.
