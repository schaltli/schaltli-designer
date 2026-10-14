# Todo: ha-sensor-type

Plan: `tasks/ha-sensor-type-plan.md`. Spec approved by the user 2026-10-14.

- [x] H1 The rule
  - `numericSensor` in lib/ha-discovery.ts; e2e/ha-discovery.spec.ts «a sensor's type, as Home Assistant reads it»; fixture rajiva-service-id.json
- [x] H2 Rajiva's «Service ID» through the Block menu
  - e2e/bausteine.spec.ts «Rajiva's «Service ID»: a text beside its name, its topic typed text with the broker's value»
- [x] H3 Handbook
  - handbuch/designer/bausteine.md: row «Text (`sensor` ohne Zahl)» and the rule; through maettel-humanizer
- [x] Checkpoint: test:quick 2026-10-14: e2e 1548 passed; every device suite green but knob-popups (a request timed out after the swipe check - the knob's known sporadic instability, nothing of this module runs on it)
