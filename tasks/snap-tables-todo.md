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
- [x] A 3×2 table of known object sizes lays out to the expected column x, row y and object rectangles.
- [x] A width set by hand raises a column, never lowers it; below the content it has no effect.
- [x] A 2-column span wider than its columns widens the last of them only.
- [x] Align left/center/right, top/middle/bottom and Fill width/height place an object as specified.
- [x] Roles: icon and live-icon Icon, text Label, everything else Control.

Done 2026-10-09. `lib/snap-table.ts`: `arrangeSnapTable`, `snapTableGeometry`,
`occupancy`, `dimensions`, `roleOf`, `isSnapTable`. Found while writing it:
Fill overwrites an object's width or height, and the next layout pass would
take that for its natural size and grow the column on every change; the
drawn size is kept in `properties.drawnWidth`/`drawnHeight` while filled
(tested by laying out twice).

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
- [x] A column inserted inside a 2-column span makes it 3 wide; one at its edge does not.
- [x] Taking out the last object of a row removes the row; of a two-object table returns the one left.
- [x] A span grows left over two empty cells and is refused over an occupied one.
- [x] After inserting a column at index 0, every other object keeps its absolute position.
- [x] The drop target over an occupied cell is the nearest of its four edges; over an empty cell the cell.

Done 2026-10-09. In `lib/snap-table.ts`: `insertSnapColumn`/`insertSnapRow`,
`placeInCell`, `setLineSize`, `takeOutOf` (taken and left objects come out
absolute and as drawn, without cell, fill or align), `resizeSpan`,
`keepInPlace`, `snapPair`, `snapTargetAt`, `freeSideAt`. Found by a test:
shrinking a span must not remove the column it leaves empty - it would
vanish under the pointer; only taking an object out tidies lines, as in the
prototype.

**Verification:** `npx playwright test e2e/snap-table-model.spec.ts`; typecheck.

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `lib/snap-table.ts`, `e2e/snap-table-model.spec.ts`

## Task 3: Wiring - layout pass and export

**Description:** `lib/layout.ts` lays out a table with `grid = 1` through
the new core (`layoutOne`, `naturalWidth`, `minimumWidth`, `fills`), old
tables as before. A new table's children keep coordinates relative to it,
so export dissolves it as an old one.

**Acceptance criteria:**
- [x] `layoutProject` on a project with a new table sets its children's x/y/width/height as Task 1 computes.
- [x] The device zip, the Android export and the preview get absolute objects, no `table`, for a new table.
- [x] Every existing `table-model`, `layout-*` and `bausteine` test still passes (old tables untouched).

Done 2026-10-09. `lib/layout.ts` lays a table with `grid = 1` out through
`arrangeSnapTable` (its children first), measures it by its content and
never stretches it. Export: tested on `dissolveGroupsInProject`, the first
step every export (zip, Android, assets, preview) takes. Moved align, fill
and the drawn size into `properties.cell` so they cannot meet an object's
own properties (spec updated). Test infrastructure for the worktree:
`E2E_PORT` (playwright.config.ts, e2e/global-setup.ts) runs the suite
against the worktree's own dev server, `SCHALTLI_FIRMWARE_REPO`
(e2e/ddf-seed.ts) finds the firmware from a worktree - without it 17
`bausteine` tests skipped. Ran: snap-table-model 22, table-model,
layout-model, block-description, ha-discovery 125 (Node); bausteine,
table-canvas, table-editing, layout-canvas, free-area, layout-templates,
vanpi-bridge 149 against port 3100 (4 `placing a catalog entry` tests failed
once under the cold server's load and passed alone, together and in a
second full run).

**Verification:** `npx playwright test e2e/snap-table-model.spec.ts e2e/table-model.spec.ts e2e/layout-model.spec.ts e2e/bausteine.spec.ts`; typecheck.

**Dependencies:** Task 2 · **Scope:** S

**Files likely touched:** `lib/layout.ts`, `lib/object-groups.ts` (only if a test shows a gap), `e2e/snap-table-model.spec.ts`

