# Todo: no-made-up-values

Plan: `tasks/no-made-up-values-plan.md`. Spec approved by the user 2026-10-14; run «bau durch».

- [x] N1 No sample stored
  - readTopicEntry stores the heard value or nothing; payloadWith gone; write topics keep their payloads. e2e/bausteine.spec.ts: the switch, value and level cases expect no example; topicsInSettings reads a topic without the Examples line
- [x] N2 The editor draws no value yet
  - nothing to change: with no example a live-value text draws nothing for the value, a level its empty state - checked by eye for a text, a number with unit and a slider. e2e/bausteine.spec.ts «Rajiva's «Service ID» with nothing heard: no example, no value drawn»
- [x] N3 Heard while the dialog is open
  - useHeardValues in hooks/use-block-catalog.ts, used by the Block dialog. e2e/bausteine.spec.ts «a value published live while the dialog is open is shown and becomes the example»
- [x] N4 Handbook
  - handbuch/designer/bausteine.md: step 2 and the examples paragraph
- [x] Checkpoint: test:quick 2026-10-14: e2e 1550 passed; knob-popups, 4v3b-popups, papers3-live-values red on timeouts in the run (three boards at once), all three green alone right after
