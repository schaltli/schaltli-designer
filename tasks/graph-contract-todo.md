# Todo: graph-contract

Plan: `tasks/graph-contract-plan.md`.

- [x] C1 The contract: `docs/device-contract.md` §2.10 «The screen graph - feature `screen-graph`», `goto-neighbour` in §5, `showScreenMenu` retired with `screen-graph` in the registry. While writing it: the pull tab, the warning and a slide that follows the finger go by one rule now, `swipeReachesNeighbour` (an own «Next screen» towards the screen beside keeps its tab, as a device reading the export would draw it); test in `e2e/preview-swipe.spec.ts`
- [x] C2 The feature and the gate: `SCREEN_GRAPH_FEATURE`, `screenGraphFeature` in `lib/screen-graph.ts`, asked beside `local-topics` in the deploy dialog. Tests: `e2e/screen-graph-deploy.spec.ts` (pure, `planDeploy`, and the dialog with a fake board serving its DDF with and without the feature)
- [x] C3 Handbook and spec: `designer/screens.md` (the warning), `designer/deploy.md` (the reason), spec decision 14
- [x] Checkpoint: test:quick 2026-10-18: e2e 1621 passed; knob placeholder-redraw red in the run (a timeout), green alone
