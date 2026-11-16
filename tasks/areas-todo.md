# areas - todo

Plan: tasks/areas-plan.md. Spec: docs/2026-11-16-areas.md.
Each task: `npm run typecheck`, its spec, e2e/areas-nothing-moves.spec.ts.
Each step ends with `npm run test:quick` and a stop for the user.

- [x] Before: branch `areas` made 2026-11-16; the plan's three open questions put to the user with a proposal each, answered «ja weiter» (2026-11-16) - taken as the proposals: formatVersion 2, the size scale stays on a device change, Padding and Gap only on a screen and a panel

## Step 1 - panel and screen are areas
- [x] T0 baseline: e2e/areas-nothing-moves.spec.ts, e2e/fixtures/areas-baseline.json from main 784739e8 (2026-11-16: green twice, the baseline written twice the same; uncommitted on branch `areas`)
- [x] T1 lib/area.ts: isArea; dock, anchor, free-min-size ask it (no behaviour change; 2026-11-16: typecheck, baseline and 11 area specs green - anchor-dock-card:117 timed out once under load, green alone). The screen wrapped moves to T4, drop-into-free to T2: it already treats a panel on its own
- [x] T2 a panel is an area: dock, Position, Padding; panel and switcher hold their content (E2); e2e/area-panel.spec.ts (model, 13), e2e/area-panel-canvas.spec.ts (3). test:e2e:prod 2026-11-16: 2440 passed, 1 failed - layout-model:88 asserted the old rule (a switcher outside a container left as saved), rewritten to the new one. No strip migration for stale dock/anchor: moving between areas already drops them. A switcher in a table counts what a panel docks at its own height (lib/dock.ts dockedHeight)
- [x] T3 old panels: the one Free area taken over (`areaBox`: the box's id and stacking), controls outside (E2a); e2e/areas-migration.spec.ts (12), two cases in area-panel-canvas. 2026-11-16, decided while building:
  - settings.formatVersion = 2 is written by the migration, which runs once per project by it (lib/area-migration.ts)
  - a panel shows the sections an area standing alone has (Look, Padding, Gap, Shape, Colour): one that took a card over has to be able to change it. More than «Padding and Gap only»; in line with the spec's decision 1
  - a switcher in a cell keeps the size its card gave it in `ownSize`, the least it asks for (T7 makes that «Min W»/«Min H»)
  - the baseline leaves the designer's place notes out of project.json (cell, anchor, dock, ownSize, dockedOut): they ride along in the export and neither firmware nor app reads them. «Byte for byte» holds for everything else
  - no saved project on this machine has a panel holding one Free area (searched .data/projects): the migration is tested on built cases only
- [x] T4 a screen is an area: screen.area, dock, growth (E1), free anywhere (E1a), masters (E7); e2e/area-screen.spec.ts (11), e2e/area-screen-canvas.spec.ts (1). 2026-11-16:
  - lib/area.ts screenAreaLaid: only what is docked is placed; `screen.areaSize` written while the area has grown, drawn dashed on the canvas
  - the migration drops dock/anchor/ownSize/dockedOut an object kept on a screen or in a panel, where they meant nothing; a new project is made at formatVersion 2
  - a box or area docked Fill asked for a room as wide as any height tried (minWidthOf): now 1
  - OPEN: Position (Horizontal/Vertical) on a screen on a device change - the size scale is untouched, nothing places anchored objects afterwards yet (the plan's question 2). E8 (knob) has no case of its own: its area is the project's square screen
  - OPEN: `dockedOut` is still set by lib/dock.ts for an area standing alone; cards grow before it shows
- [x] T5 «Position» on a screen and in a panel; property-panel-controls.json harvested (done with T2 and T4). test:e2e:prod 2026-11-16 at d838c351: 2466 passed, 1 failed - anchor-dock-canvas:97 asserted that an area on the screen has no Position, rewritten
- [x] T6 «Free» becomes «Area»; handbook objekte/anordnen.md, designer/screens.md, designer/index.md, designer/objekte.md (anchor #free kept); a newer formatVersion is refused (how the designer shows that error is not checked)
- [ ] Checkpoint 1: the user looks at it (dev server on 3000, 2026-11-16). test:quick 2026-11-16 at 4147b550, HIL broker up: Overall FAIL
  - green: typecheck, e2e 2468 passed, every host check; conformance 84/84 on 4.3B and 4"; deploy «back running exactly the deployed screen» on knob, 4" and PaperS3; PaperS3 all green
  - failed, none of them on a picture that differs: 4.3B placeholder-redraw and live-values («sent no description within 30 s»), screen-graph (timeout), charts-actions (0 s back, 0 px moved); knob charts-draw («never held the chart's history»), scaled-values (timeout); 4" charts-draw (NowPoint does not pulse)
  - skipped: 4.3B deploy, install-gate, popups (unreachable at the time); Android (no phone)
  - a first run the same day failed in every device lane for want of the HIL broker on 1883 (`npm run hil:broker`)

## Step 2 - one kept size
- [x] T7 cell.drawnWidth/drawnHeight become ownSize; migration at formatVersion 3 (a project of step 1 gets step 2 only); «Min W»/«Min H» on it. 2026-11-16: baseline green, three cases in areas-migration. Kept as it was: the size is written while stretched and dropped once not - the spec's «dropped where the content needs as much» would need each type's content size and changes no layout
- [x] T8 docking keeps no size (decision 14): across its dock an object keeps a least size only where typed («Min W»/«Min H», 0 until then), and the area is no smaller than it asks; what was kept there goes on load. Along the dock its own length is still kept while the area cuts it - dropping that would let a cut become permanent. Handbook: objekte/anordnen.md («Andocken»). Tests: anchor-dock (2 rewritten, 1 new), areas-migration, area-panel-canvas
- [x] Checkpoint 2: skipped as a stop - the user asked for steps 2 and 3 in one go (2026-11-16). test:e2e:prod after step 2: 2473 passed, 1 failed - templates:189, a real fault: a project made from the starter template opened with unsaved changes, the template taken for current. Fixed (a template says its own format, lib/templates.ts)

## Step 3 - the cell is an area
Built otherwise than planned (2026-11-16, lib/cell-area.ts): a table's children stay objects that name their cell. A cell that holds more than one object, or has a look, is an area the designer makes around what stood in it and takes away again; a card stretched in its cell counts as a cell unmarked. The spec's `type: "cell"` for every cell, and `properties.cell` gone from objects, is NOT built - it would rewrite lib/snap-table.ts and everything that reads a cell for the same result on the screen. To be put to the user.
- [x] T9 the cell as an area in the model: wrapInCell, unwrappedCells, the drop search names an occupied cell; e2e/area-cell.spec.ts (17)
- [x] T10 let go on an occupied cell without Alt, an object goes into it (E6); «Cell» and «Area» in the object list; e2e/area-cell-canvas.spec.ts
- [x] T11 «Position» for «Cell»: Dock (Fill), Horizontal, Vertical, «Cell look»; a dock to an edge or a look makes the cell an area
- [x] T12 look and padding on a cell (the cell's area shows the sections of an area, titled «Cell»); E4, E5 in the model spec. No migration: an area stretched both ways in its cell is a cell as it is
- [x] T13 several objects in a cell: E6, levels (table, cell, object) as an area in a cell has them
- [x] T14 prebuilts and templates: unchanged - their cards stand stretched in their cells and are cells by that (E10)
- [x] T15 handbook objekte/anordnen.md («In den Eigenschaften», «Mehr als ein Objekt in einer Zelle», «Ein Raster aus Karten»)
- [ ] OPEN: an object alone in a cell's area that is taken away stands by its Horizontal and Vertical again, not where it was moved to inside the cell
- [ ] OPEN: a text let go in a cell keeps the width it was drawn at (the user's label, 227 px, made its column that wide); in a slot it is as wide as its words
- [ ] OPEN: e2e/area-maxxfan.spec.ts (the spec's success criterion as a test) not written; tried by hand on a copy of the van's project instead
- [ ] OPEN: carried from the object list onto an occupied cell goes through the same code (lib/carry.ts) but has no case of its own
- [ ] Checkpoint 3: test:e2e:prod and test:quick after step 3, then the spec's success criteria with the user
