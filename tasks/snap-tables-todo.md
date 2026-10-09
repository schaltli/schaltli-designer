# Todo: tables put together by snapping

Plan: `tasks/snap-tables-plan.md`. Spec: `docs/2026-10-09-snap-tables.md`.
Branch `snap-tables`, worktree `.claude/worktrees/snap-tables`.

## Module `snap-table-model`

## Task 1: The core - model, roles, layout

**Description:** `lib/snap-table.ts`: the types (`properties.grid = 1`,
`columns`/`rows` with optional `mm`, a child's `cell`, `align`, `alignY`,
`fill`), `isSnapTable`, roles (Icon, Label, Control by object type), the
occupancy of cells with spans, and the layout: natural column widths and
row heights from objects that span alone, raised by `mm`, spans that do not
fit growing their last column/row, empty ones about 4 mm, the 1.5 mm gap,
each object placed by align/fill (text left, rest centred by default).

**Acceptance criteria:**
- [ ] A 3×2 table of known object sizes lays out to the expected column x, row y and object rectangles.
- [ ] A width set by hand raises a column, never lowers it; below the content it has no effect.
- [ ] A 2-column span wider than its columns widens the last of them only.
- [ ] Align left/center/right, top/middle/bottom and Fill width/height place an object as specified.
- [ ] Roles: icon and live-icon Icon, text Label, everything else Control.

**Verification:** `npx playwright test e2e/snap-table-model.spec.ts`; `npm run typecheck`.

**Dependencies:** None · **Scope:** M

**Files likely touched:** `lib/snap-table.ts` (new), `e2e/snap-table-model.spec.ts` (new)

## Task 2: The core - editing operations

