# Tables put together by snapping

Spec, drafted 2026-10-09 from the finished idea paper
docs/ideas/tabelle-zum-zusammenstecken.md and its two prototypes
(docs/ideas/tabelle-prototyp.html, docs/ideas/tabelle-prototyp-spans.html,
published as artifacts). **Status: awaiting the user's approval.**

It replaces the table of docs/2026-10-02-layout-tables.md and
docs/2026-10-03-table-editing.md: its tool, templates, nesting, path
ribbon, column kinds and context menu. What it keeps: the type name
`table`, free screens (docs/2026-10-03-free-screens.md), the layout pass
after every change, containers dissolved at export, devices getting x, y,
width and height as today.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `snap-table-model` | The flat table: cells with spans, column widths and row heights by hand, Align, Fill, column roles; inserting and tidying rows and columns; layout | designer (`lib/`) | - |
| `snap-table-canvas` | Snapping with an insertion line, two-level selection, dragging out, the four span handles, column and row lines; tables inside switcher panels and free areas | designer (canvas) | `snap-table-model` |
| `snap-table-panel` | Property panel (Size, Align, Fill, «Auto sizes»), object tree; the Table tool and its templates go | designer (panel, toolbar, tree) | `snap-table-model` |
| `place-by-dragging` | A tool makes its object at its default size, held at its middle like a dragged one: placed freely or snapped by the same mechanics; lines still drawn (added 2026-10-10) | designer (canvas, toolbar) | `snap-table-canvas` (Task 5) |
| `snap-table-rows` | Row templates in the toolbar; a row's parts placed into columns by role | designer | `snap-table-model`, `snap-table-canvas`, `place-by-dragging` |
| `snap-table-blocks` | Blocks built as a row or as a table of their own instead of nested tables; switcher panels free | designer (`lib/bausteine.ts`) | `snap-table-rows` |
| `old-table-removal` | Old tables dissolved on load; the Table tool, old table code, overlay, ribbon, templates and their tests removed; HIL fixture rebuilt; last pass over the handbook | designer, `hil/`, `handbuch/` | all above |

Build order: `snap-table-model` → `snap-table-canvas` (Tasks 4-5) →
`place-by-dragging` → `snap-table-canvas` (Tasks 6-9), `snap-table-panel`
→ `snap-table-rows` → `snap-table-blocks` → `old-table-removal`.

Until `old-table-removal`, old and new tables live side by side, told apart
by `properties.grid = 1`: the Table tool keeps making old ones, so
dissolving them on load must come together with removing the tool
(found while planning, 2026-10-09).

Each module carries its own tests and its own handbook changes; the last
one only removes what nothing uses any more.

## Objective

Working with tables is hard today, nested ones above all: a click into a
table always hits the innermost object (`cellAt`, canvas.tsx), the table
itself is reached only by a small handle that shows on hover, the corner
handles of a table in a cell do nothing visible, and Esc does not go one
level up. Nesting was used for one thing only: more than one control in a
cell, an icon beside a label.

A table is not meant to be a responsive container. Schaltli works with
fixed sizes; a table is there so that controls stand flush in rows and
columns. The user wants (in their words): to fetch several switches and
line them up; blocks put together «wie Lego»; columns that can be made
wider than their text, since names arrive later from Pekaway or Home
Assistant and the positions are fixed once exported; buttons drawn bigger
than their text, growing into neighbouring cells in every direction;
controls aligned left, right or centred.

**Decisions** (the user, 2026-10-09, in the idea paper and while drafting
this spec):

- **The name stays «Table».** In German running text «Tabelle», in the UI
  «Table».
- **A table forms when two objects snap together.** There is no Table tool,
  no template and no empty table: a table whose last but one object leaves
  dissolves, its last object staying where it stood.
- **Flat, no table in a table.** A cell holds exactly one object.
- **Selection has two levels:** a click selects the table, a double click
  the object in it, Esc goes one level up.
- **No migration.** A table of the old kind becomes, on load, the objects it
  held, each where it stood. There are no customer projects to protect.
- **Switcher panels are free**, like a screen: they hold free objects and
  may hold tables. A switcher sits in a cell as one object.
