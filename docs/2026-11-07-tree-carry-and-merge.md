# Carrying from the tree, and merging tables

Decided with the user on 2026-11-07, built the same day. Found when the
user tried to put the table of the «Grauwasser» card under the one of the
«Frischwasser» card on the Home screen of «CamperUI nachgebaut» and could
not: the table, docked Fill in its card, did not follow the pointer, and a
table could not snap to a table at all.

## The rule behind it

What something carried goes into, the pointer says; what it lines up
with, its outline. Into a card, a free area or a table's cell: the pointer.
Snapping to an edge, a new row or column, which columns a merged table
takes: the outline. Until 2026-11-07, with Alt, the cell under the
carried object's *middle* decided (docs/2026-10-09-snap-tables.md); now the
pointer does (`snapDropAt`'s `pointer`).

## Carrying from the object tree

- A row dragged out of the tree onto the canvas carries its object (or the
  selection it belongs to) from wherever it stands - a card, a table, a
  group - held at its middle under the pointer, drawn as an outline. It
  goes where anything carried goes (docs/2026-11-03-placing.md): free on
  the screen, into the card or free area under the pointer, with Alt into
  a table or beside an object. The hint at the pointer says the same as
  for a drag on the canvas.
- Let go on the middle of a table's row in the tree, one object becomes
  the table's new last row, in its first column; a table merges (below).
- Panels stay in their switcher; they are not carried onto the canvas.
- One undo step. Out of a table, the table keeps the rest in place, or
  dissolves into its last object (`liftOut`). In its new place an object
  starts as a new one does: no cell, no Position, no Dock.
- Model: `lib/carry.ts` `carryObjects`. Canvas: `treeCarry`, `onCarryTo`.

## A docked object dragged on the canvas

Its area keeps placing it, so it stays; its outline follows the pointer
(`dockDrag`). It leaves its place only into another area or, with Alt,
to a table.

## Merging tables

- A table carried with Alt to a table does not go into a cell: its cells
  join the other table and it is gone (`SnapDrop.merge`, `mergeTables`).
  The hint says «Release mouse button to merge the tables».
- Below or above, its rows are inserted as new rows; beside, its columns.
  Lined up by position, not by what the cells hold.
- Which columns it takes: each of its columns lands in the column under
  that column's middle - so its first column's middle decides - moved back
  so it does not stick out on the right. A table as wide as the other or
  wider starts at the first column. The strong insertion line is as long as
  the carried table.
- Narrower: the cells beside it stay empty. Wider: the other table gets the
  columns it lacks, with the carried table's sizes set by hand.
- Spans, how each object stands in its cell and row and column sizes set by
  hand come along. The other table stays where it was (`keepInPlace`).
- A table never goes into a single cell, and never forms a pair with a free
  object (a table in a cell stays out of scope, docs/2026-10-09-snap-tables.md).
- One undo step separates them again.

## Not now

- Merging by role (name, value, control) instead of by position.
- A table dropped beside a free object taking it in.
- The column range named in the hint («into columns 2-3»); the line shows it.

## Tests

- `e2e/tree-carry-merge-model.spec.ts`: merging, carrying from anywhere.
- `e2e/tree-carry.spec.ts`: tree onto a table's row (merge), tree onto the
  canvas and into a card, a table merged with Alt on the canvas and undone,
  a docked table's outline.
- `e2e/snap-table-model.spec.ts`, `e2e/snap-table-canvas.spec.ts`: the
  pointer picks the cell.
