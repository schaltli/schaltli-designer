# Card grid (`card-grid`): tasks

Spec: `docs/2026-11-03-card-grid.md`. Designer only, branch `card-grid`.
Model first (the table's geometry is the one place gap and widths are
worked out), then the card's stretch on landing, then the panel and the
handbook.

## Task 1: Gap, Width and Equal columns in the model

- [ ] `measure` takes `gapMm`, `widthMm`, `equalColumns`; hand sizes kept; content never squeezed
- [ ] Old tables to the same pixels; laying out twice changes nothing

**Verification:** `e2e/card-grid.spec.ts`; `snap-table-model`, `bausteine` green
**Files:** `lib/snap-table.ts`

## Task 2: A card fills its cell

- [ ] A free area with a Look dropped or placed into a cell gets `{ x: "stretch", y: "stretch" }`, unless it has an anchor there; a plain free area not

**Verification:** `e2e/card-grid.spec.ts`
**Files:** `lib/snap-table.ts`

## Task 3: Panel, handbook, final run

- [ ] Gap, Width, Equal columns in the Table section, one undo step each
- [ ] Four cards snapped into an equal 2 × 2 grid on the canvas
- [ ] Handbook `objekte/anordnen.md`
- [ ] `npm run test:quick` green apart from known load failures

**Verification:** `e2e/card-grid-canvas.spec.ts`, `e2e/handbook-labels.spec.ts`
**Files:** `components/property-panel/snap-table-properties.tsx`, `handbuch/objekte/anordnen.md`
