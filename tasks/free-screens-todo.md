# Tasks: screens are always free

Spec: docs/2026-10-03-free-screens.md. Chat German, docs English.

## Task 1: Migration (model)

**Description:** `migrateProject` turns a screen's root table into one table
object, placed where the root laid its objects out (content area, 2 mm in),
same columns and rows; drops a root `free`, `layout` and a master's
`contentArea`.

**Acceptance criteria:**
- [ ] A screen with a root table loads with one table object; every object's
      absolute place after the layout pass is what it was before.
- [ ] Old projects (test-projects/*.zip) load unchanged.
- [ ] `contentArea` is gone after load.

**Verification:** `npx playwright test e2e/layout-model.spec.ts e2e/table-model.spec.ts`

**Dependencies:** none · **Scope:** M

## Task 2: The screen table goes from the code

**Description:** No root table in `lib/table.ts` (`tablesOn`, `cellAt`,
drops), `lib/layout.ts` (`layoutScreenObjects`, content area), the canvas
(SCREEN_ROOT_HINT, its lines, handles, «+»), the editor (`tableParts(null)`,
`selectTableLevel(null)`, the path's «Screen») and the Table group. New
screens are free. Specs that set a screen layout are rewritten.

**Acceptance criteria:**
- [ ] A new screen is free; no Layout field.
- [ ] No «Screen» step in the path; no screen-table lines or handles.

**Dependencies:** Task 1 · **Scope:** L (split if it grows)

## Task 3: The content area goes

**Description:** The master's content-area frame and its handles, the
property, and what lays out into it.

**Acceptance criteria:**
- [ ] No content area on a master; no handles for it.

**Dependencies:** Task 2 · **Scope:** S

## Task 4: The Table tool's shapes

**Description:** The Table tool opens a menu of «One column», «Name and
control», «Two columns» with their pictures (from the layout picker); the
choice is what the rectangle draws. Default «Name and control».

**Acceptance criteria:**
- [ ] Each shape drawn with its columns; the menu shows the pictures.

**Dependencies:** Task 2 · **Scope:** M

## Task 5: Handbook, HIL fixture, full run

**Description:** `designer/screens.md` (Layout section out),
`einfuehrung/erste-schritte.md` (first block as a rectangle, the rest via
«+»), `objekte/anordnen.md`, `designer/bausteine.md`; screenshots;
`hil/layout/containers.js` as table objects; full e2e and `npm run test:all`.

**Acceptance criteria:**
- [ ] Handbook humanized, labels test and build green.
- [ ] Full e2e green; Knob and 4.3B layout HIL 0 px.

**Dependencies:** Tasks 1-4 · **Scope:** M

## Checkpoint - review with the user
- [ ] Every success criterion of the spec ticked
- [ ] The user approves

## Task 6: A block without a name keeps the control column

**Description:** Asked 2026-10-03: a block whose control names itself (a
button, «Restart») has no name of its own; merged into a table it landed in
the left, name column. Its cell stays empty, the control goes right
(`lib/bausteine.ts` blockTable, `lib/table.ts` mergedRows).

**Acceptance criteria:**
- [ ] Merged into a two-column table, a button-only block's button is in column 1, column 0 empty.
- [ ] Into a one-column table, the button is in that column.

**Verification:** `npx playwright test e2e/bausteine.spec.ts`

**Dependencies:** none · **Scope:** S
