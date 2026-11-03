# Anchor and Dock (`anchor-dock`): tasks

Plan: `tasks/anchor-dock-plan.md`. Spec: `docs/2026-11-03-anchor-dock.md`.
Designer only, branch `anchor-dock`.

## Task 1: Horizontal and Vertical in a cell

**Description:** `lib/anchor.ts` with the types and `placeInRoom`;
`arrangeSnapTable` places by it; `SnapCell` loses align/alignY/fill; old
projects converted on load; blocks write `anchor`; the Cell section shows
Horizontal and Vertical.

**Acceptance criteria:**
- [x] `properties.anchor {x, y}` places an object in its cell exactly as align/alignY/fill did, spans and texts included
- [x] `migrateProject` converts align/alignY/fill; a project with every combination lays out to the same pixels before and after
- [x] `lib/bausteine.ts` writes `anchor`; blocks unchanged on screen
- [x] The Cell section: Horizontal (Left/Center/Right/Stretch) and Vertical (Top/Middle/Bottom/Stretch), Stretch only where Fill was offered; a text's Horizontal is its text alignment
- [x] Handbook `objekte/anordnen.md` («In den Eigenschaften», the free area's «Fill» sentence), through maettel-humanizer

**Verification:** `e2e/anchor-dock.spec.ts` (new, placeInRoom), `e2e/snap-table-model.spec.ts` (rewritten, migration), `e2e/snap-table-canvas.spec.ts`, `e2e/bausteine.spec.ts`, `e2e/handbook-labels.spec.ts`; `npm run test:quick`

- [x] `npm run test:quick` 2026-11-03: host 2084 passed; knob-charts-draw (terminated) and papers3-screen-graph (board not back within 180 s) green alone; 4v3b-internal-heap red as always

**Done:** cell placement in `properties.cell.anchor` (not `properties.anchor`: an object taken out of a table loses it with its cell, as before - noted in the spec). Switcher added to what stretches in width, as blocks always did. The migration test compares against `lib/fixtures/cells-before-anchor.json`, recorded with the code before the change (all 64 combinations, texts, spans). `hil/layout/containers.js` written with anchors, its geometry unchanged on all three boards.

**Dependencies:** None
**Files likely touched:** new `lib/anchor.ts`, `lib/snap-table.ts`, `lib/object-types.ts`, `lib/bausteine.ts`, `components/property-panel/snap-table-properties.tsx`, `handbuch/objekte/anordnen.md`
**Estimated scope:** M

## Task 2: Anchors in a free area

**Description:** `resizeFree` moves an area's children by their anchors when
the area changes size - dragged, typed into Frame, stretched in a cell; a
section «Position» with Horizontal and Vertical on an area's objects.

**Acceptance criteria:**
- [x] Left/Top stay, Right/Bottom keep their distance to that edge, Center/Middle their offset from the centre, Stretch grows; default Left/Top, so untouched areas behave as before
- [x] A resize to the same size, and a second layout pass, move nothing
- [x] Dragging an area's corner moves its children in the same undo step
- [x] A free area stretched in a cell takes its anchored children along
- [x] «Position» in the property panel for objects directly in a free area; Stretch for the cell's types and text
- [x] Handbook `objekte/anordnen.md`, free area section

**Verification:** `e2e/anchor-dock.spec.ts` (resizeFree), new `e2e/anchor-dock-canvas.spec.ts` (drag, undo, panel); `npm run test:quick`

- [x] `npm run test:quick` 2026-11-03: host 2092 passed; 4v3b-live-values, 4v3b-popups, 4v3b conformance (fetch failed) and ws4-charts-draw (terminated) green alone, conformance 68/68; 4v3b-internal-heap red as always

**Done:** `resizeFree` and `withUpdates` in `lib/anchor.ts`; every object edit goes through `withUpdates` (`lib/object-tree.ts`), so dragging, Frame and Apply size agree in one undo step. A free area stretched in its cell, or taken out of its table, takes its objects along (`lib/snap-table.ts`). Found on the way: the frame lock in the property panel still read `cell.fill.width` (Task 1) - reads the anchor now. A click on a free area's row in the object list opens it rather than selecting it, so the canvas test selects it with a click on the canvas.

**Dependencies:** Task 1
**Files likely touched:** `lib/anchor.ts`, `lib/layout.ts`, `components/canvas/canvas.tsx`, new `components/property-panel/free-area-properties.tsx`, `handbuch/objekte/anordnen.md`
**Estimated scope:** M

## Task 3: Padding and Dock

**Description:** Padding on a free area; Dock on its objects, placed by
`dockFree` in list order inside the padding with the table gap between;
docked objects cut to the room left or left out (plan, «clipping»).

**Acceptance criteria:**
- [ ] The spec's «Open» answered with the plan's clipping rule
- [ ] Top/Bottom/Left/Right/Fill in list order, 1.5 mm between, inside the padding; across the dock stretched where the object can, else by its Horizontal/Vertical; a table docked Top stretched like a switcher's panel
- [ ] Too little room: cut along the dock, or left out of export and preview and outlined in the editor
- [ ] Padding field on the area; Dock in «Position»; Frame of a docked object greyed, the docked axis' Horizontal/Vertical hidden; the dock mark in the object list
- [ ] The spec's card by hand: heading docked Top, table Fill, area dragged and stretched in a cell - shown to the user
- [ ] Handbook `objekte/anordnen.md`: Padding, Dock, the example of a heading and a table

**Verification:** `e2e/anchor-dock.spec.ts` (dockFree, clipping, layout twice equal), `e2e/anchor-dock-canvas.spec.ts` (Dock in the panel, mark, greyed Frame), an export test that the left-out object is not in the device's project; `npm run test:quick`

**Dependencies:** Task 2
**Files likely touched:** `lib/anchor.ts`, `lib/layout.ts`, `lib/object-groups.ts` (export leaves out), `components/property-panel/free-area-properties.tsx`, the object list component, `handbuch/objekte/anordnen.md`
**Estimated scope:** M

## Task 4: Final run

**Acceptance criteria:**
- [ ] The spec's success criteria ticked
- [ ] `npm run test:quick` green apart from known load failures, each re-run alone

**Dependencies:** Task 3
**Estimated scope:** XS
