# areas - todo

Plan: tasks/areas-plan.md. Spec: docs/2026-11-16-areas.md.
Each task: `npm run typecheck`, its spec, e2e/areas-nothing-moves.spec.ts.
Each step ends with `npm run test:quick` and a stop for the user.

- [x] Before: branch `areas` made 2026-11-16; the plan's three open questions put to the user with a proposal each, answered «ja weiter» (2026-11-16) - taken as the proposals: formatVersion 2, the size scale stays on a device change, Padding and Gap only on a screen and a panel

## Step 1 - panel and screen are areas
- [x] T0 baseline: e2e/areas-nothing-moves.spec.ts, e2e/fixtures/areas-baseline.json from main 784739e8 (2026-11-16: green twice, the baseline written twice the same; uncommitted on branch `areas`)
- [x] T1 lib/area.ts: isArea; dock, anchor, free-min-size ask it (no behaviour change; 2026-11-16: typecheck, baseline and 11 area specs green - anchor-dock-card:117 timed out once under load, green alone). The screen wrapped moves to T4, drop-into-free to T2: it already treats a panel on its own
- [x] T2 a panel is an area: dock, Position, Padding; panel and switcher hold their content (E2); e2e/area-panel.spec.ts (model, 13), e2e/area-panel-canvas.spec.ts (3). test:e2e:prod 2026-11-16: 2440 passed, 1 failed - layout-model:88 asserted the old rule (a switcher outside a container left as saved), rewritten to the new one. No strip migration for stale dock/anchor: moving between areas already drops them. A switcher in a table counts what a panel docks at its own height (lib/dock.ts dockedHeight)
- [ ] T3 old panels: the one Free area taken over (boxId), controls outside (E2a); e2e/areas-migration.spec.ts
- [ ] T4 a screen is an area: screen.area, dock, growth (E1), free anywhere (E1a), masters (E7), knob (E8); e2e/area-screen.spec.ts
- [ ] T5 «Position» on a screen and in a panel; property-panel-controls.json harvested
- [ ] T6 «Free» becomes «Area»; handbook objekte/anordnen.md, designer/index.md; test:quick
- [ ] Checkpoint 1: test:quick noted here; the user looks at «MaxxFan»

## Step 2 - one kept size
- [ ] T7 cell.drawnWidth/drawnHeight become ownSize; migration; «Min W»/«Min H» on it
- [ ] T8 docking keeps no size (decision 14); saved ones go on load; test:quick
- [ ] Checkpoint 2: test:quick noted here; the user confirms step 3

## Step 3 - the cell is an area
- [ ] T9 the cell in the model: type cell, measure by cells, dissolve, migration; layout stable
- [ ] T10 editing a table of cells: lib operations, then canvas and tree; one-object cells skipped
- [ ] T11 «Position» for «Cell»; Dock: Fill shown and changeable
- [ ] T12 look and padding on a cell; a stretched Free area becomes its cell; E4, E5
- [ ] T13 several objects in a cell: E6, levels, «Cell» in the list; e2e/area-cell.spec.ts
- [ ] T14 prebuilts and templates build cells with a look (E10)
- [ ] T15 handbook rewritten; e2e/area-maxxfan.spec.ts; test:quick
- [ ] Checkpoint 3: the spec's success criteria, with the user
