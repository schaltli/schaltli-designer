# placing - tasks

Spec: docs/2026-11-03-placing.md (approved 2026-11-03).

- [x] T1 `lib/drop-into-free.ts` by the pointer, no zone - `e2e/drop-into-free.spec.ts`
- [x] T2 Canvas: the space under the pointer for drag, out of a table, tool, Row tool and block; without a key into an area or empty cell, else free; Alt builds tables; the hint with the Alt keycap; Alt kept from the browser and shown without moving - `e2e/placing.spec.ts`, `e2e/drop-into-free-canvas.spec.ts`
- [x] T3 Tests that build tables by dragging hold Alt (`buildingTables`, the drag helpers of snap-table-canvas, snap-table-rows, place-by-dragging, card-grid-canvas, bausteine, handbook-screenshots, `carryUnderSnapTable`); `placingFreely` holds nothing
- [x] T4 Handbook: anordnen (Zusammenstecken, the hint, Herausnehmen, Row, Free, Card), bausteine, objekte, screens
- [ ] T5 `npm run test:quick` green apart from known load failures
