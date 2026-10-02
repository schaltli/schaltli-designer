# Implementation Plan: Layout containers in the designer

Spec: docs/2026-10-02-layout.md (approved 2026-10-02). Tasks and
checkpoints: tasks/layout-todo.md.

## Overview

Screens are divided into containers - `vertical-stack`, `horizontal-stack`,
`grid`, `free` - and objects get their place and size from them: width
from the container, height from the size step; groups in a grid share its
columns. Masters keep inheriting live and get a content area; a screen's
layout is a copy chosen through a «Layout» option; existing projects load
into one `free` container; devices are unchanged. Four modules, built in
order: `layout-model` → `layout-canvas`, `layout-blocks` →
`layout-templates`.

## Architecture decisions

- **The layout is written into the objects, not computed at draw time.** A
  pure `layoutObjects` (`lib/layout.ts`) places every container's children
  after every change, where `normalizeGroups` already runs
  (`components/project-editor.tsx:728`). Canvas, preview, thumbnails, baked
  bitmaps and deploy keep reading finished coordinates and need no change.
  Rationale: the smallest footprint, and every existing reader stays correct
  by construction.
- **Containers are dissolved at deploy like groups** (`dissolveGroups`,
  `lib/object-groups.ts:185`), for the device zip and the Android export
  alike. The device contract does not change.
- **Two passes: measure (leaves up), arrange (root down).** Grid columns are
  measured across all cells of a column, including the pieces of groups in
  the grid (shared columns).
- **The screen is its own root container** (`screen.layout`, decided
  2026-10-02 over wrapping): old screens load as `free`, idempotently in
  `migrateProject`, objects untouched; canvas, tree and master merge stay
  as they are. A project from before deploys byte-for-byte as before -
  proven in Task 5.
- **Round comes from the DDF** (`screen.shape`), not from the adornment.
- **The content area belongs to the master,** inherited live; screens lay
  their root container out in it.

## What the code looks like today

See the spec's section of the same name. Two things the plan leans on:

- `childOrigin` (`object-groups.ts:357`) skips a panel's x/y while
  `getAbsolutePosition` (`lib/object-tree.ts:47`) adds it - they disagree for
  panel children. The layout pass must use one rule; Task 1 settles it with
  a test before anything is built on it.
- The canvas moves objects only inside the container being edited; moving
  between containers exists only in the object tree (`moveObject`,
  `project-editor.tsx:~1836`). Task 8 adds it to the canvas.

## Task list

### Phase 1 - `layout-model`

- [x] Task 1: Container types and the vertical stack
- [x] Task 2: Horizontal stack and grid
- [x] Task 3: Groups in a grid share its columns
- [x] Task 4: Containers drawn, and dissolved at deploy
- [x] Task 5: A screen is its own root container, and the layout pass

### Checkpoint A - the model

### Phase 2 - `layout-canvas`

- [x] Task 6: The Layout tools and container properties
- [x] Task 7: Placing into a container at the insertion line
- [x] Task 8: Moving within and between containers on the canvas
- [ ] Task 9: Round screens and the master's content area

### Checkpoint B - on devices

### Phase 3 - `layout-blocks`

- [ ] Task 10: Blocks into containers, lined up in a grid

### Phase 4 - `layout-templates`

- [ ] Task 11: A screen's Layout option
- [ ] Task 12: Handbook pictures, humanizer pass, full run

### Checkpoint C - complete

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A layout pass after every change makes editing slow on big projects | Med | Pure function over the open screen only; measure it on the largest test project in Task 4 and keep a budget (one frame) |
| An old project changes by one pixel through migration | High | Task 4 proves old projects deploy byte-for-byte as before, before any UI exists |
| Panel children: two coordinate rules in the code | Med | Task 1 pins one rule with a test |
| `canvas.tsx` (3000+ lines) is hard to change safely | Med | Tasks 7 and 8 each touch one interaction; e2e for each before the next |
| Size steps and layout disagree (`stepUpdates` widens a control the container then narrows) | Med | Layout runs after `stepUpdates`; in containers width is the container's, tested in Task 2 |
| The DDF field lives in `schaltli-firmware` | Low | Ask before changing it (Task 9); the designer treats a missing field as `"rect"` |

## Open questions

From the spec, to be settled where they come up:

1. ~~A `systemGeneration` step for new object types in the editable
   project.~~ No step (the user, 2026-10-02): devices never see containers,
   and the designer is updated as one.
2. ~~A `free` container inside a stack: height only, or a fixed aspect
   ratio (Task 2).~~ Height only: the stack's width, its own height.
3. Default `padding` and `gap` in millimetres (tried at Checkpoint B).
