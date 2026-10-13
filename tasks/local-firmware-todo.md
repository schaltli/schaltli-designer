# Todo: local-firmware

Plan: `tasks/local-firmware-plan.md`. Approved by the user 2026-10-13
(«Go»), after reading it as an artifact. Run: /build auto; boards flashed
by USB (allowed: «Die flashes kannst du selber»); no push, no release.

- [x] F1 The HIL test first: hil/local-topics.js
  - initial "b", not the first panel «a» a switcher shows without a value (with "a" check 1 passed on the old firmware); a mid-grey screen, so a switcher showing no panel reads as neither; the broker's retained value is «c»
  - in hil/test-all.js for all three, the knob with the 4.3B as its pair; red on the old knob firmware: 5 of 5
- [x] F2 The loader and the DDFs
  - firmware: MQTTTopic.local/initial, a local topic starts at initial after every load, ProjectLoader::isLocalTopic; the three ddf-source*/device.json list supportedFeatures ["local-topics"]; the 4.3B announces 1.8; public/ddf zips regenerated
  - three envs build, native 38/38; e2e/local-topics.spec.ts «… declares local-topics» for the three shipped DDFs
- [x] F3 The knob
  - writeProjectTopic for the send-mqtt action, the switch/group, the level drag (both publishes) and the ring's adjust-level; a local write queued and applied from loop() by applyTopicValue (the project part of onMqttMessage); subscriptions without local topics; a message under a local name dropped
  - the asked marker of a level needs no special case: the local write comes back through the same path an echo does
  - /api/debug?set=restart (the knob had no restart for the HIL); hil/local-topics.js checks the uptime went down
  - hil/local-topics.js on the knob 5/5; knob smoke HIL 16/16, popups 26, live values, energy flow green
- [ ] F4 The 4.3B
- [ ] F5 The PaperS3
- [ ] Checkpoint: test:all; the user decides on the release
