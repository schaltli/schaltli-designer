# Plan: graph-contract

Spec: `docs/2026-10-17-screen-graph.md` (decisions 6, 7, 9, 13, 14, 16).
Module `graph-contract` of the capability map: what a device must do with
the screen graph is written down, a device says it can with the feature
`screen-graph`, and Deploy asks for it. After it `graph-firmware` and
`graph-android` build against the contract.

## Decisions taken here (user, 2026-10-18)

1. **The gate is hard from now on.** A project with a screen docked off
   the main row is not deployed to a device whose description lacks
   `screen-graph`: a board is brought up to its release first where the
   designer's copy of its DDF lists it, else refused; an app is asked to
   update. A single row deploys as before. Until `graph-firmware` and
   `graph-android` declare the feature, a docked project deploys nowhere.
   The handbook's warning says so.
2. **«Show Screen Menu» goes with `graph-firmware`, not here.** The
   designer keeps offering it, and projects keep it, until the boards
   swipe over the graph; then the knob's DDF drops it and the designer
   removes it from projects with its notice (decision 6), in the same
   piece of work. So the knob is never without a way to its screens.
   The contract says now that a device declaring `screen-graph` no longer
   offers it.

## Tasks

- **C1 The contract.** `docs/device-contract.md` §2.10 «The screen graph
  - feature `screen-graph`»: `mainRow`, each screen's `neighbours` and
  `back`, `goto-neighbour`, the swipes as exported (one action each,
  resolved), next and previous over the main row (wrapping, from a docked
  screen its page's place), the start screen, following the finger
  beside the navigator, a swipe belonging to what it starts on, the pull
  tab with its numbers (`lib/pull-tabs.ts`), the navigator's «←»
  (icon `schaltli-back-<edge>`, drawn by the device), the screen menu
  gone; the feature and generation 1.9. §5's registry marks
  `showScreenMenu` as retired with `screen-graph`.
- **C2 The feature and the gate.** `lib/screen-graph.ts`:
  `SCREEN_GRAPH_FEATURE` and `screenGraphFeature(screens)`, naming the
  docked screens; the deploy dialog asks it beside `local-topics`.
  Tests: pure (`e2e/screen-graph.spec.ts`, `e2e/deploy-plan.spec.ts`)
  and the dialog with a fake device announcing a DDF with and without
  the feature (`e2e/deploy-dialog.spec.ts`).
- **C3 Handbook and spec.** `designer/screens.md`: the warning says
  Deploy refuses until the device can. The spec records decisions 1
  and 2.
- **Checkpoint:** `npm run test:quick` green.
