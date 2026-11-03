# drop-into-free - tasks

Spec: docs/2026-11-03-drop-into-free.md (approved 2026-11-03).

- [x] T1 `lib/drop-into-free.ts`: the area under a selection's middle (innermost, deeper than the snap zone, not into itself), leaving an area, the move with coordinates kept on the glass - `e2e/drop-into-free.spec.ts`
- [x] T2 Canvas: the area outlined while dragging, a table in it snapping as before, in or out on release; editor callback `moveIntoAreaOf` - `e2e/drop-into-free-canvas.spec.ts`
- [x] T3 Handbook `objekte/anordnen.md` «Free»: Hineinziehen und herausziehen
- [ ] T4 `npm run test:quick` green apart from known load failures
