# Implementation plan: themes in the designer (`theme-model`)

Spec: `docs/2026-09-24-themes-model.md` (approved 2026-09-24). Capability
map: `docs/2026-09-24-themes.md`. Task checklist: `tasks/todo.md`.

## Overview

Colours in the designer become roles of a theme. A project's screens each
pick one of a few shipped themes; every colour property holds a role name;
one function resolves roles to hex at the boundary to drawing and to
export, so the renderers, the exporter's output and the devices see what
they see today. Built in six vertical slices: the catalogue the user picks
from, drawing from roles, creation and migration, the role picker, the
variant toggle and Themes tab, and the handbook.

## Architecture decisions

- **Resolution at the boundary, renderers untouched.** `applyTheme()`
  turns a screen's objects into plain-hex objects; it is called where
  objects are handed to drawing (`canvas.tsx:1012` before `drawObject`,
  `screen-thumbnail.tsx:132`, the live preview) and where a project is
  handed to an exporter (`project-zip.ts`, `android-export.ts` - both get a
  `resolvedProject(project, "light")` first, two lines each). The dozen
  renderers and the derived-colour rules mirrored in C++/Kotlin stay as
  they are. `app/test-render` draws the device format (hex) and is not
  touched.
- **Roles replace values in place.** The colour keys keep their names
  (`color`, `backgroundColor`, …), so the property panels, the exporter's
  `/color$/i` scan and the object types need no renaming; only the values
  change from hex to role. `lib/themes.ts` owns the list of colour keys,
  `isRole()`, `resolveRole()`, `applyTheme()` and `nearestRole()`.
- **Screen background is a role too**, resolved through
  `lib/master-screen.ts`'s existing inherit chain (`local → master →
  default`), where the default becomes `surface`. The grid colour is
  derived from the resolved surface and loses its control.
- **`lavender` reproduces today's creation palette value for value**, so
  every look test that pins today's hex (`switch-look`, `level-track`,
  `software-button-look`, `bausteine`) stays green unchanged and doubles as
  the proof.
- **Migration is a pass in `migrateProject`** (the one existing hook),
  nearest role in `lavender`; it also runs on version and autosave restore,
  which skip the hook today. It exists for fixtures and the corpus; there
  is no productive data.
- **Variant is view state** (`useState` in `project-editor.tsx`, passed to
  canvas, thumbnails and preview), not project state: not saved, not in
  undo.
- **No unit runner in this repo** - `lib/themes.ts` is exercised through
  Playwright (`page.evaluate` against the running app where a pure function
  is the subject, the UI otherwise), as every other lib module is.
- **The generation number is not bumped here.** The export's shape is
  unchanged; whether the project-file change bumps `SYSTEM_GENERATION`
  is settled with the contract decision at the start of `theme-export`
  (capability map). Until then a pre-theme project file still opens
  (migrated), so nothing is refused.

## Dependency graph

```
Task 1  lib/themes.ts (roles, catalogue, resolve, nearest) + catalogue page
   │
   ├── Checkpoint A: user picks themes, role count, wording
   │
Task 2  drawing and export from roles (themeId fields, applyTheme at every
   │    draw/export site, screen background as role, master per screen)
   │
Task 3  creation defaults write roles; migration pass at every door;
   │    pre-theme fixture
   │
   ├── Checkpoint B: full e2e green, a new project is role-only end to end
   │
Task 4  role picker replaces the colour picker; Theme select per screen
   │
Task 5  Light/Dark toggle; Themes tab replaces Color Palette
   │
   ├── Checkpoint C: user review in the running designer
   │
Task 6  handbook (themes.md, gemeinsames.md, screens.md, projekte.md),
        humanizer, handbook-labels
   │
   └── Checkpoint D: code-reviewer agent, npm run test:all, commit
```

Tasks 4 and 5 could run in parallel after 3 (different files: panel vs
toolbar/settings), but both touch `project-editor.tsx`; sequential is
simpler. Task 6 depends on the final wording from Checkpoint A and the UI
from 4-5.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `canvas.tsx` draws through its own `drawObject`, not `renderScreenObjects`; a site is missed and draws a role name as a colour (invisible fill) | High | Task 2 lists every site (`canvas.tsx:1012/1567`, thumbnail, live preview, exporters); its test creates a project with roles and probes pixels on canvas, thumbnail and export render. |
| Tests that assert the old picker's colour list or hex values in the panel (`property-panel.spec.ts`, `master-screen-background.spec.ts`, `undo.spec.ts:250`, `empty-values.spec.ts`) | Medium | Rewritten in Task 4 to assert roles; look tests that pin rendered pixels stay untouched because `lavender` equals today. |
| `lavender` deviates from today's palette in some default (box fill transparent at creation vs `#e5e5e5` in the renderer; live-text defaults) | Medium | Task 1 derives `lavender` from `lib/control-palette.ts` and `handleCreateObject`'s literals, and Task 3's migration test renders the pre-theme fixture before and after and compares pixels. |
| HIL suites: conformance and Android fixtures write hex into device-format zips and feed `test-render` | Low | Untouched by design (device format stays hex); `npm run test:all` at Checkpoint B and D confirms. |
| The frozen generation corpus (`project-1.0.zip` etc.) holds hex; after Task 3 it opens migrated | Low | That is the intended path; `system-generation.spec.ts` keeps passing. A new pre-theme fixture is added, the corpus is never regenerated. |
| Two themes indistinguishable at 4 bit; a user picks one and sees no difference | Low | Themes tab shows quantised swatches (Task 5); the catalogue page (Task 1) shows every theme on the PaperS3 so the catalogue is chosen with that in view. |
| Master objects must resolve against each screen's theme; the thumbnail and canvas merge master objects before drawing | Medium | `applyTheme(project, screen, mergedObjects, variant)` takes the *drawn* screen; Task 2's test draws one master label on two screens with two themes. |

## Open questions

- Which 6-8 themes, their names and values; eight roles or six; the UI
  wording - all decided by the user at Checkpoint A on the catalogue page.
