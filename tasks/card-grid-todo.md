# Card grid (`card-grid`): tasks

Spec: `docs/2026-11-03-card-grid.md`. Designer only, branch `card-grid`.
Model first (the table's geometry is the one place gap and widths are
worked out), then the card's stretch on landing, then the panel and the
handbook.

## Task 1: Gap, Width and Equal columns in the model

- [x] `measure` takes `gapMm`, `widthMm`, `equalColumns`; hand sizes kept; content never squeezed
- [x] Old tables to the same pixels; laying out twice changes nothing

**Verification:** `e2e/card-grid.spec.ts`; `snap-table-model`, `bausteine` green
**Files:** `lib/snap-table.ts`

## Task 2: A card fills its cell

- [x] A free area with a Look dropped or placed into a cell gets `{ x: "stretch", y: "stretch" }`, unless it has an anchor there; a plain free area not

**Verification:** `e2e/card-grid.spec.ts`
**Files:** `lib/snap-table.ts`

## Task 3: Panel, handbook, final run

- [x] Gap, Width, Equal columns in the Table section, one undo step each
- [x] Four cards snapped into an equal 2 × 2 grid on the canvas
- [x] Handbook `objekte/anordnen.md`
- [x] `npm run test:quick` green apart from known load failures

**Verification:** `e2e/card-grid-canvas.spec.ts`, `e2e/handbook-labels.spec.ts`
**Files:** `components/property-panel/snap-table-properties.tsx`, `handbuch/objekte/anordnen.md`

**Done 2026-11-03:** `npm run test:quick` host 2117 passed, every board green but 4v3b-internal-heap (red as always). Sharpened on the way: with Equal columns, a share too small for one column makes all as wide as the widest (the spec said only «never narrower»). The canvas test presses Esc before each drag: after a drop the table stays selected and the next press would not take a card.
