# Layout: tables instead of stacks and grids

Amendment to docs/2026-10-02-layout.md. Agreed 2026-10-02, from an
interview with the user (agent-skills `interview-me`, then
`spec-driven-development`), after trying Tasks 1-12 of that spec in the
running designer.

It replaces that spec's container types, its grid, the spacer, groups
spreading over a grid's columns ("subgrid"), placing by reading order and
the template names. What it keeps: a master's content area, round screens,
the layout pass after every change, containers dissolved at deploy, old
projects on `free`, devices getting x, y, width and height as today.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `table-model` | The `table` container: columns, rows, cells, spans, the layout computation; migration of the containers Tasks 1-12 made | designer (`lib/`) | - |
| `table-canvas` | Tables on the canvas: always-visible lines, column lines dragged, «+» for rows and columns, placing into a cell or a new row, moving, merging cells, the table's and the cell's properties | designer (UI) | `table-model` |
| `table-blocks` | A block is a small table: merged into a table at a row line, nested in a cell, a table of its own on `free` | designer (`lib/bausteine.ts`) | `table-model`, `table-canvas` |
| `table-templates` | A screen's Layout option as table shapes and `free`, with a picture of each, the structure visible at once | designer (UI) | `table-canvas` |

Build order: `table-model` → `table-canvas` → `table-blocks`, `table-templates`.

## Objective

The user built screens with Tasks 1-12 and found the rules hidden:

- choosing a layout changes nothing visible on the canvas - PowerPoint
  shows dashed placeholders of what is coming;
- «Name and control» is a grid, but nothing says so, and its columns are a
  comma-separated list (`auto, 1`) to type;
- a grid looks inside groups and spreads their pieces over its columns,
  ordered by stacking number - which the object list showed the other way
  round; the spacer exists only to leave a cell empty. Both are rules one
  has to know, not see.

What the user wants instead (in their words): "ein Grid möchte ich lieber
wie in Word eine Tabelle layouten: ich verschiebe Linien und gebe keine
kommagetrennten Listen ein", "bevor ich den Namen der Vorlage anklicke
möchte ich schon bei der Auswahl ein kleines Thumbnail sehen", and of the
x, y and width an object stores: they are specific to the free layout; in a
table an object should store its cell.

**Decisions** (the user, 2026-10-02):

- **Two kinds only: table and free.** Vertical stack, horizontal stack and
  grid become one `table`; a stack is a table of one column, a row a table
  of one row. `free` stays.
- **A table is laid out like a Word table.** Its lines are always visible
  in the editor, thin, grey and dashed, empty cells included; the table
  being worked on shows them strong, with handles. The preview and the
  device show no lines.
- **Columns** are one of:
  - `auto` - as wide as its widest content; about 20 px while empty;
  - a **share** in percent of what is left after the `auto` and fixed
    columns (`auto | 100%` is name and control: the control takes the
    rest; shares that do not add up to 100 are taken in proportion);
  - **fixed**, in millimetres (`20mm`) or as a multiple of a size step's
    height (`2S`, `1M`, `3L`).
  No pixels: they hold on one device only. A column is changed by dragging
  its line, which shows the share in percent while it moves.
- **Rows** are added with «+» below the table, columns with «+» at its
  right. ~~There is always one empty row at the end, to place into.~~ No
  table has a free row (changed at Checkpoint C, see below): a table ends
  with its last row. A row is as tall as its tallest object.
- **Spacing between cells is fixed: 1.5 mm.** No cell padding.
- **Each object in a table stores its cell**: row, column, row span,
  column span - properties it has because it is in a table, as WPF's
  `Grid.Row`/`Grid.Column` or CSS's `grid-row`/`grid-column`. x, y and
  width follow from the cell. Cells are merged as in Word (a span).
- **Alignment** per column, overridable per cell: start, centre, end,
  stretch across; vertically centred in the row.
- **A text with a placeholder** (`{topic:…}`) does not count for an
  `auto` column's width: what it shows is not known at design time. A
  column showing a value gets a share or a fixed width.
- **A control is never narrower than its labels need** (Checkpoint B):
  one too wide for its cell sticks out, and the table says it does not fit.
