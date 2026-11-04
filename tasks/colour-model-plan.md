# Plan: colour model

Module `colour-model` of docs/2026-11-04-text-sizes-and-colours.md (approved
2026-11-04). Branch `colour-model`, after `text-sizes`; released with the
rest.

## What was found

- `lib/themes.ts`: 17 roles (11 + 6 energy), labels in `ROLE_LABELS`, nine
  themes, Lavender first and `DEFAULT_THEME_ID`; new masters take
  `defaultThemeIdFor(depth)` (the catalogue's first for the depth) or
  `DEFAULT_THEME_ID`; an unmigrated master gets `DEFAULT_THEME_ID` on load.
- `nearestRole` maps a hex from before themes onto a role; it leaves the
  energy roles out.
- Devices get hex (`applyTheme`); no firmware or app change.

## Approach

- **Roles:** five more - `accent3`, `accent4`, `good`, `warning`, `alarm` -
  in `ROLES`, `ROLE_LABELS` and every theme; the labels of five change
  (Background, Card, Card border, Text low, Accent 2). Ids stay.
  `nearestRole` leaves the new ones out too, so a pre-theme project still
  migrates to the same roles.
- **Slate** gets the spec's values, light and dark, and becomes the theme of
  new masters: `defaultThemeIdFor` and `DEFAULT_THEME_ID` say slate; the
  migration of a master without a theme keeps saying lavender, which is
  what such a file has always opened in.
- **The other seven colour themes** get the five new roles now, derived so
  nothing looks wrong (their accent's neighbours, the states shared), and
  their full redo - ground tinted, three accents that go with theirs - is
  proposed on a page for the user to choose before it is built (spec).
- **Paper:** the new roles in greys and black.

## Tasks

- **T1 roles and labels**, every theme filled, Paper in greys. Verify:
  `e2e/themes*.spec.ts` - every theme fills every role in light and dark;
  the panel lists the new ones; old projects open unchanged (nearestRole).
- **T2 Slate and the default**: values, new masters in Slate, old files
  still Lavender. Verify: themes spec, a new project's master is Slate, an
  unmigrated file's master Lavender.
- **T3 proposal page** (done 2026-11-04: all accepted; Schaltli keeps ink on orange) for the other themes' values (artifact), the user
  chooses; then built.
- **T4 handbook** `designer/themes.md` (Rollen, Die Themes), screenshots;
  `test:quick`.
