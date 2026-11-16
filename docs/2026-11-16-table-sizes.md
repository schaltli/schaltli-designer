# Table sizes: one rule for what sets a size

Spec drafted 2026-11-16 from a conversation with the user. **Status: approved
by the user on 2026-11-16 («freigegeben»), with the answers under «Decided».
Plan: `tasks/table-sizes-plan.md`.** Follows `docs/2026-11-16-areas.md`.

## Objective

Nobody can see what sets a size in a table (the user, 2026-11-16, on the
van's screen with the fan: «das ist soooo kompliziert. total unübersichtlich.
die tabelle erhält ihre Masse vom Inhalt diktiert. mit dieser "gleiche
Breiten" option wird es noch schwieriger zu erkennen was die grösse
bestimmt»). The case: a table with «Equal columns» on and two columns of 310
and 181 px. The first column had been pulled by hand once, and «Equal
columns» leaves such a column out. Nothing on the screen said so.

After this there is one rule for every size in the designer, and each column
and row says on its own line which case of the rule it is:

> **At least what it holds. Above that: the room it stands in, or the
> author's hand.**

It is for whoever builds screens in the designer. A device sees none of it:
tables are dissolved on export, as today.

## Today

As read in `lib/snap-table.ts`, `lib/dock.ts` and
`components/property-panel/snap-table-properties.tsx` on 2026-11-16.

An area, a switcher and a panel already follow the rule: at least their
content, larger by their handles, their dock or their switcher. A table does
not. It has no size of its own; it is exactly as large as its columns and
rows add up to, and five things can change that sum:

| What | Where it is set | What it does |
|---|---|---|
| Content | nowhere | a column is as wide as the widest object in it asks |
| A column or row pulled | its turquoise line | fixed in mm, never below its content |
| «Width» | the table's properties | the table is that wide; the last column takes the rest |
| «Equal columns» | the table's properties | the columns *not pulled* are as wide as the widest of them, or share «Width» |
| Dock, or a switcher's panel | the table's «Position» | stretched across; the last column takes the rest |

What this costs:

- Two of the five are switches on the table that change what a column does,
  and a column does not show it.
- «The last column takes the rest» is a rule nobody set and nothing shows.
- «Equal columns» silently skips pulled columns. The handbook says «alle
  Spalten».
- A table cannot be pulled wider at a handle, as everything else that holds
  objects can. The way to a wider table is a number typed into «Width».

## Decisions (proposed)

1. **One rule.** A table, like an area, is at least as large as what it
   holds; above that it is as large as its room gives it (docked, in a
   panel, stretched in a cell) or as the author pulled it.

2. **A table has handles.** Selected, it is resized at its right and bottom
   edge and the corner between them, as an area is. It stops where its
   content needs it. Never pulled, it is as large as its content: a table
   nobody resized behaves as it does today.

3. **A column says what sets its width, one of three:**
   - **auto** - as wide as what it holds. What a new column is.
   - **fixed** - the width it was pulled to, in mm. Never below its content.
   - **fill** - takes a share of what the table has left over.

   The same three for a row and its height.

