# Implementation plan: tables put together by snapping (`snap-tables`)

Spec: `docs/2026-10-09-snap-tables.md` (2026-10-09). Idea paper and
prototypes: `docs/ideas/tabelle-zum-zusammenstecken.md`,
`docs/ideas/tabelle-prototyp*.html`. Tasks: `tasks/snap-tables-todo.md`.
Chat German, docs English.

Scope: all six modules of the spec, in its build order.

## Overview

A new kind of `table` (`properties.grid = 1`): a flat grid that forms when
two objects snap together, selected on two levels, with spans in four
directions, column widths and row heights by hand, Align and Fill. Rows
come from templates and from blocks, their parts sorted into columns by
role. Old tables keep working until the last module, which dissolves them
on load and removes the Table tool with everything that served it.

## Architecture decisions

- **A new pure core, `lib/snap-table.ts`,** beside the old `lib/table.ts`
  until `old-table-removal`: types, roles, layout, insert, tidy, spans,
  hit-testing helpers for the canvas. No React, no project; tested in Node
  like `e2e/table-model.spec.ts` tests today's core. The prototype's
  functions (`gl`, `occ`, `fits`, `insertCol`, `insertRowAt`, `tidy`,
  `plan`, `target`) are the reference for behaviour, not for code.
- **Old and new told apart by `properties.grid = 1`.** `lib/layout.ts`
  branches on it in `layoutOne`, `naturalWidth`, `minimumWidth` and
  `fills`; the canvas branches on it where it handles tables today. No
  object changes kind while the user works.
- **Sizes in mm in the file, pixels only on the canvas,** through the
  project's px/mm as the size scale does (`lib/size-scale.ts`).
- **Export untouched.** A new table has children with coordinates relative
  to it, as an old one does, so `dissolveContainerList` dissolves both.
  Checked by a test in Task 3, not assumed.
- **The canvas gets a new overlay file, `components/canvas/snap-table-overlay.ts`,**
  for the insertion line, the green cell, the span handles, the column and
  row lines and the chip; `canvas.tsx` only routes pointer events to the
  new table's logic. The old `table-overlay.ts` stays until removal.
- **One undo step per gesture** through the existing `setProjectState`
  path, as every canvas gesture does today.
- **Handbook in the same task as the change it describes.** A new section
  on snapping appears with the canvas tasks; the old «Container» section
  goes in the removal module.

## Dependency graph

```
lib/snap-table.ts (T1, T2)
  └─ layout + export wiring (T3)
       ├─ selection (T4) ─ snapping (T5) ─ moving (T6) ─ spans (T7) ─ lines (T8) ─ contexts (T9)
       └─ panel + tree (T10)
            └─ row templates (T11)
                 └─ blocks as rows (T12) ─ several-part blocks, switcher (T13)
                      └─ dissolve old + remove tool (T14) ─ remove old code and tests (T15)
                           └─ HIL fixture (T16) ─ handbook final pass (T17)
```

T10 can run beside T4-T9 once T3 is done.

## Checkpoints

- **A (after T3):** the core and its wiring green in Node; a new table made
  in a test project lays out and exports as expected. No UI yet.
- **B (after T9 and T10):** the user tries snapping, selection, spans,
  lines and the panel in the running designer (port 3000) and compares
  with the prototype. Findings go into the spec before T11.
- **C (after T13):** blocks and rows tried by the user, the bridge blocks
  included.
- **D (after T17):** full `npm run test:all`; the Knob and the 4.3B show a
  screen of new tables as the preview does.

## Risks

| Risk | Mitigation |
|---|---|
| `canvas.tsx` (≈4,500 lines) mixes old table code everywhere | New logic in its own file; `canvas.tsx` only routes. Old paths stay until T15, removed in one task with their tests. |
| Blocks and switcher sizing depend on table layout (`fitSwitcher`, `stretchedNaturalWidth`) | T12/T13 rebuild blocks against the new core and keep `e2e/bausteine.spec.ts`'s visible outcomes (right edges flush, name on top). |
| Another session works in the same checkout on `main` | Built on branch `snap-tables` in its own worktree `.claude/worktrees/snap-tables` (agreed 2026-10-09); its own `node_modules` and its own dev server on another port than 3000. Merged into `main` at checkpoints, rebased on `main` before. |
| ~130 tests depend on old tables | Rewritten module by module; removed only in T15 and only for removed behaviour (allowed by the spec). |
| Snap zone or roles feel wrong in the real designer | Checkpoint B before rows and blocks build on them. |

## Verification per task

`npm run typecheck`, the task's spec file (`npx playwright test e2e/<file>`),
and at each checkpoint the full `npm run test:e2e`. One commit per task.
