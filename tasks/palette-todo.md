# palette - todo

Plan: tasks/palette-plan.md. Spec: docs/2026-11-06-palette.md.
Each task: `npm run typecheck`, its spec, `npm run test:quick`, its handbook part.

- [x] T1 the palette window: float, dock, minimize to a rail, remembered, Ctrl+K (highest risk)
- [x] T2 the Prebuilt tab: groups by device, search, rows, placing
- [x] T3 the Parts tab: groups, rows, placing
      (T1-T3 in one commit: the wiring in project-editor.tsx grew together.
      The e2e window 1644 wide, the rail's 44 px beside the 4.3B's canvas;
      the suite starts with the palette minimized.)
- [x] Checkpoint A: test:quick green; the user tries the palette (ribbon still there)
      (the user: «sieht gut aus. weiter»; found: a row clicked first could
      not be dragged after - fixed with T4-T6)
      **Halted here 2026-11-06 (build auto).** test:quick: e2e 2259 of 2260,
      the one red the new drag test (fixed: waits for the row in hand;
      28/28 twice in parallel); papers3-live-values «fetch failed», green
      alone. Waiting for the user to try the palette on localhost.
- [x] T4 helpers and the e2e state; the specs moved to the palette
- [x] T5 the ribbon and the Select tool out
- [x] T6 the Row tool out
      (T4-T6 in one commit: with the ribbon still there every tool was
      twice on the page, so the specs moved over as the ribbon went. The
      suite starts docked, every group open, its window 1864 wide.)
- [x] T7 handbook and pictures, humanizer
- [x] Checkpoint B: test:quick green; the user reviews
      **Halted here 2026-11-06 (build auto).** test:quick: e2e 2245 of 2246
      (settable-level's own 1281 px window too narrow beside the docked
      palette - widened, 36/36); boards red on popups, screen-graph,
      local-topics, charts-actions - each green run alone.
- [ ] T8 spec «built», test:all
      Spec marked built 2026-11-06; test:all left to the user («mache ich später»).
