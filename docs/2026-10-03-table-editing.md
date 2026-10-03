# Table editing like Word

Second amendment to «Layout im Designer» (docs/2026-10-02-layout.md), after
docs/2026-10-02-layout-tables.md. Agreed with the user on 2026-10-03.

## Objective

Tables work, but editing them is hard, above all nested ones: a click lands
on the outer table or on an object instead of the inner table, so its
handles and its «+» are out of reach, and there is no way to say «this
cell» when it is empty. Word has no table mode: the cursor in a cell makes
the table the context, and everything to do with it is at hand. The
designer does the same - **no separate mode** (an extra step each time, and
one more state to keep in mind).

Success looks like: a user reaches any level of a nested table in one
click, and inserts, deletes, merges and splits rows, columns and cells
without dragging handles or knowing the cell numbers.

## Behaviour

- **A cell is something you can point at.** With the select tool, a click
  into an empty cell selects that cell (no object selected); a click on an
  object selects the object, and its cell is the cell. The cell in context
  is outlined on the canvas. Esc or a click outside every table leaves it.
- **The «Table» group in the ribbon** appears at its right end while the
  context is in a table - a table selected, an object in a table, a cell -
  and is gone otherwise. It holds:
  - **the path** to where you are: `Screen › Table › Table › Cell 2, 1`.
    Every step but the cell is a button that selects that level: the
    screen (its own table), or a table object. Nested tables are reached
    from here in one click; the canvas shows handles only on the table the
    path ends in, the others stay quiet.
  - **Insert**: row above, row below, column left, column right - next to
    the cell in context.
  - **Delete**: row, column (what stood only there loses its cell, as
    Remove column does today).
  - **Merge** right, merge down (the cell's span grows by one, if the cell
    it takes is empty) and **Split** (span back to one).
  Each is one undo step. Without a cell in context (a table selected), the
  commands act on its last row and last column; merge and split are off.
- **Right-click** in a table: the same commands as a context menu, for the
  cell under the pointer - it becomes the cell in context. The menu's
  existing entries (copy, paste, group, ...) stay below them.
- **«+» at a line's end, like Word**: on the active table, hovering just
  left of a row line shows a «+» there, a click inserts a row at that line;
  just above a column line, a «+» that inserts a column there. The «+»
  below the table and at its right stay.

## Not in scope

- Selecting a range of cells by dragging (Word's multi-cell selection).
  Merge goes one step at a time.
- Keyboard moves between cells (Tab, arrows).
- A table mode.

## Code

`lib/table.ts` gains the pure operations (insert a column at an index,
delete a row, merge right/down, split, a table's path), tested in
`e2e/table-model.spec.ts`. The cell in context is editor state
(`components/project-editor.tsx`), drawn by the canvas; the ribbon group is
`components/toolbar/table-group.tsx`; the context menu entries go into the
canvas's existing menu. Browser tests in `e2e/table-editing.spec.ts`.

## Success criteria

- [ ] In a table nested in a table nested in the screen's, each of the three
      levels is selected with one click on the path.
- [ ] An empty cell can be selected; Insert row above puts a row above it.
- [ ] Every command in the group and the context menu is one undo step and
      leaves the table's objects in the cells the command says.
- [ ] Merge right on a cell whose neighbour is occupied does nothing (the
      button is off).
- [ ] A row is inserted at a line by the «+» at its left end.
- [ ] The handbook's table section describes the group, the path, the
      context menu and the «+» at the lines.
