# Screens are always free

Third amendment to «Layout im Designer» (docs/2026-10-02-layout.md), after
docs/2026-10-02-layout-tables.md and docs/2026-10-03-table-editing.md.
Agreed with the user on 2026-10-03.

## Objective

A screen's own layout - its root as a table, the Layout field with its
pictures, a master's content area - is almost only special cases: the
«Screen» step in the Table group's path, its handles over the device's
frame, a click below its rows that does nothing, its padding from the
content area, every table command with a branch for the screen's table.
The way the user actually works needs none of it: the first block on a
free screen becomes a table, every further one goes in through the «+»
below it.

So **every screen is free**, and a table is an object like any other. A
master's content area goes too: one sees where things are.

Success looks like: a new screen is empty and free; a list of blocks is
built by placing the first with a rectangle and appending the rest with
«+»; a project saved with a screen table or a content area loads looking
exactly as it did.

## Behaviour

- **A new screen** is empty and free. There is no Layout field.
- **The Table tool** offers the table shapes the Layout field had - «One
  column» (`100%`), «Name and control» (`auto | 100%`), «Two columns»
  (`50% | 50%`) - each with its picture, chosen before the rectangle is
  drawn. Without a choice it draws «Name and control».
- **A block** placed on a screen becomes a small table of its own, as on a
  free screen today; the «+» below it appends more.
- **Old projects**: a screen whose root is a table loads as a free screen
  with one table object holding everything, where the root table laid it
  out - inside the content area, 2 mm in - with the same columns and rows:
  nothing moves. A root `free` is dropped. A master's content area is
  dropped; it no longer places anything.
- **Gone**: the screen's table everywhere it was special - the «Screen»
  step of the path, the screen table's lines, handles and «+», the root
  padding, the content area's frame and its handles on a master.

## Not in scope

- Changing what a table does once placed.
- Any device change: devices get objects with x, y and size, as always.

## Code

`lib/table.ts` and `lib/layout.ts` lose the root table (`tablesOn`'s root,
`layoutScreenObjects`, the content-area functions); `migrateProject`
(`lib/object-types.ts`) turns a root table into a table object and drops
`layout` and `contentArea`. The canvas, the editor and the Table group lose
their `null` table. `components/property-panel/layout-picker.tsx` becomes
the Table tool's shape menu. Tests: `e2e/table-model.spec.ts`,
`e2e/layout-model.spec.ts` (migration, old projects unchanged),
`e2e/table-canvas.spec.ts`, `e2e/table-editing.spec.ts`,
`e2e/layout-templates.spec.ts` (now the Table tool's shapes); the specs
that set a screen layout are rewritten.

## Success criteria

- [x] A new screen is free and has no Layout field.
- [x] The Table tool offers the three shapes with their pictures.
- [x] A project saved with a screen table loads with one table object, every
      object exactly where it was drawn before.
- [x] A project saved with a master's content area loads without it, its
      screens looking as they did.
- [x] No «Screen» step in the path, no lines or handles of a screen table.
- [x] The Knob and the 4.3B show a migrated screen as the preview does.
- [x] The handbook describes free screens and the Table tool's shapes.

## Amendment 2026-10-05: Free is back, with a box's look

The screen stays free. But a free *area* is wanted where a table or a
switcher's panel arranges everything: a few objects placed by hand in a cell
(asked while fitting the Autoterm block on the 4.3B). The Free tool is back
beside Table, placeable on the screen, into an empty cell (a click) and into
an open panel. A free area may look like a Box - fill, stroke, stroke width,
corner radius - which a device gets as a box behind the area's objects
(lib/object-groups.ts `freeBackground`). Opened by a click on its tree row,
or a double click (two in a table); while it is open, a tool draws into it
even inside a table's cell. Tests: `e2e/free-area.spec.ts`.
