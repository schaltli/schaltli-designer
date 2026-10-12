# Todo: energy-contract

Plan: `tasks/energy-contract-plan.md`. Approved by the user 2026-10-12
(«ok, freigegeben»), after asking what `{watts}` is: the node's watts
after resolveEnergy - no topic carries them (the rest, the reverse sign,
a storage's amount). Run: /build auto; no push, no release, demo and van
untouched; a push on halt or finish.

- [x] C1 Label and icon boxes in the core
  - `rowStep`, `labelHeight`, `sankeyBoxes`, `flowBoxes` in lib/energy-diagram.ts; vectors `boxes` (4 cases); the renderer draws from them; the Sankey bus name now on whole pixels
- [x] C2 Contract §2.8 and generation 1.7
  - docs/device-contract.md §2.8; `ENERGY_DIAGRAM_GENERATION`; spec decision 16 amended
  - the tap's geometry also moved into the core (`nodeAtTap`), so §2.8 names only the core
- [ ] C3 Into the device zip
- [ ] C4 Into the Android bundle
- [ ] C5 The Deploy dialog
- [ ] C6 Handbook
- [ ] Checkpoint: test:all green; the user has read §2.8