- **A block is a small table**: its name and control in one row, each
  further part in a row below, in the control's column.
  - Placed on `free`, it stays a table of its own.
  - Dropped on a table's **row line** - a thick line shows where - its rows
    are merged into the table, which keeps its own columns: the block's
    cells go into the columns from the left; with more columns, the rest
    stay empty; with fewer, the cells left over go into the last column.
  - Dropped into a table's **cell**, it is nested there, a table in a cell.
  What the drop target is decides it, in every table alike - also in «Two
  columns».
- **A screen's layout** offers table shapes and `free`, each with a small
  picture in the list: «One column» (`100%`), «Name and control»
  (`auto | 100%`), «Two columns» (`50% | 50%`), «Free». Chosen, its lines
  show on the canvas at once.

## Behaviour

### The table (`table-model`)

A `table` object: `properties.columns` - one entry each,
`{ width: "auto" } | { width: { share: number } } | { width: { mm: number } } | { width: { step: "s" | "m" | "l", times: number } }`,
plus `align`; `properties.rows` - the number of rows (the last one kept
empty). A child's `properties.cell = { row, column, rowSpan?, columnSpan?, align? }`,
0-based. Children without a cell (an old file, a paste) are put into the
first empty cells in reading order.

**Layout:** columns first - fixed and `auto` widths (an `auto` column's
widest content that spans it alone; placeholder texts do not count;
20 px when empty), then the shares divide what is left; then each row as
tall as its tallest object that does not span rows (an empty row: the
height of a size-S control, proposed), spanning objects last; the gap
1.5 mm between columns and rows. Each object is placed in its cell by the
cell's alignment - a control at its natural width (never narrower than its
labels), a bar or slider, a nested table and anything that stretches at
the cell's width; vertically centred. The table's own height is its
content's; the screen's root table lays out in the master's content area.
The trailing empty row does not count for "does not fit".

The screen's root is a table or `free` (`screen.layout`), as Task 5 made
it.

**Migration** of what Tasks 1-12 saved, on load, idempotent:
`vertical-stack` → a table of one column (share 100%, align from the
stack's), children one per row in their order; `horizontal-stack` → a
table of one row, a column per child (`auto`, or equal shares for
`distribute: fill`); `grid` → a table with its columns (`auto` stays,
weights become shares), children in reading order, a group in a grid
unpacked into its pieces' cells as the grid laid it out; `spacer` →
dropped, its cell left empty; a template column (`layoutSlot`) → a cell of
the screen's table. Padding and gap settings are dropped (the gap is fixed,
padding gone); the screen root keeps its 2 mm from the content area's edge.

**Deploy:** a table dissolves as the containers do; devices get x, y,
width and height. Nothing in the device contract changes.

### On the canvas (`table-canvas`)

- The Layout tools: **Table** and **Free** (Stack, Row, Grid, Spacer go).
  A new table is drawn as a rectangle, with two `auto | 100%` columns and
  one empty row (proposed).
- Lines: always shown in the editor, thin and grey; the active table (the
  selected one, the one holding the selection, the one under the pointer
  with a tool) strong, with a handle on each column line and «+» below and
  at the right.
- Dragging a column line moves the width between the two columns beside
  it, both becoming shares; the share shows while dragging. A column's
  width kind (Auto, Share, Fixed mm, Size multiple) and alignment are set
  in the column's properties, opened by clicking above the column (its
  header strip, shown on the active table).
- Placing an object with a tool: over an empty cell the cell lights up, a
  click puts the object there; over a row line a thick line shows, a click
  inserts a row there with the object in the column under the pointer; an
  occupied cell takes nothing (no highlight).
- While something is placed (a tool or a block armed, objects dragged)
  every table shows a «+» in each empty cell and one below it. Over the
  «+» below, the table's bottom line is drawn thick; a drop there puts the
  object in a new row after the last one used. A nested table's «+» below
  shows only while the pointer is over the table or that «+», as it lies in
  the next row of the table holding it. On a screen that is a table, a
  click below its rows places nothing (Checkpoint C).
- Moving: the same targets, by dragging on the canvas or in the object
  list. Several selected objects keep their relative cells.
