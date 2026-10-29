# Todo: charts-recorder

Plan: `tasks/charts-recorder-plan.md`. Approved by the user on 2026-10-29 («ok, go!»), all decisions as written.

- [x] R1 Steps
  - recorder/compare.js: the designer's `matches` and JSON field, copied; recorder/history.js `Series`: level and power at 1, 5, 15 min, time-weighted, a value held 15 min at most, the positive integral for energy in; state periods (no condition: «is yes»)
  - e2e/recorder-history.spec.ts: the two copies against the designer's on the same vectors (2), steps (5)
- [x] R2 Payloads and days
  - recorder/history.js: `dayPayload` (15 min, 92/96/100 steps; a state's minutes since midnight), `recentPayload` (2 h at 1 min, 48 h at 5 min; a state's periods in unix seconds - written into the spec), `dailyPayload` (30 days: energy in and out, decline, rise, mean, min, max; run time, starts), `prune`, `toJSON`/`fromJSON`
  - e2e/recorder-history.spec.ts «the recorder's payloads (R2)» (6), a full day under 4 KB among them
- [ ] R3 The service
- [ ] R4 Persistence
- [ ] R5 Deploy lays the wants (needs charts-model M6)
- [ ] R6 A real run on the bench
- [ ] R7 Install and handbook
- [ ] Checkpoint: test:quick green; the user installs on the Pekaway; memory and Mosquitto persistence measured, answers in the spec