**Description:** In `lib/snap-table.ts`, pure operations on a table:
insert a column or row at an index (spans across it grow), put an object
into a cell, take an object out (its cell empty, empty rows and columns
removed, a table left with one object reported for dissolving), grow or
shrink a span in four directions only over empty cells, set and clear a
column width or row height, keep an existing object's place when the table
grows left or up (anchor), make a table from two free objects side by side
or one above the other, and the drop target for a point (empty cell, a
column or row line, a free object's edge, nothing).

**Acceptance criteria:**
- [ ] A column inserted inside a 2-column span makes it 3 wide; one at its edge does not.
- [ ] Taking out the last object of a row removes the row; of a two-object table returns the one left.
- [ ] A span grows left over two empty cells and is refused over an occupied one.
- [ ] After inserting a column at index 0, every other object keeps its absolute position.
- [ ] The drop target over an occupied cell is the nearest of its four edges; over an empty cell the cell.

**Verification:** `npx playwright test e2e/snap-table-model.spec.ts`; typecheck.

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `lib/snap-table.ts`, `e2e/snap-table-model.spec.ts`

## Task 3: Wiring - layout pass and export

**Description:** `lib/layout.ts` lays out a table with `grid = 1` through
the new core (`layoutOne`, `naturalWidth`, `minimumWidth`, `fills`), old
tables as before. A new table's children keep coordinates relative to it,
so export dissolves it as an old one.

**Acceptance criteria:**
- [ ] `layoutProject` on a project with a new table sets its children's x/y/width/height as Task 1 computes.
- [ ] The device zip, the Android export and the preview get absolute objects, no `table`, for a new table.
- [ ] Every existing `table-model`, `layout-*` and `bausteine` test still passes (old tables untouched).

**Verification:** `npx playwright test e2e/snap-table-model.spec.ts e2e/table-model.spec.ts e2e/layout-model.spec.ts e2e/bausteine.spec.ts`; typecheck.

**Dependencies:** Task 2 · **Scope:** S

**Files likely touched:** `lib/layout.ts`, `lib/object-groups.ts` (only if a test shows a gap), `e2e/snap-table-model.spec.ts`

## Checkpoint A: the core
- [ ] typecheck; `e2e/snap-table-model.spec.ts` and the old table/layout/bausteine specs green.

## Module `snap-table-canvas`

## Task 4: Two-level selection

**Description:** For new tables: a click selects the table, a double click
the object under the pointer, a click on another object of the same table
keeps the object level, Ctrl/⌘-click the object at once, Esc object →
table → nothing, Enter table → first object. Hover outlines what a click
would select. The chip names the selection («Table · 3×4», «Switch · M ·
2×1»). Old tables behave as before.

**Acceptance criteria:**
- [ ] Each rule above, in the running designer, on a new table made in the test's project.
- [ ] Old tables in the same project keep today's behaviour (`e2e/table-editing.spec.ts` green).

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g selection`; typecheck.

**Dependencies:** Task 3 · **Scope:** M

**Files likely touched:** `components/canvas/canvas.tsx` (routing), `components/canvas/snap-table-overlay.ts` (new), `e2e/snap-table-canvas.spec.ts` (new), `e2e/helpers.ts`

## Task 5: Snapping

**Description:** Dragging an object, from the canvas or as a new object
from the toolbar, near a free object or a new table shows the target (green
cell, insertion line strong along its row/column and faint over the rest,
a line along a free object's edge) and drops it there; elsewhere it lies
free; Esc puts everything back. One undo step. Handbook: a new section on
snapping in `handbuch/objekte/anordnen.md`.

**Acceptance criteria:**
- [ ] Three free switches dragged one next to the other become one table of one row.
- [ ] A label dropped left of a table row inserts a column; dropped on an empty cell fills it.
- [ ] Esc while dragging restores the project; one Ctrl+Z undoes a snap.
- [ ] The handbook section exists and its quoted labels pass `e2e/handbook-labels.spec.ts`.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g snapping e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 4 · **Scope:** L (split if it grows: canvas drags first, toolbar drops second)

**Files likely touched:** `components/canvas/canvas.tsx`, `components/canvas/snap-table-overlay.ts`, `components/project-editor.tsx` (drop actions), `handbuch/objekte/anordnen.md`, `e2e/snap-table-canvas.spec.ts`

## Task 6: Moving and dragging out

**Description:** A selected table is moved whole by dragging. A selected
object in a table is taken out by dragging (cell left empty, empty
rows/columns removed, a one-object table dissolved) and snaps as in Task 5,
losing its span. Copy/paste: a table pastes as a table, an object from a
table as a free object.

**Acceptance criteria:**
- [ ] Dragging a selected table moves all its objects; nothing else changes.
- [ ] Dragging a switch out of a 3×3 table leaves a gap; the last one of a row removes the row.
- [ ] Dragging one of two objects out leaves two free objects and no table.
- [ ] Copy/paste as above.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g moving`; typecheck.

**Dependencies:** Task 5 · **Scope:** M

**Files likely touched:** `components/canvas/canvas.tsx`, `components/project-editor.tsx` (paste), `e2e/snap-table-canvas.spec.ts`

## Task 7: Span handles

**Description:** ⇤ ⇥ ⤒ ⤓ on a selected object in a new table; dragging
grows or shrinks its span over empty cells; refused over occupied ones and
at the table's edge with a short message. One undo step. Handbook updated.

**Acceptance criteria:**
- [ ] A button grows over two empty cells to its left with ⇤ and back with ⇥.
- [ ] A span over an occupied cell is refused; the object stays as it was.
- [ ] The handbook describes the four handles.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g span`; typecheck.

**Dependencies:** Task 6 · **Scope:** M

**Files likely touched:** `components/canvas/snap-table-overlay.ts`, `components/canvas/canvas.tsx`, `handbuch/objekte/anordnen.md`, `e2e/snap-table-canvas.spec.ts`

## Task 8: Column and row lines

**Description:** A selected new table shows a line right of each column
and below each row; dragging sets the width/height in mm (shown while
dragging), below the content it turns automatic again; hand-set lines
solid, automatic ones faint. One undo step. Handbook updated.

**Acceptance criteria:**
- [ ] A label column dragged 10 mm wider stays so when its text gets shorter.
- [ ] Dragged back below its text, it is automatic again.
- [ ] The width shows in mm while dragging.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g lines`; typecheck.

**Dependencies:** Task 7 · **Scope:** S

**Files likely touched:** `components/canvas/snap-table-overlay.ts`, `components/canvas/canvas.tsx`, `handbuch/objekte/anordnen.md`, `e2e/snap-table-canvas.spec.ts`

## Task 9: Switcher panels and free areas

**Description:** Inside a switcher panel and a free area, new tables work
as on a screen (snapping, selection, spans, lines). A switcher and a free
area can sit in a new table's cell as one object (role Control).

**Acceptance criteria:**
- [ ] Two switches snapped inside a switcher panel form a table there.
- [ ] A free area snapped beside a label forms a table; the free area's content stays free.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g contexts`; typecheck.

**Dependencies:** Task 8 · **Scope:** M

**Files likely touched:** `components/canvas/canvas.tsx`, `lib/snap-table.ts`, `e2e/snap-table-canvas.spec.ts`

## Module `snap-table-panel`

## Task 10: Property panel and object tree

**Description:** An object in a new table: x/y/width hidden, Size as
today, Align (Left, Center, Right; Top, Middle, Bottom), Fill (Width,
Height) where offered. A new table: its size as columns × rows, «Auto
sizes» when any width or height is set by hand. The object tree lists a
new table's objects row by row. Handbook updated with the labels.

**Acceptance criteria:**
- [ ] Align and Fill change the object's place on the canvas and are one undo step each.
- [ ] «Auto sizes» shows only with a hand-set width or height and clears them all.
- [ ] The tree lists a 2×2 table's objects in reading order.
- [ ] Every new label is quoted in the handbook and passes `e2e/handbook-labels.spec.ts`.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g panel e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 3 (can run beside Tasks 4-9) · **Scope:** M

**Files likely touched:** `components/property-panel/snap-table-properties.tsx` (new), `components/property-panel/property-panel.tsx`, `components/object-tree/object-tree-panel.tsx`, `handbuch/objekte/anordnen.md`

## Checkpoint B: try it
- [ ] Full `npm run test:e2e` green.
- [ ] The user tries Tasks 4-10 in the designer on port 3000 and compares with the prototype; findings go into the spec before Task 11.

## Module `snap-table-rows`

## Task 11: Row templates

**Description:** The toolbar offers «Icon · Label · Switch», «Label ·
Switch», «Icon · Switch», «Label · Button». Dragged to a new table, a row is
inserted at the nearest row line, each part into the first free column of
its role, missing roles get a column (Icon, Label, Control order), columns
covered by a span skipped; «+ Label column» shows while one would be made.
Released free or clicked: a new table of one row. Handbook updated.

**Acceptance criteria:**
- [ ] «Label · Switch» under a row «Icon · Label · Switch» puts its switch under the other switches, the icon cell empty.
- [ ] «Label · Button» onto a table of buttons only adds a Label column left of them.
- [ ] A row inserted across a 3-row span lengthens the span and skips its column.
- [ ] A clicked template lands as a table of one row.

**Verification:** `npx playwright test e2e/snap-table-rows.spec.ts e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 5, Task 10 · **Scope:** M

**Files likely touched:** `lib/snap-table.ts` (role placement), `components/toolbar/toolbar.tsx`, `components/canvas/canvas.tsx`, `handbuch/objekte/anordnen.md`, `e2e/snap-table-rows.spec.ts` (new)

## Module `snap-table-blocks`

## Task 12: One-part blocks as rows

**Description:** `lib/bausteine.ts` builds a one-part block as a row (icon,
name, part; missing ones left out) and places it as a row template: into a
new table by roles, or free as a table of one row. Old tables no longer
receive blocks.

**Acceptance criteria:**
- [ ] Three switch blocks dropped one under the other stand as one table, names and switches flush.
- [ ] A block without icon lands with its icon cell empty.
- [ ] The visible outcomes `e2e/bausteine.spec.ts` checks today (names on top, right edges flush) hold for the new build; the spec rewritten where it tested nesting.

**Verification:** `npx playwright test e2e/bausteine.spec.ts`; typecheck.

**Dependencies:** Task 11 · **Scope:** M

**Files likely touched:** `lib/bausteine.ts` (`blockTable`), `components/project-editor.tsx` (`startBaustein`, `placeBlockInTable`), `e2e/bausteine.spec.ts`

## Task 13: Several-part blocks and switchers

**Description:** A block of several parts is a new table of its own (first
row icon · name · first part, further parts below in the Control column,
name top-aligned) and is never inserted into another table. A switcher is
one object in its Control column; its panels hold their parts free, or a
table when more than one (pending open question 3). The switcher's size is
its tallest panel's. Handbook `designer/bausteine.md` updated.

**Acceptance criteria:**
- [ ] The MaxxFan block lands as a table of its own; dropped on another table it lies free beside it.
- [ ] Its switcher sits in one cell; each panel shows its parts as before; nothing below jumps when the mode changes.
- [ ] `e2e/vanpi-bridge.spec.ts` green.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/vanpi-bridge.spec.ts e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 12 · **Scope:** L

**Files likely touched:** `lib/bausteine.ts` (`switcherSlot`, `blockTable`), `lib/layout.ts` (`fitSwitcher`), `handbuch/designer/bausteine.md`, `e2e/bausteine.spec.ts`

## Checkpoint C: blocks
- [ ] Full `npm run test:e2e` green.
- [ ] The user inserts bridge blocks (Autoterm, MaxxFan, relays) and rows and tries them.

## Module `old-table-removal`

## Task 14: Old tables dissolved, Table tool gone

**Description:** On load, every `table` without `grid = 1`, at any depth,
becomes its children at their last absolute positions
(`dissolveContainerList`); idempotent, no undo step. `migrateScreenToTables`
and the table part of `migrateToFreeScreens` stop making tables. The
toolbar's «Tables» group (Table, Table template) goes. Handbook: the old
«Container» section replaced by the snapping sections.

**Acceptance criteria:**
- [ ] A project saved with nested old tables opens with every object where it was and no old table.
- [ ] Opening it twice changes nothing more.
- [ ] No «Table» tool and no table template in the toolbar.
- [ ] `e2e/handbook-labels.spec.ts` green.

**Verification:** `npx playwright test e2e/snap-table-model.spec.ts e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 13 · **Scope:** M

**Files likely touched:** `lib/object-types.ts` (`migrateProject`), `lib/table.ts`, `lib/free-screens.ts`, `components/toolbar/toolbar.tsx`, `handbuch/objekte/anordnen.md`

## Task 15: Old table code and tests removed

**Description:** Remove what only old tables used: `table-overlay.ts`,
`table-group.tsx`, `table-shape-picture.tsx`, `layout-templates.ts`, the old
parts of `table-properties.tsx`, `lib/table.ts` and of `canvas.tsx`,
`project-editor.tsx`, `object-tree-panel.tsx`, `lib/layout.ts`; and the
tests of removed behaviour (`table-editing`, `layout-templates`, the old
parts of `table-model`, `table-canvas`, `layout-*`, `free-area`).
`lib/snap-table.ts` may take over the name `lib/table.ts`.

**Acceptance criteria:**
- [ ] No import of a removed file; typecheck, lint and build green.
- [ ] Full `npm run test:e2e` green; every removed test was about removed behaviour (listed in the commit message).

**Verification:** `npm run typecheck && npm run lint && npm run build && npm run test:e2e`.

**Dependencies:** Task 14 · **Scope:** L (split by file group if it grows)

**Files likely touched:** the files above

## Task 16: HIL fixture rebuilt

**Description:** `hil/layout/containers.js` builds its screens with new
tables (rows, spans, a hand-set column width, align, fill).

**Acceptance criteria:**
- [ ] The Knob and the 4.3B show the fixture as the preview does (user runs it on the hardware).

**Verification:** `npm run test:all` with the devices connected.

**Dependencies:** Task 15 · **Scope:** S

**Files likely touched:** `hil/layout/containers.js`

## Task 17: Handbook final pass

**Description:** Every handbook page that mentions tables
(`objekte/anordnen.md`, `designer/bausteine.md`, `designer/index.md`,
`designer/screens.md`, `einfuehrung/erste-schritte.md`,
`designer/objekte.md`, `einfuehrung/index.md`, `objekte/anzeigen.md`)
describes the new table; screenshots renewed; drafts through
`maettel-humanizer`.

**Acceptance criteria:**
- [ ] No page describes the Table tool, templates or nested tables.
- [ ] `e2e/handbook-labels.spec.ts` and `npm run screenshots` green.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`; `npm run screenshots`; `npm run dev --prefix handbuch` read through.

**Dependencies:** Task 15 · **Scope:** M

**Files likely touched:** the pages above, `e2e/handbook-screenshots.spec.ts`

## Checkpoint D: complete
- [ ] `npm run test:all` green; the spec's success criteria ticked.
