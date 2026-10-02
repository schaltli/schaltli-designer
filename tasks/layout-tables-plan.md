# Implementation plan: tables instead of stacks and grids

Spec: docs/2026-10-02-layout-tables.md (amendment to
docs/2026-10-02-layout.md). Tasks in tasks/layout-tables-todo.md.

## Overview

The four container types of layout Tasks 1-12 (vertical stack, horizontal
stack, grid, free), the spacer and groups spreading over a grid's columns
become one `table` beside `free`. A table is laid out like a Word table:
each object stores its cell (row, column, spans); columns are `auto`, a
share of the rest or fixed (mm or a size multiple); lines are always
visible in the editor; column lines are dragged, rows and columns added
with «+». A block is a small table, merged at a row line or nested in a
cell. The screen's layouts are table shapes with a picture each. Devices
get x, y, width and height as today.

## Architecture decisions

- **A new module, `lib/table.ts`,** holds the table: types, the layout
  computation, the drop targets (cell, row line), merging and migration.
  `lib/layout.ts` keeps what is not about stacks and grids - the layout
  pass, the content area, round screens, `keepUnchanged`, natural widths -
  and dispatches a `table` to `lib/table.ts`. Its stack, row and grid code
  goes in the last task, once nothing uses it.
- **Cells are stored on the child** (`properties.cell`), as the spec says;
  x, y and width are still written by the layout pass, because the canvas,
  the renderers and the export read them. The cell is the truth, x/y the
  result.
- **Migration on load, in `migrateProject`,** idempotent, as the free root
  of Task 5: every saved stack, row, grid, spacer and template column
  becomes table cells. The user's test projects (e.g. «holl») load as they
  looked.
- **The canvas overlay is its own file** (`components/canvas/table-overlay.ts`):
  lines, handles, «+», the column strip - canvas.tsx calls it to draw and to
  hit-test, as it does for the content area. canvas.tsx is 3900 lines; new
  interaction state stays out of it where it can.
- **Order of work:** the model first, proven by Node tests and on the
  devices (Checkpoint A) before any UI; then placing and moving, then the
  column and cell editing; blocks and templates last; removal of the old
  types at the end, so every task leaves a working designer.

## Task list

### Phase 1 - `table-model`

- [x] Task 1: The table and its layout
- [x] Task 2: The table as the screen's root, migration, deploy

### Checkpoint A - the model on devices

### Phase 2 - `table-canvas`

- [x] Task 3: Lines and the Table tool
- [x] Task 4: Placing into a cell or a new row
- [x] Task 5: Moving between cells and rows
- [x] Task 6: Column lines and «+»
- [x] Task 7: The table's, column's and cell's properties; spans

### Checkpoint B - working with tables, reviewed

### Phase 3 - `table-blocks`

- [ ] Task 8: A block is a small table

### Phase 4 - `table-templates`

- [ ] Task 9: Layouts as table shapes, with pictures
- [ ] Task 10: The old types removed, handbook, full run

### Checkpoint C - complete

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Migration loses or moves something in a saved project | High | Task 2 migrates every Task 1-12 shape in Node tests, compares the laid-out objects before and after; «holl» checked by hand |
| canvas.tsx grows harder to change | Med | The overlay in its own file; one interaction per task, e2e for each before the next |
| Dragging column lines and spans needs precise hit-testing at any zoom | Med | Hit areas in screen pixels (as the content area's handles); tested at zoom 1 and 2 |
| An empty row at the end changes what devices show | Low | It is laid out but has no objects; "does not fit" ignores it; HIL compares at Checkpoint A |
| Old tests encode stack/grid rules | Med | Rewritten task by task for tables, not deleted; the old ones go with the code in Task 10 |

## Open questions

None open; the spec's four were settled on its approval.