- Spans: an object's right or bottom edge dragged across a line extends
  its span; the span is also in its properties («Cell»: Row, Column, Row
  span, Column span, Align). x, y and width are not shown for an object in
  a table.
- The object list shows a table's objects row by row, left to right.

### Blocks (`table-blocks`)

As decided above. The block dialog is unchanged; Insert arms the tool,
and the drop target decides: `free` (a rectangle, a table of its own), a
row line (merged), an empty cell (nested). Merged, a block's objects are
ordinary cells; nested or on `free`, it is a table to select and move as a
whole.

### A screen's layout (`table-templates`)

The Layout field lists the four with a picture each (the table's lines, a
name and a control drawn small); choosing one copies its table into the
screen and its lines show at once. Changing it keeps all content: the
objects are put into the new table's cells in the order they stood in,
row by row; into `free` they keep their last places; one undo step. A new
screen starts with «Name and control».

## Code style, commands, structure

As docs/2026-10-02-layout.md. New: `lib/table.ts` (model, layout,
migration), `components/canvas/table-overlay` (lines, handles, «+»),
`components/property-panel/table-properties.tsx` (table, column, cell).
`lib/layout.ts`'s stack, row and grid code and the spacer go when nothing
uses them.

## Testing strategy

- `e2e/table-model.spec.ts` (Node): column widths of every kind and mixed;
  rows; spans; alignment; placeholder texts; migration of each Task 1-12
  container and of a group in a grid; deploy unchanged for a migrated
  screen.
- `e2e/table-canvas.spec.ts`: lines drawn (empty cells included) and none
  in the preview; a column line dragged shows its share and sets it; «+»
  adds a row and a column; placing into a cell and at a row line; moving;
  spans.
- `e2e/bausteine.spec.ts`: a block merged at a row line, with more and
  with fewer target columns; nested in a cell; on `free`.
- `e2e/layout-templates.spec.ts`: the pictures in the list; choosing shows
  the lines; changing keeps content; undo.
- The HIL fixture `hil/layout/containers.js` rebuilt with tables, compared
  on the Knob and the 4.3B pixel for pixel.

## Boundaries

- **Always:** devices get what they get today; projects from before
  containers look and deploy as before; Tasks 1-12's saved containers load
  migrated; the handbook updated in the same piece of work.
- **Ask first:** anything that changes the deploy zip; removing a test
  rather than rewriting it.
- **Never:** pixels as a column width; rules the canvas does not show.

## Success criteria

- [x] A screen is built with clicks and drags only: no comma lists, no
      typed widths needed.
- [x] Choosing a layout shows its table's lines on the canvas at once; the
      list shows a picture of each before it is chosen.
- [x] Three blocks dropped on row lines of a «Name and control» screen
      stand as three rows, names and controls on one edge each.
- [x] A block dropped into a cell of «Two columns» stands there whole;
      two side by side are possible.
- [x] Dragging a column line changes its share and shows it.
- [x] A project saved with Tasks 1-12's stacks, grids and spacers loads
      with tables and looks as it did.
- [x] The Knob and the 4.3B show a table screen as the preview does.

## Open questions

Settled with the user on approving this amendment (2026-10-02), as
proposed:

1. ~~An empty row's height.~~ A size-S control's, so it can be clicked
   into; on the device the same.
2. ~~A new table drawn with a tool.~~ Two columns `auto | 100%` and one
   empty row.
3. ~~An object dropped on an occupied cell.~~ Nothing; the cell does not
   light up.
4. ~~The templates' names.~~ «One column», «Name and control», «Two
   columns», «Free» stay; the picture shows what each is.

## Changed at Checkpoint C (2026-10-03)

Reviewing Checkpoint C the user found nested tables chaotic: each drew its
free row below its content, over the next row of the table holding it, and
that row took drops there. Decided with the user: **no table has a free
row any more**, the screen's own included; the «+» below a table is the
drop target that appends a row, its bottom line drawn thick while hovered,
and while something is placed every empty cell shows a «+» too. Also
reported then and fixed: the dashed lines are drawn on whole device pixels
(crisp), and a share column is never narrower than a table nested in it
can be.