- **A free area stays** and may sit in a cell as one object; inside, it is
  free like a screen and may hold tables.
- **A block of one part** (icon, name, one control - any of them may be
  missing) arrives as a row. **A block of several parts** (MaxxFan: Betrieb,
  Deckel, Lüfter) is a table of its own and is not inserted into another
  table.
- **No preview of long texts of its own:** the designer's preview with real
  values shows whether a column is wide enough.

## Behaviour

### The table (`snap-table-model`)

A `table` object, marked as the new kind by `properties.grid = 1`:

- `properties.columns: { mm?: number }[]` - one entry per column; `mm` is a
  width set by hand, the column never narrower than its content.
- `properties.rows: { mm?: number }[]` - the same for row heights.
- Each child's `properties.cell = { row, column, rowSpan?, columnSpan?,
  align?, alignY?, fill?, drawnWidth?, drawnHeight? }`, 0-based; `align`
  `"left" | "center" | "right"`, `alignY` `"top" | "middle" | "bottom"`,
  `fill` `{ width?: true, height?: true }`. Everything about an object's
  place lives in `cell`, so it never meets the object's own properties (a
  text's `textAlign`) and taking `cell` away frees the object entirely
  (moved there in Task 3, 2026-10-09). `drawnWidth`/`drawnHeight` keep the
  drawn size while Fill overwrites it, so that the next layout pass does
  not take the filled size for the natural one.

Every row and every column holds at least one object or part of a span;
a gap is an empty cell. The gap between columns and rows is the existing
1.5 mm (`TABLE_GAP_MM`).

**Layout**, after every change as today:

1. A column is as wide as the widest object that spans it alone, a row as
   tall as the tallest; an empty one about 4 mm (proposed).
2. A width or height set by hand raises that, never lowers it.
3. An object spanning several columns or rows does not count in step 1;
   if it does not fit, the last column or row it spans grows.
4. An object stands in its cell (or span) by `align` / `alignY`; without
   them a text stands left, everything else centred, all vertically
   centred. With `fill` it takes the cell's width and/or height.
5. The table's top left corner stays where it is; the table grows right and
   down. When an insertion or removal would move an object that was already
   there, the table shifts so that object keeps its place.

**Roles:** each column has the role of its objects: `icon` and `live-icon`
are Icon, `text` is Label, everything else Control. A column whose objects
disagree takes its first object's role.

**Fill** is offered for button, button group, bar, slider, box and free area
(width), and for button, box and free area (height) - proposed, see open
questions.

**What a cell may hold:** any object except a group, a table and the
navigator.

**Inserting** a column at an index inside an object's column span widens the
span by one; the same for rows. **Removing** an object leaves its cell
empty; a row or column left without any object or span goes; a table left
with one object dissolves into it.

**Old tables** (built in `old-table-removal`): on load, every `table` without `properties.grid = 1`, at any
depth (screens, switcher panels, free areas, groups), is replaced by its
children at the absolute positions they were last laid out at, through the
existing `dissolveContainerList`. Idempotent; no undo step; nothing else in
the project changes. `migrateScreenToTables` and the table part of
`migrateToFreeScreens` go: what they produced is dissolved the same way.

**Export:** a table dissolves as today; devices, Android and the preview get
x, y, width and height. The device contract does not change.

### On the canvas (`snap-table-canvas`)

- **Snapping.** Dragging an object (from the toolbar or the canvas) to
  within about 5 mm of a table or a free object shows where it will go.
  *By the object's edges, not the pointer* (asked by the user 2026-10-10):
  an edge of the dragged object within 5 mm of the facing edge of the other
  (apart or overlapping), the two overlapping across it - side by side at
  the same height or one above the other in line; the nearest pair of
  edges wins. With the object's middle over a table, the cell under the
  middle decides; a new column or row at a table's side goes into the row
  or column of the object's middle (`sideByEdges`, `snapDropAt`).
  - over an empty cell: the cell lit green - it goes there;
  - near a cell's or the table's edge: a thick line between two columns or
    rows, strong along the row or column the object will be in, faint over
    the rest - a new column or row is inserted there;
  - near a free object's edge: a line along that edge - the two become a
    table of one row or one column.

  Over an occupied cell the nearest of its four edges wins. Released
  elsewhere, the object lies free. Esc while dragging puts everything back.

  **Snapping is on, Ctrl/⌘ held while dragging turns it off** (decided by
  the user 2026-10-10, as Figma does for frames). Found at Task 5: on a
  free screen every drag or drawn rectangle that ended within 5 mm of
  another object made a table - seven existing tests that place objects
  side by side on purpose did so; they now hold Ctrl (`placingFreely`,
  e2e/helpers.ts). Ctrl at the press itself still adds to the selection,
  so it is pressed once dragging.
- **Selection, two levels.** A click on a table selects the table. A
  double click selects the object under the pointer. With an object in a
  table selected, a click on another object of the same table selects that
  object. Esc: object → table → nothing. Enter: table → its first object.
  Hovering outlines what a click would select. It is the group's selection
  (`editingContainerId`), which a table put together by snapping shares.
  *Not built (Task 4, 2026-10-09):* «Ctrl/⌘-click selects the object at
  once» - in the designer Ctrl/⌘-click already adds to the selection;
  pending the user's decision.
- **No resize handle** on such a table or on an object in it: the table is
  as large as its content, the cell decides an object's size.
- **Moving.** Dragging a selected table moves it whole. Dragging a selected
  object in a table takes it out (its cell stays empty, see Removing) and
  snaps it as above; it loses its span.
- **Spans.** A selected object in a table shows ⇤ ⇥ ⤒ ⤓ at the middle of
  its span's edges. Dragging one grows or shrinks the span into the
  neighbouring cells, only over empty ones; at the table's edge the log
  says to snap an object beside it first.
- **Widths and heights.** A selected table shows a line at the right of
  each column and below each row. Dragging one sets that column's width or
  row's height in mm, shown while dragging; dragged below the content it
  is automatic again. A line set by hand is drawn solid, an automatic one
  faint.
- **No handle for the table as a whole**: it grows through its columns and
  rows.
- **Contexts.** A switcher panel and a free area are worked in as a screen
  is: entered as today, they hold free objects and tables, and the two-level
  selection applies inside them. A switcher and a free area are, from
  outside, one object in a cell.
- **One undo step** per gesture (a snap, a span, a line drag).
- **Copy and paste:** a copied table pastes as a table; a copied object from
  a table pastes as a free object.

The chip on a selection names it: «Table · 3×4», «Switch · M · 2×1» (span
shown only when larger than 1×1).

### Panel, tree and toolbar (`snap-table-panel`)

- **An object in a table:** x, y and width are not shown; Size as today;
  **Align** (Left, Center, Right; Top, Middle, Bottom); **Fill** (Width,
  Height) where offered.
- **A table:** its size as columns × rows; **Auto sizes** when any width or
  height is set by hand, setting them all back.
- **Object tree:** a table lists its objects row by row, left to right, as
  today; drops into a table in the tree go.
- **Toolbar:** the «Tables» group with Table and Table template goes; Free
  stays where it is.

### Placing by dragging (`place-by-dragging`)

Decided with the user 2026-10-10, after Task 5. Drawing a rectangle sets a
size most objects do not have - a control's comes from its size step, a
text's from its words, a block's from its parts - and it ends with the
mouse button up, so a new object cannot be carried to its place as a
moved one is (the open table taking a drawn box into its first cell was one
result). Instead:

- **A tool held, a press on the canvas makes the object** at its default
  size, its middle under the pointer, and from then on it is dragged as an
  existing object is: it follows the pointer, snaps by its edges (into a
  table, beside a free object or a table), Ctrl/⌘ places it freely,
  release puts it down, Esc takes it away again - no object is left. One
  undo step for the whole gesture. A click without moving puts it down
  where it was pressed.
- **Default sizes** (proposed): a control with a size step at M (as
  `stepUpdates` makes it today); a text its words in the starting style; an
  icon, a gauge and a dial at M; a bar or slider 30 mm long; a box
  20 × 10 mm; a free area 30 × 20 mm; a button group and a switcher as wide
  as their labels at M. Box, free area, bar and slider are made larger or
  smaller afterwards at their handles, as today.
- **Lines and polylines are still drawn**: their points are the object.
  A line drawn always lies free - in the space being worked in, or where an
  open table stands - and never snaps while it is drawn, not even against a
  table. Once drawn it is moved into a cell like any object, its points
  with it (the user, 2026-10-10).
- **Blocks** (module `snap-table-blocks`) and **row templates** (module
  `snap-table-rows`) arrive the same way: held at the pointer, snapped as
  a row or placed free.
- What goes away: drawing a rectangle for every other tool, and the extra
  paths Task 5 built for it (`createSnapRef`, the draw space for new
  objects); an object drawn while a table is open is no longer a case.
- **Not now:** dragging straight from a toolbar button onto the canvas
  (later, its own step).

### Rows (`snap-table-rows`)

- The toolbar gets row templates: «Icon · Label · Switch», «Label ·
  Switch», «Icon · Switch», «Label · Button».
- Dragged to a table, a row is inserted at the nearest row line; each part
  goes into the first column of its role not yet taken, from the left; a
  part with no such column gets a new one, placed after the last column of
  an earlier or equal role (Icon, Label, Control). Cells without a part
  stay empty. Rows covered by a span at that line are skipped for matching.
  A label shows «+ Label column» while a column would be created.
- Released free, a row is a new table of one row; clicked, it lands free.

### Blocks (`snap-table-blocks`)

- **One part:** the block is a row (icon, name, part - missing ones left
  out) and is placed as a row template is: into a table by roles, or free
  as a table of one row.
- **Several parts:** the block is a table of its own: first row icon,
  name, first part; each further part a row below in the Control column,
  its icon and name cells empty; the name aligned top. It is never inserted
  into another table; dropped on one, it lies free next to the pointer.
- **Switcher:** one object, in the block's Control column. Its panels hold
  their parts free, one below the other with the table gap, or as a table
  when a panel has more than one part (proposed). The switcher's own size is
  its tallest panel's, as today.
- Once placed, a block is ordinary objects in an ordinary table (decided
  2026-09-29).

### Removal (`old-table-removal`)

Old tables are dissolved on load as described under `snap-table-model`, in
the same piece of work that removes the Table tool. Then
`components/canvas/table-overlay.ts`, `components/toolbar/table-group.tsx`,
`components/toolbar/table-shape-picture.tsx`, `lib/layout-templates.ts`,
the old parts of `components/property-panel/table-properties.tsx` and of
`lib/table.ts`, the table code in `canvas.tsx`, `project-editor.tsx` and
`object-tree-panel.tsx`, and their tests (`e2e/table-editing.spec.ts`,
`e2e/layout-templates.spec.ts`, the table parts of `table-canvas`,
`table-model`, `layout-*`, `free-area`) go, once the modules above no
longer need them. `hil/layout/containers.js` is rebuilt with new tables.

## Tech stack

Next.js and TypeScript as today; Playwright for e2e. No new dependency.

## Commands

```
Typecheck: npm run typecheck
Lint:      npm run lint
Build:     npm run build
e2e:       npm run test:e2e -- e2e/snap-table-model.spec.ts
Full:      npm run test:all
Handbook:  npm run dev --prefix handbuch
```

## Project structure

- `lib/table.ts` - rewritten: model, layout, roles, insert and tidy,
  dissolving old tables.
- `components/canvas/snap-table-overlay.ts` - insertion line, green cell,
  span handles, column and row lines, chip.
- `components/property-panel/table-properties.tsx` - rewritten: Align,
  Fill, Auto sizes.
- `components/toolbar/toolbar.tsx` - row templates; the Tables group goes.
- `lib/bausteine.ts` - `blockTable`, `switcherSlot` rewritten.
- Tests in `e2e/`, plans in `tasks/snap-tables-plan.md` and
  `tasks/snap-tables-todo.md`.

## Code style

As the code around it: small pure functions in `lib/` that the canvas
calls, comments that say why, kebab-case module ids. For example, the
model's insertion keeps spans whole:

```ts
/** A column inserted inside an object's span widens the span. */
export function insertColumn(table: ScreenObject, at: number): void {
  for (const child of table.children ?? []) {
    const cell = cellOf(child)
    if (cell.column < at && at < cell.column + (cell.columnSpan ?? 1)) cell.columnSpan = (cell.columnSpan ?? 1) + 1
    else if (cell.column >= at) cell.column += 1
  }
  columnsOf(table).splice(at, 0, {})
}
```

## Testing strategy

- `e2e/snap-table-model.spec.ts` (Node): layout of widths and heights
  (natural, by hand, spans that do not fit); align and fill; roles; insert
  inside a span; tidy and dissolving of a one-object table; old tables at
  every depth dissolved in place, idempotent; export unchanged for a
  dissolved project.
- `e2e/snap-table-canvas.spec.ts`: two free objects snap to a table; the
  green cell and the insertion line; drag out leaves a gap, empty row goes;
  the two-level selection, Esc and Enter; ⇤ ⇥ ⤒ ⤓ over empty cells and
  blocked by occupied ones; a column line dragged wider and back to
  automatic; one undo step per gesture; a table inside a switcher panel.
- `e2e/snap-table-rows.spec.ts`: each template into a table with fewer and
  with more columns; a new column created by role; a row over a span; free.
- `e2e/bausteine.spec.ts` rewritten: a one-part block as a row, a
  several-part block as its own table, a switcher in a cell.
- `e2e/handbook-labels.spec.ts` keeps passing: every quoted label exists.
- `hil/layout/containers.js` rebuilt; the Knob and the 4.3B show it as the
  preview does.
- Each prototype check that was done by hand (snapping, gap, spans, widths)
  becomes a case in the specs above.

## Boundaries

- **Always:** devices get what they get today; every gesture one undo step;
  the handbook updated in the same piece of work as the change it
  describes; `npm run typecheck` and the module's specs green before a
  commit.
- **Ask first:** anything that changes the export zip or the device
  contract; removing a test that is not about removed behaviour.
- **Never:** a table inside a table cell; a handle that does nothing; a rule
  the canvas does not show.

## Success criteria

- [ ] Three free switches dragged one onto the next stand as one table, in
      a row or a column, without opening any menu.
- [ ] «Label · Switch» dragged under a row «Icon · Label · Switch» puts its
      switch under the other switches, the icon cell empty.
- [ ] A click on a table selects it, a double click an object in it, Esc
      goes back up; a selected table moves whole by dragging.
- [ ] A switch dragged out of a table leaves an empty cell; the last switch
      of a row dragged out removes the row.
- [ ] A button grows over three empty cells to its left with ⇤ and, with
      Fill Width, is as wide as the three.
- [ ] A label column dragged 10 mm wider stays so when its text gets
      shorter, and is automatic again when dragged back below its text.
- [ ] A project saved with old (nested) tables opens with every object
      where it was, and no table.
- [ ] A one-part block lands as a row of a table, a several-part block as a
      table of its own.
- [ ] The Knob and the 4.3B show a screen of new tables as the preview does.
- [ ] No «Table» tool and no table template in the toolbar; the handbook
      describes snapping and quotes only labels that exist.

## Not doing

- A table inside a table cell; several objects in one cell.
- Merging two tables by dragging one onto the other.
- A gap setting per table.
- Duplicating a row (Ctrl+D) and selecting by rectangle (later, if missed).
- A preview of long texts of its own.
- Changing what a device does with a text too long for its cell.

## Open questions

1. **Fill for which objects?** Proposed: width for button, button group,
   bar, slider, box, free area; height for button, box, free area.
2. **An empty column's or row's size** before anything is in it (only
   while dragging a span over it): proposed about 4 mm.
3. **Switcher panels with more than one part:** a table in the panel
   (proposed) or parts stacked free?
4. **Align per object or per column?** Proposed per object, as in the
   prototype; a column-wide setting can come later.
5. **The snap zone:** about 5 mm on the device's scale, proposed; to be
   checked in the designer.
6. **Groups:** stay as they are and never sit in a cell (proposed).
