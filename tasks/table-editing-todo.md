# Tasks: table editing like Word

Spec: docs/2026-10-03-table-editing.md. Chat German, docs English.

## Task 1: The operations (model)

**Description:** Pure functions in `lib/table.ts`: insert a column at an
index (objects right of it move), delete a row (objects only there lose
their cells, spans shrink), merge right / merge down (span +1 only onto an
empty cell), split (spans back to one), and a table's path from the screen
down to an object or cell.

**Acceptance criteria:**
- [x] Each operation leaves the objects in the cells it says, spans included.
- [x] Merge onto an occupied cell returns nothing (not possible).
- [x] The path of an object three levels deep lists screen, both tables, cell.

**Verification:** `npx playwright test e2e/table-model.spec.ts`

**Dependencies:** none · **Files:** `lib/table.ts`, `e2e/table-model.spec.ts` · **Scope:** S

## Task 2: The cell in context

**Description:** Editor state for the cell in context (table id or screen,
row, column). A click with the select tool into an empty cell sets it and
clears the object selection; selecting an object in a table sets its cell;
Esc or a click outside every table clears it. The canvas outlines it, and
handles show only on its table.

**Acceptance criteria:**
- [x] An empty cell can be selected by a click; it is outlined.
- [x] An object selected in a nested table makes that table the active one.

**Verification:** `npx playwright test e2e/table-editing.spec.ts`

**Dependencies:** Task 1 · **Files:** `components/project-editor.tsx`, `components/canvas/canvas.tsx`, `components/canvas/table-overlay.ts`, `e2e/table-editing.spec.ts` · **Scope:** M

## Task 3: The «Table» group in the ribbon

**Description:** `components/toolbar/table-group.tsx`, shown at the
ribbon's end while the context is in a table: the path (each level a
button that selects it), Insert row above/below, column left/right, Delete
row/column, Merge right/down, Split; each one undo step, off where not
possible.

**Acceptance criteria:**
- [x] Three nested levels each selected by one click on the path.
- [x] Every command one undo step, objects where the command says.
- [x] Merge right off when the neighbour is occupied.

**Verification:** `npx playwright test e2e/table-editing.spec.ts`

**Dependencies:** Task 2 · **Files:** `components/toolbar/table-group.tsx`, `components/toolbar/toolbar.tsx`, `components/project-editor.tsx` · **Scope:** M

## Task 4: Right-click

**Description:** The same commands in the canvas's context menu, for the
cell under the pointer, which becomes the cell in context.

**Acceptance criteria:**
- [x] Right-click on an empty cell, Insert row above: a row above it.

**Verification:** `npx playwright test e2e/table-editing.spec.ts`

**Dependencies:** Task 3 · **Files:** `components/canvas/canvas.tsx`, its context menu · **Scope:** S

## Task 5: «+» at a line's end

**Description:** On the active table, a «+» left of each row line and above
each column line on hover; a click inserts a row or column there.

**Acceptance criteria:**
- [x] A row inserted at a line by the «+» at its left end; a column likewise.

**Verification:** `npx playwright test e2e/table-editing.spec.ts`

**Dependencies:** Task 1 · **Files:** `components/canvas/table-overlay.ts`, `components/canvas/canvas.tsx` · **Scope:** S

## Task 6: Handbook and full run

**Description:** `handbuch/objekte/anordnen.md` describes the group, the
path, the context menu and the «+» at the lines (humanized); full e2e and
`npm run test:all`.

**Acceptance criteria:**
- [ ] Handbook updated, labels test green.
- [ ] Full e2e green.

**Dependencies:** Tasks 1-5 · **Scope:** S

## Checkpoint - review with the user
- [ ] Every success criterion of the spec ticked
- [ ] The user tries nested tables and approves

**After Task 5 (2026-10-03):** a nested table's column strip, its «+» and handles lay over the row above it; now they show only while the pointer is near the table (`nearTableHandles`). Test in `e2e/table-editing.spec.ts`.
