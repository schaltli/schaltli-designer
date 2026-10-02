# Tasks: tables instead of stacks and grids

Spec: docs/2026-10-02-layout-tables.md. Plan: tasks/layout-tables-plan.md.
Every task: typecheck (`npm run typecheck`) and the specs it names green
before its commit; the handbook updated where a user sees the change
(CLAUDE.md); the test that proves it named in the report.

## Phase 1 - `table-model`

## Task 1: The table and its layout

**Description:** `lib/table.ts`: the `table` type (`properties.columns`
with width `auto` / `{ share }` / `{ mm }` / `{ step, times }` and `align`;
`properties.rows`), a child's `properties.cell` (row, column, spans,
align), and the layout computation: column widths (fixed and `auto`
first - placeholder texts not counted, 20 px empty - then shares of the
rest, in proportion), row heights (tallest single-row object; an empty row
a size-S control's height; spanning objects last), the 1.5 mm gap,
placement by alignment (controls at natural width, never narrower than
their labels; stretchers at the cell's width; vertically centred), "does
not fit" ignoring the trailing empty row, nested tables. `lib/layout.ts`
dispatches a `table` to it.

**Acceptance criteria:**
- [x] Every column kind, alone and mixed, gives the widths the spec says.
- [x] Spans, alignment, nested tables and placeholder texts lay out as
      the spec says; a too-wide control marks "does not fit".
- [x] Children without a cell take the first empty cells in reading order.

Note (2026-10-02): the always-free last row is not part of the model - it
would add an empty row under every nested block on the device. It is the
canvas's: Task 3 draws it below the table, Task 4 places into it.

**Verification:** `npx playwright test e2e/table-model.spec.ts`; `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/table.ts` (new), `lib/layout.ts`, `lib/object-types.ts`, `e2e/table-model.spec.ts` (new)

**Estimated scope:** M

## Task 2: The table as the screen's root, migration, deploy

**Description:** `screen.layout` may be a table; the layout pass lays it
out in the master's content area with the 2 mm edge. `migrateProject`
turns what Tasks 1-12 saved into tables: a vertical stack into one column,
a horizontal stack into one row, a grid into its columns, a group in a grid
into its pieces' cells, a spacer into an empty cell, template columns
(`layoutSlot`) into the screen table's cells; idempotent. Deploy dissolves
tables as it did containers.

**Acceptance criteria:**
- [x] Each Task 1-12 shape migrates, and its objects lie where they lay
      before (within the gap's change). «holl»: every control at the same
      x; 12 px lower, its leading spacer's row now an empty row's height.
- [x] A project from before containers loads, looks and deploys exactly as
      before; migration run twice changes nothing.
- [x] A screen whose root is a table deploys with every object absolute.

Note (2026-10-02): `migrateScreenToTables` is wired into `migrateProject`
in Task 5, with the canvas tests for stacks and grids rewritten for
tables - before Task 4 a migrated screen could not be placed into.

**Verification:** `npx playwright test e2e/table-model.spec.ts e2e/layout-model.spec.ts`; `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:** `lib/table.ts`, `lib/layout.ts`, `lib/object-types.ts`, `lib/object-groups.ts`, `e2e/table-model.spec.ts`

**Estimated scope:** M

## Checkpoint A - the model on devices
- [x] `hil/layout/containers.js` builds its screens with tables; the Knob
      and the 4.3B match the preview pixel for pixel (3/3 each, 0 px).
      Found on the Knob: two buttons in 50% columns overlapped - a share
      column is now never narrower than a control in it.
- [x] «holl» migrates and stands as it did (checked with
      migrateScreenToTables; loading it migrated is Task 5)
- [ ] Review with the user

## Phase 2 - `table-canvas`

## Task 3: Lines and the Table tool

**Description:** The Layout tools become Table and Free; a drawn table has
`auto | 100%` and one empty row. `components/canvas/table-overlay.ts`
draws every table's lines in the editor, thin and grey and dashed, empty
cells included; the active table (selected, holding the selection, under
a tool) strong. None in the preview and on devices. Replaces Task 8's
tinted places.

**Acceptance criteria:**
- [ ] A drawn table shows its lines and empty cells at once.
- [ ] The active table is drawn strong, others thin; the preview shows none.
- [ ] The toolbar's Layout group offers Table and Free only.

**Verification:** `npx playwright test e2e/table-canvas.spec.ts e2e/handbook-labels.spec.ts`; `npm run typecheck`

**Dependencies:** Task 2

**Files likely touched:** `components/canvas/table-overlay.ts` (new), `components/canvas/canvas.tsx`, `components/toolbar/toolbar.tsx`, `e2e/table-canvas.spec.ts` (new), `handbuch/objekte/anordnen.md`

**Estimated scope:** M

## Task 4: Placing into a cell or a new row

**Description:** With a tool over a table: an empty cell lights up and a
click puts the object there; over a row line a thick line shows and a
click inserts a row there with the object in the column under the pointer;
an occupied cell takes nothing. The trailing empty row stays empty
(another is added). Replaces the insertion line for tables.

**Acceptance criteria:**
- [ ] A click into an empty cell places the object in that cell.
- [ ] A click on a row line inserts a row, shifting the rows below.
- [ ] An occupied cell shows nothing and takes nothing.

**Verification:** `npx playwright test e2e/table-canvas.spec.ts`; `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `lib/table.ts`, `components/canvas/table-overlay.ts`, `components/canvas/canvas.tsx`, `components/project-editor.tsx`, `e2e/table-canvas.spec.ts`

**Estimated scope:** M

## Task 5: Moving between cells and rows

**Description:** Dragging an object, or several, on the canvas or in the
object list onto an empty cell or a row line moves it there; several keep
their cells relative to each other. The object list shows a table's
objects row by row, left to right.

**Acceptance criteria:**
- [ ] An object dragged onto an empty cell or a row line lands there.
- [ ] Two selected objects keep their relative cells.
- [ ] The object list orders a table row by row.

**Verification:** `npx playwright test e2e/table-canvas.spec.ts`; `npm run typecheck`

**Dependencies:** Task 4

**Files likely touched:** `lib/table.ts`, `components/canvas/canvas.tsx`, `components/object-tree/object-tree-panel.tsx`, `components/project-editor.tsx`, `e2e/table-canvas.spec.ts`

**Estimated scope:** M

## Task 6: Column lines and «+»

**Description:** On the active table a handle on each inner column line;
dragging it moves width between the two columns, both becoming shares,
the share shown while dragging. «+» below adds a row, «+» at the right a
column (`auto`). One undo step each.

**Acceptance criteria:**
- [ ] Dragging a column line sets both columns' shares and shows them.
- [ ] «+» adds a row and a column.
- [ ] Each is one undo step.

**Verification:** `npx playwright test e2e/table-canvas.spec.ts`; `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `components/canvas/table-overlay.ts`, `components/canvas/canvas.tsx`, `lib/table.ts`, `e2e/table-canvas.spec.ts`

**Estimated scope:** M

## Task 7: The table's, column's and cell's properties; spans

**Description:** Selecting a table shows its rows and columns; clicking
the strip above a column shows the column's width kind (Auto, Share,
Fixed mm, Size multiple) and alignment, and lets it be removed. An object
in a table shows «Cell» (row, column, row span, column span, align)
instead of x, y and width; dragging its right or bottom edge across a line
extends its span. Replaces container-properties.tsx's fields.

**Acceptance criteria:**
- [ ] A column's width kind and alignment are set from its strip.
- [ ] An object's cell and spans are set in «Cell» and by dragging its edge.
- [ ] An object in a table shows no x, y, width.

**Verification:** `npx playwright test e2e/table-canvas.spec.ts e2e/property-panel.spec.ts e2e/handbook-labels.spec.ts`; `npm run typecheck`

**Dependencies:** Task 6

**Files likely touched:** `components/property-panel/table-properties.tsx` (new), `components/property-panel/property-panel.tsx`, `components/canvas/table-overlay.ts`, `components/canvas/canvas.tsx`, `handbuch/objekte/anordnen.md`

**Estimated scope:** M

## Checkpoint B - working with tables, reviewed
- [ ] A screen built only by clicking and dragging, no typed widths
- [ ] typecheck, table-model, table-canvas green
- [ ] Review with the user in the running designer

## Phase 3 - `table-blocks`

## Task 8: A block is a small table

**Description:** The block builder makes a table: name and control in a
row, each further part in a row below in the control's column. On `free`
it stays a table; dropped on a row line it is merged (the target keeps its
columns; more target columns: the rest empty; fewer: the leftovers into
the last column); dropped into an empty cell it is nested. Handbook:
`designer/bausteine.md`.

**Acceptance criteria:**
- [ ] Three blocks on row lines of a «Name and control» table stand as
      three rows, names and controls on one edge each.
- [ ] Merged into one and into three columns as the spec says.
- [ ] Into a cell nested; on `free` a table of its own.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/table-canvas.spec.ts` (needs `npm run hil:broker`); `npm run typecheck`

**Dependencies:** Task 5

**Files likely touched:** `lib/bausteine.ts`, `lib/table.ts`, `components/project-editor.tsx`, `e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`

**Estimated scope:** M

## Phase 4 - `table-templates`

## Task 9: Layouts as table shapes, with pictures

**Description:** The Layout field becomes a list with a small picture of
each layout (One column, Name and control, Two columns, Free); choosing
one copies its table into the screen, its lines show at once; changing
keeps all content (in the order it stood in, row by row; into Free at its
last places); one undo step; a new screen starts with «Name and control».
Replaces lib/layout-templates.ts's stack and grid templates.

**Acceptance criteria:**
- [ ] The list shows a picture of each layout before it is chosen.
- [ ] Choosing shows the table's lines; changing keeps all content; undo
      restores it.
- [ ] A new screen starts with «Name and control».

**Verification:** `npx playwright test e2e/layout-templates.spec.ts e2e/handbook-labels.spec.ts`; `npm run typecheck`

**Dependencies:** Task 7

**Files likely touched:** `lib/layout-templates.ts`, `components/property-panel/screen-properties.tsx`, `components/project-editor.tsx`, `e2e/layout-templates.spec.ts`, `handbuch/designer/screens.md`

**Estimated scope:** M

## Task 10: The old types removed, handbook, full run

**Description:** Stack, row, grid and spacer code and their tests go
(`lib/layout.ts`, `container-properties.tsx`, the old specs' cases);
nothing reads them after the migration. The handbook pages this touched
(`objekte/anordnen.md`, `designer/screens.md`, `designer/bausteine.md`,
`einfuehrung/erste-schritte.md`, `designer/index.md`) describe tables,
with pictures (`e2e/handbook-screenshots.spec.ts`), through the
humanizer. `hil/layout/containers.js` and `npm run test:all`.

**Acceptance criteria:**
- [ ] No stack, row, grid or spacer left in the designer's code or UI.
- [ ] The handbook describes tables, with pictures; humanized.
- [ ] `npm run test:all` green but for what fails on `main` too.

**Verification:** `npm run test:all`; `npm run build --prefix handbuch`

**Dependencies:** Tasks 8, 9

**Files likely touched:** `lib/layout.ts`, `components/property-panel/container-properties.tsx`, `e2e/layout-model.spec.ts`, `e2e/layout-canvas.spec.ts`, `e2e/handbook-screenshots.spec.ts`, handbook pages

**Estimated scope:** M

## Checkpoint C - complete
- [ ] Every success criterion of the amendment ticked
- [ ] `npm run test:all` green but for failures that also fail on `main`
- [ ] Review with the user
