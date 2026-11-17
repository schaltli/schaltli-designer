# Implementation Plan: table sizes

Spec: `docs/2026-11-16-table-sizes.md` (approved 2026-11-16). Tasks:
`tasks/table-sizes-todo.md`. Branch: `areas` (the work follows the areas and
is not merged yet).

## Overview

One rule for every size - at least the content, above that the room or the
author's hand - made true for tables and made visible: a line under «Frame»
that names what sets a width and a height (step 0), columns and rows that
say auto, fixed or fill on their own line (step 1), a table that is resized
at handles, with «Width» and «Equal columns» gone (step 2).

## Architecture decisions

- **Where a size comes from is computed, not stored.** `lib/size-source.ts`
  reads the laid-out objects and names the source; nothing in the project
  file changes for step 0. It is written against today's rules first and
  follows the rules as steps 1 and 2 change them, so the line under «Frame»
  is true after every step.
- **States live on the line object** (`columns[i]`, `rows[i]`), where `mm`
  already is. `{ fill: true }` beside `{}` and `{ mm }`.
- **The layout reads states and never writes them** (decision 5). Setting
  the last auto column to fill happens in the editor's edit pipeline, next
  to `cardsFitted` (components/project-editor.tsx), by comparing the project
  before and after an edit: a table that got more room than its content and
  has no fill column. Same undo step as the edit.
- **Two format versions**, one per step that changes the file: 4 after step
  1 (states; `equalColumns` no longer written), 5 after step 2 (`ownSize` on
  a table; `widthMm` no longer written). Each step can go to the van alone.
- **Rows get fill only with step 2:** before a table has a height of its
  own there is nothing for a row to fill (spec E6).
- **Nothing moves** is proven by the existing baseline
  (`e2e/areas-nothing-moves.spec.ts`), unchanged.

## Dependency graph

```
size-source (T1) ── Frame line (T2)
                         │ follows the rules below
column states in layout + migration v4 (T3)
        ├── fill set by the edit that gives room (T4)
        └── signs on the lines, «Equal columns» as a view of the states (T5)
table ownSize in layout + migration v5 (T7)
        ├── handles, Frame W/H, rows fill (T8)
        └── «Width» and «Equal columns» removed; block cards, template (T9)
```

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A migrated table lands a pixel off (rounding of shares) | High: «nothing moves» | The baseline per task; the migration writes what today's layout does, read from the laid-out table |
| A sign on every line clutters a selected table | Medium | Signs only on the selected table, where its lines are drawn today; checkpoint 1 with the user |
| The edit pipeline sets fill where the author did not want it | Medium | Only where no column is fill and one is auto; one Ctrl+Z; never from the layout |
| Old specs set «Width» / «Equal columns» through the panel | Low | Rewritten in T9, listed in the spec's Tests |
| A project saved with step 1 or 2 cannot be opened by an older designer | Medium | As with areas: said in the release note, copy first |

## Test runs

- T1, T2 (designer only): `npm run test:e2e:prod` at checkpoint 0.
- Steps 1 and 2 touch the project format: `npm run test:quick` at
  checkpoints 1 and 2.

## Open questions

None. Each checkpoint is a halt with the user.
