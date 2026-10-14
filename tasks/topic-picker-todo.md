# Todo: topic-picker

Plan: `tasks/topic-picker-plan.md`. Spec approved by the user 2026-10-14; run «bau durch».

- [x] P1 The popover and the tree
  - components/property-panel/topic-selector.tsx a popover over lib/topic-tree, search, the trigger with data-slot=select-trigger; e2e/topic-selector.spec.ts unchanged and green
- [x] P2 Heard topics and adding by use
  - TopicAdderContext (components/topic-adder-context.ts) from project-editor; e2e/topic-picker.spec.ts (own broker, e2e/own-broker.ts): fragment search, «Project only», read with examples and one undo, JSON fields and no examples for a write
- [x] P3 Adding by hand
  - same spec: «Add topic «…»» text, and nothing offered for a wildcard or a space
- [x] P4 The completion
  - lib/placeholder-completion.ts section «heard»; live-text-field adds on pick; same spec «value search»
- [x] P5 Handbook
  - handbuch/designer/topics.md «Ein Topic an ein Objekt binden»
- [x] Checkpoint: test:quick 2026-10-14: every device suite green; e2e 1566 passed, 2 red on the new trigger (property-fields: no select-trigger slot; property-panel: its own aria-label left the row's caption unspent) - fixed, both green
