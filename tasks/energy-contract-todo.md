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
- [x] C3 Into the device zip
  - `exportedEnergyDiagram`, `iconBakes` (lib/energy-diagram-object.ts); bakes in asset-export's bakeScreen on the screen's ground; node `colorDark` from applyThemeWithDark; node topics in objectReferencedTopics (export and preview subscriptions)
  - e2e/energy-diagram.spec.ts «the energy diagram in the device zip»: the data, the topics, the bakes' size and colour in both modes
- [x] C4 Into the Android bundle
  - the same `exportedEnergyDiagram`; icons as tinted SVGs per look (iconPathFor), dark from darkVariantOf; e2e: the bundle's diagram equals the zip's but for the icon files
- [ ] C5 The Deploy dialog
- [ ] C6 Handbook
- [ ] Checkpoint: test:all green; the user has read §2.8
