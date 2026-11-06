# palette - todo

Plan: tasks/palette-plan.md. Spec: docs/2026-11-06-palette.md.
Each task: `npm run typecheck`, its spec, `npm run test:quick`, its handbook part.

- [x] T1 the palette window: float, dock, minimize to a rail, remembered, Ctrl+K (highest risk)
- [x] T2 the Prebuilt tab: groups by device, search, rows, placing
- [x] T3 the Parts tab: groups, rows, placing
      (T1-T3 in one commit: the wiring in project-editor.tsx grew together.
      The e2e window 1644 wide, the rail's 44 px beside the 4.3B's canvas;
      the suite starts with the palette minimized.)
- [ ] Checkpoint A: test:quick green; the user tries the palette (ribbon still there)
      **Halted here 2026-11-06 (build auto).** test:quick: e2e 2259 of 2260,
      the one red the new drag test (fixed: waits for the row in hand;
      28/28 twice in parallel); papers3-live-values «fetch failed», green
      alone. Waiting for the user to try the palette on localhost.
- [ ] T4 helpers and the e2e state; the specs moved to the palette
- [ ] T5 the ribbon and the Select tool out
- [ ] T6 the Row tool out
- [ ] T7 handbook and pictures, humanizer
- [ ] Checkpoint B: test:quick green; the user reviews
- [ ] T8 spec «built», test:all