## Checkpoint A: the core
- [x] typecheck; `e2e/snap-table-model.spec.ts` and the old table/layout/bausteine specs green (2026-10-09).

## Module `snap-table-canvas`

## Task 4: Two-level selection

**Description:** For new tables: a click selects the table, a double click
the object under the pointer, a click on another object of the same table
keeps the object level, Ctrl/⌘-click the object at once, Esc object →
table → nothing, Enter table → first object. Hover outlines what a click
would select. The chip names the selection («Table · 3×4», «Switch · M ·
2×1»). Old tables behave as before.

**Acceptance criteria:**
- [x] Each rule above, in the running designer, on a new table made in the test's project - except Ctrl/⌘-click (see below).
- [x] Old tables in the same project keep today's behaviour (`e2e/table-editing.spec.ts` green).

Done 2026-10-09. The new table uses the group's two-level selection
(`editingContainerId`): `isOldTable` (lib/table.ts) keeps the old table's
cell click, lines, «+», span-by-resize, ribbon path, tree drops and
TableProperties to old tables; Esc leaves a new table as a group
(`leaveEditedGroup`); Enter goes to the first object in reading order;
hover outlines were already there. `snap-table-overlay.ts` draws the cells
dashed while the table is selected or open, and the chip
(«Table · 2×2», «Text»; also `data-snap-chip` on the canvas). Found in a
screenshot: the generic resize handles showed on such a table and its
objects and did nothing - removed (`sizedBySnapTable`). **Not built:**
Ctrl/⌘-click selecting the object at once - Ctrl/⌘-click already adds to
the selection in the designer; left for the user. No handbook change: a new
table cannot be made in the UI before Task 5, whose handbook section covers
selection too. Ran 197 specs on port 3100 (snap-table-*, table-*, layout-*,
free-area, bausteine, group, object-tree-*, property-panel,
tab-control-copy-paste): green.

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
- [x] Three free switches dragged one next to the other become one table of one row (tested with texts).
- [x] A label dropped left of a table row inserts a column; dropped on an empty cell fills it (Node).
- [x] Esc while dragging restores the project; one Ctrl+Z undoes a snap.
- [x] The handbook section exists and its quoted labels pass `e2e/handbook-labels.spec.ts`.

