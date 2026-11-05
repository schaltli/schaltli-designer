# prebuilt - todo

Plan: tasks/prebuilt-plan.md. Spec: docs/2026-11-05-quick-blocks.md.
Each task: `npm run typecheck`, its spec, `npm run test:quick`, its handbook part.

- [x] Before: the uncommitted card-blocks work committed (f1fee4e, ade48db)
- [x] Branch `prebuilt`
- [x] T0 handbook: Bausteine → Baugruppen, links, sidebar, pointer page at the old address
- [x] T1 drag a tool from the ribbon onto the screen (highest risk)
- [x] T2 click a tool: the object hangs at the pointer, a click sets it down
- [x] T3 dropped: Alt stays (the user, 2026-11-05, after the recording of T2; decision 8 revised)
- [x] Checkpoint A: test:quick green; the user tries tools in the browser
      (a recording sent, the user remote: «passt, weiter»)
      Was halted here 2026-11-05 (build auto).** T1 and T2 built and committed;
      test:quick e2e green both times, the boards red only on network
      timeouts that moved between runs (T1: 4v3b-charts-draw; T2:
      knob-internal-heap, 4v3b-live-values). Waiting for the user to try
      dragging and clicking tiles, and Alt with an object hanging after a
      click on Windows Chrome - that decides T3 (keep Alt or Shift).
- [x] T4 tabs «Parts» / «Prebuilt», tiles by device, Block button gone
      (the ribbon a fixed 112 px: 109 put the screen on a half pixel)
- [x] T5 catalog from the broker store, live; refresh with Listening off
- [x] T6 no dialog: a tile carries the prebuilt with the defaults
      (T4-T6 in one commit: the tiles, the hook and their spec grew together)
- [ ] T7 icons fetched with the tab, a late icon put in while carried
      Fetched with the tab: built in T6 (lib/prebuilt-icons.ts). A tile
      pressed while its icons are still on their way waits up to 4 s, as
      Insert did, instead of carrying it without and putting it in late.
      Asked at Checkpoint B whether that is enough.
- [ ] Checkpoint B: test:quick green; the user places VanPi's prebuilts
- [ ] T8 «Convert to» for free objects, Properties panel, one undo
- [ ] T9 «Convert to» in a cell and a card, the row and card follow
- [ ] T10 «Convert to» in the right-click menu
- [ ] Checkpoint C: test:quick green; the user converts parts of a prebuilt
- [ ] T11 screenshots, humanizer, spec «built», test:all
