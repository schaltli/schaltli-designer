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
- [x] C5 The Deploy dialog
  - `energyDiagramsNotOnDevices` → a need at 1.7 in deploy-dialog.tsx; e2e: names by screen (nested too), the plan for a board and an app below 1.7
- [x] C6 Handbook
  - objekte/anzeigen.md, the info box: no device offers it yet; what Deploy does with an older firmware or app
- [x] Checkpoint: test:all green; the user has read §2.8
  - the user: «ok weiter» 2026-10-12 after the summary
  - test:all 2026-10-12: e2e 1500 passed, 4 red - two «Preview» locators matched the user's project «… Energy preview» (exact now), focus-on-create and the undo memory test green alone (25/25); every HIL suite green; waveshare-ddf stale only through energy-firmware's DDF edit made during the run
