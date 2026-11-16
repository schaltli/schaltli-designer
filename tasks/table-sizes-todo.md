# Todo: table sizes

Spec `docs/2026-11-16-table-sizes.md`, plan `tasks/table-sizes-plan.md`.

## Step 0: where a size comes from

- [ ] **T1: `lib/size-source.ts`.** `sizeSourceOf(objects, id, scale)` gives, for width and for height, the pixels and what sets them.
  - Accept: names each of: its own (drawn or typed); its content (a text's words, a control's labels); docked (which edge, in what); stretched in its area; its column fixed at n mm; its column as wide as object X; its column sharing the table's room («Equal columns», «Width», the last column of a stretched table - today's rules); a table: its columns and rows; an area grown to what it holds; a switcher: its largest panel; a panel: its switcher.
  - Verify: `e2e/size-source.spec.ts` (model), one test per source; the user's table (one fixed column at 45.7 mm, «Equal columns» on) reads «column fixed at 45.7 mm» and «column as wide as …».
  - Files: `lib/size-source.ts`, `e2e/size-source.spec.ts`. Size S.
- [ ] **T2: the line under «Frame».** Two lines of small text below W and H of the chosen object, English.
  - Accept: shown for every object with a Frame; follows a change at once; nothing shown for a multi-selection.
  - Verify: `e2e/size-source-canvas.spec.ts`: the user's table, a docked heading, a free box. Handbook: `handbuch/designer/objekte.md` or where «Frame» is described; `e2e/handbook-labels.spec.ts` green.
  - Files: `components/property-panel/property-panel.tsx` (Frame), spec, handbook. Size S. Depends: T1.

### Checkpoint 0
- [ ] `npm run typecheck`, `npm run test:e2e:prod`
- [ ] With the user: is the wording of the lines right?

## Step 1: a column says what sets its width

- [ ] **T3: states in the layout, migration to format 4.**
  - Accept: `columns[i].fill` read by `measure`/`shareWidth`/`arrangeSnapTable`/`snapTableGeometry`: what a table has left over goes to its fill columns, which end equally wide, none below its content (a share too small: all as wide as the widest). No fill column: the room stays empty at the right. Migration: `equalColumns` → every column without `mm` is fill; a table with `widthMm` or stretched (docked Top/Bottom/Fill, directly in a panel) and without `equalColumns` → its last column without `mm` is fill. `equalColumns` no longer written; `widthMm` stays until step 2. `FORMAT_VERSION = 4`. `lib/block-card.ts` and `templates/vanpi-4.json` write states.
  - Verify: `e2e/table-sizes.spec.ts` (model): each migration row, fill equal, share too small, fixed beside fill (E1), all fixed (E2), fill without room (E3), span (E4). `e2e/areas-nothing-moves.spec.ts` green, baseline untouched. `e2e/areas-migration.spec.ts` version bumped.
  - Files: `lib/snap-table.ts`, `lib/area-migration.ts`, `lib/block-card.ts`, `templates/vanpi-4.json`, specs. Size M.
- [ ] **T4: the edit that gives room sets fill.**
  - Accept: a table that an edit gave more room than its content (docked Top/Bottom/Fill, moved into a panel, «Width» typed) and that has no fill column gets its last auto column set to fill, in the same undo step. All fixed: nothing. Set back to auto by hand: stays auto.
  - Verify: model test of the pure function (before, after → after'); canvas test: dock a two-column table Top in a card, the second line reads fill; one Ctrl+Z undoes both.
  - Files: `lib/table-fill.ts` (new), `components/project-editor.tsx`, specs. Size M. Depends: T3.
- [ ] **T5: the sign on the line.**
  - Accept: a selected table shows on each column line its state: «auto», «n mm», «fill»; a click on the sign steps auto → fill → fixed (at its present width) → auto; pulling the line fixes it, pulled below its content it is auto (as today). Rows: «auto» and «n mm» only. «Equal columns» in the panel reads «on» where every column not fixed is fill and writes fill/auto to them. `lib/size-source.ts` names fill.
  - Verify: `e2e/table-sizes-canvas.spec.ts`: the user's table - the first line reads «45.7 mm», one click on it and both columns are equally wide. Signs after each click.
  - Files: `components/canvas/canvas.tsx`, `components/property-panel/snap-table-properties.tsx`, `lib/size-source.ts`, specs. Size M. Depends: T3.
- [ ] **T6: handbook for step 1.** `handbuch/objekte/anordnen.md`: «Spalten breiter, Zeilen höher» (three states, the sign), «Equal columns» (what it now is). Through `maettel-humanizer`.

### Checkpoint 1
- [ ] `npm run typecheck`, `npm run test:quick` (project format)
- [ ] With the user: the signs on the lines; pre-release to the van?

## Step 2: the table has a size of its own

- [ ] **T7: `ownSize` on a table, migration to format 5.**
  - Accept: a table is at least its columns and rows; with `ownSize.width`/`.height` larger, its fill columns/rows share the rest. `rows[i].fill` read. Docking stretches across only (E6). Migration: `widthMm` → `ownSize.width` in px at the project's scale. `widthMm` no longer written. `FORMAT_VERSION = 5`. Device change scales `ownSize` as an area's (E7).
  - Verify: `e2e/table-sizes.spec.ts`: own size wider/taller, rows fill, migration of `widthMm`; `e2e/size-scale.spec.ts` rewritten where it sets «Width»; baseline green.
  - Files: `lib/snap-table.ts`, `lib/area-migration.ts`, `lib/layout.ts`, `lib/dock.ts`, specs. Size M.
- [ ] **T8: handles.**
  - Accept: a selected table has a right, a bottom and a corner handle; pulled, it stops at its content; W and H under «Frame» can be typed, the least taken where too small. Pulled wider with no fill column: the last auto column is fill (T4's function, also for rows and the bottom handle). Signs for rows include «fill».
  - Verify: `e2e/table-sizes-canvas.spec.ts`: pulled wider, pulled below content, pulled taller; one Ctrl+Z each.
  - Files: `components/canvas/canvas.tsx`, `components/property-panel/property-panel.tsx`, `lib/table-fill.ts`, specs. Size M. Depends: T7.
- [ ] **T9: «Width» and «Equal columns» go.**
  - Accept: neither in the table's properties; `lib/block-card.ts` and the template give the tiles' table its size as `ownSize`; `e2e/card-grid.spec.ts`, `e2e/card-grid-canvas.spec.ts`, `e2e/property-panel-controls.json` (reharvested) rewritten.
  - Verify: the rewritten specs; `e2e/handbook-labels.spec.ts`. Handbook: the paragraph on «Width»/«Equal columns» gone, «Raster aus Karten» a table of fill columns pulled to the screen's width. Through `maettel-humanizer`.
  - Files: `components/property-panel/snap-table-properties.tsx`, `lib/block-card.ts`, `templates/vanpi-4.json`, specs, handbook. Size M. Depends: T7, T8.

### Checkpoint 2
- [ ] `npm run typecheck`, `npm run test:quick`
- [ ] With the user: the spec's success criteria on the van's project; pre-release?

## Decisions taken while building

(none yet)

## Open

(none yet)