Done 2026-10-10. `snapDropAt`/`applySnapDrop` (lib/snap-table.ts) find
and apply a drop in one space (screen, panel, group, free area); the canvas
shows it while dragging (`drawSnapDrop`: green cell, insertion line strong
along its row/column, a line along a free object's edge) and the editor
applies it on release (`snapDrop`), opening the table with the object
chosen. A new object drawn with a tool snaps the same way (`onAddObject`
takes `{ snap }`). One free object at a time; not from inside a new table
(Task 6); groups, tables, the navigator never stand in a cell. Esc while
dragging puts the object back. Zone 5 mm (open question 5). Handbook:
section «Zusammenstecken» in `objekte/anordnen.md`.

The full suite then showed snapping on by default made tables of every
drag ending near another object; the user decided (2026-10-10): snapping
stays on, Ctrl/⌘ held while dragging turns it off. Seven tests that place
side by side on purpose hold Ctrl now (`placingFreely`, e2e/helpers.ts).
The worktree needed its own `.env.local` (`NEXT_PUBLIC_DEPLOY_ENABLED=true`
only) - without it ~45 deploy, export and recovery tests failed - and
`e2e/page-icon-export.spec.ts` reads `SCHALTLI_FIRMWARE_REPO` too. Full
suite on port 3100: 1370 passed, 18 skipped, 3 failed - the Ctrl test's
position check (fixed: the alignment guides place it), page-icon-export
(fixed) and preview-performance `@alone` (green alone).

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g snapping e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 4 · **Scope:** L (split if it grows: canvas drags first, toolbar drops second)

**Files likely touched:** `components/canvas/canvas.tsx`, `components/canvas/snap-table-overlay.ts`, `components/project-editor.tsx` (drop actions), `handbuch/objekte/anordnen.md`, `e2e/snap-table-canvas.spec.ts`

## Module `place-by-dragging` (added 2026-10-10)

## Task P1: A tool makes its object at the pointer, held as a dragged one

**Description:** With a tool other than line/polyline, a press on the
canvas makes the object at its default size (spec: «Placing by dragging»),
its middle under the pointer, selected and in the drag that moving uses:
it follows the pointer, snaps by its edges, Ctrl/⌘ places freely, release
puts it down, Esc removes it again. A click without moving puts it down
there. One undo step. Drawing a rectangle goes for these tools, and with it
`createSnapRef` and the draw space for new objects; an open table is left
for the space it stands in when a tool is used. Lines and polylines are
drawn as today. The old table's click placement (`tablePlacementRef`) and
the Table tool keep working until module old-table-removal.

**Acceptance criteria:**
- [x] A switch: press, move, release - it lies where it was let go, at M, its middle where the pointer was (tested with a box: the test device has no switch).
- [x] Pressed and let go with its edge against a free text: they are a table.
- [x] Esc before release: no object, nothing to undo.
- [x] One Ctrl+Z after placing removes the object.
- [x] A line is still drawn from point to point, and lies free even when drawn against a table or with a table open.
- [x] A drawn line dragged onto an empty cell goes into it (snap-table-canvas, since the line fix).

Done 2026-10-10. `lib/placing.ts`: `placedSize` (the spec's proposed
sizes; null for line, polyline, the old table's tool and a block) and
`heldAt`. The canvas starts the existing create drag with `placing: true`
and the default size held at the pointer; moving carries it and snaps by
its edges; release builds the object through the existing creation code
from that rectangle; Esc takes it away (the tool stays in hand). The canvas
carries `data-pixels-per-mm` for tests. Kept, not removed as the spec said:
`createSnapRef` hands the snap to the creation on release, and `drawSpace`
still sends a new object out of an open table. **Not yet:** the full suite -
many specs still draw rectangles - and the handbook; both are Task P2.
Ran: place-by-dragging 7, snap-table-canvas 11 (three rewritten for the new
gesture).

**Verification:** `npx playwright test e2e/place-by-dragging.spec.ts e2e/snap-table-canvas.spec.ts`; typecheck.

**Dependencies:** Task 5 · **Scope:** L

**Files likely touched:** `components/canvas/canvas.tsx`, `components/project-editor.tsx` (`addObject`), `lib/` (default sizes), `e2e/place-by-dragging.spec.ts` (new), `e2e/helpers.ts`

## Task P2: Default sizes, tests and handbook

**Description:** The default size of each type (spec, proposed values),
checked per tool. Every existing test that draws a rectangle with such a
tool is changed to the new gesture (a helper `placeWith(page, tool, at)` in
`e2e/helpers.ts`), keeping what it tests; tests about the size a rectangle
gave go or are rewritten for the default size and the handles. Handbook:
every page that says to draw a rectangle for an object.

**Acceptance criteria:**
- [x] Each tool's new object has the default size the spec names.
- [x] Full `npm run test:e2e` green (but for the timing test below).
- [x] No handbook page tells to draw a rectangle except for a line; `e2e/handbook-labels.spec.ts` green. (Blocks and the old table's tool still draw one until their modules.)

Done 2026-10-10. Found by the suite: the creation code gives some objects
another size than they were carried at - a slider its track's height, a
text its font's - keeping their top edge, so they did not stand centred
where let go; a carried object is now moved back onto that middle
(`placedMiddleRef`), the navigator excepted. Five specs that expected a
drawn rectangle's size or place were changed for the new gesture
(free-area, layout-canvas, hardware-button-adjust-level, two in
software-button-look). Handbook: designer/objekte.md («Ein Objekt setzen»
with the default sizes), objekte/anordnen.md (Zusammenstecken, Free),
objekte/anzeigen.md (Bar), objekte/zeichnen.md (Line). Full suite on port
3100: 1386 passed, 18 skipped, 1 failed - preview-performance `@alone`, a
1000 ms timing test at 10x CPU, which failed once alone too and passed on
the next run alone: flaky on this machine, not touched by this work.

**Verification:** full `npm run test:e2e` on the worktree's server; `npm run screenshots`.

**Dependencies:** Task P1 · **Scope:** L (split by spec file group if it grows)

**Files likely touched:** many `e2e/*.spec.ts`, `e2e/helpers.ts`, `handbuch/**`

## Task 6: Moving and dragging out

**Description:** A selected table is moved whole by dragging. A selected
object in a table is taken out by dragging (cell left empty, empty
rows/columns removed, a one-object table dissolved) and snaps as in Task 5,
losing its span. Copy/paste: a table pastes as a table, an object from a
table as a free object.

**Acceptance criteria:**
- [x] Dragging a selected table moves all its objects; nothing else changes.
- [x] Dragging a switch out of a 3×3 table leaves a gap; the last one of a row removes the row (tested with texts in a 2×2 table; the gap case in Node).
- [x] Dragging one of two objects out leaves two free objects and no table.
- [x] Copy/paste as above (an object copied out of a table; a copied table pastes as a table through the existing paste).

Done 2026-10-10. `liftOut`/`moveOutOf` (lib/snap-table.ts) take an object
out of a table in one space, the rest kept in place; the canvas carries an
outline while an object in an open table is dragged, works out the snap
target against the space with the object already out, and the editor
applies it on release (`snapMoveOut`); Esc leaves it in its cell. Paste:
with a new table open the copy goes where the table stands, and an object
copied out of a table pastes without its cell (an old table keeps the old
rule). Moving a table whole already worked (it is dragged as a group is);
now tested. Handbook: «Herausnehmen» and pasting in objekte/anordnen.md.
Ran 134 specs (snap-table-*, place-by-dragging, tab-control-copy-paste,
table-*, group, free-area, undo, handbook-labels): green.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g moving`; typecheck.

**Dependencies:** Task 5 · **Scope:** M

**Files likely touched:** `components/canvas/canvas.tsx`, `components/project-editor.tsx` (paste), `e2e/snap-table-canvas.spec.ts`

## Task 7: Span handles

**Description:** ⇤ ⇥ ⤒ ⤓ on a selected object in a new table; dragging
grows or shrinks its span over empty cells; refused over occupied ones and
at the table's edge with a short message. One undo step. Handbook updated.

**Acceptance criteria:**
- [x] A button grows over two empty cells to its left with ⇤ and back with ⇥ (canvas: ⇥ and back, ⤓, ⤒; ⇤ over empty cells in Node - the test table has none to the left).
- [x] A span over an occupied cell is refused; the object stays as it was.
- [x] The handbook describes the four handles.

Done 2026-10-10. The canvas draws ⇤ ⇥ ⤒ ⤓ at the middle of the chosen
object's span edges (`spanHandles`, `drawSpanHandles`), takes a press on
one before anything else, and on each move sets the span to the line under
the pointer through `resizeSpan`/`spanIndexAt` - one gesture, one undo
step. Cursor ew/ns-resize over them. The canvas carries
`data-span-handles` for tests. Found in a screenshot: a text in such a
table still showed its own renderer's baseline handles - removed. **Not
built:** the spec's message at the table's edge (the designer has no
message line there); the span simply stops. Ran 132 specs: green.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g span`; typecheck.

**Dependencies:** Task 6 · **Scope:** M

**Files likely touched:** `components/canvas/snap-table-overlay.ts`, `components/canvas/canvas.tsx`, `handbuch/objekte/anordnen.md`, `e2e/snap-table-canvas.spec.ts`

## Task 8: Column and row lines

**Description:** A selected new table shows a line right of each column
and below each row; dragging sets the width/height in mm (shown while
dragging), below the content it turns automatic again; hand-set lines
solid, automatic ones faint. One undo step. Handbook updated.

**Acceptance criteria:**
- [x] A label column dragged 10 mm wider stays so when its text gets shorter (the width set by hand in the canvas test; never lowered by content in Node, Task 1).
- [x] Dragged back below its text, it is automatic again.
- [x] The width shows in mm while dragging (beside the pointer, «· auto» below the content; seen, not asserted - it is drawn on the canvas only).

Done 2026-10-10. A selected new table shows a line right of each column and
below each row (`sizeLines`, `drawSizeLines`): solid when set by hand,
dashed when automatic; col/row-resize cursor over them. Dragged, the size
goes to millimetres (0.1 mm) when wider or taller than the content needs,
else back to automatic (`setLineSize`); one gesture, one undo step. Found
by a test: where a row line crosses a column line both were near - the
nearer across now wins (`sizeLineAt`). The Task 4 test «no resize handle»
now allows the last column's and row's lines at the table's corner. The
canvas carries `data-size-lines`. Handbook: «Spalten breiter, Zeilen
höher». Ran 134 specs: green.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g lines`; typecheck.

**Dependencies:** Task 7 · **Scope:** S

**Files likely touched:** `components/canvas/snap-table-overlay.ts`, `components/canvas/canvas.tsx`, `handbuch/objekte/anordnen.md`, `e2e/snap-table-canvas.spec.ts`

## Task 9: Switcher panels and free areas

**Description:** Inside a switcher panel and a free area, new tables work
as on a screen (snapping, selection, spans, lines). A switcher and a free
area can sit in a new table's cell as one object (role Control).

**Acceptance criteria:**
- [x] Two switches snapped inside a switcher panel form a table there (texts: the test device has no switch).
- [x] A free area snapped beside a label forms a table; the free area's content stays free.

Done 2026-10-10 without a code change: snapping, selection and the layout
already work in whatever space is open (`interactionObjects`, `drawSpace`,
the editing container), a panel and a free area included, and a switcher
and a free area may stand in a cell (`canStandInCell`). Three canvas cases
now hold it: two texts into a table in an open switcher panel, two in an
open free area, a free area beside a text (its content kept). Handbook: a
paragraph in «Zusammenstecken». Ran snap-table-canvas: 25 green.

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
- [x] Align and Fill change the object's place on the canvas and are one undo step each (undo tested for Align).
- [x] «Auto sizes» shows only with a hand-set width or height and clears them all.
- [x] The tree lists a 2×2 table's objects in reading order.
- [x] Every new label is quoted in the handbook and passes `e2e/handbook-labels.spec.ts`.

Done 2026-10-10. `components/property-panel/snap-table-properties.tsx`:
`SnapTableProperties` («Table», its size as columns × rows, «Auto sizes»)
and `SnapCellProperties` («Cell»: Align, Vertical align, Fill Width/Height
where offered - open question 1's proposal). The old Cell section is for
old tables only now. Found while doing it: since Task 4 the object list
sorted a new table's objects by stacking, not row by row - fixed; the test
stacks them out of reading order. Handbook: «In den Eigenschaften». Ran
snap-table-canvas 29 and property-panel, object-tree-*, table-*, bausteine,
handbook-labels: 90, green.

**Verification:** `npx playwright test e2e/snap-table-canvas.spec.ts -g panel e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 3 (can run beside Tasks 4-9) · **Scope:** M

**Files likely touched:** `components/property-panel/snap-table-properties.tsx` (new), `components/property-panel/property-panel.tsx`, `components/object-tree/object-tree-panel.tsx`, `handbuch/objekte/anordnen.md`

## Checkpoint B: try it
- [x] Full `npm run test:e2e` green (2026-10-10, port 3100: 1408 passed, 18 skipped, 1 failed - preview-performance `@alone`, the timing test flaky on this machine).
- [ ] The user tries Tasks 4-10 in the designer on port 3100 (the worktree's) and compares with the prototype; findings go into the spec before Task 11.

## Module `snap-table-rows`

## Task 11: Row templates

**Description:** The toolbar offers «Icon · Label · Switch», «Label ·
Switch», «Icon · Switch», «Label · Button». Dragged to a new table, a row is
inserted at the nearest row line, each part into the first free column of
its role, missing roles get a column (Icon, Label, Control order), columns
covered by a span skipped; «+ Label column» shows while one would be made.
Released free or clicked: a new table of one row. Handbook updated.

**Acceptance criteria:**
- [x] «Label · Switch» under a row «Icon · Label · Switch» puts its switch under the other switches, the icon cell empty.
- [x] «Label · Button» onto a table of buttons only adds a Label column left of them.
- [x] A row inserted across a 3-row span lengthens the span and skips its column.
- [x] A clicked template lands as a table of one row.

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
- [x] Three switch blocks dropped one under the other stand as one table, names and switches flush.
- [x] A block without icon lands with its icon cell empty.
- [x] The visible outcomes `e2e/bausteine.spec.ts` checks today (names on top, right edges flush) hold for the new build; the spec rewritten where it tested nesting.

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
- [x] The MaxxFan block lands as a table of its own; dropped on another table it lies free beside it.
- [x] Its switcher sits in one cell; each panel shows its parts as before; nothing below jumps when the mode changes.
- [x] `e2e/vanpi-bridge.spec.ts` green.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/vanpi-bridge.spec.ts e2e/handbook-labels.spec.ts`; typecheck.

**Dependencies:** Task 12 · **Scope:** L

**Files likely touched:** `lib/bausteine.ts` (`switcherSlot`, `blockTable`), `lib/layout.ts` (`fitSwitcher`), `handbuch/designer/bausteine.md`, `e2e/bausteine.spec.ts`

## Checkpoint C: blocks
- [x] Full `npm run test:e2e` green: 1419 passed; failed only `preview-performance @alone` (timing), «history keeps the last 100 steps» (passes alone) and the old Table tool's toolbar test, which now meets the Row tool (removed in Task 15).
- [x] The user inserts bridge blocks (Autoterm, MaxxFan, relays) and rows and tries them.

## Module `old-table-removal`

## Task 14: Old tables dissolved, Table tool gone

**Description:** On load, every `table` without `grid = 1`, at any depth,
becomes its children at their last absolute positions
(`dissolveContainerList`); idempotent, no undo step. `migrateScreenToTables`
and the table part of `migrateToFreeScreens` stop making tables. The
toolbar's «Tables» group (Table, Table template) goes. Handbook: the old
«Container» section replaced by the snapping sections.

**Acceptance criteria:**
- [x] A project saved with nested old tables opens with every object where it was and no old table.
- [x] Opening it twice changes nothing more.
- [x] No «Table» tool and no table template in the toolbar.
- [x] `e2e/handbook-labels.spec.ts` green.

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
- [x] No import of a removed file; typecheck and build green. (Lint: `next lint` has no configuration in this repo and only asks for one.)
- [x] Full `npm run test:e2e`: 1333 passed; failed only `preview-performance @alone` (timing) and two undo tests that pass alone. Every removed test was about removed behaviour (listed in the commit message).

**Verification:** `npm run typecheck && npm run lint && npm run build && npm run test:e2e`.

**Dependencies:** Task 14 · **Scope:** L (split by file group if it grows)

**Files likely touched:** the files above

## Task 16: HIL fixture rebuilt

**Description:** `hil/layout/containers.js` builds its screens with new
tables (rows, spans, a hand-set column width, align, fill).

**Acceptance criteria:**
- [x] The Knob and the 4.3B show the fixture as the preview does: 3/3 screens each, 0 differing pixels (2026-10-10).

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
- [x] No page describes the Table tool, templates or nested tables (only «Ältere Projekte» names them, as what opens dissolved).
- [x] `e2e/handbook-labels.spec.ts` and `npm run screenshots` green (the homepage's 4v3b shot timed out once in the full run, passes alone).

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`; `npm run screenshots`; `npm run dev --prefix handbuch` read through.

**Dependencies:** Task 15 · **Scope:** M

**Files likely touched:** the pages above, `e2e/handbook-screenshots.spec.ts`

## Checkpoint D: complete
- [x] `npm run test:all` (2026-10-10): every table suite green - e2e 1335 passed, knob-layout and 4v3b-layout 3/3 at 0 px, conformance 52/52. Red only under load and green alone: one e2e deploy test, the Knob's smoke test (setup portal), the PaperS3 navigator. Skipped: the e-paper (desupported), Android (no device, repo not beside the worktree), firmware uploads (checkout build differs from the boards). The spec's success criteria ticked; the last two got tests of their own (snap-table-model: a button over three cells with Fill; snap-table-canvas: no Table tool).
