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
- [x] F4 The 4.3B
  - the callback's project part is applyTopicValue; writeProjectTopic queues a local write, applied after mqttClient.loop() - after the switch marked what it asked for, so the value answers that mark; subscriptions without local topics
  - hil/local-topics.js 5/5, the knob/4.3B pair green; conformance 57/57, popups, live values, navigator, energy nested, placeholder redraw green
  - the 4.3B joined a far access point (B4:FB:…, -88 to -91 dBm) after some restarts and then took no upload: suites were run with it on the near one (FC:EC:…); the user chose to go on without a WiFi fix («Weiter, flashen»)
- [x] F5 The PaperS3
  - the same in src/boards/papers3/main.cpp
  - hil/local-topics.js 5/5; popups (second try - the first lost the install, as in the last test:all), live values, navigator, hold countdown green
- [ ] Checkpoint: test:all; the user decides on the release
  - test:all 2026-10-13, all three boards on g0986acd (USB): knob, 4v3b and papers3 local topics PASS (the knob with the 4.3B as its pair); every HIL suite green but the 4.3B Sankey motion (0 px between two pictures while stepping 8.9/s) - green alone (31480 px); e2e 1523 passed, 5 red under load (leave-unsaved, startup-gate, two snap-table-canvas, undo across loads) - all 5 green alone
  - waits for the user's decision on the release
