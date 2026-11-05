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
- [x] ~~T7 icons fetched with the tab, a late icon put in while carried~~
      Dropped 2026-11-05: the user, «4s reicht» - the fetch with the tab
      (T6) and the wait of up to 4 s stay.
      Fetched with the tab: built in T6 (lib/prebuilt-icons.ts). A tile
      pressed while its icons are still on their way waits up to 4 s, as
      Insert did, instead of carrying it without and putting it in late.
      Asked at Checkpoint B whether that is enough.
- [x] Checkpoint B: test:quick green; the user places VanPi's prebuilts
      Resumed 2026-11-05: buttons stay, 4 s is enough; trying VanPi's
      prebuilts on the real broker is left to the user.
      **Halted here 2026-11-05 (build auto)**, after 4192ee7 (T4-T6). A
      recording of the Prebuilt tab sent. Open for the user:
      1. Switch or buttons for on/off: decision 9 says «Switch stays the
         default», but a Home Assistant switch has been placed as buttons
         «Aus»/«An» since 2026-10-01 (catalogLooks), a Switch only where a
         block description asks. T6 kept the buttons; change it?
         **Decided 2026-11-05: buttons stay** (decision 9 revised); a
         Button Group converts to a Switch only with two states (T8).
      2. T7: a tile pressed while its icons are still on their way waits up
         to 4 s. Enough, or build «carried without, put in when it comes»?
      3. Try VanPi's prebuilts on the real broker.
- [x] T8 «Convert to» for free objects, Properties panel, one undo
      lib/convert-object.ts; the menu beside the heading, not in it (a
      heading «Slider id Convert to» broke getSelectedHeader); the reason
      under a greyed entry, a disabled item takes no hover.
- [x] T9 «Convert to» in a cell and a card, the row and card follow
      convertInTree: a ring in a cell six lines of its font; a card that
      ended with its content ends there again, one with its own height keeps it.
- [x] T10 «Convert to» in the right-click menu
      A hover submenu below Group / Ungroup, for one selected object of a family.
      T8-T10 in one commit, e2e/convert.spec.ts covers all three.
- [ ] Checkpoint C: test:quick green; the user converts parts of a prebuilt
      **Halted here 2026-11-05 (build auto)**, after 35027125 (T8-T10),
      test:quick Overall PASS (e2e 2219). A recording of Convert to sent.
      Open for the user: convert parts of a placed prebuilt in the browser.
- [ ] T11 screenshots, humanizer, spec «built», test:all