4. **What is left over goes to the fill columns, equally.** They end up
   equally wide. Where the share is too small for what one of them holds,
   all fill columns are as wide as the widest of them and the table is wider
   than its room (today's rule for «Equal columns»).

5. **Given more room, a table without a fill column gets one.** The edit
   that gives a table more room than its content - pulled wider at a
   handle, docked Top, Bottom or Fill, put into a panel, stretched in a
   cell - sets its last auto column to fill, in the same undo step, where
   no column is fill yet. From then on it is a state like any other: the
   line reads «fill», and set back to auto it stays auto, with the room
   empty at the table's right. The layout itself never changes a state; it
   only reads them. Without an auto column (all fixed) nothing is set (E2).
   The same for rows and the table's height.

6. **The state is on the line.** The turquoise line of a column or row
   carries its state as its sign does today for «auto» and mm: «auto»,
   «45 mm», «fill». A click on the sign steps through the three. Pulling the
   line makes it fixed; pulling it below its content makes it auto again (as
   today).

7. **«Width» and «Equal columns» go.** A width is the table's own size,
   pulled or typed under «Frame» like any object's. Equal columns are fill
   columns.

8. **Where a size comes from is said in words.** For the chosen object, a
   line under «Frame» names what sets its width and its height: «310 px:
   column fixed at 45.7 mm», «181 px: column filling the table», «227 px:
   the text "Lüfter"», «464 px: docked Top in Area». This is step 0 and
   stands on its own; it changes no rule.

9. **No device change.** The export gives placed objects, as today.

10. **Nothing moves.** An existing project, opened, exports the same bytes
    for every device (the baseline of `e2e/areas-nothing-moves.spec.ts`).

## Order of work

- **Step 0: the line that says where a size comes from** (decision 8).
  Independent of the rest. Can ship alone.
- **Step 1: column and row states** (decisions 3-6), with the migration.
  «Width» and «Equal columns» still shown, now only reading and writing the
  states.
- **Step 2: the table's own size and handles** (decisions 1, 2, 7). «Width»
  and «Equal columns» removed.

A checkpoint with the user after each step.

## Data model

Today: `properties.columns[i] = {}` (auto) or `{ mm }` (fixed), the same for
`rows`; `properties.widthMm`; `properties.equalColumns`.

After:

- `columns[i]`: `{}` auto, `{ mm }` fixed, `{ fill: true }` fill. The same
  for `rows[i]`.
- The table's own size: `properties.ownSize { width?, height? }`, as an
  area stretched or docked keeps it today (`docs/2026-11-16-areas.md`, step
  2). Absent: as large as its content.
- `widthMm` and `equalColumns` are no longer written.
- `settings.formatVersion` 4.

## Old projects

Migration in `lib/area-migration.ts`, on opening, for every table at any
depth:

- `equalColumns: true`: every column without `mm` becomes fill.
- `widthMm` set: `ownSize.width` in pixels at the project's scale. Without
  `equalColumns`, the last column becomes fill.
- Neither, but stretched (docked Top, Bottom or Fill; directly in a panel):
  the last column becomes fill. This writes down what the layout does today.
- Neither and not stretched: unchanged.

Also to be changed where they write the old properties: `lib/block-card.ts`
(the tiles of a block's card) and `templates/vanpi-4.json` (five tables).

## Edge cases

- **E1. A fixed column and «fill» beside it:** the user's case. Column 1 at
  45.7 mm stays; column 2 fills. The line of column 1 reads «45.7 mm», so
  the answer to «why not equal» is on the screen.
- **E2. All columns fixed and the table wider:** the room stays empty at the
  right. Decision 5 does not turn a fixed column into fill.
- **E3. A fill column in a table that has no room left over:** as wide as
  its content, like auto. Fill columns are still equal among themselves.
- **E4. Spans:** an object across a fill and an auto column asks its width
  of the last column it spans, as today.
- **E5. A table too wide for an area that clips:** cut at the edge, as today
  (`lib/dock.ts`).
- **E6. Rows:** a docked table is stretched across only; its height is its
  content's, also docked Fill, Left or Right (`lib/dock.ts`, read
  2026-11-16). That stays: docking gives a table room across, never down.
  A table is taller than its rows only where its author pulled it at the
  bottom handle, and only then is a row set to fill (decision 5).
- **E7. Device change:** the table's own size is in pixels and follows the
  size scale as an area's does; a fixed column stays in mm.
- **E8. Taken apart and put together:** an object carried out of a table
  leaves the column states of the rest as they are; a column removed with
  its last object takes its state with it.

## Not in scope

- Any change to an area, a switcher, a panel or the screen.
- How an object stands in its cell («Position»).
- Top-down sizing as the only direction: the content stays the lower bound
  everywhere.

## Decided (the user, 2026-11-16)

- **A new column is auto**, not fill. A table of a name and its value keeps
  a narrow name and a value taking the rest; equal columns are one click on
  each line.
- **The table's own size is in pixels**, as an area's. No width in mm.
- **Step 0 is not built ahead of the rest.** It is the first step once the
  spec is approved.
- **Decision 5** was left to this spec («mach vorschlag»): the edit that
  gives the table room sets the last auto column to fill, once, visibly.
  Why not «the room stays empty»: a table docked across a card would end
  short of the card's right edge until its author found the sign, and that
  is the common case. Why not a rule in the layout: a column would read
  «auto» and be wider than its content, which is the kind of size nobody
  can explain that this spec removes.

## Open questions

None.

## Tests

- Model: `e2e/table-sizes.spec.ts` - each row of the migration; fill columns
  equal; a share too small; fixed beside fill (E1); all fixed (E2).
- Canvas: `e2e/table-sizes-canvas.spec.ts` - a table pulled wider at its
  handle; the sign stepped through auto, fixed, fill; the line under
  «Frame» for each source.
- `e2e/areas-nothing-moves.spec.ts` unchanged and green: the baseline is the
  proof of decision 10.
- `e2e/card-grid.spec.ts`, `e2e/card-grid-canvas.spec.ts`,
  `e2e/size-scale.spec.ts`: rewritten where they set «Width» or «Equal
  columns».
- Touches the project format: `npm run test:quick`.

## Handbook

`handbuch/objekte/anordnen.md`: «Spalten breiter, Zeilen höher» (the three
states and the sign), the paragraph on «Width» and «Equal columns» (gone),
«Raster aus Karten» (a grid of cards is a table of fill columns), and the
line under «Frame» where the handbook describes «Frame».

## Success criteria

- On the user's screen, the table with one fixed and one other column shows
  «45.7 mm» on the first line, and one click makes both columns equal.
- For any object, the designer names what sets its width and its height.
- «Width» and «Equal columns» are gone from the table's properties.
- Every existing project exports the same bytes as before.
